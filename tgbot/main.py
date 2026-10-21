"""Запуск: фоновые циклы (самопинг, пробуждение выдры, уборка памяти), меню команд, polling.

Часть бывшего app.py — код перенесён без изменений логики."""

import asyncio
import logging
import os
from http.server import ThreadingHTTPServer

import httpx
from aiogram import types

import pet
import pet_garden

# Порядок важен: обработчики регистрируются при импорте в том же порядке, что и в старом app.py
from tgbot import handlers, commands_extra, inline_mode  # noqa: F401
from tgbot.config import ALLOWED_USER_IDS, BOT_OWNER_ID, bot, dp, pet_key_for_user, remember_name
from tgbot.webserver import WebAppHandler, public_base_url
from tgbot.db import get_db, init_db
from tgbot.memory import memory_maintenance
from tgbot.llm import (
    GEMINI_RPD_LIMIT,
    get_llm_usage,
    next_quota_reset_local,
    pacific_day,
    run_in_background,
)
from tgbot.reminders import load_pending_reminders, scheduler

# --- ЗАПУСК БОТА ---


# Функция для запуска нашего веб-сервера
def run_http_server():
    port = int(os.environ.get("PORT", 10000))
    server = ThreadingHTTPServer(("0.0.0.0", port), WebAppHandler)
    print(f"HTTP server started on port {port}")
    server.serve_forever()


async def keep_alive_loop():
    """Не даёт бесплатному Render усыпить сервис (иначе бот и напоминания спят).

    Каждые 10 минут бот сам открывает свой публичный адрес. Работает, пока
    процесс жив; на случай сна можно добавить внешний пинг (UptimeRobot).
    """
    base = public_base_url()
    if not base:
        logging.info("RENDER_EXTERNAL_URL не задан — самопинг отключён")
        return
    await asyncio.sleep(60)
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as http:
        while True:
            try:
                await http.get(f"{base}/health")
            except Exception as e:
                logging.warning(f"Самопинг не удался: {e}")
            await asyncio.sleep(600)


async def pet_wake_loop():
    """Раз в минуту: если выдра проснулась — присылаем уведомление обоим."""
    await asyncio.sleep(20)
    while True:
        try:
            keys = {pet_key_for_user(uid): [u for u in ALLOWED_USER_IDS if pet_key_for_user(u) == pet_key_for_user(uid)] for uid in ALLOWED_USER_IDS}
            for key, recipients in keys.items():
                name = await asyncio.to_thread(pet.process_wakeups, get_db, pet_key=key)
                if name:
                    for uid in recipients:
                        try:
                            await bot.send_message(uid, f"☀️ {name} проснулся и ждёт вас! 🦦 /pet")
                        except Exception as e:
                            logging.warning(f"Не удалось отправить уведомление {uid}: {e}")
        except Exception:
            logging.exception("Цикл пробуждений выдры")
        await asyncio.sleep(60)


async def memory_maintenance_loop():
    """Раз в сутки сливает дубли и убирает устаревшее."""
    while True:
        try:
            stats = await asyncio.to_thread(memory_maintenance)
            if any(stats.values()):
                logging.info(f"Уборка памяти: {stats}")
        except Exception:
            logging.exception("Уборка памяти не удалась")
        await asyncio.sleep(24 * 3600)


async def main():
    logging.info("Инициализация базы данных...")
    await asyncio.to_thread(init_db)
    await asyncio.to_thread(pet.init_tables, get_db)
    await asyncio.to_thread(pet_garden.init_tables, get_db)
    logging.info("База данных готова.")

    # Имена из профилей Telegram (работает, если человек уже писал боту)
    for uid in ALLOWED_USER_IDS:
        try:
            chat = await bot.get_chat(uid)
            remember_name(chat)
        except Exception as e:
            logging.info(f"Имя {uid} пока не определено: {e}")

    run_in_background(memory_maintenance_loop())
    run_in_background(keep_alive_loop())
    run_in_background(pet_wake_loop())

    try:
        usage = await asyncio.to_thread(get_llm_usage, 1)
        today_total = sum(r["calls"] for r in usage if r["day"] == pacific_day())
        logging.info(
            f"📊 Gemini: сегодня (по PT) запросов {today_total} из {GEMINI_RPD_LIMIT};"
            f" сброс в {next_quota_reset_local()} (местное время)"
        )
    except Exception as e:
        logging.warning(f"Не удалось прочитать учёт запросов при старте: {e}")

    scheduler.start()
    try:
        count = await asyncio.to_thread(load_pending_reminders)
        logging.info(f"Напоминаний в расписании: {count}")
    except Exception:
        logging.exception("Не удалось загрузить напоминания")

    try:
        base_commands = [
            types.BotCommand(command="memory", description="Что бот помнит"),
            types.BotCommand(command="remember", description="Запомнить вручную"),
            types.BotCommand(command="memorydelete", description="Удалить факт"),
            types.BotCommand(command="memoryclear", description="Очистить память"),
            types.BotCommand(command="remind", description="Поставить напоминание"),
            types.BotCommand(command="reminders", description="Мои напоминания"),
            types.BotCommand(command="weather", description="Погода и прогноз"),
            types.BotCommand(command="limits", description="Запросы к Gemini за сутки"),
            types.BotCommand(command="draw", description="Холст для рисования"),
            types.BotCommand(command="pet", description="Наша выдра (игра)"),
            types.BotCommand(command="command", description="Список команд"),
        ]
        await bot.set_my_commands(base_commands)
        # /adduser работает только у владельца — показываем его в меню только ему
        try:
            await bot.set_my_commands(
                base_commands + [types.BotCommand(command="adduser", description="Добавить пользователя (владелец)")],
                scope=types.BotCommandScopeChat(chat_id=BOT_OWNER_ID),
            )
        except Exception as e:
            logging.warning(f"Не удалось добавить /adduser в меню владельца: {e}")
    except Exception as e:
        logging.warning(f"Не удалось обновить меню команд: {e}")

    logging.info("Бот запущен...")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
