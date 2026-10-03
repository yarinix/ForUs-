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
from aiogram.types import Message, InlineQuery, InlineQueryResultArticle, InputTextMessageContent

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

# Функция для запроса к Gemini с автоповтором (только gemini-3.8-flash)
async def generate_with_retry(prompt: str) -> str:
    model_name = 'gemini-3.8-flash'
    
    # Делаем до 3 попыток для модели
    for attempt in range(3):
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=prompt,
            )
            if response and response.text:
                return response.text
        except Exception as e:
            error_str = str(e)
            # Если ошибка 503 или перегрузка, ждем и пробуем снова
            if "503" in error_str or "UNAVAILABLE" in error_str or "high demand" in error_str:
                logging.warning(f"Модель {model_name} перегружена (попытка {attempt + 1}/3). Ждем...")
                await asyncio.sleep(2 ** attempt)  # 1с, 2с, 4с
                continue
            else:
                raise e
                
    raise Exception("Модель временно перегружена.")

@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    await message.answer(f"Привет, {html.quote(message.from_user.first_name)}! Я на связи. Меня можно использовать и в личных сообщениях, и через инлайн-режим в любых чатах (@имя_бота запрос).")

# Обработка обычных сообщений в ЛС
@dp.message()
async def chat_with_gemini(message: Message) -> None:
    try:
        answer_text = await generate_with_retry(message.text)
        await message.answer(answer_text)
    except Exception as e:
        logging.error(f"Ошибка при запросе к Gemini: {e}")
        await message.answer("Сейчас не могу ответить 😭")

# Обработка инлайн-запросов
@dp.inline_query()
async def inline_gemini_handler(inline_query: InlineQuery) -> None:
    query = inline_query.query.strip()
    
    if not query:
        result = InlineQueryResultArticle(
            id="empty_query",
            title="Введите запрос для Gemini",
            input_message_content=InputTextMessageContent(
                message_text="Пожалуйста, введите запрос после имени бота, например: @my_bot Напиши стихотворение"
            ),
            description="Например: @bot Сделай план на день"
        )
        await inline_query.answer([result], cache_time=1)
        return

    try:
        answer_text = await generate_with_retry(query)
    except Exception as e:
        logging.error(f"Ошибка при инлайн-запросе к Gemini: {e}")
        answer_text = "Сейчас не могу ответить 😭"

    result_id = str(hash(query))
    result = InlineQueryResultArticle(
        id=result_id,
        title=f"Ответ от Gemini: {query[:30]}...",
        input_message_content=InputTextMessageContent(
            message_text=answer_text,
            parse_mode=ParseMode.HTML
        ),
        description=answer_text[:100] + "..." if len(answer_text) > 100 else answer_text
    )
    
    await inline_query.answer([result], cache_time=0, is_personal=True)

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
    await web_server()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
