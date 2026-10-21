"""Напоминания: разбор текста, база, расписание APScheduler, отправка.

Часть бывшего app.py — код перенесён без изменений логики."""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

import dateparser
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from dateparser.search import search_dates
from aiogram import types

from tgbot.config import MAX_FACT_LENGTH, bot, partner_of, user_name
from tgbot.db import get_db
from tgbot.memory import _to_dt, _utcnow
from tgbot.utils import format_local, local_tz, to_utc_naive
from tgbot.llm import llm_retry

# ---------------------------------------------------------------------------
# НАПОМИНАНИЯ (APScheduler + dateparser)
# ---------------------------------------------------------------------------

scheduler = AsyncIOScheduler(timezone="UTC")

REPEAT_PATTERNS = (
    ("daily", re.compile(r"\b(?:каждый день|ежедневно|каждое утро|каждый вечер)\b", re.I)),
    ("weekly", re.compile(r"\b(?:каждую неделю|еженедельно)\b", re.I)),
)
BOTH_RE = re.compile(r"^(?:нам|обоим|обоих|мне и [а-яё]+)\b[\s,:-]*", re.I)
# «напомни», «поставь напоминание», «заведи будильник», «напомни нам, пожалуйста»
INTENT_RE = re.compile(
    r"(?:(?:поставь|создай|добавь|заведи|установи)\s+(?:мне\s+|нам\s+)?)?"
    r"(?:пожалуйста[\s,]*)?"
    r"(?:напомни(?:ть)?|напоминани[еяю]|будильник)"
    r"(?:[\s,]+(?:мне|нам|обоим))?(?:[\s,]+пожалуйста)?[\s,:-]*",
    re.I,
)
LEAD_JUNK_RE = re.compile(
    r"^[\s,.:;-]*(?:(?:что|чтобы|нужно|надо|не\s+забыть|не\s+забудь|о\s+том,?\s+что)[\s,]+)*"
    r"(?:на\s+(?=\d))?",
    re.I,
)
REPEAT_LABELS = {"daily": "каждый день", "weekly": "каждую неделю"}



def _dateparser_settings():
    """Настройки dateparser. Время считаем «настенным» (по часам BOT_TIMEZONE).

    Пояс в настройки НЕ передаём: с TIMEZONE dateparser по-разному сдвигает
    относительные фразы («в 18:00», «через 2 минуты»). Вместо этого даём ему
    местное «сейчас» без пояса, а пояс добавляем сами в to_utc_naive().
    """
    now_local = datetime.now(local_tz()).replace(tzinfo=None, microsecond=0)
    return {"PREFER_DATES_FROM": "future", "RELATIVE_BASE": now_local}


def parse_reminder_text(raw: str):
    """Из «завтра в 18:00 купить цветы» делает (время_UTC, текст, повтор, обоим).

    Время и дело можно разделить знаком «|»: «завтра в 18:00 | купить цветы» —
    так надёжнее всего. Без него время ищется в начале фразы автоматически.
    Возвращает None, если время не нашлось.
    """
    text = " ".join(str(raw or "").split())
    both = False
    m = INTENT_RE.search(text)
    if m:
        both = bool(re.search(r"\b(?:нам|обоим)\b", m[0], re.I))
        text = (text[:m.start()] + " " + text[m.end():]).strip()
    text = LEAD_JUNK_RE.sub("", text).strip()
    m = BOTH_RE.match(text)
    if m:
        both, text = True, text[m.end():].strip()

    repeat = None
    for name, pattern in REPEAT_PATTERNS:
        if pattern.search(text):
            repeat = name
            text = pattern.sub(" ", text)
            break
    text = " ".join(text.split())

    when, task = None, ""
    settings = _dateparser_settings()
    parse = lambda s: dateparser.parse(s, languages=["ru", "en"], settings=settings)
    phrase = ""
    if "|" in text:
        phrase, _, task = text.partition("|")
        phrase = phrase.strip()
        when = parse(phrase) if phrase else None
    else:
        # Самое длинное начало фразы, которое dateparser понимает как время
        words = text.split()
        for k in range(min(len(words), 7), 0, -1):
            candidate = " ".join(words[:k])
            when = parse(candidate)
            if when:
                phrase, task = candidate, " ".join(words[k:])
                break
        if when is None:  # время где-то в середине фразы
            found = [
                f for f in (search_dates(text, languages=["ru", "en"], settings=settings) or [])
                if f[0].strip()
            ]
            if found:
                phrase, when = max(found, key=lambda f: len(f[0]))
                task = text.replace(phrase, " ", 1)
    task = " ".join(task.split()).strip(" ,.:;-—|")
    if when is None:
        return None
    # «завтра» или «в пятницу» без часа: ищем время дальше во фразе
    # («завтра купить цветы в 18:00», «завтра в 6 вечера»), иначе ставим на
    # 9 утра, а не на «сейчас»
    if not re.search(
        r"\d{1,2}[:.]\d{2}|через|утр|вечер|дн[её]м|ноч|полд|час|мин", phrase, re.I
    ):
        time_re = re.compile(
            r"(?:\b[вк]\s+)?\b(\d{1,2})[:.](\d{2})\b"
            r"|\b[вк]\s+(\d{1,2})\b(?:\s*(утра|вечера|дня|ночи)\b)?",
            re.I,
        )
        hour, minute = 9, 0
        in_task = time_re.search(task)
        tm = in_task or time_re.search(phrase)
        if tm:
            h = int(tm[1] if tm[1] else tm[3])
            m_ = int(tm[2]) if tm[2] else 0
            part = (tm[4] or "").lower()
            if in_task:
                task = (task[:tm.start()] + " " + task[tm.end():]).strip(" ,.:;-—")
            else:  # время было в самой фразе; «вечера» могло остаться в деле
                lead = re.match(r"\s*(утра|вечера|дня|ночи)\b", task, re.I)
                if lead:
                    part = lead[1].lower()
                    task = task[lead.end():].strip(" ,.:;-—")
            if part in ("вечера", "дня") and h < 12:
                h += 12
            if h < 24 and m_ < 60:
                hour, minute = h, m_
        when = when.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if not task and re.search(r"будильник", str(raw), re.I):
        task = "Будильник"
    when_utc = to_utc_naive(when)
    return when_utc, task[:MAX_FACT_LENGTH * 2], repeat, both


def create_reminder(user_id, chat_id, text, remind_at, repeat=None, both=False) -> int:
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO reminders (user_id, chat_id, text, remind_at, repeat_rule,"
                " both_users, done) VALUES (%s, %s, %s, %s, %s, %s, %s)"
                " RETURNING id",
                (user_id, chat_id, text, remind_at, repeat, bool(both), False),
            )
            return cursor.fetchone()[0]


def get_reminder(rem_id: int):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, user_id, chat_id, text, remind_at, repeat_rule, both_users"
                " FROM reminders WHERE id = %s AND done = %s",
                (rem_id, False),
            )
            row = cursor.fetchone()
    if not row:
        return None
    return {
        "id": row[0], "user_id": row[1], "chat_id": row[2], "text": row[3],
        "remind_at": _to_dt(row[4]), "repeat": row[5], "both": bool(row[6]),
    }


def list_reminders(user_id: int):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, text, remind_at, repeat_rule, both_users FROM reminders"
                " WHERE user_id = %s AND done = %s ORDER BY remind_at, id",
                (user_id, False),
            )
            rows = cursor.fetchall()
    return [
        {"id": r[0], "text": r[1], "remind_at": _to_dt(r[2]), "repeat": r[3],
         "both": bool(r[4])}
        for r in rows
    ]


def finish_reminder(rem_id: int, next_at=None):
    """Одноразовое помечаем выполненным, повторяющееся переносим."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            if next_at:
                cursor.execute(
                    "UPDATE reminders SET remind_at = %s WHERE id = %s",
                    (next_at, rem_id),
                )
            else:
                cursor.execute(
                    "UPDATE reminders SET done = %s WHERE id = %s", (True, rem_id)
                )


def delete_reminder(user_id: int, rem_id: int) -> bool:
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM reminders WHERE id = %s AND user_id = %s AND done = %s",
                (rem_id, user_id, False),
            )
            if not cursor.fetchone():
                return False
            cursor.execute("UPDATE reminders SET done = %s WHERE id = %s", (True, rem_id))
    return True


def schedule_reminder(rem_id: int, remind_at: datetime):
    run_date = remind_at.replace(tzinfo=timezone.utc)
    scheduler.add_job(
        fire_reminder,
        DateTrigger(run_date=run_date),
        args=[rem_id],
        id=f"rem{rem_id}",
        replace_existing=True,
        misfire_grace_time=None,  # после простоя всё равно напомнить
    )


def unschedule_reminder(rem_id: int):
    try:
        scheduler.remove_job(f"rem{rem_id}")
    except Exception:
        pass


@llm_retry
async def _send_with_retry(chat_id: int, text: str):
    await bot.send_message(chat_id, text)


async def fire_reminder(rem_id: int):
    rem = await asyncio.to_thread(get_reminder, rem_id)
    if not rem:
        return
    author = user_name(rem["user_id"])
    targets = [rem["chat_id"]]
    if rem["both"]:
        partner = partner_of(rem["user_id"])
        if partner is not None and partner not in targets:
            targets.append(partner)
    body = rem["text"] or "Время пришло!"
    for chat in targets:
        prefix = "⏰ Напоминание"
        if chat != rem["chat_id"]:
            prefix += f" от {author}"
        try:
            await _send_with_retry(chat, f"{prefix}:\n{body}")
        except Exception as e:
            logging.error(f"Не удалось отправить напоминание {rem_id} в {chat}: {e}")

    step = {"daily": timedelta(days=1), "weekly": timedelta(days=7)}.get(rem["repeat"])
    if step:
        nxt = rem["remind_at"] + step
        now = _utcnow()
        while nxt <= now:
            nxt += step
        await asyncio.to_thread(finish_reminder, rem_id, nxt)
        schedule_reminder(rem_id, nxt)
    else:
        await asyncio.to_thread(finish_reminder, rem_id)


def load_pending_reminders() -> int:
    """После перезапуска заново ставит в расписание всё невыполненное."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, remind_at FROM reminders WHERE done = %s", (False,)
            )
            rows = cursor.fetchall()
    for rem_id, remind_at in rows:
        dt = _to_dt(remind_at)
        if dt:
            schedule_reminder(rem_id, dt)
    return len(rows)


REMIND_USAGE = (
    "⏰ <b>Как поставить напоминание</b>\n"
    "/remind завтра в 18:00 купить цветы\n"
    "/remind через 2 часа позвонить маме\n"
    "/remind в пятницу в 20:00 | сходить на ужин\n"
    "/remind каждый день в 9:00 выпить витамины\n"
    "/remind нам 14 февраля в 10:00 годовщина — придёт обоим\n\n"
    "Знак «|» отделяет время от дела — так бот не ошибётся.\n"
    "Можно и просто написать боту: «напомни завтра в 18:00 купить цветы».\n"
    "Список: /reminders, удалить: /reminddelete &lt;номер&gt;"
)


async def add_reminder_from_text(message: types.Message, raw: str):
    parsed = await asyncio.to_thread(parse_reminder_text, raw)
    logging.info(f"Напоминание: разбор {raw[:120]!r} -> {parsed}")
    if not parsed:
        await message.answer(
            "🤔 Не получилось понять, когда напомнить. Напиши время и дело, например:\n"
            "завтра в 18:00 | купить цветы",
        )
        return
    when, task, repeat, both = parsed
    if not task:
        await message.answer(
            "🤔 А о чём напомнить? Например: через 2 часа | позвонить маме"
        )
        return
    if repeat is None and when <= _utcnow():
        await message.answer(
            "⌛ Это время уже прошло. Укажи будущее, например: завтра в 9:00 | ..."
        )
        return
    if len(await asyncio.to_thread(list_reminders, message.from_user.id)) >= 50:
        await message.answer("📋 Уже 50 активных напоминаний. Удали ненужные: /reminders")
        return
    rem_id = await asyncio.to_thread(
        create_reminder, message.from_user.id, message.chat.id, task, when, repeat, both
    )
    schedule_reminder(rem_id, when)
    logging.info(f"Напоминание #{rem_id} поставлено на {format_local(when)}: {task!r}")
    extra = f", {REPEAT_LABELS[repeat]}" if repeat else ""
    who = " (получите оба)" if both else ""
    await message.answer(
        f"✅ Напомню {format_local(when)}{extra}{who}:\n{task}\n"
        f"Номер {rem_id} — отменить: /reminddelete {rem_id}"
    )
