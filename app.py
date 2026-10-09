import os
import logging
import asyncio
import urllib.request
import urllib.parse
from contextlib import contextmanager
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineQueryResultArticle, InputTextMessageContent
import psycopg2
from google import genai
from google.genai import types as genai_types
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import base64


# 1. Простейший HTTP-сервер для Render
class WebAppHandler(BaseHTTPRequestHandler):

  def do_GET(self):
    parsed_path = urllib.parse.urlparse(self.path)
    if parsed_path.path == "/" or parsed_path.path == "/health":
      self.send_response(200)
      self.end_headers()
      self.wfile.write(b"Bot is alive!")
    elif parsed_path.path == "/draw":
      try:
        with open("static/draw.html", "rb") as f:
          content = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(content)
      except Exception as e:
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"Drawing page not found")
    else:
      self.send_response(404)
      self.end_headers()

  def do_POST(self):
    parsed_path = urllib.parse.urlparse(self.path)
    if parsed_path.path == "/api/upload":
      content_length = int(self.headers.get("Content-Length", 0))
      body = self.rfile.read(content_length)
      try:
        data = json.loads(body.decode("utf-8"))
        chat_id = data.get("chat_id")
        user_name = data.get("name", "Пользователь")
        image_base64 = data.get("image")

        if image_base64 and chat_id:
          if "," in image_base64:
            image_base64 = image_base64.split(",")[1]

          image_bytes = base64.b64decode(image_base64)
          
          # Формируем подпись
          caption_text = f"От {user_name} ♥️"

          # Отправляем картинку с подписью в чат через Telegram Bot API
          url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto"
          boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
          
          body_data = (
              f"--{boundary}\r\n"
              f'Content-Disposition: form-data; name="chat_id"\r\n\r\n'
              f"{chat_id}\r\n"
              f"--{boundary}\r\n"
              f'Content-Disposition: form-data; name="caption"\r\n\r\n'
              f"{caption_text}\r\n"
              f"--{boundary}\r\n"
              f'Content-Disposition: form-data; name="photo";'
              f' filename="drawing.png"\r\n'
              f"Content-Type: image/png\r\n\r\n"
          ).encode("utf-8") + image_bytes + f"\r\n--{boundary}--\r\n".encode(
              "utf-8"
          )

          req = urllib.request.Request(
              url,
              data=body_data,
              headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
          )
          with urllib.request.urlopen(req) as resp:
            pass

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))
      except Exception as e:
        logging.error(f"Ошибка загрузки рисунка: {e}")
        self.send_response(500)
        self.end_headers()
        self.wfile.write(b"Error")


# Настройка логирования
logging.basicConfig(level=logging.INFO)

# Получение переменных окружения
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# Читаем белый список пользователей
ALLOWED_USERS_RAW = os.getenv("ALLOWED_USERS", "5084782149,1253880871")
ALLOWED_USER_IDS = [
    int(uid.strip()) for uid in ALLOWED_USERS_RAW.split(",") if uid.strip().isdigit()
]

USER_NAMES = {
    5084782149: "Основной пользователь",
    1253880871: "Полина",
}

# Инициализация бота и клиента Gemini
bot = Bot(token=TELEGRAM_TOKEN)
dp = Dispatcher()
client = genai.Client(api_key=GEMINI_API_KEY)

# Каскад моделей Gemini
MODELS_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]


# --- БЕЗОПАСНЫЙ КОНТЕКСТНЫЙ МЕНЕДЖЕР БД ---


@contextmanager
def get_db():
  conn = psycopg2.connect(DATABASE_URL)
  try:
    yield conn
    conn.commit()
  except Exception as e:
    conn.rollback()
    logging.error(f"Ошибка базы данных: {e}")
    raise
  finally:
    conn.close()


def init_db():
  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    chat_id BIGINT,
                    user_id BIGINT,
                    chat_type TEXT,
                    role TEXT,
                    content TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
      cursor.execute(
          "ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id BIGINT;"
      )
      cursor.execute(
          "ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_type TEXT;"
      )

      cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_memory (
                    user_id BIGINT PRIMARY KEY,
                    memory_text TEXT
                );
            """)

      cursor.execute("""
                CREATE TABLE IF NOT EXISTS couple_memory (
                    id INT PRIMARY KEY,
                    memory_text TEXT
                );
            """)
      cursor.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT,
                    memory_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo


@dp.message(Command("draw"))
async def cmd_draw(message: types.Message):
    if ALLOWED_USER_IDS and message.from_user.id not in ALLOWED_USER_IDS:
        return

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
            "🎨 Создание рисунков через холст доступно только в **личных сообщениях** с ботом.\n\nНажми на кнопку ниже:",
            reply_markup=keyboard
        )
        return

    # Логика для личных сообщений
    base_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
    if not base_url:
        base_url = "https://твой-реальный-сервис.onrender.com"
    elif base_url.startswith("http://"):
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
            reply_markup=keyboard
        )
    except Exception as e:
        logging.error(f"Ошибка при вызове холста: {e}")


def save_message(
    chat_id: int, user_id: int, chat_type: str, role: str, content: str
):
  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute(
          "INSERT INTO messages (chat_id, user_id, chat_type, role, content)"
          " VALUES (%s, %s, %s, %s, %s)",
          (chat_id, user_id, chat_type, role, content),
      )


def get_chat_history(chat_id: int, limit: int = 10):
  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute(
          "SELECT role, content FROM messages WHERE chat_id = %s ORDER BY id"
          " DESC LIMIT %s",
          (chat_id, limit),
      )
      rows = cursor.fetchall()

  history = []
  for role, content in reversed(rows):
    gemini_role = "user" if role == "user" else "model"
    history.append({"role": gemini_role, "parts": [{"text": content}]})
  return history


def save_memory(user_id: int, memory_type: str, content: str):
    allowed_types = {
        "personal",
        "couple",
        "event",
        "emotion",
        "inside_joke",
    }

    if memory_type not in allowed_types:
        raise ValueError(f"Неизвестный тип воспоминания: {memory_type}")

    content = content.strip()
    if not content:
        return

    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO memories (user_id, memory_type, content)
                VALUES (%s, %s, %s)
                """,
                (user_id, memory_type, content),
            )

def get_memories(user_id: int, limit: int = 20):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT memory_type, content
                FROM memories
                WHERE user_id = %s OR user_id IS NULL
                ORDER BY id DESC
                LIMIT %s
                """,
                (user_id, limit),
            )
            rows = cursor.fetchall()

    return [
        {"type": memory_type, "content": content}
        for memory_type, content in reversed(rows)
    ]
def get_user_memory(user_id: int) -> str:
  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute(
          "SELECT memory_text FROM user_memory WHERE user_id = %s", (user_id,)
      )
      row = cursor.fetchone()
  return row[0] if row and row[0] else "Нет личной сохраненной информации."


def update_user_memory(user_id: int, new_fact: str):
  current_memory = get_user_memory(user_id)
  if current_memory == "Нет личной сохраненной информации.":
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
  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute("SELECT memory_text FROM couple_memory WHERE id = 1")
      row = cursor.fetchone()
  return row[0] if row and row[0] else "Пока нет общей информации о паре."


def update_couple_memory(new_fact: str):
  current_memory = get_couple_memory()
  if current_memory == "Пока нет общей информации о паре.":
    updated = new_fact
  else:
    if new_fact.lower() in current_memory.lower():
      return
    updated = f"{current_memory}\n- {new_fact}"

  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute(
          "INSERT INTO couple_memory (id, memory_text) VALUES (1, %s) ON CONFLICT"
          " (id) DO UPDATE SET memory_text = EXCLUDED.memory_text",
          (updated,),
      )


def delete_memory_phrase(user_id: int, phrase: str):
  phrase_lower = phrase.lower().strip()
  deleted_from = []

  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute(
          "SELECT memory_text FROM user_memory WHERE user_id = %s", (user_id,)
      )
      row = cursor.fetchone()
      if row and row[0]:
        lines = row[0].split("\n")
        new_lines = [line for line in lines if phrase_lower not in line.lower()]
        if len(new_lines) < len(lines):
          updated = (
              "\n".join(new_lines).strip()
              if new_lines
              else "Нет личной сохраненной информации."
          )
          cursor.execute(
              "UPDATE user_memory SET memory_text = %s WHERE user_id = %s",
              (updated, user_id),
          )
          deleted_from.append("личную память")

    with conn.cursor() as cursor:
      cursor.execute("SELECT memory_text FROM couple_memory WHERE id = 1")
      row = cursor.fetchone()
      if row and row[0]:
        lines = row[0].split("\n")
        new_lines = [line for line in lines if phrase_lower not in line.lower()]
        if len(new_lines) < len(lines):
          updated = (
              "\n".join(new_lines).strip()
              if new_lines
              else "Пока нет общей информации о паре."
          )
          cursor.execute(
              "UPDATE couple_memory SET memory_text = %s WHERE id = 1",
              (updated,),
          )
          deleted_from.append("общую память пары")

  return deleted_from


# --- ФУНКЦИЯ ПОГОДЫ ---


def get_weather(city: str) -> str:
  try:
    encoded_city = urllib.parse.quote(city)
    url = f"https://wttr.in/{encoded_city}?format=3&lang=ru"
    req = urllib.request.Request(url, headers={"User-Agent": "curl/7.68.0"})
    with urllib.request.urlopen(req, timeout=5) as response:
      return response.read().decode("utf-8").strip()
  except Exception as e:
    logging.error(f"Ошибка получения погоды: {e}")
    return f"Не удалось получить погоду для города: {city}"


# --- КАСКАДНАЯ ОТПРАВКА ЗАПРОСОВ В GEMINI ---


async def process_with_cascade(history_contents, contents, system_prompt):
  for model_name in MODELS_CASCADE:
    try:
      chat = client.chats.create(
          model=model_name,
          history=history_contents,
          config=genai_types.GenerateContentConfig(
              system_instruction=system_prompt
          ),
      )
      response = chat.send_message(contents)
      return response.text
    except Exception as e:
      logging.warning(
          f"Модель {model_name} недоступна: {e}. Пробуем следующую..."
      )
      continue
  raise Exception("Все модели из каскада временно недоступны.")


async def extract_and_save_facts(user_id: int, chat_type: str, user_message: str):
  speaker_name = USER_NAMES.get(user_id, "Пользователь")
  
  # Улучшенный промпт со строгим фильтром от сиюминутного мусора
  prompt = (
      f"Проанализируй реплику от '{speaker_name}' (ID: {user_id}).\n"
      f"Определи, есть ли здесь **важная, долговременная информация** (предпочтения, черты характера, важные планы, цели, привычки, годовщины, значимые события).\n\n"
      f"⚠️ КАТЕГОРИЧЕСКИ ИГНОРИРУЙ временные, сиюминутные состояния и бытовые действия (например: 'спит', 'устал сегодня', 'кушает', 'едет в транспорте', 'болит голова', 'смотрит фильм прямо сейчас'). Такие сиюминутные мелочи ЗАПРЕЩЕНО сохранять в память.\n\n"
      f"Выдай ответ строго в формате:\n"
      f"PERSONAL: [долговременный факт о пользователе или НЕТ]\n"
      f"COUPLE: [долговременный факт об отношениях/паре или НЕТ]\n\n"
      f"Реплика: {user_message}"
  )

  for model_name in MODELS_CASCADE:
    try:
      response = client.models.generate_content(
          model=model_name, contents=prompt
      )
      text = response.text.strip()

      lines = text.split("\n")
      personal_fact, couple_fact = "НЕТ", "НЕТ"
      for line in lines:
        if line.startswith("PERSONAL:"):
          personal_fact = line.replace("PERSONAL:", "").strip()
        elif line.startswith("COUPLE:"):
          couple_fact = line.replace("COUPLE:", "").strip()

      if personal_fact and "НЕТ" not in personal_fact.upper():
        update_user_memory(user_id, personal_fact)

      if couple_fact and "НЕТ" not in couple_fact.upper():
        update_couple_memory(couple_fact)

      return
    except Exception as e:
      logging.warning(
          f"Модель {model_name} не смогла выделить факты: {e}. Пробуем следующую..."
      )
      continue



# --- ОБРАБОТЧИКИ КОМАНД И СООБЩЕНИЙ ---


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
  if message.from_user.id not in ALLOWED_USER_IDS:
    return
  await message.answer(
      "Привет! Я твой личный ИИ-помощник.\n"
      "• В личке я общаюсь с тобой напрямую.\n"
      "• В общем чате я молча слушаю и запоминаю, а отзываюсь на префикс"
      " **«чат»** или ответ реплаем."
  )


@dp.message(Command("command"))
async def cmd_command_list(message: types.Message):
  if message.from_user.id not in ALLOWED_USER_IDS:
    return
  await message.answer(
      "📋 **Доступные команды бота:**\n\n"
      "• `/start` — Приветствие и справка.\n"
      "• `/command` — Список команд.\n"
      "• `/memory` — Посмотреть личную и общую память пары.\n"
      "• `/memorydelete <фраза>` — Удалить факт по ключевой фразе.\n"
      "• `/memoryclear` — Полностью очистить память.\n\n"
      "🌤 **Инлайн-режим (@имя_бота):**\n"
      "• `погода <город>` — узнать погоду.\n"
      "• Любой текст — быстрый ответ от ИИ.",
      parse_mode="Markdown",
  )


@dp.message(Command("memorytest"))
async def cmd_memory_test(message: types.Message):
    user_id = message.from_user.id

    if user_id not in ALLOWED_USER_IDS:
        return

    test_text = "Тестовая запись памяти"

    try:
        await asyncio.to_thread(
            save_memory,
            user_id,
            "inside_joke",
            test_text,
        )

        with get_db() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id
                    FROM memories
                    WHERE user_id = %s
                      AND memory_type = %s
                      AND content = %s
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (user_id, "inside_joke", test_text),
                )
                result = cursor.fetchone()

        if result:
            await message.answer(
                f"✅ Тест пройден! Воспоминание сохранено. ID: {result[0]}"
            )
        else:
            await message.answer(
                "⚠️ Запись не найдена после сохранения."
            )

    except Exception:
        logging.exception("Ошибка тестирования новой памяти")
        await message.answer(
            "❌ Проверка не пройдена. Посмотри логи Render."
        )


@dp.message(Command("memory"))
async def cmd_memory(message: types.Message):
  user_id = message.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    return
  await message.answer(
      f"🧠 **Память бота:**\n\n"
      f"💞 **Общая информация о паре:**\n{get_couple_memory()}\n\n"
      f"👤 **Твоя личная память:**\n{get_user_memory(user_id)}"
  )


@dp.message(Command("memorydelete"))
async def cmd_memory_delete(message: types.Message):
  user_id = message.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    return
  parts = message.text.split(maxsplit=1)
  if len(parts) < 2:
    await message.answer(
        "⚠️ Укажи текст для удаления. Пример: `/memorydelete горы`",
        parse_mode="Markdown",
    )
    return
  phrase = parts[1].strip()
  deleted = delete_memory_phrase(user_id, phrase)
  if deleted:
    await message.answer(
        f"🗑 Успешно удалено из разделов: **{', '.join(deleted)}**.",
        parse_mode="Markdown",
    )
  else:
    await message.answer("❌ Совпадений с такой фразой в памяти не найдено.")


@dp.message(Command("memoryclear"))
async def cmd_memory_clear(message: types.Message):
  user_id = message.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    return
  with get_db() as conn:
    with conn.cursor() as cursor:
      cursor.execute(
          "UPDATE user_memory SET memory_text = 'Нет личной сохраненной"
          " информации.' WHERE user_id = %s",
          (user_id,),
      )
      cursor.execute(
          "UPDATE couple_memory SET memory_text = 'Пока нет общей информации о"
          " паре.' WHERE id = 1"
      )
  await message.answer("🧹 Вся память успешно очищена!")


# --- ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ (ПАССИВ + АКТИВ) ---


@dp.message(F.text | F.voice | F.video_note | F.photo)
async def handle_media_or_text(message: types.Message):
  user_id = message.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    return

  chat_id = message.chat.id
  chat_type = "private" if message.chat.type == "private" else "group"
  speaker_name = USER_NAMES.get(user_id, "Пользователь")

  user_text = ""
  file_bytes = None
  mime_type = None

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
    elif message.reply_to_message and message.reply_to_message.from_user.id == bot.id:
      is_addressed_to_bot = True

  # 1. ВСЕГДА сохраняем сообщение в историю БД, чтобы бот видел хронологию общения
  save_message(chat_id, user_id, chat_type, "user", f"{speaker_name}: {user_text}")

  # 2. ВСЕГДА запускаем фоновый анализ фактов для памяти
  asyncio.create_task(
      extract_and_save_facts(user_id, chat_type, f"{speaker_name}: {user_text}")
  )

  # 3. Если к боту не обращались (пассивный режим в группе) — просто выходим
  if not is_addressed_to_bot:
    return

  # --- АКТИВНЫЙ РЕЖИМ (отправка ответа пользователю) ---
  couple_memory = get_couple_memory()
  recent_history = get_chat_history(chat_id, limit=10)

  if chat_type == "private":
    user_memory = get_user_memory(user_id)
    system_prompt = (
        f"Ты — эмпатичный ИИ-помощник. ЛИЧНЫЙ чат с {speaker_name}.\n\n"
        f"💞 Общая информация о паре:\n{couple_memory}\n\n"
        f"👤 Личная память:\n{user_memory}"
    )
  else:
    system_prompt = (
        f"Ты — эмпатичный ИИ-помощник. ГРУППОВОЙ чат пары.\n"
        f"Сейчас обращается: {speaker_name}.\n\n"
        f"💞 Общая информация о паре:\n{couple_memory}"
    )

  try:
    if file_bytes:
      uploaded_file = client.files.upload(
          file=file_bytes, config={"mime_type": mime_type}
      )
      contents = [uploaded_file, user_text]
    else:
      contents = user_text

    bot_response_text = await process_with_cascade(
        recent_history,
        contents,
        system_prompt,
        user_id=user_id,
    )

    save_message(chat_id, user_id, chat_type, "model", bot_response_text)
    await message.answer(bot_response_text)

  except Exception as e:
    logging.error(f"Ошибка при обработке запроса: {e}")
    await message.answer(
        "Произошла ошибка при обработке сообщения. Попробуйте еще раз."
    )


# --- ИНЛАЙН-РЕЖИМ ---


@dp.inline_query()
async def inline_query_handler(query: types.InlineQuery):
    if query.from_user.id not in ALLOWED_USER_IDS:
        return
    
    query_text = query.query.strip()
    if not query_text:
        return

    if query_text.lower().startswith(("погода", "weather")):
        parts = query_text.split(maxsplit=1)
        city = parts[1].strip() if len(parts) > 1 else "Москва"
        loop = asyncio.get_running_loop()
        weather_text = await loop.run_in_executor(None, get_weather, city)
        articles = [
            InlineQueryResultArticle(
                id="weather_res",
                title=f"Погода в городе: {city}",
                input_message_content=InputTextMessageContent(
                    message_text=weather_text
                ),
                description=weather_text,
            )
        ]
        await query.answer(articles, cache_time=60)
        return

    system_prompt = (
        "Ты — быстрый встроенный ИИ-ассистент в Telegram. Отвечай точно, кратко и по делу."
    )
    try:
        response_text = await process_with_cascade([], query_text, system_prompt)
        articles = [
            InlineQueryResultArticle(
                id="ai_response",
                title="Ответ от Gemini",
                input_message_content=InputTextMessageContent(
                    message_text=response_text
                ),
                description=response_text[:100] + "...",
            )
        ]
        await query.answer(articles, cache_time=1)
    except Exception as e:
        logging.error(f"Ошибка в инлайн-режиме: {e}")





# --- ЗАПУСК БОТА ---




# Функция для запуска нашего веб-сервера
def run_http_server():
    port = int(os.environ.get("PORT", 10000))
    server = HTTPServer(("0.0.0.0", port), WebAppHandler)
    print(f"HTTP server started on port {port}")
    server.serve_forever()

async def main():
    logging.info("Инициализация базы данных...")

    await asyncio.to_thread(init_db)

    logging.info("База данных готова.")
    logging.info("Бот запущен...")

    await dp.start_polling(bot)

if __name__ == "__main__":
    # 1. Запускаем HTTP-сервер в фоновом потоке (чтобы Render видел порт и отдавал /draw)
    server_thread = threading.Thread(target=run_http_server, daemon=True)
    server_thread.start()
    
    # 2. Запускаем Telegram-бота в основном потоке
    asyncio.run(main())
