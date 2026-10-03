import os
import logging
import hashlib
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

# Каскад моделей с учетом новых версий flash-lite
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
    
    # Таблица для короткой истории сообщений
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            role TEXT,
            content TEXT
        )
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

def save_message(user_id: int, role: str, content: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO messages (user_id, role, content) VALUES (%s, %s, %s)',
        (user_id, role, content)
    )
    conn.commit()
    cursor.close()
    conn.close()

def get_user_history(user_id: int, limit: int = 10):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT role, content FROM (
            SELECT role, content, id FROM messages 
            WHERE user_id = %s 
            ORDER BY id DESC LIMIT %s
        ) sub ORDER BY id ASC
    ''', (user_id, limit))
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
        f"отношениях или целях, сформулируй его коротко в виде утверждения (например: 'Пользователь увлекается монтажом в CapCut'). "
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
    await message.answer("Привет! Я на связи. База данных Neon подключена, модели обновлены, инлайн-режим активен.")

@dp.message()
async def handle_message(message: types.Message):
    user_id = message.from_user.id
    user_text = message.text

    # 1. Собираем долгосрочную память и недавний контекст
    long_term_memory = get_user_memory(user_id)
    recent_history = get_user_history(user_id, limit=10)

    # 2. Формируем системный промпт с фактами о пользователе
    system_prompt = (
        f"Ты — умный и понимающий помощник. Вот что тебе важно знать о пользователе:\n"
        f"{long_term_memory}\n\n"
        f"Учитывай эту информацию при ответах, если это уместно."
    )

    try:
        # 3. Отправляем запрос через каскад моделей
        bot_response_text = await process_with_cascade(recent_history, user_text, system_prompt)

        # 4. Сохраняем диалог в таблицу сообщений
        save_message(user_id, "user", user_text)
        save_message(user_id, "model", bot_response_text)

        # 5. Проверяем и записываем новые факты в долгосрочную память
        await extract_and_save_facts(user_id, user_text, bot_response_text)

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

    # Получаем долгосрочную память пользователя, чтобы бот «знал» вас и в инлайн-режиме
    long_term_memory = get_user_memory(user_id)
    
    system_prompt = (
        f"Ты — умный помощник, отвечающий в inline-режиме.\n"
        f"Вот что тебе важно знать о пользователе:\n"
        f"{long_term_memory}"
    )

    try:
        # В инлайн-режиме передаем пустую историю сообщений, но используем память и промпт
        response_text = await process_with_cascade([], query_text, system_prompt)
    except Exception as e:
        response_text = f"Ошибка генерации: {e}"

    # Формируем результат для выдачи во всплывающем меню
    result_id = hashlib.md5(query_text.encode()).hexdigest()
    articles = [
        InlineQueryResultArticle(
            id=result_id,
            title="Ответ от Gemini",
            description=response_text[:100] + "...",
            input_message_content=InputTextMessageContent(
                message_text=response_text
            )
        )
    ]

    await inline_query.answer(articles, cache_time=1, is_personal=True)

# ==================== ЗАПУСК ПРИЛОЖЕНИЯ ====================

async def main():
    # Инициализируем базу данных при старте
    init_db()
    logging.info("База данных Neon инициализирована. Запуск бота...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
