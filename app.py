import os
import asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message
from gigachat import GigaChat

BOT_TOKEN = os.getenv("BOT_TOKEN")
# Сбер выдает credentials (авторизационные данные / Client Secret)
GIGA_CREDENTIALS = os.getenv("AI_API_KEY") 

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(F.text == "/start")
async def cmd_start(message: Message):
    await message.answer("Привет! Бот с GigaChat успешно запущен и готов к работе. Напишите что-нибудь!")

@dp.message(F.text)
async def chat_with_ai(message: Message):
    try:
        # Авторизуемся и отправляем запрос в GigaChat
        # verify_ssl=False полезно для облачных хостингов вроде Render, чтобы не было ошибок с сертификатами
        with GigaChat(credentials=GIGA_CREDENTIALS, verify_ssl=False) as giga:
            response = giga.chat(message.text)
            answer = response.choices[0].message.content
            await message.answer(answer)
    except Exception as e:
        await message.answer(f"Ошибка при обращении к GigaChat: {e}")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
