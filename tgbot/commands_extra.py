"""Команды /remind, /reminders, /reminddelete, /limits, /weather (регистрируются после основных — порядок как в старом app.py).

Часть бывшего app.py — код перенесён без изменений логики."""

import asyncio
import html
import logging

from aiogram import types
from aiogram.filters import Command, CommandObject

from tgbot.config import dp
from tgbot.utils import format_local, is_allowed, send_long
from tgbot.weather import DEFAULT_CITY, get_weather
from tgbot.llm import format_llm_usage, get_llm_usage
from tgbot.reminders import (
    REMIND_USAGE,
    REPEAT_LABELS,
    add_reminder_from_text,
    delete_reminder,
    list_reminders,
    unschedule_reminder,
)

@dp.message(Command("remind"))
async def cmd_remind(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    args = (command.args or "").strip()
    if not args:
        await message.answer(REMIND_USAGE, parse_mode="HTML")
        return
    await add_reminder_from_text(message, args)


@dp.message(Command("reminders"))
async def cmd_reminders(message: types.Message):
    if not is_allowed(message.from_user):
        return
    items = await asyncio.to_thread(list_reminders, message.from_user.id)
    if not items:
        await message.answer("Активных напоминаний нет. Создать: /remind")
        return
    lines = []
    for r in items:
        extra = f" · {REPEAT_LABELS[r['repeat']]}" if r["repeat"] else ""
        both = " · обоим" if r["both"] else ""
        lines.append(
            f"• <code>{r['id']}</code> {format_local(r['remind_at'])}{extra}{both}\n"
            f"   {html.escape(r['text'])}"
        )
    await send_long(
        message,
        "⏰ <b>Твои напоминания</b>\n" + "\n".join(lines)
        + "\n\nУдалить: /reminddelete &lt;номер&gt;",
        parse_mode="HTML",
    )


@dp.message(Command("reminddelete"))
async def cmd_remind_delete(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    arg = (command.args or "").strip()
    if not arg.isdigit():
        await message.answer("⚠️ Укажи номер: /reminddelete 3 (номера в /reminders)")
        return
    ok = await asyncio.to_thread(delete_reminder, message.from_user.id, int(arg))
    if ok:
        unschedule_reminder(int(arg))
    await message.answer("🗑 Напоминание удалено." if ok else "❌ Нет такого напоминания.")


@dp.message(Command("limits"))
async def cmd_limits(message: types.Message):
    if not is_allowed(message.from_user):
        return
    try:
        rows = await asyncio.to_thread(get_llm_usage, 7)
    except Exception as e:
        logging.error(f"Не удалось прочитать учёт запросов: {e}")
        await message.answer("Не удалось получить статистику запросов.")
        return
    await send_long(message, format_llm_usage(rows), parse_mode="HTML")


@dp.message(Command("weather"))
async def cmd_weather(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    city = (command.args or "").strip() or DEFAULT_CITY
    text = await asyncio.to_thread(get_weather, city)
    await message.answer(text)
