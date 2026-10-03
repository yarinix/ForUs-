import os
import logging
import asyncio
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineQueryResultArticle, InputTextMessageContent
import psycopg2
from google import genai
from google.genai import types as genai_types
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler



# 1. Создаем простейший HTTP-сервер для Render, чтобы он видел открытый порт
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

# 2. Запускаем HTTP-сервер в отдельном потоке перед стартом бота
if __name__ == "__main__":
    server_thread = threading.Thread(target=run_http_server, daemon=True)
    server_thread.start()
    
    # Здесь ваш стандартный запуск бота (например, asyncio.run(dp.start_polling(bot)))

# Настройка логирования
logging.basicConfig(level=logging.INFO)

# Получение переменных окружения
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# Инициализация бота и клиента Gemini
bot = Bot(token=TELEGRAM_TOKEN)
dp = Dispatcher()
client = genai.Client(api_key=GEMINI_API_KEY)

# Каскад моделей Gemini
MODELS_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

# --- РАБОТА С БАЗОЙ ДАННЫХ (NEON POSTGRESQL) ---

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            chat_id BIGINT,
            user_id BIGINT,
            role TEXT,
            content TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id BIGINT;")
    
    # Таблица долгосрочной памяти
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_memory (
            user_id BIGINT,
            memory_text TEXT
        );
    """)
    
    conn.commit()
    cursor.close()
    conn.close()


def save_message(chat_id: int, user_id: int, role: str, content: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (chat_id, user_id, role, content) VALUES (%s, %s, %s, %s)",
        (chat_id, user_id, role, content)
    )
    conn.commit()
    cursor.close()
    conn.close()

def get_user_history(user_id: int, limit: int = 10):
    """История сообщений едина для всех чатов пользователя по user_id"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, content FROM messages WHERE user_id = %s ORDER BY id DESC LIMIT %s",
        (user_id, limit)
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    history = []
    for role, content in reversed(rows):
        gemini_role = "user" if role == "user" else "model"
        history.append({"role": gemini_role, "parts": [{"text": content}]})
    return history

def get_user_memory(user_id: int) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT memory_text FROM user_memory WHERE user_id = %s", (user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row[0] if row and row[0] else "Пока нет сохраненной информации о пользователе."

def update_user_memory(user_id: int, new_fact: str):
    current_memory = get_user_memory(user_id)
    if current_memory == "Пока нет сохраненной информации о пользователе.":
        updated = new_fact
    else:
        if new_fact.lower() in current_memory.lower():
            return
        updated = f"{current_memory}\n- {new_fact}"
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Надежное обновление без использования конфликтов
    cursor.execute("SELECT user_id FROM user_memory WHERE user_id = %s", (user_id,))
    exists = cursor.fetchone()
    
    if exists:
        cursor.execute(
            "UPDATE user_memory SET memory_text = %s WHERE user_id = %s",
            (updated, user_id)
        )
    else:
        cursor.execute(
            "INSERT INTO user_memory (user_id, memory_text) VALUES (%s, %s)",
            (user_id, updated)
        )
        
    conn.commit()
    cursor.close()
    conn.close()


# --- КАСКАДНАЯ ОТПРАВКА ЗАПРОСОВ В GEMINI ---

async def process_with_cascade(history_contents, contents, system_prompt):
    for model_name in MODELS_CASCADE:
        try:
            chat = client.chats.create(
                model=model_name,
                history=history_contents,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt
                )
            )
            response = chat.send_message(contents)
            return response.text
        except Exception as e:
            logging.warning(f"Модель {model_name} недоступна: {e}. Пробуем следующую...")
            continue
    raise Exception("Все модели из каскада временно недоступны.")


async def extract_and_save_facts(user_id: int, user_message: str):
    prompt = (
        f"Проанализируй реплику пользователя и выдели из нее важные долгосрочные факты о нем "
        f"(его интересы, предпочтения, проекты, цели, стиль жизни, имена близких), если они там есть. "
        f"Выдавай факты кратко, с дефисом в начале (например: '- Любит научную фантастику'). "
        f"Если фактов нет вообще, ответь строго: 'НЕЧЕГО ВЫДЕЛЯТЬ'.\n\n"
        f"Реплика: {user_message}"
    )
    
    for model_name in MODELS_CASCADE:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt
            )
            fact = response.text.strip()
            if fact and "НЕЧЕГО ВЫДЕЛЯТЬ" not in fact:
                update_user_memory(user_id, fact)
            return
        except Exception as e:
            logging.warning(f"Модель {model_name} не смогла выделить факты: {e}. Пробуем следующую...")
            continue


# --- ОБРАБОТЧИКИ КОМАНД И СООБЩЕНИЙ ---

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer(
        "Привет! Я твой личный ИИ-помощник.\n"
        "• Текстовые сообщения я обрабатываю **строго** по префиксу **«чат»** (например: *«чат привет»*).\n"
        "• Голосовые сообщения, кружочки и фотографии я принимаю и понимаю нативно!\n"
        "• Моя память и история диалогов едины для всех чатов. Команда **/memory** покажет, что я помню о тебе.\n"
        "• Также поддерживается работа через инлайн-режим в любых чатах."
    )


@dp.message(Command("memory"))
async def cmd_memory(message: types.Message):
    user_id = message.from_user.id
    memory = get_user_memory(user_id)
    await message.answer(f"🧠 **Что я помню о тебе (во всех чатах):**\n\n{memory}")


@dp.message(F.text | F.voice | F.video_note | F.photo)
async def handle_media_or_text(message: types.Message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    
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
        user_text = message.caption or "Послушай это голосовое сообщение и ответь на него."

    elif message.video_note:
        file_id = message.video_note.file_id
        file = await bot.get_file(file_id)
        file_bytes = await bot.download_file(file.file_path)
        mime_type = "video/mp4"
        user_text = message.caption or "Посмотри это видеосообщение и ответь на него."

    elif message.photo:
        photo = message.photo[-1]
        file = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file.file_path)
        mime_type = "image/jpeg"
        user_text = message.caption or "Что изображено на этой фотографии? Опиши и проанализируй."

    # Подтягиваем глобальную память и общую историю со ВСЕХ чатов пользователя
    long_term_memory = get_user_memory(user_id)
    recent_history = get_user_history(user_id, limit=10)

    system_prompt = (
        f"Ты — умный и эмпатичный ИИ-помощник. Вот что тебе важно знать о пользователе "
        f"(эта информация и последние диалоги синхронизированы из всех его чатов):\n"
        f"{long_term_memory}\n\n"
        f"Учитывай эту информацию при ответах, общайся естественно."
    )

    try:
        if file_bytes:
            uploaded_file = client.files.upload(
                file=file_bytes,
                config={'mime_type': mime_type}
            )
            contents = [uploaded_file, user_text]
            saved_content = f"[Медиафайл] {user_text}"
        else:
            contents = user_text
            saved_content = user_text

        bot_response_text = await process_with_cascade(recent_history, contents, system_prompt)

        save_message(chat_id, user_id, "user", saved_content)
        save_message(chat_id, user_id, "model", bot_response_text)

        asyncio.create_task(extract_and_save_facts(user_id, saved_content))

        await message.answer(bot_response_text)

    except Exception as e:
        logging.error(f"Ошибка при обработке запроса: {e}")
        await message.answer("Произошла ошибка при обработке вашего сообщения. Попробуйте еще раз.")


# --- ИНЛАЙН-РЕЖИМ ---

@dp.inline_query()
async def inline_query_handler(query: types.InlineQuery):
    user_id = query.from_user.id
    query_text = query.query.strip()
    if not query_text:
        return

    long_term_memory = get_user_memory(user_id)
    system_prompt = (
        f"Ты — встроенный ИИ-ассистент в Telegram. Учитывай глобальный контекст о пользователе:\n"
        f"{long_term_memory}"
    )

    try:
        response_text = await process_with_cascade([], query_text, system_prompt)
        
        articles = [
            InlineQueryResultArticle(
                id="ai_response",
                title="Ответ от Gemini",
                input_message_content=InputTextMessageContent(message_text=response_text),
                description=response_text[:100] + "..."
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
