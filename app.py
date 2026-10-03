import os
import sys
import logging
import asyncio
from aiohttp import web
from google import genai
from aiogram import Bot, Dispatcher, html
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import Message

# Настройка логирования
logging.basicConfig(level=logging.INFO, stream=sys.stdout)

# Забираем ключи и порт от Render
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PORT = int(os.getenv("PORT", 10000))

if not TELEGRAM_BOT_TOKEN or not GEMINI_API_KEY:
    logging.error("Не заданы токен бота или API-ключ Gemini!")
    sys.exit(1)

# Инициализируем Gemini и aiogram
client = genai.Client(api_key=GEMINI_API_KEY)
bot = Bot(token=TELEGRAM_BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    await message.answer(f"Привет, {html.quote(message.from_user.first_name)}! Я на связи.")

@dp.message()
async def chat_with_gemini(message: Message) -> None:
    try:
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents=message.text,
        )
        await message.answer(response.text)
    except Exception as e:
        await message.answer(f"Что-то пошло не так: {e}")

# Заглушка для веб-сервера Render, чтобы порт был открыт
async def handle_ping(request):
    return web.Response(text="Bot is running!")

async def web_server():
    app = web.Application()
    app.router.add_get("/", handle_ping)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logging.info(f"Web server started on port {PORT}")

async def main() -> None:
    # Запускаем и веб-сервер для порта, и поллинг бота одновременно
    await web_server()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
