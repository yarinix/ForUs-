import os
import asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton

BOT_TOKEN = os.getenv("BOT_TOKEN")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Создаем простую клавиатуру с кнопками для вас и Полин
def get_main_keyboard():
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="❤️ Сделать комплимент"), KeyboardButton(text="💡 Идея для свидания")],
            [KeyboardButton(text="📌 Наша общая заметка")]
        ],
        resize_keyboard=True
    )

@dp.message(F.text == "/start")
async def cmd_start(message: Message):
    await message.answer(
        "Привет! Это ваш общий ассистент для двоих. Выберите нужное действие на клавиатуре ниже:",
        reply_markup=get_main_keyboard()
    )

@dp.message(F.text == "❤️ Сделать комплимент")
async def send_compliment(message: Message):
    await message.answer("Ты сегодня выглядишь просто потрясающе! ✨")

@dp.message(F.text == "💡 Идея для свидания")
async def send_date_idea(message: Message):
    await message.answer("☕ Устроить вечер настольных игр дома с горячим шоколадом и любимым сериалом.")

@dp.message(F.text == "📌 Наша общая заметка")
async def send_note(message: Message):
    await message.answer("📝 Пока здесь пусто. Скоро сюда можно будет записывать планы!")

@dp.message(F.text)
async def echo_message(message: Message):
    await message.answer(f"Вы написали: {message.text}")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
