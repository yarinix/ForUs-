"""Gemini: каскад моделей, учёт суточной квоты, расшифровка голоса, извлечение фактов в память.

Часть бывшего app.py — код перенесён без изменений логики."""

import asyncio
import html
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

from google.genai import types as genai_types
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from tgbot.config import (
    DEFAULT_IMPORTANCE,
    MEMORY_LABELS,
    MEMORY_PROMPT_LIMIT,
    MEMORY_TYPES,
    MIN_SAVE_IMPORTANCE,
    MODELS_CASCADE,
    SUBJECTS,
    client,
    partner_of,
    user_name,
)
from tgbot.db import get_db
from tgbot.memory import (
    _utcnow,
    build_memory_block,
    clamp_importance,
    clean_fact,
    get_memories,
    parse_until,
    save_memory,
    update_memory,
)
from tgbot.utils import current_time_str, format_local, local_tz

# ---------------------------------------------------------------------------
# GEMINI
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# УЧЁТ ЗАПРОСОВ К GEMINI (чтобы видеть расход суточной квоты)
# ---------------------------------------------------------------------------

GEMINI_RPD_LIMIT = int(os.getenv("GEMINI_RPD_LIMIT", "500"))  # суточный лимит на модель
_usage_warned = set()  # (день, порог), чтобы не писать предупреждение каждый раз
_last_quota_error = {"at": None, "model": "", "text": ""}


def pacific_tz():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("America/Los_Angeles")
    except Exception:
        return timezone(timedelta(hours=-8))


def pacific_day() -> str:
    """Сегодняшняя дата по тихоокеанскому времени: по ней Google считает сутки."""
    return datetime.now(pacific_tz()).strftime("%Y-%m-%d")


def next_quota_reset_local() -> str:
    """Когда сбросится суточная квота — в местном времени бота."""
    pt = pacific_tz()
    now = datetime.now(pt)
    reset = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return reset.astimezone(local_tz()).strftime("%d.%m %H:%M")


def classify_llm_error(exc: BaseException) -> str:
    text = f"{type(exc).__name__} {exc}".casefold()
    if "429" in text or "quota" in text or "resource_exhausted" in text:
        return "quota"
    return "error"


def record_llm_call(model: str, outcome: str, detail: str = ""):
    """Записывает один запрос к Gemini: счётчик в БД и строка в логах.

    outcome: ok | quota | error. Любая ошибка учёта не должна ломать запрос.
    """
    day = pacific_day()
    ok_n, quota_n, err_n = (outcome == "ok"), (outcome == "quota"), (outcome == "error")
    total = None
    try:
        with get_db() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO llm_usage (day, model, calls, ok, quota_errors, errors)"
                    " VALUES (%s, %s, 1, %s, %s, %s)"
                    " ON CONFLICT (day, model) DO UPDATE SET"
                    " calls = llm_usage.calls + 1, ok = llm_usage.ok + EXCLUDED.ok,"
                    " quota_errors = llm_usage.quota_errors + EXCLUDED.quota_errors,"
                    " errors = llm_usage.errors + EXCLUDED.errors",
                    (day, model, int(ok_n), int(quota_n), int(err_n)),
                )
                cursor.execute(
                    "SELECT calls FROM llm_usage WHERE day = %s AND model = %s",
                    (day, model),
                )
                total = cursor.fetchone()[0]
    except Exception as e:
        logging.warning(f"Учёт запросов Gemini недоступен: {e}")

    if outcome == "quota":
        _last_quota_error.update(
            at=_utcnow(), model=model, text=" ".join(str(detail).split())[:400]
        )
        logging.warning(
            f"📊 Gemini {model}: КВОТА исчерпана. Сегодня запросов: {total}."
            f" Ответ Google: {' '.join(str(detail).split())[:300]}"
        )
    else:
        mark = "ок" if outcome == "ok" else f"ОШИБКА: {' '.join(str(detail).split())[:120]}"
        logging.info(
            f"📊 Gemini {model}: запрос №{total if total is not None else '?'} за сутки"
            f" (лимит {GEMINI_RPD_LIMIT}) — {mark}"
        )
    if total:
        for percent in (80, 95):
            if total >= GEMINI_RPD_LIMIT * percent // 100 and (day, model, percent) not in _usage_warned:
                _usage_warned.add((day, model, percent))
                logging.warning(
                    f"⚠️ Gemini {model}: израсходовано {total} из {GEMINI_RPD_LIMIT}"
                    f" запросов за сутки ({percent}%+). Сброс в {next_quota_reset_local()}"
                )


def get_llm_usage(days: int = 7):
    """Запросы к Gemini по дням и моделям (последние сутки первыми)."""
    since = (datetime.now(pacific_tz()) - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT day, model, calls, ok, quota_errors, errors FROM llm_usage"
                " WHERE day >= %s ORDER BY day DESC, model",
                (since,),
            )
            rows = cursor.fetchall()
    return [
        {"day": str(r[0])[:10], "model": r[1], "calls": r[2], "ok": r[3],
         "quota": r[4], "errors": r[5]}
        for r in rows
    ]


def format_llm_usage(rows) -> str:
    today = pacific_day()
    todays = [r for r in rows if r["day"] == today]
    total = sum(r["calls"] for r in todays)
    lines = [
        "📊 <b>Запросы бота к Gemini</b>",
        f"Сутки считаются по тихоокеанскому времени, сброс в {next_quota_reset_local()}"
        " по местному.",
        "",
        f"<b>Сегодня ({today}):</b>",
    ]
    if todays:
        for r in todays:
            lines.append(
                f"• {html.escape(r['model'])}: {r['calls']} из {GEMINI_RPD_LIMIT}"
                f" (успешно {r['ok']}, квота {r['quota']}, другие ошибки {r['errors']})"
            )
        lines.append(f"Всего: {total}")
    else:
        lines.append("• запросов ещё не было")
    older = {}
    for r in rows:
        if r["day"] != today:
            older[r["day"]] = older.get(r["day"], 0) + r["calls"]
    if older:
        lines += ["", "<b>Предыдущие дни:</b>"]
        lines += [f"• {d}: {n}" for d, n in sorted(older.items(), reverse=True)]
    if _last_quota_error["at"]:
        lines += [
            "",
            f"⛔ Последняя ошибка квоты: {format_local(_last_quota_error['at'])},"
            f" {html.escape(_last_quota_error['model'])}",
            html.escape(_last_quota_error["text"][:300]),
        ]
    lines += [
        "",
        "ℹ️ Это только запросы самого бота. Если с этим же ключом работают другие"
        " приложения или чат в AI Studio, в панели Google цифра будет больше.",
    ]
    return "\n".join(lines)


_TRANSIENT_MARKERS = (
    "503", "502", "504", "500", "unavailable", "overloaded", "timeout",
    "timed out", "deadline", "connection", "reset by peer", "temporarily",
)


def _is_transient(exc: BaseException) -> bool:
    """Временный сбой (сеть, перегрузка), который стоит повторить.

    Квоту (429) не повторяем: быстрее перейти к следующей модели каскада.
    """
    text = f"{type(exc).__name__} {exc}".casefold()
    if "429" in text or "quota" in text or "resource_exhausted" in text:
        return False
    return any(marker in text for marker in _TRANSIENT_MARKERS)


llm_retry = retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=6),
    reraise=True,
)


@llm_retry
def _generate_reply_sync(model_name, history_contents, contents, system_prompt):
    try:
        chat = client.chats.create(
            model=model_name,
            history=history_contents,
            config=genai_types.GenerateContentConfig(system_instruction=system_prompt),
        )
        text = chat.send_message(contents).text
    except Exception as e:
        record_llm_call(model_name, classify_llm_error(e), str(e))
        raise
    record_llm_call(model_name, "ok")
    return text


async def process_with_cascade(
    history_contents,
    contents,
    system_prompt,
    user_id=None,
    chat_type="private",
):
    """Отправляет запрос в каскад моделей.

    Если передан user_id — к промпту добавляются воспоминания из таблицы memories
    (личные только владельцу, в группе — только общие). Без user_id (инлайн)
    работает как раньше.
    """
    if user_id is not None:
        try:
            query = (
                contents
                if isinstance(contents, str)
                else next((c for c in contents if isinstance(c, str)), None)
            )
            memories = await asyncio.to_thread(
                get_memories,
                user_id,
                MEMORY_PROMPT_LIMIT,
                query,
                chat_type == "private",
            )
            system_prompt += build_memory_block(
                memories, system_prompt, speaker_id=user_id, group=chat_type != "private"
            )
        except Exception as e:
            logging.warning(f"Новая память недоступна, отвечаю по старой: {e}")

    for model_name in MODELS_CASCADE:
        try:
            text = await asyncio.to_thread(
                _generate_reply_sync,
                model_name,
                history_contents,
                contents,
                system_prompt,
            )
            if not text or not text.strip():
                raise ValueError("пустой ответ модели")
            return text
        except Exception as e:
            logging.warning(
                f"Модель {model_name} недоступна: {e}. Пробуем следующую..."
            )
            continue
    raise Exception("Все модели из каскада временно недоступны.")


@llm_retry
def upload_to_gemini(file_bytes, mime_type: str):
    """Загружает файл в Gemini и ждёт, пока он обработается (важно для видео)."""
    uploaded = client.files.upload(file=file_bytes, config={"mime_type": mime_type})
    for _ in range(30):
        state = getattr(getattr(uploaded, "state", None), "name", None)
        if state != "PROCESSING":
            break
        time.sleep(2)
        uploaded = client.files.get(name=uploaded.name)
    return uploaded


def transcribe_sync(uploaded_file) -> str:
    """Дословная расшифровка речи из голосового/кружка (пустая строка, если не вышло)."""
    prompt = (
        "Дословно расшифруй речь из этого файла на языке оригинала. "
        "Верни только текст, без пояснений. Если речи нет — верни пустую строку."
    )
    for model_name in MODELS_CASCADE:
        try:
            response = client.models.generate_content(
                model=model_name, contents=[uploaded_file, prompt]
            )
            record_llm_call(model_name, "ok")
            return (response.text or "").strip()
        except Exception as e:
            record_llm_call(model_name, classify_llm_error(e), str(e))
            logging.warning(f"Модель {model_name} не расшифровала запись: {e}")
    return ""


def parse_memory_ops(text: str, valid_ids=None):
    """Разбирает JSON-ответ модели в список операций с памятью.

    Операции: add (новый факт), update (уточнить существующий по id),
    reinforce (факт снова подтвердился). Принимает и старый формат —
    список {"type", "fact"}. Бросает исключение при мусоре.
    """
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    data = json.loads(text)
    if isinstance(data, dict):
        data = data.get("ops") or data.get("facts") or [data]
    if not isinstance(data, list):
        raise ValueError("ожидался список")
    valid_ids = set(valid_ids) if valid_ids is not None else None

    ops = []
    for item in data:
        if not isinstance(item, dict):
            continue
        op = str(item.get("op", "add")).strip().lower()
        fact = clean_fact(item.get("fact", ""))
        if fact.strip(" .").upper() in {"НЕТ", "NONE", "N/A", "NULL"}:
            continue

        if op == "add":
            mem_type = str(item.get("type", "")).strip().lower()
            if mem_type not in MEMORY_TYPES or not fact:
                continue
            importance = clamp_importance(
                item.get("importance"), DEFAULT_IMPORTANCE[mem_type]
            )
            if importance < MIN_SAVE_IMPORTANCE:
                continue  # мелочь — не запоминаем
            about = str(item.get("about", "")).strip().lower()
            ops.append({
                "op": "add", "type": mem_type, "fact": fact,
                "importance": importance,
                "about": about if about in SUBJECTS else None,
                "until": parse_until(item.get("until")),
            })
        elif op in ("update", "reinforce"):
            try:
                mem_id = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            if valid_ids is not None and mem_id not in valid_ids:
                continue
            if op == "update" and not fact:
                continue
            ops.append({
                "op": op, "id": mem_id, "fact": fact or None,
                "importance": (
                    clamp_importance(item.get("importance"))
                    if item.get("importance") is not None else None
                ),
            })
    return ops[:4]


@llm_retry
def _generate_json_sync(model_name, prompt):
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
        )
    except Exception as e:
        record_llm_call(model_name, classify_llm_error(e), str(e))
        raise
    record_llm_call(model_name, "ok")
    return response


def _extract_ops_sync(prompt: str, valid_ids):
    for model_name in MODELS_CASCADE:
        try:
            response = _generate_json_sync(model_name, prompt)
            return parse_memory_ops(response.text, valid_ids)
        except Exception as e:
            logging.warning(
                f"Модель {model_name} не смогла выделить факты: {e}."
                " Пробуем следующую..."
            )
    return []


def get_recent_context(chat_id: int, limit: int = 6, skip_last_user: bool = True):
    """Последние реплики чата (для понимания шуток и чувств в контексте)."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT role, content FROM messages WHERE chat_id = %s"
                " ORDER BY id DESC LIMIT %s",
                (chat_id, limit + 1),
            )
            rows = cursor.fetchall()
    if skip_last_user and rows and rows[0][0] == "user":
        rows = rows[1:]  # само анализируемое сообщение
    lines = []
    for role, content in reversed(rows[:limit]):
        if content:
            lines.append(("Бот: " if role != "user" else "") + content[:300])
    return lines


def build_extraction_prompt(
    user_id: int, user_message: str, existing, context_lines
) -> str:
    me = user_name(user_id)
    pid = partner_of(user_id)
    partner = user_name(pid) if pid is not None else "партнёр"

    def about_label(m):
        if m["shared"] and m["subject_id"] is None:
            return "пара"
        return f"о {me}" if m["subject_id"] == user_id else f"о {partner}"

    existing_text = "\n".join(
        f"[id {m['id']}] ({MEMORY_LABELS.get(m['type'], m['type'])}, "
        f"{about_label(m)}, важность {m['importance']}) {m['content']}"
        for m in existing
    ) or "(пока ничего)"
    context_text = "\n".join(context_lines) or "(нет)"

    return (
        f"Сегодня: {current_time_str()}.\n"
        f"Ты ведёшь память чат-бота пары: {me} и {partner}. Сейчас пишет {me}.\n"
        f"Реши, что из НОВОЙ реплики стоит запомнить надолго.\n\n"
        f"ВАЖНОСТЬ (поле importance):\n"
        f"5 — критично: здоровье, аллергии, страхи и границы, главные даты и"
        f" события отношений, важные обещания;\n"
        f"4 — сильно описывает человека или пару: ценности, цели, устойчивые"
        f" предпочтения, важные планы, повторяющиеся переживания;\n"
        f"3 — полезно помнить: вкусы, привычки, договорённости;\n"
        f"2 и ниже — мелочи и сиюминутное: НЕ сохраняй (просто не добавляй).\n"
        f"Большинство реплик не содержат ничего достойного памяти — тогда верни [].\n\n"
        f"ТИПЫ (type) и ОТНОСИТЕЛЬНО КОГО (about: self — {me}, partner —"
        f" {partner}, couple — пара):\n"
        f"- personal — предпочтения, привычки, цели, черты характера. about:"
        f" self, или partner, если {me} рассказал это про {partner};\n"
        f"- couple — важное об отношениях пары (about: couple);\n"
        f"- event — значимые события и даты. Относительные даты ('завтра')"
        f" переведи в конкретные. Если событие разовое и после даты"
        f" теряет смысл, укажи until (YYYY-MM-DD);\n"
        f"- emotion — чувства: устойчивые закономерности ('{me} тревожится"
        f" перед выступлениями') или по-настоящему значимый эмоциональный момент"
        f" (с коротким поводом и датой). Обычное настроение ('устал', 'бесит"
        f" пробка') не сохраняй. Это всегда чувства самого {me} (about: self),"
        f" даже если они о {partner};\n"
        f"- inside_joke — внутренние шутки, прозвища, словечки пары. Пиши ФРАЗУ и"
        f" её смысл/происхождение, чтобы потом можно было обыграть"
        f" (например: «Шутка пары: «пельмени-ниндзя» — про тот случай с кухней»).\n\n"
        f"КАК ПИСАТЬ ФАКТ: коротко (до 150 символов), самодостаточно, с именем"
        f" человека ('{me} любит горы', '{partner} боится глубины'). Не путай"
        f" людей: если {me} говорит о {partner}, подлежащим должно быть имя"
        f" {partner}, а не {me}.\n\n"
        f"УЖЕ В ПАМЯТИ (не дублируй!):\n{existing_text}\n\n"
        f"Если новая информация уточняет или меняет существующую запись —"
        f' верни {{"op": "update", "id": N, "fact": "новая формулировка"}}.'
        f' Если она просто повторяет запись — {{"op": "reinforce", "id": N}}.\n\n'
        f"Ответ — строго JSON-массив (максимум 3 операции), без пояснений:\n"
        f'[{{"op": "add", "type": "personal", "about": "self",'
        f' "importance": 3, "fact": "...", "until": null}}]\n\n'
        f"КОНТЕКСТ (предыдущие реплики, только для понимания):\n{context_text}\n\n"
        f"НОВАЯ РЕПЛИКА от {me}: {user_message}"
    )


async def extract_and_save_facts(
    user_id: int, chat_type: str, user_message: str, chat_id=None
):
    try:
        existing = await asyncio.to_thread(
            get_memories, user_id, 12, user_message, chat_type == "private"
        )
        context_lines = (
            await asyncio.to_thread(get_recent_context, chat_id)
            if chat_id is not None else []
        )
        prompt = build_extraction_prompt(
            user_id, user_message, existing, context_lines
        )
        ops = await asyncio.to_thread(
            _extract_ops_sync, prompt, {m["id"] for m in existing}
        )
        for op in ops:
            if op["op"] == "add":
                saved = await asyncio.to_thread(
                    save_memory, user_id, op["type"], op["fact"],
                    None, op["importance"], op["about"], op["until"],
                )
                if saved:
                    logging.info(
                        f"Новая память [{op['type']}, важн. {op['importance']}]:"
                        f" {op['fact']}"
                    )
            else:
                await asyncio.to_thread(
                    update_memory, user_id, op["id"], op["fact"], op["importance"]
                )
                logging.info(f"Память #{op['id']}: {op['op']} {op['fact'] or ''}")
    except Exception:
        logging.exception("Не удалось сохранить факты в память")


# Ссылки на фоновые задачи, чтобы их не собрал сборщик мусора
_background_tasks = set()


def run_in_background(coro):
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
