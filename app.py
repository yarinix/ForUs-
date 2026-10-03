import os
import logging
import hashlib
import re
import psycopg2
from aiogram import Bot, Dispatcher, types, F
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

# Каскад моделей с учетом версий flash-lite
MODELS_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
]

# ==================== РАБОТА С POSTGRESQL (NEON) ====================

def get_db_connection():
    """Создаем подключение к внешней базе данных PostgreSQL на Neon"""
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def init_db():
    """Инициализация таблиц в базе данных"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Таблица для короткой истории сообщений (включая chat_id)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            chat_id BIGINT,
            user_id BIGINT,
            role TEXT,
            content TEXT
        )
    ''')
    
    # Автоматическая миграция, если таблица уже существовала без chat_id
    cursor.execute('''
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id BIGINT;
    ''')
    
    # Таблица для долгосрочной памяти (фактов о пользователе)
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

def get_user_history(chat_id: int, user_id: int, limit: int = 10):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Привязываем историю к конкретному чату и пользователю
    cursor.execute('''
        SELECT role, content FROM (
            SELECT role, content, id FROM messages 
            WHERE chat_id = %s AND user_id = %s 
            ORDER BY id DESC LIMIT %s
        ) sub ORDER BY id ASC
    ''', (chat_id, user_id, limit))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    # Форматируем под требования Gemini SDK
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
        return "Нет специфических сохраненных фактов."
    
    return "\n".join([f"- {row[0]}" for row in rows])

def add_fact_to_memory(user_id: int, fact: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO user_memory (user_id, fact) VALUES (%s, %s)', (user_id, fact))
    conn.commit()
    cursor.close()
    conn.close()

# ==================== ЛОГИКА ИИ И ИСКЛЮЧЕНИЕ ФАКТОВ ====================

async def process_with_cascade(history_contents, user_text, system_prompt):
    """Отправка запроса с каскадом моделей"""
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
    """Фоновый анализ диалога на предмет появления важных фактов о пользователе"""
    prompt = (
        f"Проанализируй реплику пользователя и ответ бота.\n"
        f"Пользователь: {user_text}\n"
        f"Бот: {bot_response}\n\n"
        f"Если пользователь упомянул какой-то важный факт о себе, своих проектах, интересах, "
        f"отношениях или целях, сформулируй его коротко в виде утверждения. "
        f"Если никакой новой важной информации нет, напиши ровно одно слово: НЕТ."
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
    await message.answer("Привет! Я на связи. Бот отвечает строго на сообщения, начинающиеся со слова «Чат».")

@dp.message(F.text)
async def handle_message(message: types.Message):
    user_text = message.text.strip()
    text_lower = user_text.lower()

    # Строго проверяем, начинается ли сообщение со слова "чат"
    if text_lower.startswith("чат"):
        # Защита от ложных срабатываний на слова вроде "чатер" или "печатать"
        if len(text_lower) == 3 or text_lower[3] in " ,:;!?.-":
            chat_id = message.chat.id
            user_id = message.from_user.id
            
            # Очищаем запрос от слова "чат" и разделителей (если нужен чистый текст для ИИ)
            clean_query = user_text[3:].lstrip(" ,:;!?.-")
            if not clean_query:
                clean_query = "Привет!" # Если написали просто "Чат,"

            long_term_memory = get_user_memory(user_id)
            recent_history = get_user_history(chat_id, user_id, limit=10)

            system_prompt = (
                f"Ты — умный и понимающий помощник. Вот что тебе важно знать о пользователе:\n"
                f"{long_term_memory}\n\n"
                f"Учитывай эту информацию при ответах, если это уместно."
            )

            try:
                bot_response_text = await process_with_cascade(recent_history, clean_query, system_prompt)

                save_message(chat_id, user_id, "user", clean_query)
                save_message(chat_id, user_id, "model", bot_response_text)

                await extract_and_save_facts(user_id, clean_query, bot_response_text)

                await message.answer(bot_response_text)

            except Exception as e:
                logging.error(f"Ошибка обработки сообщения: {e}")
                await message.answer("Извините, произошла ошибка при обращении к модели. Попробуйте написать еще раз.")

# ==================== ОБРАБОТЧИК INLINE-ЗАПРОСОВ ====================

@dp.inline_query()
async def handle_inline_query(inline_query: types.InlineQuery):
    user_id = inline_query.from_user.id
    query_text = inline_query.query.strip()

    if not query_text:
        return

    long_term_memory = get_user_memory(user_id)
    
    system_prompt = (
        f"Ты — умный помощник, отвечающий в inline-режиме.\n"
        f"Вот что тебе важно знать о пользователе:\n"
        f"{long_term_memory}"
    )

    try:
        response_text = await process_with_cascade([], query_text, system_prompt)
    except Exception as e:
        response_text = f"Ошибка генерации: {e}"

    # Очищаем текст от лишних символов разметки (*, _, #, `)
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

# ==================== ЗАПУСК ПРИЛОЖЕНИЯ ====================

async def main():
    init_db()
    logging.info("База данных Neon инициализирована. Запуск бота...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
