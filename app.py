import os
import asyncio
import sqlite3
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton, FSInputFile

BOT_TOKEN = os.getenv("BOT_TOKEN")
# Укажите здесь ваш Telegram ID, чтобы бот знал, кому слать бэкап (или бот будет присылать в тот чат, куда написали)
# Но лучше отправлять в чат, откуда вызвали команду бэкапа.

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
DB_NAME = "database.db"

# --- РАБОТА С БАЗОЙ ДАННЫХ ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def add_idea_to_db(idea_text: str):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO ideas (text) VALUES (?)", (idea_text,))
    conn.commit()
    conn.close()

def get_random_idea_from_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT text FROM ideas ORDER BY RANDOM() LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else "Пока нет сохраненных идей. Добавьте первую!"


# --- КЛАВИАТУРА ---
def get_main_keyboard():
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="💡 Случайная идея"), KeyboardButton(text="➕ Добавить идею")],
            [KeyboardButton(text="💾 Скачать бэкап базы")]
        ],
        resize_keyboard=True
    )

@dp.message(F.text == "/start")
async def cmd_start(message: Message):
    init_db()
    await message.answer(
        "Привет! Бот с базой данных и автобэкапом готов к работе.",
        reply_markup=get_main_keyboard()
    )

@dp.message(F.text == "💡 Случайная идея")
async def show_idea(message: Message):
    init_db()
    idea = get_random_idea_from_db()
    await message.answer(f"✨ Идея для вас:\n\n{idea}")

@dp.message(F.text == "➕ Добавить идею")
async def start_add_idea(message: Message):
    await message.answer("Напишите идею в формате:\n`/add [ваш текст]`\nНапример: `/add Устроить вечер кино`")

@dp.message(F.text.startswith("/add "))
async def save_new_idea(message: Message):
    init_db()
    idea_text = message.text[5:].strip()
    if idea_text:
        add_idea_to_db(idea_text)
        
        # Автоматический бэкап: сразу отправляем файл базы в чат после добавления!
        await message.answer(f"✅ Идея сохранена и создан свежий бэкап:")
        if os.path.exists(DB_NAME):
            db_file = FSInputFile(DB_NAME)
            await message.answer_document(db_file, caption="📦 Актуальный файл базы данных (сохраните на всякий случай)")
    else:
        await message.answer("Вы забыли написать саму идею после команды /add.")

@dp.message(F.text == "💾 Скачать бэкап базы")
async def send_backup(message: Message):
    init_db()
    if os.path.exists(DB_NAME):
        db_file = FSInputFile(DB_NAME)
        await message.answer_document(db_file, caption="📦 Вот текущий файл вашей базы данных:")
    else:
        await message.answer("Файл базы данных пока не создан.")

async def main():
    init_db()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
