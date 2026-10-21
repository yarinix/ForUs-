"""Настройки бота: переменные окружения, список пользователей, имена, клиенты Telegram и Gemini.

Часть бывшего app.py — код перенесён без изменений логики."""

import logging
import os
import re

from aiogram import Bot, Dispatcher
from google import genai

import pet  # игра «Наша выдра» (pet.py лежит в корне проекта)

# Настройка логирования
logging.basicConfig(level=logging.INFO)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # корень проекта (папка над tgbot/)

# Получение переменных окружения
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# Читаем белый список пользователей
ALLOWED_USERS_RAW = os.getenv("ALLOWED_USERS", "5084782149,1253880871")
ALLOWED_USER_IDS = [
    int(uid.strip()) for uid in ALLOWED_USERS_RAW.split(",") if uid.strip().isdigit()
]

COUPLE_USER_IDS = {5084782149, 1253880871}
BOT_OWNER_ID = int(os.getenv("BOT_OWNER_ID", "5084782149"))

DEFAULT_USER_NAMES = {
    5084782149: "Основной пользователь",
    1253880871: "Полина",
}
# Имена можно задать переменной USER_NAMES="5084782149:Ярослав,1253880871:Полина".
# Если не задана, бот берёт имя из профиля Telegram (first_name), когда человек
# хоть раз ему написал; запасной вариант — DEFAULT_USER_NAMES.
USER_NAMES = dict(DEFAULT_USER_NAMES)
_names_cache = {}  # id -> имя из профиля Telegram
_names_env = {}
for _pair in os.getenv("USER_NAMES", "").split(","):
    _uid, _, _nm = _pair.partition(":")
    if _uid.strip().isdigit() and _nm.strip():
        _names_env[int(_uid.strip())] = _nm.strip()[:40]

# Часовой пояс для «сегодня/завтра» в ответах бота и в извлечении фактов
BOT_TIMEZONE = os.getenv("BOT_TIMEZONE", "Asia/Omsk")
pet.TZ = BOT_TIMEZONE                       # день и ночь в игре — по местным часам
# Админ игры «Наша выдра»: по умолчанию первый в ALLOWED_USERS; можно задать PET_ADMIN_IDS=id1,id2
pet.USER_IDS = sorted(COUPLE_USER_IDS)      # двое с общим питомцем: для общих и личных заданий
pet.ADMIN_IDS = [
    int(x) for x in os.getenv("PET_ADMIN_IDS", "").replace(" ", "").split(",") if x.isdigit()
] or ALLOWED_USER_IDS[:1]

# Если "1" — рисунки принимаются ТОЛЬКО с подписью Telegram (initData).
# По умолчанию включено для защиты от подделки запросов.
REQUIRE_WEBAPP_AUTH = os.getenv("REQUIRE_WEBAPP_AUTH", "1") == "1"

MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # лимит тела запроса /api/upload
MAX_STASH_BYTES = 2 * 1024 * 1024  # лимит тела запроса для рисунков из инлайн-режима
DRAWINGS_TOTAL_BYTES = 40 * 1024 * 1024  # сколько памяти максимум занимают все ожидающие рисунки
STASH_PER_HOUR = 30  # сколько рисунков в час принимаем с одного IP
TELEGRAM_TEXT_LIMIT = 4000  # у Telegram лимит 4096, оставляем запас

# Инициализация бота и клиента Gemini
bot = Bot(token=TELEGRAM_TOKEN)
dp = Dispatcher()
client = genai.Client(api_key=GEMINI_API_KEY)

# Каскад моделей Gemini
MODELS_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

# --- КОНСТАНТЫ ПАМЯТИ ---

EMPTY_USER_MEMORY = "Нет личной сохраненной информации."
EMPTY_COUPLE_MEMORY = "Пока нет общей информации о паре."

MEMORY_TYPES = {"personal", "couple", "event", "emotion", "inside_joke"}
# Эти типы принадлежат паре (user_id = NULL) и доступны обоим.
# Остальные — личные: видит только владелец.
SHARED_MEMORY_TYPES = {"couple", "event", "inside_joke"}
MEMORY_LABELS = {
    "personal": "👤 личное",
    "couple": "💞 пара",
    "event": "📅 событие",
    "emotion": "🌧 эмоции",
    "inside_joke": "😄 шутка",
}
MAX_FACT_LENGTH = 300
TEST_MEMORY_TEXT = "Тестовая запись памяти"  # осталась от /memorytest

# Важность: 5 — критично (здоровье, границы, главные даты и события),
# 4 — сильно характеризует человека или пару, 3 — полезно помнить,
# 2 — мелочь, 1 — не стоит хранить.
DEFAULT_IMPORTANCE = {
    "personal": 3, "couple": 4, "event": 3, "emotion": 3, "inside_joke": 3,
}
MIN_SAVE_IMPORTANCE = int(os.getenv("MEMORY_MIN_IMPORTANCE", "3"))
# «Период полураспада» актуальности в днях: чувства забываются быстрее всего,
# шутки и отношения — медленнее. Повторное упоминание обновляет запись.
HALF_LIFE_DAYS = {
    "emotion": 30, "event": 120, "personal": 240, "couple": 400, "inside_joke": 400,
}
MEMORY_PROMPT_LIMIT = 16  # сколько воспоминаний кладём в промпт
MEMORY_CORE_LIMIT = 6  # из них — самые важные (4–5), берутся всегда
# Кому принадлежит факт: о ком он.
SUBJECTS = {"self", "partner", "couple"}


def user_name(uid) -> str:
    """Имя человека: переменная USER_NAMES > профиль Telegram > запасное."""
    return (
        _names_env.get(uid)
        or _names_cache.get(uid)
        or USER_NAMES.get(uid)
        or "Пользователь"
    )


def remember_name(user) -> None:
    """Запоминает имя из профиля Telegram (если не задано переменной)."""
    first = clean_caption_name(getattr(user, "first_name", "") or "")
    if first and getattr(user, "id", None) is not None:
        _names_cache[user.id] = first[:40]


def partner_of(uid):
    """Партнёр только для исходной пары; добавленные пользователи не становятся парой автоматически."""
    if uid not in COUPLE_USER_IDS:
        return None
    others = [u for u in COUPLE_USER_IDS if u != uid]
    return others[0] if others else None


def pet_key_for_user(uid: int) -> str:
    """У исходной пары одна общая выдра; у каждого добавленного пользователя — своя."""
    return "couple" if uid in COUPLE_USER_IDS else f"user:{int(uid)}"


def admin_pet_key(uid: int) -> str:
    """Режим «Проверка»: личный тестовый питомец админа. Отдельная запись в базе (admin:<id>): он не общий с Полиной,
    его нет в списке «Навестить», уведомления о пробуждении по нему не шлются."""
    return f"admin:{int(uid)}"



def clean_caption_name(name) -> str:
    """Убирает управляющие символы и ограничивает длину имени для подписи."""
    name = re.sub(r"[\x00-\x1f\x7f]", " ", str(name or "")).strip()
    return name[:40] or "Пользователь"
