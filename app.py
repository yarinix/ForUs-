import os
from google import genai
from aiogram import Bot, Dispatcher, html
from aiogram.types import Message

# Забираем ключи из переменных окружения Render
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Инициализируем клиента Google GenAI
client = genai.Client(api_key=GEMINI_API_KEY)

# ... тут твоя инициализация aiogram (bot и dp) ...

@dp.message()
async def chat_with_gemini(message: Message) -> None:
    try:
        # Отправляем текст в модель gemini-2.5-flash
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=message.text,
        )
        
        # Отправляем ответ обратно в Telegram
        await message.answer(response.text)
        
    except Exception as e:
        await message.answer(f"Что-то пошло не так: {e}")
