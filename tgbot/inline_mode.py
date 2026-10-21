"""Инлайн-режим: рисунки и быстрые ответы через @бота.

Часть бывшего app.py — код перенесён без изменений логики."""

import asyncio
import logging
import os
import re

from aiogram import types
from aiogram.types import (
    InlineQueryResultArticle,
    InlineQueryResultCachedPhoto,
    BufferedInputFile,
    InputTextMessageContent,
    WebAppInfo,
)

from tgbot.config import TELEGRAM_TEXT_LIMIT, bot, clean_caption_name, dp
from tgbot.webserver import _drawings, _drawings_lock, public_base_url
from tgbot.utils import FORMAT_HINT, html_is_balanced, is_allowed, markdown_to_html, strip_markdown
from tgbot.weather import geocode, get_weather
from tgbot.llm import process_with_cascade, run_in_background

# --- ИНЛАЙН-РЕЖИМ ---


_drawing_file_ids = {}  # метка -> file_id уже загруженного в Telegram рисунка

# Куда Telegram временно загружает рисунок, чтобы выдать file_id.
# Лучше всего — закрытый канал, где бот администратор: тогда в личных чатах
# ничего не появляется. Если не задан, используется личный чат с ботом, а
# копия удаляется через DRAWING_COPY_TTL секунд (KEEP_DRAWING_COPY=1 — не удалять).
_storage_raw = os.getenv("DRAWING_STORAGE_CHAT_ID", "").strip()
DRAWING_STORAGE_CHAT_ID = int(_storage_raw) if _storage_raw.lstrip("-").isdigit() else None
KEEP_DRAWING_COPY = os.getenv("KEEP_DRAWING_COPY", "0") == "1"
DRAWING_COPY_TTL = int(os.getenv("DRAWING_COPY_TTL", "120"))


async def delete_message_later(chat_id: int, message_id: int, delay: float):
    await asyncio.sleep(delay)
    try:
        await bot.delete_message(chat_id=chat_id, message_id=message_id)
    except Exception as e:
        logging.warning(f"Не удалось удалить служебную копию рисунка: {e}")


async def get_drawing_file_id(token: str, item, user_id: int) -> str:
    """Загружает рисунок в Telegram обычной отправкой фото и возвращает file_id.

    Фото попадает в личный чат пользователя с ботом (без звука) — это и есть
    надёжный способ получить file_id для инлайн-результата. Telegram сам
    перекодирует картинку, поэтому проблем с форматом не возникает.
    """
    if token in _drawing_file_ids:
        return _drawing_file_ids[token]
    _, data, mime = item
    ext = "png" if mime == "image/png" else "jpg"
    target_chat = DRAWING_STORAGE_CHAT_ID or user_id
    msg = await bot.send_photo(
        chat_id=target_chat,
        photo=BufferedInputFile(data, filename=f"drawing.{ext}"),
        caption="🎨 Служебная копия рисунка (удалится сама)",
        disable_notification=True,
    )
    file_id = msg.photo[-1].file_id
    if DRAWING_STORAGE_CHAT_ID is None and not KEEP_DRAWING_COPY:
        run_in_background(
            delete_message_later(target_chat, msg.message_id, DRAWING_COPY_TTL)
        )
    _drawing_file_ids[token] = file_id
    if len(_drawing_file_ids) > 200:
        _drawing_file_ids.pop(next(iter(_drawing_file_ids)))
    return file_id


def draw_inline_button():
    base = public_base_url()
    if not base:
        return None
    return types.InlineQueryResultsButton(
        text="🎨 Нарисовать", web_app=WebAppInfo(url=f"{base}/draw")
    )


INLINE_DEBOUNCE_SEC = float(os.getenv("INLINE_DEBOUNCE_SEC", "1.5"))
_inline_latest = {}  # user_id -> id последнего инлайн-запроса


@dp.inline_query()
async def inline_query_handler(query: types.InlineQuery):
    if not is_allowed(query.from_user):
        return

    button = draw_inline_button()
    query_text = query.query.strip()[:1000]
    if not query_text:
        # пустой запрос: показываем только кнопку «Нарисовать»
        await query.answer([], button=button, cache_time=0, is_personal=True)
        return

    # Рисунок, присланный холстом: «draw <метка>» -> фото-результат
    m = re.fullmatch(r"(?:draw|рисунок)\s+([0-9a-f]{32})", query_text.lower())
    if m:
        token = m.group(1)
        with _drawings_lock:
            item = _drawings.get(token)
        if item:
            name = clean_caption_name(query.from_user.first_name)
            try:
                file_id = await get_drawing_file_id(token, item, query.from_user.id)
                results = [
                    InlineQueryResultCachedPhoto(
                        id=token,
                        photo_file_id=file_id,
                        caption=f"От {name} ♥️",
                    )
                ]
            except Exception:
                logging.exception("Не удалось подготовить рисунок для инлайн-режима")
                results = [
                    InlineQueryResultArticle(
                        id="drawing_error",
                        title="Не удалось подготовить рисунок",
                        description="Нарисуй заново",
                        input_message_content=InputTextMessageContent(
                            message_text="🎨 Не удалось подготовить рисунок."
                        ),
                    )
                ]
        else:
            results = [
                InlineQueryResultArticle(
                    id="drawing_missing",
                    title="Рисунок не найден или устарел",
                    description="Открой холст и нарисуй заново",
                    input_message_content=InputTextMessageContent(
                        message_text="🎨 Рисунок не найден, нарисуй заново."
                    ),
                )
            ]
        await query.answer(results, button=button, cache_time=0, is_personal=True)
        return

    if query_text.lower().startswith(("погода", "weather")):
        parts = query_text.split(maxsplit=1)
        city = parts[1].strip() if len(parts) > 1 else ""

        def hint(title, description):
            return [
                InlineQueryResultArticle(
                    id="weather_hint",
                    title=title,
                    description=description,
                    input_message_content=InputTextMessageContent(
                        message_text=f"{title}. {description}"
                    ),
                )
            ]

        # Пока человек печатает, приходят неполные названия («Ом», «Омс»)
        if len(city) < 3:
            await query.answer(
                hint("🌤 Погода", "Допиши название города, например: погода Омск"),
                button=button, cache_time=0, is_personal=True,
            )
            return

        places = await asyncio.to_thread(geocode, city, 5)
        # Если город с таким именем один — показываем только его
        exact = [p for p in places if p.get("name", "").casefold() == city.casefold()]
        if len(exact) == 1:
            places = exact
        places = places[:3]
        if not places:
            await query.answer(
                hint(f"Не нашёл город «{city[:40]}»", "Проверь написание или допиши название"),
                button=button, cache_time=0, is_personal=True,
            )
            return

        texts = await asyncio.gather(
            *(asyncio.to_thread(get_weather, city, p) for p in places)
        )
        articles = []
        for i, (place, text) in enumerate(zip(places, texts)):
            lines = text.splitlines()
            summary = lines[1] if len(lines) > 1 else text
            articles.append(
                InlineQueryResultArticle(
                    id=f"weather_{i}",
                    title=place["title"] if len(places) > 1 else (lines[0] if lines else place["title"]),
                    description=summary[:120],
                    input_message_content=InputTextMessageContent(message_text=text),
                )
            )
        # Результаты с неполным вводом не кэшируем надолго
        await query.answer(articles, button=button, cache_time=30, is_personal=True)
        return

    # Telegram присылает инлайн-запрос почти на каждую набранную букву.
    # Чтобы не тратить лимит Gemini, ждём паузу в наборе: если за это время
    # пришёл более новый запрос от того же человека — этот пропускаем.
    # Если вопрос уже закончен знаком ? ! . — отвечаем сразу.
    if len(query_text) < 3:
        return
    if not query_text.endswith(("?", "!", ".", "？", "！")):
        uid = query.from_user.id
        _inline_latest[uid] = query.id
        await asyncio.sleep(INLINE_DEBOUNCE_SEC)
        if _inline_latest.get(uid) != query.id:
            return

    system_prompt = (
        "Ты — быстрый встроенный ИИ-ассистент в Telegram. Отвечай точно, кратко и по делу."
    )
    try:
        response_text = await process_with_cascade(
            [], query_text, system_prompt + FORMAT_HINT
        )
        response_text = response_text[:3500]
        rendered = markdown_to_html(response_text)
        if html_is_balanced(rendered) and len(rendered) <= TELEGRAM_TEXT_LIMIT:
            content = InputTextMessageContent(
                message_text=rendered, parse_mode="HTML"
            )
        else:
            content = InputTextMessageContent(
                message_text=strip_markdown(response_text)
            )
        articles = [
            InlineQueryResultArticle(
                id="ai_response",
                title="Ответ от Gemini",
                input_message_content=content,
                description=strip_markdown(response_text)[:100] + "...",
            )
        ]
        await query.answer(articles, button=button, cache_time=1, is_personal=True)
    except Exception as e:
        logging.error(f"Ошибка в инлайн-режиме: {e}")
