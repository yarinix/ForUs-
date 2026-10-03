import os
import sys
import logging
import asyncio
from google import genai
from aiogram import Bot, Dispatcher, html
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import Message

# Забираем ключи из переменных окружения
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Проверяем, на месте ли ключи
if not TELEGRAM_BOT_TOKEN or not GEMINI_API_KEY:
    logging.error("Не заданы токен бота или API-ключ Gemini!")
    sys.exit(1)

# Инициализируем клиента Google GenAI и бота
client = genai.Client(api_key=GEMINI_API_KEY)
bot = Bot(token=TELEGRAM_BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()  # <--- СНАЧАЛА СОЗДАЕМ ДИСПЕТЧЕР

# А ТОЛЬКО ПОТОМ ВЕШАЕМ НА НЕГО ДЕКОРАТОРЫ:
@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    await message.answer(f"Привет, {html.quote(message.from_user.first_name)}! Я на связи.")

@dp.message()
async def chat_with_gemini(message: Message) -> None:
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=message.text,
        )
        await message.answer(response.text)
    except Exception as e:
        await message.answer(f"Что-то пошло не так: {e}")

async def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
