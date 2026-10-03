import os
import logging
import hashlib
import re
import psycopg2
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import InlineQueryResultArticle, InputTextMessageContent
from google import genai

# Настройка логирования
logging.basicConfig(level=logging.INFO)

# Получаем ключи из окружения Render
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
DATABASE_URL = os.environ.get("DATABASE_URL")

# Инициализация бота и клиента Gemini
bot = Bot(token=TELEGRAM_BOT_TOKEN)
dp = Dispatcher()
client = genai.Client(api_key=GEMINI_API_KEY)

# Каскад моделей
MODELS_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
]

# ==================== РАБОТА С POSTGRESQL (NEON) ====================

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Таблица истории сообщений (теперь сохраняет и chat_id, чтобы разделять группы и личку)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            chat_id BIGINT,
            user_id BIGINT,
            role TEXT,
            content TEXT
        )
    ''')
    
    # Таблица долгосрочной памяти для каждого пользователя персонально
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_memory (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            fact TEXT
        )
    ''')
    
    conn.commit()
    cursor.close()
    conn.close()

def save_message(chat_id: int, user_id: int, role: str, content: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO messages (chat_id, user_id, role, content) VALUES (%s, %s, %s, %s)',
        (chat_id, user_id, role, content)
    )
    conn.commit()
    cursor.close()
    conn.close()

def get_chat_history(chat_id: int, limit: int = 10):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT role, content FROM (
            SELECT role, content, id FROM messages 
            WHERE chat_id = %s 
            ORDER BY id DESC LIMIT %s
        ) sub ORDER BY id ASC
    ''', (chat_id, limit))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    history = []
    for role, content in rows:
        history.append({"role": role, "parts": [{"text": content}]})
    return history

def get_user_memory(user_id: int) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT fact FROM user_memory WHERE user_id = %s', (user_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    if not rows:
        return "Нет специфических сохраненных фактов об этом пользователе."
    
    return "\n".join([f"- {row[0]}" for row in rows])

def add_fact_to_memory(user_id: int, fact: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO user_memory (user_id, fact) VALUES (%s, %s)', (user_id, fact))
    conn.commit()
    cursor.close()
    conn.close()

# ==================== ЛОГИКА ИИ ====================

async def process_with_cascade(history_contents, user_text, system_prompt):
    for model_name in MODELS_CASCADE:
        try:
            chat = client.chats.create(
                model=model_name,
                history=history_contents,
                config={"system_instruction": system_prompt}
            )
            response = chat.send_message(user_text)
            return response.text
        except Exception as e:
            logging.warning(f"Модель {model_name} недоступна: {e}. Переключаем далее...")
            continue
    raise Exception("Все модели из каскада временно недоступны.")

async def extract_and_save_facts(user_id, user_text, bot_response):
    prompt = (
        f"Проанализируй реплику пользователя и ответ бота.\n"
        f"Пользователь: {user_text}\n"
        f"Бот: {bot_response}\n\n"
        f"Если пользователь упомянул важный факт о себе, своих интересах, целях или отношениях, "
        f"сформулируй его коротко в виде утверждения (например: 'Пользователь любит путешествовать'). "
        f"Если информации нет, напиши ровно: НЕТ."
    )
    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )
        fact = response.text.strip()
        if fact and "НЕТ" not in fact.upper() and len(fact) < 150:
            add_fact_to_memory(user_id, fact)
            logging.info(f"Сохранен новый факт для юзера {user_id}: {fact}")
    except Exception as e:
        logging.error(f"Ошибка при извлечении фактов: {e}")

# ==================== ОБРАБОТЧИКИ СООБЩЕНИЙ ====================

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer("Привет! Я готов работать как в личных сообщениях, так и в группах.")

@dp.message()
async def handle_message(message: types.Message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    user_text = message.text

    if not user_text:
        return

    is_group = message.chat.type in ["group", "supergroup"]
    bot_info = await bot.get_me()
    bot_username = bot_info.username

    # Если это группа, отвечаем только если бота упомянули (@botname) или ответили на его сообщение
    if is_group:
        is_mentioned = f"@{bot_username}" in user_text
        is_reply_to_bot = message.reply_to_message and message.reply_to_message.from_user.id == bot_info.id
        
        if not (is_mentioned or is_reply_to_bot):
            return  # Пропускаем обычные сообщения в группе, чтобы не спамить
        
        # Убираем упоминание бота из текста, чтобы модель не путалась
        user_text = user_text.replace(f"@{bot_username}", "").strip()

    # Собираем личную память конкретного пользователя и историю конкретного чата
    user_memory = get_user_memory(user_id)
    recent_history = get_chat_history(chat_id, limit=10)

    system_prompt = (
        f"Ты — умный и понимающий помощник.\n"
        f"Информация о пользователе, который пишет прямо сейчас:\n"
        f"{user_memory}\n\n"
        f"Учитывай её в общении."
    )

    try:
        bot_response_text = await process_with_cascade(recent_history, user_text, system_prompt)

        # Сохраняем историю привязанную к чату
        save_message(chat_id, user_id, "user", user_text)
        save_message(chat_id, user_id, "model", bot_response_text)

        # Запоминаем факты о человеке, который написал
        await extract_and_save_facts(user_id, user_text, bot_response_text)

        await message.answer(bot_response_text)

    except Exception as e:
        logging.error(f"Ошибка обработки сообщения: {e}")
        await message.answer("Произошла ошибка при обработке запроса.")

# ==================== ОБРАБОТЧИК INLINE-ЗАПРОСОВ ====================

@dp.inline_query()
async def handle_inline_query(inline_query: types.InlineQuery):
    user_id = inline_query.from_user.id
    query_text = inline_query.query.strip()

    if not query_text:
        return

    user_memory = get_user_memory(user_id)
    
    system_prompt = (
        f"Ты — умный помощник в inline-режиме.\n"
        f"Информация о пользователе:\n"
        f"{user_memory}"
    )

    try:
        response_text = await process_with_cascade([], query_text, system_prompt)
    except Exception as e:
        response_text = f"Ошибка генерации: {e}"

    clean_response = re.sub(r'[*_#`]', '', response_text)

    result_id = hashlib.md5(query_text.encode()).hexdigest()
    articles = [
        InlineQueryResultArticle(
            id=result_id,
            title="Ответ от Gemini",
            description=clean_response[:100] + "...",
            input_message_content=InputTextMessageContent(
                message_text=clean_response
            )
        )
    ]

    await inline_query.answer(articles, cache_time=1, is_personal=True)

# ==================== ЗАПУСК ====================

async def main():
    init_db()
    logging.info("Бот запущен с поддержкой групп и личных чатов!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
