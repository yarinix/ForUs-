"""Память бота: таблица memories, поиск, важность, затухание, удаление и старая память.

Часть бывшего app.py — код перенесён без изменений логики."""

import re
from datetime import datetime, timedelta, timezone

from tgbot.config import (
    COUPLE_USER_IDS,
    DEFAULT_IMPORTANCE,
    EMPTY_COUPLE_MEMORY,
    EMPTY_USER_MEMORY,
    HALF_LIFE_DAYS,
    MAX_FACT_LENGTH,
    MEMORY_CORE_LIMIT,
    MEMORY_LABELS,
    MEMORY_TYPES,
    SHARED_MEMORY_TYPES,
    SUBJECTS,
    TEST_MEMORY_TEXT,
    partner_of,
    user_name,
)
from tgbot.db import get_db

# --- НОВАЯ ПАМЯТЬ (таблица memories) ---


def clean_fact(text: str) -> str:
    """Один аккуратный однострочный факт ограниченной длины."""
    text = " ".join(str(text or "").split())
    text = text.lstrip("-•*– ").strip()
    return text[:MAX_FACT_LENGTH]


def _norm(text: str) -> str:
    return " ".join(str(text).casefold().split()).strip(" .!?…")


def _to_dt(value):
    """Время из БД (datetime или строка) -> naive datetime (UTC)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    s = str(value).replace("T", " ")
    for fmt, n in (("%Y-%m-%d %H:%M:%S", 19), ("%Y-%m-%d", 10)):
        try:
            return datetime.strptime(s[:n], fmt)
        except ValueError:
            continue
    return None


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_until(value):
    """'2026-12-31' -> datetime конца этого дня; всё остальное -> None."""
    m = re.match(r"\s*(\d{4})-(\d{2})-(\d{2})", str(value or ""))
    if not m:
        return None
    try:
        return datetime(int(m[1]), int(m[2]), int(m[3]), 23, 59, 59)
    except ValueError:
        return None


def clamp_importance(value, default=3) -> int:
    try:
        return max(1, min(5, int(value)))
    except (TypeError, ValueError):
        return default


def _similar(a: str, b: str) -> bool:
    """Одно и то же, сказанное чуть иначе: совпадение ключевых слов >= 75%."""
    if _norm(a) == _norm(b):
        return True
    ka, kb = _keywords(a), _keywords(b)
    if min(len(ka), len(kb)) < 3:
        return False
    return len(ka & kb) / len(ka | kb) >= 0.75


def resolve_scope(user_id, memory_type: str, subject: str = None, shared=None):
    """Возвращает (owner, subject_id): кому принадлежит запись и о ком она.

    Общие записи (couple / event / inside_joke) принадлежат паре (owner = None),
    остальные — тому, кто их рассказал. subject: self | partner | couple.
    """
    if shared is None:
        shared = memory_type in SHARED_MEMORY_TYPES
    if user_id not in COUPLE_USER_IDS:
        shared = False
    owner = None if shared else user_id
    if subject not in SUBJECTS:
        subject = "couple" if memory_type in ("couple", "inside_joke") else "self"
    partner = partner_of(user_id)
    if subject == "partner" and partner is None:
        subject = "self"
    subject_id = {"self": user_id, "partner": partner, "couple": None}[subject]
    return owner, subject_id


def save_memory(
    user_id,
    memory_type: str,
    content: str,
    shared=None,
    importance=None,
    subject: str = None,
    expires_at=None,
) -> bool:
    """Сохраняет воспоминание.

    Возвращает False, если запись пустая или это дубль (тогда у дубля
    повышается счётчик подтверждений и, при необходимости, важность).
    """
    if memory_type not in MEMORY_TYPES:
        raise ValueError(f"Неизвестный тип воспоминания: {memory_type}")

    content = clean_fact(content)
    if not content or content == TEST_MEMORY_TEXT:
        return False

    owner, subject_id = resolve_scope(user_id, memory_type, subject, shared)
    importance = clamp_importance(
        importance, DEFAULT_IMPORTANCE.get(memory_type, 3)
    )
    now = _utcnow()

    with get_db() as conn:
        with conn.cursor() as cursor:
            if owner is None:
                cursor.execute(
                    "SELECT id, content, importance FROM memories"
                    " WHERE user_id IS NULL ORDER BY id DESC LIMIT 500"
                )
            else:
                cursor.execute(
                    "SELECT id, content, importance FROM memories"
                    " WHERE user_id = %s ORDER BY id DESC LIMIT 500",
                    (owner,),
                )
            for mem_id, old_content, old_imp in cursor.fetchall():
                if _similar(old_content, content):
                    cursor.execute(
                        "UPDATE memories SET mentions = COALESCE(mentions, 1) + 1,"
                        " importance = %s, updated_at = %s WHERE id = %s",
                        (max(clamp_importance(old_imp), importance), now, mem_id),
                    )
                    return False

            cursor.execute(
                "INSERT INTO memories (user_id, memory_type, content, importance,"
                " subject_id, author_id, mentions, updated_at, expires_at)"
                " VALUES (%s, %s, %s, %s, %s, %s, 1, %s, %s)",
                (owner, memory_type, content, importance, subject_id, user_id,
                 now, expires_at),
            )
    return True


def update_memory(user_id, mem_id: int, content: str = None, importance=None) -> bool:
    """Уточняет существующую запись (её текст и/или важность).

    Менять можно только свою или общую запись пары.
    """
    content = clean_fact(content) if content else None
    now = _utcnow()
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT importance FROM memories WHERE id = %s"
                " AND (user_id = %s OR (user_id IS NULL AND %s = TRUE))",
                (mem_id, user_id, user_id in COUPLE_USER_IDS),
            )
            row = cursor.fetchone()
            if not row:
                return False
            new_imp = (
                clamp_importance(importance, row[0] or 3)
                if importance is not None else (row[0] or 3)
            )
            if content:
                cursor.execute(
                    "UPDATE memories SET content = %s, importance = %s,"
                    " mentions = COALESCE(mentions, 1) + 1, updated_at = %s"
                    " WHERE id = %s",
                    (content, new_imp, now, mem_id),
                )
            else:
                cursor.execute(
                    "UPDATE memories SET importance = %s,"
                    " mentions = COALESCE(mentions, 1) + 1, updated_at = %s"
                    " WHERE id = %s",
                    (new_imp, now, mem_id),
                )
    return True


def _keywords(text: str) -> set:
    return {w[:5] for w in re.findall(r"\w+", str(text).casefold()) if len(w) > 3}


def _memory_score(m: dict, kw: set, now: datetime) -> float:
    """Насколько воспоминание нужно прямо сейчас: важность + уместность + свежесть."""
    relevance = min(len(kw & _keywords(m["content"])), 3) if kw else 0
    half_life = HALF_LIFE_DAYS.get(m["type"], 240)
    stamp = m["updated_at"] or m["created_at"] or now
    age_days = max((now - stamp).total_seconds() / 86400, 0)
    freshness = 0.5 ** (age_days / half_life)
    # Важные записи (5) почти не стареют
    freshness = max(freshness, 0.6 if m["importance"] >= 5 else 0)
    return (
        m["importance"] * 2
        + min(m["mentions"], 5) * 0.5
        + relevance * 3
        + freshness * 2
    )


def _row_to_memory(r) -> dict:
    return {
        "id": r[0], "type": r[1], "content": r[2],
        "owner": r[3], "shared": r[3] is None,
        "importance": clamp_importance(r[4]),
        "subject_id": r[5], "author_id": r[6],
        "mentions": r[7] or 1,
        "created_at": _to_dt(r[8]), "updated_at": _to_dt(r[9]),
        "expires_at": _to_dt(r[10]),
    }


_MEM_COLUMNS = (
    "id, memory_type, content, user_id, importance, subject_id, author_id,"
    " mentions, created_at, updated_at, expires_at"
)


def get_memories(
    user_id: int,
    limit: int = 20,
    query: str = None,
    include_personal: bool = True,
    ranked: bool = True,
):
    """Воспоминания, которые ВИДИТ этот человек: его личные + общие пары.

    include_personal=False — только общие (групповой чат).
    ranked=True — отбор по важности, свежести и совпадению с query;
    ranked=False — просто последние записи (для /memory).
    Просроченные записи (expires_at в прошлом) не возвращаются.
    """
    fetch_limit = max(limit * 8, 300) if ranked else limit
    with get_db() as conn:
        with conn.cursor() as cursor:
            is_original_couple = user_id in COUPLE_USER_IDS
            if include_personal:
                if is_original_couple:
                    cursor.execute(
                        f"SELECT {_MEM_COLUMNS} FROM memories"
                        " WHERE (user_id = %s OR user_id IS NULL) AND content <> %s"
                        " ORDER BY id DESC LIMIT %s",
                        (user_id, TEST_MEMORY_TEXT, fetch_limit),
                    )
                else:
                    cursor.execute(
                        f"SELECT {_MEM_COLUMNS} FROM memories"
                        " WHERE user_id = %s AND content <> %s"
                        " ORDER BY id DESC LIMIT %s",
                        (user_id, TEST_MEMORY_TEXT, fetch_limit),
                    )
                rows = cursor.fetchall()
            elif is_original_couple:
                cursor.execute(
                    f"SELECT {_MEM_COLUMNS} FROM memories WHERE user_id IS NULL AND content <> %s ORDER BY id DESC LIMIT %s",
                    (TEST_MEMORY_TEXT, fetch_limit),
                )
                rows = cursor.fetchall()
            else:
                rows = []

    now = _utcnow()
    items = [_row_to_memory(r) for r in rows]
    items = [m for m in items if not (m["expires_at"] and m["expires_at"] < now)]

    if ranked:
        kw = _keywords(query) if query else set()
        for m in items:
            m["score"] = _memory_score(m, kw, now)
        items.sort(key=lambda m: -m["score"])
        # Ядро: самое важное берём всегда, остальное — по релевантности
        core = [m for m in items if m["importance"] >= 4][:MEMORY_CORE_LIMIT]
        taken = {m["id"] for m in core}
        rest = [m for m in items if m["id"] not in taken]
        items = (core + rest)[:limit]
    else:
        items = items[:limit]
    items.sort(key=lambda m: m["id"])  # хронологически
    return items


def format_memory_line(m: dict, speaker_id=None) -> str:
    """Одна строка памяти с понятной пометкой, о ком она."""
    tag = MEMORY_LABELS.get(m["type"], m["type"])
    stars = "⭐" * m.get("importance", 3) if m.get("importance", 3) >= 4 else ""
    return f"[{tag}] {m['content']}{(' ' + stars) if stars else ''}"


def build_memory_block(memories, existing_prompt: str, speaker_id=None, group=False) -> str:
    """Блок воспоминаний для системного промпта.

    Записи разложены по «чьё это»: о собеседнике, о его партнёре (со слов
    собеседника), общее у пары. Так модель не путает людей между собой.
    """
    existing = existing_prompt.casefold()
    about_me, about_partner, shared = [], [], []
    for m in memories:
        if m["content"].casefold() in existing:
            continue
        if m.get("shared", True):
            shared.append(m)
        elif m.get("subject_id") is not None and m["subject_id"] != speaker_id:
            about_partner.append(m)
        else:
            about_me.append(m)
    if not (about_me or about_partner or shared):
        return ""

    me = user_name(speaker_id) if speaker_id is not None else "собеседник"
    pid = partner_of(speaker_id) if speaker_id is not None else None
    partner = user_name(pid) if pid is not None else "партнёр"

    parts = [
        "\n\n🗂 ПАМЯТЬ. Не путай людей: каждая запись относится только к тому,"
        " кого указывает заголовок раздела. Факт про одного человека никогда не"
        " приписывай другому. Используй память естественно, к месту, не"
        " перечисляй её без повода. Внутренние шутки можно изредка"
        " обыгрывать; чувствами делись бережно, не давя и не цитируя дословно."
    ]
    if shared:
        parts.append(
            f"\n💞 Общее у пары ({me} и {partner}):\n"
            + "\n".join("- " + format_memory_line(m) for m in shared)
        )
    if about_me:
        parts.append(
            f"\n👤 Про {me} (твой собеседник сейчас, в личном разговоре):\n"
            + "\n".join("- " + format_memory_line(m) for m in about_me)
        )
    if about_partner:
        parts.append(
            f"\n🫶 Про {partner} (это рассказал(а) {me}; {partner} этого мог не"
            " говорить сам(а), не выдавай как чужие слова и не раскрывай"
            " секреты/сюрпризы):\n"
            + "\n".join("- " + format_memory_line(m) for m in about_partner)
        )
    return "\n".join(parts)


def memory_maintenance() -> dict:
    """Уборка: сливает почти-дубли, убирает просроченное и неважное старое."""
    now = _utcnow()
    stats = {"merged": 0, "expired": 0, "faded": 0}
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT {_MEM_COLUMNS} FROM memories ORDER BY id")
            items = [_row_to_memory(r) for r in cursor.fetchall()]

            dead = set()
            for m in items:
                if m["expires_at"] and m["expires_at"] < now - timedelta(days=7):
                    dead.add(m["id"]); stats["expired"] += 1
                    continue
                age = (now - (m["updated_at"] or m["created_at"] or now)).days
                if m["mentions"] <= 1 and (
                    (m["importance"] <= 2 and age > 60)
                    or (m["type"] == "emotion" and m["importance"] <= 3 and age > 120)
                ):
                    dead.add(m["id"]); stats["faded"] += 1

            # Слияние почти-дублей внутри одного владельца: остаётся более важная
            keep = [m for m in items if m["id"] not in dead]
            for i, a in enumerate(keep):
                if a["id"] in dead:
                    continue
                for b in keep[i + 1:]:
                    if b["id"] in dead or a["owner"] != b["owner"]:
                        continue
                    if _similar(a["content"], b["content"]):
                        winner, loser = (
                            (a, b) if (a["importance"], a["mentions"])
                            >= (b["importance"], b["mentions"]) else (b, a)
                        )
                        cursor.execute(
                            "UPDATE memories SET mentions = %s, importance = %s"
                            " WHERE id = %s",
                            (winner["mentions"] + loser["mentions"],
                             max(winner["importance"], loser["importance"]),
                             winner["id"]),
                        )
                        winner["mentions"] += loser["mentions"]
                        dead.add(loser["id"]); stats["merged"] += 1
                        if loser is a:
                            break
            for mem_id in dead:
                cursor.execute("DELETE FROM memories WHERE id = %s", (mem_id,))
    return stats


# --- СТАРАЯ ПАМЯТЬ (user_memory / couple_memory) ---


def get_user_memory(user_id: int) -> str:
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT memory_text FROM user_memory WHERE user_id = %s", (user_id,)
            )
            row = cursor.fetchone()
    return row[0] if row and row[0] else EMPTY_USER_MEMORY


def update_user_memory(user_id: int, new_fact: str):
    current_memory = get_user_memory(user_id)
    if current_memory == EMPTY_USER_MEMORY:
        updated = new_fact
    else:
        if new_fact.lower() in current_memory.lower():
            return
        updated = f"{current_memory}\n- {new_fact}"

    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO user_memory (user_id, memory_text) VALUES (%s, %s)"
                " ON CONFLICT (user_id) DO UPDATE SET memory_text ="
                " EXCLUDED.memory_text",
                (user_id, updated),
            )


def get_couple_memory() -> str:
    """Читает старую общую заметку пары; вызывается только для исходной пары."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT memory_text FROM couple_memory WHERE id = 1")
            row = cursor.fetchone()
    return row[0] if row and row[0] else EMPTY_COUPLE_MEMORY


def update_couple_memory(new_fact: str):
    current_memory = get_couple_memory()
    if current_memory == EMPTY_COUPLE_MEMORY:
        updated = new_fact
    else:
        if new_fact.lower() in current_memory.lower():
            return
        updated = f"{current_memory}\n- {new_fact}"

    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO couple_memory (id, memory_text) VALUES (1, %s) ON"
                " CONFLICT (id) DO UPDATE SET memory_text = EXCLUDED.memory_text",
                (updated,),
            )


# --- УДАЛЕНИЕ И ОЧИСТКА ---


def delete_memory_phrase(user_id: int, phrase: str):
    """Удаляет строки с фразой из старой памяти и из таблицы memories.

    Затрагивает: личную память пользователя и общую память пары.
    Личные воспоминания партнёра не трогает.
    """
    phrase_lower = phrase.lower().strip()
    if not phrase_lower:
        return []
    deleted_from = []

    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT memory_text FROM user_memory WHERE user_id = %s", (user_id,)
            )
            row = cursor.fetchone()
            if row and row[0]:
                lines = row[0].split("\n")
                new_lines = [l for l in lines if phrase_lower not in l.lower()]
                if len(new_lines) < len(lines):
                    updated = "\n".join(new_lines).strip() or EMPTY_USER_MEMORY
                    cursor.execute(
                        "UPDATE user_memory SET memory_text = %s WHERE user_id = %s",
                        (updated, user_id),
                    )
                    deleted_from.append("личную память")

            if user_id in COUPLE_USER_IDS:
                cursor.execute("SELECT memory_text FROM couple_memory WHERE id = 1")
                row = cursor.fetchone()
            else:
                row = None
            if row and row[0]:
                lines = row[0].split("\n")
                new_lines = [l for l in lines if phrase_lower not in l.lower()]
                if len(new_lines) < len(lines):
                    updated = "\n".join(new_lines).strip() or EMPTY_COUPLE_MEMORY
                    cursor.execute(
                        "UPDATE couple_memory SET memory_text = %s WHERE id = 1",
                        (updated,),
                    )
                    deleted_from.append("общую память пары")

            # Новая память: свои личные + общие
            cursor.execute(
                "SELECT id, content, user_id FROM memories"
                " WHERE user_id = %s OR (user_id IS NULL AND %s = TRUE)",
                (user_id, user_id in COUPLE_USER_IDS),
            )
            personal_ids, shared_ids = [], []
            for mem_id, content, owner in cursor.fetchall():
                if phrase_lower in content.lower():
                    (shared_ids if owner is None else personal_ids).append(mem_id)
            for mem_id in personal_ids + shared_ids:
                cursor.execute("DELETE FROM memories WHERE id = %s", (mem_id,))
            if personal_ids:
                deleted_from.append("личные воспоминания")
            if shared_ids:
                deleted_from.append("общие воспоминания пары")

    return deleted_from


def delete_memory_id(user_id: int, mem_id: int) -> bool:
    """Удаляет запись по номеру: свою или общую (чужую личную — нельзя)."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM memories WHERE id = %s"
                " AND (user_id = %s OR (user_id IS NULL AND %s = TRUE))",
                (mem_id, user_id, user_id in COUPLE_USER_IDS),
            )
            if not cursor.fetchone():
                return False
            cursor.execute("DELETE FROM memories WHERE id = %s", (mem_id,))
    return True


def clear_memory(user_id: int, include_shared: bool = False):
    """Очищает личную память пользователя. Общую память пары — только если include_shared."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM user_memory WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM memories WHERE user_id = %s", (user_id,))
            if include_shared and user_id in COUPLE_USER_IDS:
                cursor.execute("DELETE FROM couple_memory WHERE id = 1")
                cursor.execute("DELETE FROM memories WHERE user_id IS NULL")
