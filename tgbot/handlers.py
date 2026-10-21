"""Команды бота (/start, /pet, /draw, /memory…) и главный обработчик сообщений.

Часть бывшего app.py — код перенесён без изменений логики."""

import asyncio
import html
import logging
import os
import re

from aiogram import F, types
from aiogram.filters import Command, CommandObject
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from tgbot.config import (
    ALLOWED_USER_IDS,
    BOT_OWNER_ID,
    COUPLE_USER_IDS,
    EMPTY_COUPLE_MEMORY,
    EMPTY_USER_MEMORY,
    MEMORY_LABELS,
    MEMORY_TYPES,
    bot,
    dp,
    partner_of,
    remember_name,
    user_name,
)
from tgbot.webserver import public_base_url
from tgbot.db import get_chat_history, get_db, save_message
from tgbot.memory import (
    clear_memory,
    delete_memory_id,
    delete_memory_phrase,
    get_couple_memory,
    get_memories,
    get_user_memory,
    save_memory,
)
from tgbot.utils import FORMAT_HINT, current_time_str, is_allowed, send_long, send_markdown
from tgbot.llm import (
    extract_and_save_facts,
    process_with_cascade,
    run_in_background,
    transcribe_sync,
    upload_to_gemini,
)
from tgbot.reminders import INTENT_RE, add_reminder_from_text, parse_reminder_text

# ---------------------------------------------------------------------------
# ОБРАБОТЧИКИ КОМАНД И СООБЩЕНИЙ
# ---------------------------------------------------------------------------


async def send_draw_prompt(message: types.Message):
    # Проверка на групповой чат (в группах Web App кнопки запрещены Telegram)
    if message.chat.type != "private":
        bot_info = await bot.get_me()
        private_link = f"https://t.me/{bot_info.username}?start=draw"
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[
                InlineKeyboardButton(
                    text="🎨 Перейти в ЛС для рисования", url=private_link
                )
            ]]
        )
        await message.answer(
            "🎨 Создание рисунков через холст доступно только в <b>личных"
            " сообщениях</b> с ботом.\n\nНажми на кнопку ниже:",
            reply_markup=keyboard,
            parse_mode="HTML",
        )
        return

    base_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
    if not base_url:
        await message.answer(
            "⚠️ Холст не настроен: в окружении нет RENDER_EXTERNAL_URL."
        )
        return
    if base_url.startswith("http://"):
        base_url = base_url.replace("http://", "https://", 1)

    web_app_url = f"{base_url.rstrip('/')}/draw"
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="🎨 Открыть холст", web_app=WebAppInfo(url=web_app_url)
            )
        ]]
    )
    try:
        await message.answer(
            "Нажми на кнопку ниже, чтобы нарисовать что-нибудь:",
            reply_markup=keyboard,
        )
    except Exception as e:
        logging.error(f"Ошибка при вызове холста: {e}")


@dp.message(Command("draw"))
async def cmd_draw(message: types.Message):
    if not is_allowed(message.from_user):
        return
    await send_draw_prompt(message)


async def send_pet_prompt(message: types.Message):
    base = public_base_url()
    if not base:
        await message.answer("Игра пока недоступна: не задан адрес приложения.")
        return
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="🦦 Играть", web_app=WebAppInfo(url=f"{base}/pet"))
        ]]
    )
    await message.answer("Бублик ждёт вас! 🦦", reply_markup=keyboard)


@dp.message(Command("pet"))
async def cmd_pet(message: types.Message):
    if not is_allowed(message.from_user):
        return
    await send_pet_prompt(message)


@dp.message(Command("start"))
async def cmd_start(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    if command.args == "draw":
        await send_draw_prompt(message)
        return
    if command.args == "pet":
        await send_pet_prompt(message)
        return
    await message.answer(
        "Привет! Я твой личный ИИ-помощник.\n"
        "• В личке я общаюсь с тобой напрямую.\n"
        "• В общем чате я молча слушаю и запоминаю, а отзываюсь на префикс"
        " «чат» или ответ реплаем.\n"
        "• Новые пользователи получают отдельную память и игру.\n"
        "• Список команд: /command"
    )


@dp.message(Command("adduser"))
async def cmd_adduser(message: types.Message, command: CommandObject):
    """Добавляет Telegram ID в постоянный белый список. Только владелец бота."""
    if not message.from_user or message.from_user.id != BOT_OWNER_ID:
        return
    raw = (command.args or "").strip()
    if not raw.isdigit():
        await message.answer("Укажи числовой Telegram ID: /adduser 123456789")
        return
    new_id = int(raw)
    if new_id <= 0 or new_id > 9_223_372_036_854_775_807:
        await message.answer("❌ Некорректный Telegram ID.")
        return
    if new_id in ALLOWED_USER_IDS:
        await message.answer("ℹ️ Этот пользователь уже есть в белом списке.")
        return
    try:
        with get_db() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO bot_allowed_users (user_id, added_by) VALUES (%s, %s) ON CONFLICT (user_id) DO NOTHING",
                    (new_id, message.from_user.id),
                )
        ALLOWED_USER_IDS.append(new_id)
        await message.answer(
            f"✅ Пользователь {new_id} добавлен. У него будут отдельные личная память, история и игра. "
            "Он не добавляется в общую память пары автоматически."
        )
    except Exception:
        logging.exception("Не удалось добавить пользователя в белый список")
        await message.answer("❌ Не удалось сохранить пользователя. Проверь подключение к базе данных.")


COMMANDS_HELP = (
    "📋 <b>Доступные команды бота:</b>\n\n"
    "• /start — приветствие и справка\n"
    "• /command — список команд\n"
    "• /adduser &lt;telegram_id&gt; — добавить пользователя (только владелец)\n"
    "• /draw — холст для рисования\n"
    "• /pet — игра «Наша выдра»\n"
    "• /remind &lt;когда и что&gt; — напоминание (например: завтра в 18:00 купить цветы)\n"
    "• /reminders — список напоминаний, /reminddelete &lt;номер&gt; — удалить\n"
    "• /weather &lt;город&gt; — погода и прогноз на 3 дня\n"
    "• /limits — сколько запросов бот отправил в Gemini за сутки\n"
    "• /memory — посмотреть общую и личную память\n"
    "• /remember [тип] &lt;текст&gt; — запомнить вручную как важное (типы: personal,"
    " partner — про партнёра, couple, event, emotion, inside_joke)\n"
    "• /memorydelete &lt;номер или фраза&gt; — удалить запись\n"
    "• /memoryclear — очистить память (с подтверждением)\n\n"
    "🌤 <b>Инлайн-режим (@имя_бота):</b>\n"
    "• погода &lt;город&gt; — узнать погоду\n"
    "• любой текст — быстрый ответ от ИИ"
)


@dp.message(Command("command"))
async def cmd_command_list(message: types.Message):
    if not is_allowed(message.from_user):
        return
    await message.answer(COMMANDS_HELP, parse_mode="HTML")


def _memory_section(title: str, items) -> str:
    if not items:
        return ""
    lines = []
    for m in items:
        stars = "⭐" * m["importance"] if m["importance"] >= 4 else ""
        tag = MEMORY_LABELS.get(m["type"], m["type"])
        lines.append(
            f"• <code>{m['id']}</code> [{html.escape(tag)}]"
            f" {html.escape(m['content'])}{(' ' + stars) if stars else ''}"
        )
    return f"\n<b>{title}</b>\n" + "\n".join(lines) + "\n"


@dp.message(Command("memory"))
async def cmd_memory(message: types.Message):
    if not is_allowed(message.from_user):
        return
    user_id = message.from_user.id
    remember_name(message.from_user)
    me = user_name(user_id)
    pid = partner_of(user_id)
    partner = user_name(pid) if pid is not None else "партнёр"

    couple = await asyncio.to_thread(get_couple_memory) if user_id in COUPLE_USER_IDS else EMPTY_COUPLE_MEMORY
    personal = await asyncio.to_thread(get_user_memory, user_id)
    items = await asyncio.to_thread(get_memories, user_id, 80, None, True, False)

    shared = [m for m in items if m["shared"]]
    mine = [m for m in items if not m["shared"] and m["subject_id"] in (user_id, None)]
    about_partner = [
        m for m in items
        if not m["shared"] and m["subject_id"] not in (user_id, None)
    ]
    # сначала важное
    for group in (shared, mine, about_partner):
        group.sort(key=lambda m: (-m["importance"], -m["id"]))

    text = "🧠 <b>Память бота</b>\n(число — номер записи, ⭐ — важное)\n"
    text += _memory_section("💞 Общее у вас двоих", shared)
    text += _memory_section(f"👤 Про тебя ({html.escape(me)}) — видишь только ты", mine)
    text += _memory_section(
        f"🫶 Что ты рассказал(а) про {html.escape(partner)} — видишь только ты",
        about_partner,
    )
    if not items:
        text += "\nНовых воспоминаний пока нет.\n"
    if couple != EMPTY_COUPLE_MEMORY:
        text += f"\n💞 <b>Старая общая заметка:</b>\n{html.escape(couple)}\n"
    if personal != EMPTY_USER_MEMORY:
        text += f"\n👤 <b>Старая личная заметка:</b>\n{html.escape(personal)}\n"
    text += "\nУдалить: /memorydelete &lt;номер или фраза&gt;"
    await send_long(message, text, parse_mode="HTML")


REMEMBER_ALIASES = {"partner": ("personal", "partner"), "партнёр": ("personal", "partner")}


@dp.message(Command("remember"))
async def cmd_remember(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    args = (command.args or "").strip()
    mem_type, subject = "personal", None
    first, _, rest = args.partition(" ")
    key = first.lower()
    if key in REMEMBER_ALIASES and rest.strip():
        (mem_type, subject), args = REMEMBER_ALIASES[key], rest.strip()
    elif key in MEMORY_TYPES and rest.strip():
        mem_type, args = key, rest.strip()

    if not args:
        await message.answer(
            "⚠️ Напиши, что запомнить. Примеры:\n"
            "/remember couple Мы познакомились в апреле\n"
            "/remember partner Любит ромашки (факт про партнёра, видишь только ты)\n"
            "/remember inside_joke «Пельмени-ниндзя» — про тот случай на кухне\n"
            "Типы: personal, partner, couple, event, emotion, inside_joke."
        )
        return

    # Вручную сохранённое считаем важным
    saved = await asyncio.to_thread(
        save_memory, message.from_user.id, mem_type, args, None, 5, subject
    )
    label = MEMORY_LABELS[mem_type] + (" · про партнёра" if subject == "partner" else "")
    if saved:
        await message.answer(f"✅ Запомнил ({label}) как важное.")
    else:
        await message.answer("ℹ️ Такая запись уже есть (я отметил её как подтверждённую).")


@dp.message(Command("memorydelete"))
async def cmd_memory_delete(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    phrase = (command.args or "").strip()
    if not phrase:
        await message.answer(
            "⚠️ Укажи номер или текст. Примеры: /memorydelete 12 или /memorydelete горы"
        )
        return
    if phrase.isdigit():
        ok = await asyncio.to_thread(
            delete_memory_id, message.from_user.id, int(phrase)
        )
        await message.answer(
            "🗑 Запись удалена." if ok else "❌ Нет такой записи среди доступных тебе."
        )
        return
    deleted = await asyncio.to_thread(
        delete_memory_phrase, message.from_user.id, phrase
    )
    if deleted:
        await message.answer(
            f"🗑 Успешно удалено из разделов: <b>{', '.join(deleted)}</b>.",
            parse_mode="HTML",
        )
    else:
        await message.answer("❌ Совпадений с такой фразой в памяти не найдено.")


@dp.message(Command("memoryclear"))
async def cmd_memory_clear(message: types.Message):
    if not is_allowed(message.from_user):
        return
    in_couple = message.from_user.id in COUPLE_USER_IDS
    rows = [[InlineKeyboardButton(text="🗑 Только мою память", callback_data="mclear:me")]]
    if in_couple:
        rows.append([InlineKeyboardButton(
            text="💥 Мою и общую память пары", callback_data="mclear:all"
        )])
    rows.append([InlineKeyboardButton(text="Отмена", callback_data="mclear:cancel")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=rows)
    text = (
        "Что очистить?\n\n"
        "• «Только мою» — твои личные записи. Общая память пары и память"
        " партнёра останутся.\n"
        "• «Мою и общую» — ещё и всё, что общее для вас обоих (затронет и"
        " партнёра!)."
        if in_couple
        else "Очистить твою личную память?"
    )
    await message.answer(text, reply_markup=keyboard)


@dp.callback_query(F.data.startswith("mclear:"))
async def cb_memory_clear(callback: types.CallbackQuery):
    if not is_allowed(callback.from_user):
        await callback.answer()
        return
    action = callback.data.split(":", 1)[1]

    if action == "cancel":
        result = "Отменено, память не тронута."
    elif action in ("me", "all"):
        both = action == "all" and callback.from_user.id in COUPLE_USER_IDS
        await asyncio.to_thread(clear_memory, callback.from_user.id, both)
        result = (
            "🧹 Очищена личная и общая память пары."
            if both
            else "🧹 Твоя личная память очищена."
        )
    else:
        await callback.answer()
        return

    try:
        if callback.message:
            await callback.message.edit_text(result)
    except Exception:
        pass
    await callback.answer()


# --- ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ (ПАССИВ + АКТИВ) ---

MEDIA_PLACEHOLDERS = {"Голосовое сообщение", "Видеосообщение", "Фотография"}


# Команды обрабатываются своими обработчиками; общий обработчик их не перехватывает,
# в каком бы месте файла они ни были объявлены.
BOT_COMMANDS = ["draw", "pet", "start", "command", "adduser", "memory", "remember", "memorydelete",
                "memoryclear", "remind", "reminders", "reminddelete", "limits", "weather"]


@dp.message(~Command(*BOT_COMMANDS), F.text | F.voice | F.video_note | F.photo)
async def handle_media_or_text(message: types.Message):
    if not is_allowed(message.from_user):
        return

    user_id = message.from_user.id
    chat_id = message.chat.id
    chat_type = "private" if message.chat.type == "private" else "group"
    remember_name(message.from_user)
    speaker_name = user_name(user_id)

    user_text = ""
    file_bytes = None
    mime_type = None

    try:
        if message.text:
            user_text = message.text.strip()
        elif message.voice:
            file = await bot.get_file(message.voice.file_id)
            file_bytes = await bot.download_file(file.file_path)
            mime_type = "audio/ogg"
            user_text = message.caption or "Голосовое сообщение"
        elif message.video_note:
            file = await bot.get_file(message.video_note.file_id)
            file_bytes = await bot.download_file(file.file_path)
            mime_type = "video/mp4"
            user_text = message.caption or "Видеосообщение"
        elif message.photo:
            photo = message.photo[-1]
            file = await bot.get_file(photo.file_id)
            file_bytes = await bot.download_file(file.file_path)
            mime_type = "image/jpeg"
            user_text = message.caption or "Фотография"
    except Exception as e:
        logging.error(f"Не удалось скачать файл: {e}")
        await message.answer("Не получилось скачать файл (возможно, он слишком большой).")
        return

    # Определяем, нужно ли боту отвечать (активный режим) или просто слушать (пассивный)
    is_addressed_to_bot = False
    text_lower = user_text.lower()

    if chat_type == "private":
        is_addressed_to_bot = True  # В личке бот отвечает на всё
    else:
        # В группе проверяем префикс «чат» или ответ реплаем на сообщение бота
        if text_lower.startswith("чат"):
            is_addressed_to_bot = True
            user_text = user_text[3:].lstrip(" ,:;!?.-")
            if not user_text:
                user_text = "Привет!"
        elif (
            message.reply_to_message
            and message.reply_to_message.from_user
            and message.reply_to_message.from_user.id == bot.id
        ):
            is_addressed_to_bot = True

    # В группе голосовое/кружок не начинается с «чат» текстом, поэтому расшифровываем
    # речь: если сказано «Чат, …» — отвечаем; иначе расшифровка уходит в историю.
    if chat_type != "private" and file_bytes and mime_type in ("audio/ogg", "video/mp4"):
        try:
            media = await asyncio.to_thread(upload_to_gemini, file_bytes, mime_type)
            spoken = await asyncio.to_thread(transcribe_sync, media)
        except Exception as e:
            logging.warning(f"Не удалось расшифровать запись в группе: {e}")
            spoken = ""
        if spoken:
            low = spoken.lower().lstrip(" «\"'")
            if not is_addressed_to_bot and low.startswith("чат"):
                is_addressed_to_bot = True
                spoken = spoken.lstrip(" «\"'")[3:].lstrip(" ,:;!?.-") or "Привет!"
            user_text = spoken
            if is_addressed_to_bot:
                file_bytes = None  # речь уже в тексте, повторно файл не шлём

    # «Напомни завтра в 18:00 купить цветы», «через 5 минут напомни позвонить»,
    # «поставь напоминание…» — ставим напоминание без Gemini
    if is_addressed_to_bot and not file_bytes and not user_text.startswith("/"):
        head = " ".join(user_text.split()[:8])
        intent = INTENT_RE.search(head)
        if intent:
            strong = intent.start() == 0 and re.match(r"(?:пожалуйста[\s,]*)?напомни", head, re.I)
            if strong or await asyncio.to_thread(parse_reminder_text, user_text):
                logging.info(f"Напоминание из чата: {user_text[:120]!r}")
                await add_reminder_from_text(message, user_text)
                return

    # История берётся ДО сохранения текущего сообщения, иначе оно уйдёт в Gemini дважды
    recent_history = []
    if is_addressed_to_bot:
        recent_history = await asyncio.to_thread(get_chat_history, chat_id, 10)

    # 1. ВСЕГДА сохраняем сообщение в историю БД, чтобы бот видел хронологию общения
    await asyncio.to_thread(
        save_message, chat_id, user_id, chat_type, "user", f"{speaker_name}: {user_text}"
    )

    # 2. Запускаем фоновый анализ фактов (пропускаем пустяки, команды и «голые» медиа)
    worth_analyzing = (
        len(user_text) >= 12
        and not user_text.startswith("/")
        and user_text not in MEDIA_PLACEHOLDERS
    )
    if worth_analyzing:
        run_in_background(
            extract_and_save_facts(
                user_id, chat_type, f"{speaker_name}: {user_text}", chat_id
            )
        )

    # 3. Если к боту не обращались (пассивный режим в группе) — просто выходим
    if not is_addressed_to_bot:
        return

    # --- АКТИВНЫЙ РЕЖИМ (отправка ответа пользователю) ---
    now_line = f"Сейчас: {current_time_str()}."
    couple_memory = await asyncio.to_thread(get_couple_memory) if user_id in COUPLE_USER_IDS else EMPTY_COUPLE_MEMORY

    if chat_type == "private":
        user_memory = await asyncio.to_thread(get_user_memory, user_id)
        system_prompt = (
            f"Ты — эмпатичный ИИ-помощник. ЛИЧНЫЙ чат с {speaker_name}.\n"
            f"{now_line}\n\n"
            f"💞 Общая информация о паре:\n{couple_memory}\n\n"
            f"👤 Личная память:\n{user_memory}"
            f"{FORMAT_HINT}"
        )
    else:
        group_title = "ГРУППОВОЙ чат пары" if user_id in COUPLE_USER_IDS else "ГРУППОВОЙ чат"
        system_prompt = (
            f"Ты — эмпатичный ИИ-помощник. {group_title}.\n"
            f"Сейчас обращается: {speaker_name}.\n"
            f"{now_line}\n\n"
            + (f"💞 Общая информация о паре:\n{couple_memory}\n" if user_id in COUPLE_USER_IDS else "")
            + f"{FORMAT_HINT}"
        )

    try:
        if file_bytes:
            uploaded_file = await asyncio.to_thread(
                upload_to_gemini, file_bytes, mime_type
            )
            contents = [uploaded_file, user_text]
        else:
            contents = user_text

        bot_response_text = await process_with_cascade(
            recent_history,
            contents,
            system_prompt,
            user_id=user_id,
            chat_type=chat_type,
        )

        await asyncio.to_thread(
            save_message, chat_id, user_id, chat_type, "model", bot_response_text
        )
        await send_markdown(message, bot_response_text)

    except Exception as e:
        logging.error(f"Ошибка при обработке запроса: {e}")
        await message.answer(
            "Произошла ошибка при обработке сообщения. Попробуйте еще раз."
        )
