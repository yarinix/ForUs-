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
from duckduckgo_search import DDGS


# 1. Простейший HTTP-сервер для Render
class HealthCheckHandler(BaseHTTPRequestHandler):
  def do_GET(self):
    self.send_response(200)
    self.end_headers()
    self.wfile.write(b"Bot is alive!")


def run_http_server():
  port = int(os.environ.get("PORT", 10000))
  server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
  print(f"HTTP server started on port {port}")
  server.serve_forever()


if __name__ == "__main__":
  server_thread = threading.Thread(target=run_http_server, daemon=True)
  server_thread.start()

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


# --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ПОГОДА И ПОИСК) ---


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


def web_search(query: str) -> str:
  """Выполняет поиск в интернете через DuckDuckGo и возвращает результаты"""
  try:
    with DDGS() as ddgs:
      results = [r.get("body", "") for r in ddgs.text(query, max_results=3)]
      if results:
        return "\n".join([f"- {res}" for res in results])
  except Exception as e:
    logging.error(f"Ошибка веб-поиска: {e}")
  return ""


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
  prompt = (
      f"Проанализируй реплику от пользователя '{speaker_name}' (ID: {user_id})."
      f" Определи, что из этого является личным фактом именно для"
      f" {speaker_name} (записывать в его личную память), а что — общей"
      f" информацией о паре (отношения, совместные планы, быт). Выдай ответ"
      f" строго в формате:\nPERSONAL: [факт или НЕТ]\nCOUPLE: [факт или"
      f" НЕТ]\n\nРеплика: {user_message}"
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
          f"Модель {model_name} не смогла выделить факты: {e}. Пробуем"
          f" следующую..."
      )
      continue


# --- ОБРАБОТЧИКИ КОМАНД И СООБЩЕНИЙ ---


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
  if message.from_user.id not in ALLOWED_USER_IDS:
    logging.warning(
        f"⚠️ Попытка неавторизованного доступа (cmd_start):"
        f" user_id={message.from_user.id},"
        f" username=@{message.from_user.username}"
    )
    return

  await message.answer(
      "Привет! Я твой личный ИИ-помощник с функцией веб-поиска.\n"
      "• Сообщения обрабатываются по префиксу **«чат»**.\n"
      "• Введите команду **/command**, чтобы посмотреть список всех доступных"
      " команд."
  )


@dp.message(Command("command"))
async def cmd_command_list(message: types.Message):
  user_id = message.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    logging.warning(
        f"⚠️ Попытка неавторизованного доступа (cmd_command): user_id={user_id},"
        f" username=@{message.from_user.username}"
    )
    return

  await message.answer(
      "📋 **Доступные команды бота:**\n\n"
      "• `/start` — Приветствие и справка.\n"
      "• `/command` — Показать этот список команд.\n"
      "• `/memory` — Посмотреть личную и общую память пары.\n"
      "• `/memorydelete <фраза>` — Удалить факт по ключевой фразе.\n"
      "• `/memoryclear` — Полностью очистить память.\n\n"
      "🌐 **Веб-поиск:**\n"
      "• Бот автоматически умеет искать свежую информацию в интернете, если в"
      " вопросе есть запрос актуальных данных.\n\n"
      "🌤 **Инлайн-режим (@имя_бота):**\n"
      "• `погода <город>` — узнать погоду.\n"
      "• Любой текст — быстрый ответ от ИИ.",
      parse_mode="Markdown",
  )


@dp.message(Command("memory"))
async def cmd_memory(message: types.Message):
  user_id = message.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    logging.warning(
        f"⚠️ Попытка неавторизованного доступа (cmd_memory): user_id={user_id},"
        f" username=@{query_username := message.from_user.username}"
    )
    return

  user_mem = get_user_memory(user_id)
  couple_mem = get_couple_memory()

  await message.answer(
      f"🧠 **Память бота:**\n\n"
      f"💞 **Общая информация о паре:**\n{couple_mem}\n\n"
      f"👤 **Твоя личная память:**\n{user_mem}"
  )


@dp.message(Command("memorydelete"))
async def cmd_memory_delete(message: types.Message):
  user_id = message.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    logging.warning(
        f"⚠️ Попытка неавторизованного доступа (cmd_memorydelete):"
        f" user_id={user_id}, username=@{message.from_user.username}"
    )
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
    logging.warning(
        f"⚠️ Попытка неавторизованного доступа (cmd_memoryclear):"
        f" user_id={user_id}, username=@{message.from_user.username}"
    )
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

  await message.answer(
      "🧹 Вся твоя личная память и общая память пары полностью очищены!"
  )


@dp.message(F.text | F.voice | F.video_note | F.photo)
async def handle_media_or_text(message: types.Message):
  user_id = message.from_user.id

  if user_id not in ALLOWED_USER_IDS:
    logging.warning(
        f"⚠️ Попытка неавторизованного доступа (сообщение/медиа):"
        f" user_id={user_id}, username=@{message.from_user.username}"
    )
    return

  chat_id = message.chat.id
  chat_type = "private" if message.chat.type == "private" else "group"
  speaker_name = USER_NAMES.get(user_id, "Пользователь")

  user_text = ""
  file_bytes = None
  mime_type = None

  if message.text:
    user_text = message.text.strip()
    text_lower = user_text.lower()

    if text_lower.startswith("чат"):
      if len(text_lower) == 3 or text_lower[3] in " ,:;!?.-":
        user_text = user_text[3:].lstrip(" ,:;!?.-")
        if not user_text:
          user_text = "Привет!"
      else:
        return
    else:
      return

  elif message.voice:
    file_id = message.voice.file_id
    file = await bot.get_file(file_id)
    file_bytes = await bot.download_file(file.file_path)
    mime_type = "audio/ogg"
    user_text = (
        message.caption or "Послушай это голосовое сообщение и ответь на него."
    )

  elif message.video_note:
    file_id = message.video_note.file_id
    file = await bot.get_file(file_id)
    file_bytes = await bot.download_file(file.file_path)
    mime_type = "video/mp4"
    user_text = (
        message.caption or "Посмотри это видеосообщение и ответь на него."
    )

  elif message.photo:
    photo = message.photo[-1]
    file = await bot.get_file(photo.file_id)
    file_bytes = await bot.download_file(file.file_path)
    mime_type = "image/jpeg"
    user_text = (
        message.caption or "Что изображено на этой фотографии? Опиши и проанализируй."
    )

  couple_memory = get_couple_memory()
  recent_history = get_chat_history(chat_id, limit=10)

  # Проверяем, нужен ли веб-поиск (если вопрос выглядит как запрос актуальной информации)
  search_context = ""
  if (
      user_text
      and not file_bytes
      and any(
          kw in user_text.lower()
          for kw in [
              "найди",
              "поиск",
              "что такое",
              "кто такой",
              "свежие",
              "новости",
              "курс",
              "цена",
              "какой",
              "какая",
              "сколько стоит",
              "расписание",
          ]
      )
  ):
    loop = asyncio.get_running_loop()
    search_results = await loop.run_in_executor(None, web_search, user_text)
    if search_results:
      search_context = (
          f"\n\n🌐 Актуальная информация из интернета по запросу:\n{search_results}"
      )

  if chat_type == "private":
    user_memory = get_user_memory(user_id)
    system_prompt = (
        f"Ты — эмпатичный ИИ-помощник с доступом к веб-поиску. Ты находишься в"
        f" ЛИЧНОМ чате с пользователем {speaker_name}.\n\n"
        f"💞 Общая информация о паре:\n{couple_memory}\n\n"
        f"👤 Личная информация о пользователе"
        f" {speaker_name}:\n{user_memory}{search_context}\n\n"
        f"Правила:\n"
        f"1. Общайся естественно.\n"
        f"2. Используй данные из интернета, если они переданы, чтобы отвечать"
        f" актуально.\n"
        f"3. Если тема сменилась, не цепляйся за старые сообщения из истории."
    )
  else:
    system_prompt = (
        f"Ты — эмпатичный ИИ-помощник с доступом к веб-поиску. Ты находишься в"
        f" ГРУППОВОМ чате с парой.\nСейчас пишет: {speaker_name}.\n\n"
        f"💞 Общая информация о паре:\n{couple_memory}{search_context}\n\n"
        f"Правила:\n"
        f"1. Учитывай контекст пары.\n"
        f"2. Используй данные из интернета при необходимости.\n"
        f"3. Если тема сменилась, не зацикливайся на прошлом."
    )

  try:
    if file_bytes:
      uploaded_file = client.files.upload(
          file=file_bytes, config={"mime_type": mime_type}
      )
      contents = [uploaded_file, user_text]
      saved_content = f"[Медиафайл] {user_text}"
    else:
      contents = user_text
      saved_content = user_text

    bot_response_text = await process_with_cascade(
        recent_history, contents, system_prompt
    )

    save_message(chat_id, user_id, chat_type, "user", saved_content)
    save_message(chat_id, user_id, chat_type, "model", bot_response_text)

    asyncio.create_task(
        extract_and_save_facts(user_id, chat_type, saved_content)
    )

    await message.answer(bot_response_text)

  except Exception as e:
    logging.error(f"Ошибка при обработке запроса: {e}")
    await message.answer(
        "Произошла ошибка при обработке вашего сообщения. Попробуйте еще раз."
    )


# --- ИНЛАЙН-РЕЖИМ ---


@dp.inline_query()
async def inline_query_handler(query: types.InlineQuery):
  user_id = query.from_user.id
  if user_id not in ALLOWED_USER_IDS:
    logging.warning(
        f"⚠️ Попытка неавторизованного доступа (inline_query): user_id={user_id},"
        f" username=@{query.from_user.username}"
    )
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
      "Ты — быстрый встроенный ИИ-ассистент в Telegram. Отвечай точно, кратко и"
      " по делу на запрос пользователя."
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


async def main():
  init_db()
  logging.info("Бот запущен и готов к работе...")
  await dp.start_polling(bot)


if __name__ == "__main__":
  asyncio.run(main())
