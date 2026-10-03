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

async def generate_with_retry(prompt: str) -> str:
    model_name = 'gemini-3.8-flash'
    
    last_error = None
    for attempt in range(3):
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=prompt,
            )
            if response and response.text:
                return response.text
            else:
                raise Exception("Пустой ответ от модели")
        except Exception as e:
            last_error = e
            error_str = str(e)
            logging.warning(f"Попытка {attempt + 1}/3 неудачна: {error_str}")
            if "503" in error_str or "UNAVAILABLE" in error_str or "high demand" in error_str:
                await asyncio.sleep(2 ** attempt)
                continue
            else:
                break
                
    raise last_error

@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    await message.answer(f"Привет, {html.quote(message.from_user.first_name)}! Я на связи.")

@dp.message()
async def chat_with_gemini(message: Message) -> None:
    try:
        answer_text = await generate_with_retry(message.text)
        await message.answer(answer_text)
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Полная ошибка: {error_msg}")
        # Выводим фразу и краткую ошибку в скобках на новой строке
        await message.answer(f"Сейчас не могу ответить 😭\n<code>[Тех. ошибка: {error_msg[:100]}]</code>", parse_mode=ParseMode.HTML)

@dp.inline_query()
async def inline_gemini_handler(inline_query: InlineQuery) -> None:
    query = inline_query.query.strip()
    
    if not query:
        result = InlineQueryResultArticle(
            id="empty_query",
            title="Введите запрос для Gemini",
            input_message_content=InputTextMessageContent(message_text="Введите запрос.")
        )
        await inline_query.answer([result], cache_time=1)
        return

    try:
        answer_text = await generate_with_retry(query)
    except Exception as e:
        error_msg = str(e)
        answer_text = f"Сейчас не могу ответить 😭\n[Тех. ошибка: {error_msg[:100]}]"

    result_id = str(hash(query))
    result = InlineQueryResultArticle(
        id=result_id,
        title=f"Ответ: {query[:30]}",
        input_message_content=InputTextMessageContent(message_text=answer_text, parse_mode=ParseMode.HTML)
    )
    await inline_query.answer([result], cache_time=0, is_personal=True)

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
