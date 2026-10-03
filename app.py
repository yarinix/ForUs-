import os
import asyncio
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from google import genai
from google.genai.errors import APIError

# Настройка логирования для отладки
logging.basicConfig(level=logging.INFO)

# Получаем токены из переменных окружения на Render
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Проверка наличия обязательных ключей
if not TELEGRAM_BOT_TOKEN or not GEMINI_API_KEY:
    raise ValueError("Отсутствуют TELEGRAM_BOT_TOKEN или GEMINI_API_KEY в переменных окружения.")

# Инициализация бота, диспетчера и клиента Gemini
bot = Bot(token=TELEGRAM_BOT_TOKEN)
dp = Dispatcher()
client = genai.Client(api_key=GEMINI_API_KEY)

# Полный список моделей для каскадной ротации при ошибках лимита (429)
MODELS_TO_TRY = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]

async def generate_with_model_fallback(prompt: str) -> str:
    """
    Пытается сгенерировать ответ, по очереди перебирая модели из списка.
    Если модель возвращает ошибку 429 (лимит исчерпан), происходит автоматический переход к следующей.
    Также включает повторные попытки (retry) для временных ошибок сервера (503).
    """
    last_error = None

    for model_name in MODELS_TO_TRY:
        max_retries = 2
        for attempt in range(max_retries):
            try:
                # Запрос к текущей модели
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                
                if response and response.text:
                    return response.text
                    
            except APIError as e:
                last_error = e
                # Если словили ошибку 429 (лимит исчерпан), прерываем попытки для этой модели и идем к следующей
                if e.code == 429 or "RESOURCE_EXHAUSTED" in str(e):
                    logging.warning(f"Модель {model_name} исчерпала лимит (429). Переключаемся на следующую...")
                    break 
                
                # Если ошибка 503 (сервер недоступен), делаем паузу и пробуем еще раз на этой же модели
                elif e.code == 503:
                    logging.warning(f"Ошибка 503 у модели {model_name}, повторная попытка {attempt + 1}...")
                    await asyncio.sleep(2)
                    continue
                else:
                    # При других ошибках API сразу переходим к следующей модели
                    break
            except Exception as e:
                last_error = e
                break

    # Если исчерпаны все модели и попытки, пробрасываем последнюю ошибку дальше
    if last_error:
        raise last_error
    else:
        raise Exception("Все доступные модели исчерпали лимит.")

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer("Привет! Я создан для ваших отношений❤️")

@dp.message()
async def handle_message(message: types.Message):
    user_prompt = message.text
    
    try:
        # Получаем ответ через систему автоматической ротации моделей
        answer = await generate_with_model_fallback(user_prompt)
        await message.answer(answer)
        
    except APIError as e:
        # Удобное сообщение об ошибке для пользователя с урезанными тех. деталями для отладки
        error_details = str(e)[:250]
        fallback_msg = f"Сейчас не могу ответить 😭\n[Тех. ошибка: {e.code if hasattr(e, 'code') else 'API_ERROR'} {error_details}]"
        await message.answer(fallback_msg)
        logging.error(f"Критическая ошибка API: {e}")
        
    except Exception as e:
        error_details = str(e)[:250]
        fallback_msg = f"Сейчас не могу ответить 😭\n[Тех. ошибка: {error_details}]"
        await message.answer(fallback_msg)
        logging.error(f"Общая ошибка: {e}")

async def main():
    logging.info("Запуск Telegram-бота...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
