"""Общие утилиты: доступ, время, разбиение длинных сообщений, Markdown → HTML для Telegram.

Часть бывшего app.py — код перенесён без изменений логики."""

import html
import logging
import re
from datetime import datetime, timezone

from aiogram import types

from tgbot.config import ALLOWED_USER_IDS, BOT_TIMEZONE, TELEGRAM_TEXT_LIMIT

# ---------------------------------------------------------------------------
# УТИЛИТЫ
# ---------------------------------------------------------------------------


def is_allowed(user) -> bool:
    return bool(user) and user.id in ALLOWED_USER_IDS


def current_time_str() -> str:
    try:
        from zoneinfo import ZoneInfo

        now = datetime.now(ZoneInfo(BOT_TIMEZONE))
    except Exception:
        now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d %H:%M (%A), %Z")


def split_text(text: str, limit: int = TELEGRAM_TEXT_LIMIT):
    """Режет длинный текст на части по переводам строк (лимит Telegram — 4096)."""
    text = text or ""
    chunks = []
    while len(text) > limit:
        cut = text.rfind("\n", 0, limit)
        if cut < limit // 2:
            cut = text.rfind(" ", 0, limit)
        if cut < limit // 2:
            cut = limit
        chunks.append(text[:cut])
        text = text[cut:].lstrip("\n")
    if text:
        chunks.append(text)
    return chunks or [""]


async def send_long(message: types.Message, text: str, **kwargs):
    for chunk in split_text(text):
        await message.answer(chunk, **kwargs)


# --- ФОРМАТИРОВАНИЕ ОТВЕТОВ (Markdown от модели -> HTML Telegram) ---

FORMAT_HINT = (
    "\n\n✍️ Оформление ответа (Telegram): обычный разговор пиши живым текстом, без"
    " лишнего оформления. Если нужно выделить, используй **жирный** для главного,"
    " *курсив* для оттенков, `код` для команд и значений, списки через «- » и"
    " короткие заголовки через «# ». Не используй таблицы и не злоупотребляй"
    " выделением."
)

_TAG_RE = re.compile(r"<(/?)(b|i|s|u|code|pre|a|blockquote)(?:\s[^>]*)?>")


def html_is_balanced(text: str) -> bool:
    """Все ли теги закрыты в правильном порядке (иначе Telegram отклонит)."""
    stack = []
    for m in _TAG_RE.finditer(text):
        if m[1]:
            if not stack or stack.pop() != m[2]:
                return False
        else:
            stack.append(m[2])
    return not stack


def markdown_to_html(text: str) -> str:
    """Превращает Markdown (как его пишет Gemini) в HTML, понятный Telegram."""
    stash = []

    def keep(markup: str) -> str:
        stash.append(markup)
        return f"\x00{len(stash) - 1}\x00"

    esc = lambda s: html.escape(s, quote=False)
    text = str(text or "").replace("\x00", "")

    # 1. Код и таблицы прячем, чтобы внутри них ничего не форматировалось
    text = re.sub(
        r"```[ \t]*[\w+#-]*\n?(.*?)```",
        lambda m: keep(f"<pre>{esc(m[1].rstrip())}</pre>"),
        text, flags=re.S,
    )
    text = re.sub(
        r"`([^`\n]+)`", lambda m: keep(f"<code>{esc(m[1])}</code>"), text
    )

    def table(m):
        rows = [r.strip() for r in m[0].strip("\n").split("\n")]
        rows = [r for r in rows if not re.fullmatch(r"\|?[\s:|-]+\|?", r)]
        cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
        return keep("<pre>" + esc("\n".join("  ".join(r) for r in cells)) + "</pre>")

    text = re.sub(r"(?:^[ \t]*\|.*\|[ \t]*(?:\n|$)){2,}", lambda m: table(m) + "\n", text, flags=re.M)

    text = esc(text)

    # 2. Блочные элементы
    text = re.sub(r"^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$", r"<b>\1</b>", text, flags=re.M)
    text = re.sub(r"^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$", "──────────", text, flags=re.M)
    text = re.sub(
        r"^([ \t]*)[-*+•][ \t]+",
        lambda m: m[1].replace("\t", "  ") + "• ", text, flags=re.M,
    )
    text = re.sub(
        r"(?:^&gt;[ \t]?.*(?:\n|$))+",
        lambda m: "<blockquote>"
        + re.sub(r"^&gt;[ \t]?", "", m[0].rstrip("\n"), flags=re.M)
        + "</blockquote>\n",
        text, flags=re.M,
    )

    # 3. Выделения внутри строки
    text = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\w_])__(?=\S)(.+?)(?<=\S)__(?![\w_])", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"<i>\1</i>", text)
    text = re.sub(r"(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_])", r"<i>\1</i>", text)
    text = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"<s>\1</s>", text)
    text = re.sub(
        r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)",
        lambda m: f'<a href="{m[2].replace(chr(34), "%22")}">{m[1]}</a>', text,
    )

    # 4. Возвращаем спрятанное
    for _ in range(2):
        text = re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m[1])], text)
    return text.strip()


def strip_markdown(text: str) -> str:
    """Запасной вариант: убирает разметку, оставляя чистый текст."""
    text = re.sub(r"```[ \t]*[\w+#-]*\n?(.*?)```", r"\1", str(text or ""), flags=re.S)
    text = re.sub(r"^[ \t]{0,3}#{1,6}[ \t]+", "", text, flags=re.M)
    text = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m[1] or m[2], text)
    text = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"\1", text)
    text = re.sub(r"`([^`\n]+)`", r"\1", text)
    text = re.sub(r"^([ \t]*)[-*+][ \t]+", r"\1• ", text, flags=re.M)
    return text.strip()


async def send_markdown(message: types.Message, text: str, **kwargs):
    """Отправляет ответ модели с красивым форматированием.

    Если Telegram не принял HTML, шлёт чистый текст без разметки.
    """
    queue = split_text(text, 3500)
    while queue:
        chunk = queue.pop(0)
        rendered = markdown_to_html(chunk)
        if len(rendered) > TELEGRAM_TEXT_LIMIT and len(chunk) > 200:
            # HTML-теги удлиняют текст: делим кусок пополам и пробуем снова
            queue = split_text(chunk, len(chunk) // 2 + 1) + queue
            continue
        try:
            if not html_is_balanced(rendered):
                raise ValueError("теги не сбалансированы")
            await message.answer(rendered, parse_mode="HTML", **kwargs)
        except Exception as e:
            logging.info(f"Форматирование не прошло ({e}), шлю простым текстом")
            await message.answer(strip_markdown(chunk), **kwargs)



# --- ВРЕМЯ: местный часовой пояс бота ---

def local_tz():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(BOT_TIMEZONE)
    except Exception:
        return timezone.utc


def to_utc_naive(dt: datetime) -> datetime:
    """Любое время -> naive UTC (так хранится в базе). Без пояса = местное."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=local_tz())
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def format_local(dt_utc: datetime) -> str:
    local = dt_utc.replace(tzinfo=timezone.utc).astimezone(local_tz())
    return local.strftime("%d.%m.%Y %H:%M")
