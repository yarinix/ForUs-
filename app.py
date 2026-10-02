import os
import asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message
from openai import OpenAI

# Получаем токены из переменных окружения на Render
BOT_TOKEN = os.getenv("8819707056:AAEHG1GXpHpIyr5lWGAP_KuI4TU0pDJRIsg
")
AI_API_KEY = os.getenv("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")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Инициализация клиента OpenRouter
client = OpenAI(
    api_key=AI_API_KEY,
    base_url="https://openrouter.ai/api/v1" 
)

@dp.message(F.text == "/start")
async def cmd_start(message: Message):
    await message.answer("Привет! Бот успешно запущен и готов к работе. Напишите что-нибудь!")

@dp.message(F.text)
async def chat_with_ai(message: Message):
    try:
        # Отправляем запрос к нейросети
        response = client.chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Ты дружелюбный и полезный помощник."},
                {"role": "user", "content": message.text}
            ]
        )
        answer = response.choices[0].message.content
        await message.answer(answer)
    except Exception as e:
        await message.answer(f"Ошибка при обращении к нейросети: {e}")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
