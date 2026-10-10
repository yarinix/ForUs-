import asyncio
import base64
import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import dateparser
import httpx
import psycopg2
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from dateparser.search import search_dates
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InlineQueryResultCachedPhoto,
    BufferedInputFile,
    InputTextMessageContent,
    WebAppInfo,
)
from google import genai
from google.genai import types as genai_types
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

# Настройка логирования
logging.basicConfig(level=logging.INFO)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Получение переменных окружения
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# Читаем белый список пользователей
ALLOWED_USERS_RAW = os.getenv("ALLOWED_USERS", "5084782149,1253880871")
ALLOWED_USER_IDS = [
    int(uid.strip()) for uid in ALLOWED_USERS_RAW.split(",") if uid.strip().isdigit()
]

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

# Если "1" — рисунки принимаются ТОЛЬКО с подписью Telegram (initData).
# Включай после того, как добавишь отправку initData в static/draw.html.
REQUIRE_WEBAPP_AUTH = os.getenv("REQUIRE_WEBAPP_AUTH", "0") == "1"

MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # лимит тела запроса /api/upload
MAX_STASH_BYTES = 4 * 1024 * 1024  # лимит для рисунков из инлайн-режима
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
    """Второй участник пары (если разрешённых ровно двое)."""
    others = [u for u in ALLOWED_USER_IDS if u != uid]
    return others[0] if len(ALLOWED_USER_IDS) == 2 and others else None


# ---------------------------------------------------------------------------
# HTTP-сервер для Render (health-check + холст для рисования)
# ---------------------------------------------------------------------------


def validate_webapp_init_data(init_data: str, max_age: int = 86400):
    """Проверяет подпись Telegram Web App (initData). Возвращает dict user или None."""
    try:
        pairs = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
        received_hash = pairs.pop("hash", None)
        if not received_hash:
            return None
        check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
        secret = hmac.new(
            b"WebAppData", TELEGRAM_TOKEN.encode(), hashlib.sha256
        ).digest()
        calculated = hmac.new(
            secret, check_string.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(calculated, received_hash):
            return None
        if time.time() - int(pairs.get("auth_date", "0")) > max_age:
            return None
        user = json.loads(pairs.get("user", "{}"))
        if not isinstance(user.get("id"), int):
            return None
        user["_query_id"] = pairs.get("query_id")  # есть, если холст открыт из инлайна
        return user
    except Exception:
        return None


def clean_caption_name(name) -> str:
    """Убирает управляющие символы и ограничивает длину имени для подписи."""
    name = re.sub(r"[\x00-\x1f\x7f]", " ", str(name or "")).strip()
    return name[:40] or "Пользователь"


def send_photo_to_telegram(chat_id: int, caption: str, image: bytes, mime: str):
    ext = "png" if mime == "image/png" else "jpg"
    boundary = "----bot" + secrets.token_hex(16)
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="chat_id"\r\n\r\n'
        f"{chat_id}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="caption"\r\n\r\n'
        f"{caption}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="photo"; filename="drawing.{ext}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    body = head + image + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=20):
        pass


# Рисунки, ожидающие отправки через инлайн-режим (Telegram скачивает их по ссылке)
_drawings = {}  # token -> (created_ts, bytes, mime)
_drawings_lock = threading.Lock()
DRAWING_TTL = 6 * 3600
DRAWINGS_MAX = 30
_stash_hits = {}  # ip -> [время загрузок]


def stash_rate_ok(ip: str) -> bool:
    now = time.time()
    with _drawings_lock:
        hits = [t for t in _stash_hits.get(ip, []) if now - t < 3600]
        if len(hits) >= STASH_PER_HOUR:
            _stash_hits[ip] = hits
            return False
        hits.append(now)
        _stash_hits[ip] = hits
        if len(_stash_hits) > 500:  # не даём словарю расти бесконечно
            for k in [k for k, v in _stash_hits.items() if not v or now - v[-1] > 3600]:
                del _stash_hits[k]
    return True


def store_drawing(image: bytes, mime: str) -> str:
    token = secrets.token_hex(16)
    now = time.time()
    with _drawings_lock:
        for t in [t for t, v in _drawings.items() if now - v[0] > DRAWING_TTL]:
            del _drawings[t]
        while len(_drawings) >= DRAWINGS_MAX:
            del _drawings[min(_drawings, key=lambda t: _drawings[t][0])]
        _drawings[token] = (now, image, mime)
    return token


def public_base_url() -> str:
    base = os.getenv("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
    if base.startswith("http://"):
        base = base.replace("http://", "https://", 1)
    return base


def answer_web_app_query(query_id: str, image: bytes, mime: str, caption: str):
    """Отправляет рисунок в чат, откуда открыт холст (инлайн-режим)."""
    base = public_base_url()
    if not base:
        raise RuntimeError("не задан RENDER_EXTERNAL_URL")
    ext = "png" if mime == "image/png" else "jpg"
    url = f"{base}/img/{store_drawing(image, mime)}.{ext}"
    payload = {
        "web_app_query_id": query_id,
        "result": {
            "type": "photo",
            "id": secrets.token_hex(8),
            "photo_url": url,
            "thumbnail_url": url,
            "caption": caption,
        },
    }
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerWebAppQuery",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20):
        pass


class WebAppHandler(BaseHTTPRequestHandler):

    def _reply(self, code: int, body: bytes = b"", content_type: str = None):
        self.send_response(code)
        if content_type:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/health"):
            self._reply(200, b"Bot is alive!", "text/plain; charset=utf-8")
        elif path == "/draw":
            try:
                with open(os.path.join(BASE_DIR, "static", "draw.html"), "rb") as f:
                    content = f.read()
                self._reply(200, content, "text/html; charset=utf-8")
            except Exception:
                self._reply(404, b"Drawing page not found")
        elif path.startswith("/img/"):
            token = path[5:].split(".")[0]
            with _drawings_lock:
                item = _drawings.get(token)
            if item and re.fullmatch(r"[0-9a-f]{32}", token):
                logging.info(
                    f"img: отдаю {len(item[1])} байт, "
                    f"UA={self.headers.get('User-Agent', '?')[:60]}"
                )
                self._reply(200, item[1], item[2])
            else:
                self._reply(404)
        else:
            self._reply(404)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path != "/api/upload":
            self._reply(404)
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            self._reply(413, b"Bad size")
            return

        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))

            # --- Рисунок из инлайн-режима: кладём на хранение и отдаём метку.
            # В этом режиме Telegram не передаёт подпись пользователя, поэтому
            # проверка личности происходит позже, в самом инлайн-запросе.
            if data.get("stash"):
                ip = (
                    self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                    or self.client_address[0]
                )
                if length > MAX_STASH_BYTES:
                    self._reply(413, b"Too big")
                    return
                if not stash_rate_ok(ip):
                    self._reply(429, b"Too many")
                    return
                raw = (data.get("image") or "").split(",", 1)[-1]
                image_bytes = base64.b64decode(raw, validate=False)
                is_png = image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
                is_jpg = image_bytes.startswith(b"\xff\xd8\xff")
                if not (is_png or is_jpg):
                    self._reply(400, b"PNG or JPEG only")
                    return
                # целый PNG заканчивается блоком IEND, целый JPEG — маркером FF D9
                tail = image_bytes.rstrip(b"\x00")
                complete = tail.endswith(b"IEND\xaeB`\x82") if is_png else tail.endswith(b"\xff\xd9")
                if not complete:
                    logging.warning(f"stash: файл оборван, {len(image_bytes)} байт")
                    self._reply(400, b"Truncated image")
                    return
                token = store_drawing(image_bytes, "image/png" if is_png else "image/jpeg")
                note = re.sub(r"[^\w-]", "", str(data.get("note", "")))[:30]
                logging.info(f"stash: принят рисунок {len(image_bytes)} байт ({note})")
                self._reply(
                    200,
                    json.dumps({"token": token}).encode("utf-8"),
                    "application/json",
                )
                return

            # --- Кто отправляет? ---
            tg_user = None
            init_data = data.get("init_data")
            if init_data:
                tg_user = validate_webapp_init_data(init_data)
                if tg_user is None:
                    self._reply(403, b"Bad signature")
                    return
            elif REQUIRE_WEBAPP_AUTH:
                self._reply(403, b"Signature required")
                return

            if tg_user is not None:
                chat_id = tg_user["id"]  # рисунок уходит только самому автору
                name = clean_caption_name(tg_user.get("first_name"))
            else:
                # Режим совместимости (старый draw.html без подписи)
                try:
                    chat_id = int(data.get("chat_id"))
                except (TypeError, ValueError):
                    self._reply(400, b"Bad chat_id")
                    return
                name = clean_caption_name(
                    data.get("name") or user_name(chat_id)
                )

            if chat_id not in ALLOWED_USER_IDS:
                self._reply(403, b"Forbidden")
                return

            # --- Картинка ---
            image_base64 = data.get("image") or ""
            if "," in image_base64:
                image_base64 = image_base64.split(",", 1)[1]
            image_bytes = base64.b64decode(image_base64, validate=False)
            if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
                mime = "image/png"
            elif image_bytes.startswith(b"\xff\xd8\xff"):
                mime = "image/jpeg"
            else:
                self._reply(400, b"Not an image")
                return

            caption = f"От {name} ♥️"
            query_id = tg_user.get("_query_id") if tg_user else None
            if query_id:
                # холст открыт из инлайна — рисунок уходит в тот чат, где его вызвали.
                # Telegram принимает для такой отправки только JPEG.
                if mime != "image/jpeg":
                    self._reply(400, b"Inline mode needs JPEG")
                    return
                answer_web_app_query(query_id, image_bytes, mime, caption)
            else:
                send_photo_to_telegram(chat_id, caption, image_bytes, mime)
            self._reply(
                200,
                json.dumps({"status": "ok"}).encode("utf-8"),
                "application/json",
            )
        except Exception as e:
            logging.error(f"Ошибка загрузки рисунка: {e}")
            self._reply(500, b"Error")

    def log_message(self, format, *args):
        # не засоряем логи Render health-check'ами
        pass


# ---------------------------------------------------------------------------
# БАЗА ДАННЫХ
# ---------------------------------------------------------------------------


@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logging.error(f"Ошибка базы данных: {e}")
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    chat_id BIGINT,
                    user_id BIGINT,
                    chat_type TEXT,
                    role TEXT,
                    content TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cursor.execute(
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id BIGINT;"
            )
            cursor.execute(
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_type TEXT;"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_messages_chat_id"
                " ON messages (chat_id, id DESC);"
            )

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_memory (
                    user_id BIGINT PRIMARY KEY,
                    memory_text TEXT
                );
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS couple_memory (
                    id INT PRIMARY KEY,
                    memory_text TEXT
                );
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT,
                    memory_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_user"
                " ON memories (user_id, id DESC);"
            )
            # Продвинутая память: важность, о ком факт, кто сказал, сколько раз
            # подтверждался, когда устаревает.
            for ddl in (
                "importance SMALLINT DEFAULT 3",
                "subject_id BIGINT",          # о ком факт (NULL = о паре)
                "author_id BIGINT",           # кто это рассказал
                "mentions INT DEFAULT 1",
                "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                "expires_at TIMESTAMP",
            ):
                cursor.execute(f"ALTER TABLE memories ADD COLUMN IF NOT EXISTS {ddl};")
            # Старые записи: личные — о владельце, общие — о паре
            cursor.execute(
                "UPDATE memories SET subject_id = user_id, author_id = user_id"
                " WHERE subject_id IS NULL AND author_id IS NULL"
                " AND user_id IS NOT NULL"
            )
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reminders (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    chat_id BIGINT NOT NULL,
                    text TEXT NOT NULL,
                    remind_at TIMESTAMP NOT NULL,
                    repeat_rule TEXT,
                    both_users BOOLEAN DEFAULT FALSE,
                    done BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_reminders_pending"
                " ON reminders (done, remind_at);"
            )
            # Чистим тестовую запись, оставшуюся от /memorytest
            cursor.execute(
                "DELETE FROM memories WHERE content = %s", (TEST_MEMORY_TEXT,)
            )


def save_message(
    chat_id: int, user_id: int, chat_type: str, role: str, content: str
):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO messages (chat_id, user_id, chat_type, role, content)"
                " VALUES (%s, %s, %s, %s, %s)",
                (chat_id, user_id, chat_type, role, content),
            )


def get_chat_history(chat_id: int, limit: int = 10):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT role, content FROM messages WHERE chat_id = %s ORDER BY id"
                " DESC LIMIT %s",
                (chat_id, limit),
            )
            rows = cursor.fetchall()

    history = []
    for role, content in reversed(rows):
        if not content:
            continue
        gemini_role = "user" if role == "user" else "model"
        history.append({"role": gemini_role, "parts": [{"text": content}]})
    return history


# --- НОВАЯ ПАМЯТЬ (таблица memories) ---


def clean_fact(text: str) -> str:
    """Один аккуратный однострочный факт ограниченной длины."""
    text = " ".join(str(text or "").split())
    text = text.lstrip("-•*– ").strip()
    return text[:MAX_FACT_LENGTH]


def _norm(text: str) -> str:
    return " ".join(str(text).casefold().split()).strip(" .!?…")


def _to_dt(value):
    """Время из БД (datetime или строка) -> naive datetime (UTC)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    s = str(value).replace("T", " ")
    for fmt, n in (("%Y-%m-%d %H:%M:%S", 19), ("%Y-%m-%d", 10)):
        try:
            return datetime.strptime(s[:n], fmt)
        except ValueError:
            continue
    return None


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_until(value):
    """'2026-12-31' -> datetime конца этого дня; всё остальное -> None."""
    m = re.match(r"\s*(\d{4})-(\d{2})-(\d{2})", str(value or ""))
    if not m:
        return None
    try:
        return datetime(int(m[1]), int(m[2]), int(m[3]), 23, 59, 59)
    except ValueError:
        return None


def clamp_importance(value, default=3) -> int:
    try:
        return max(1, min(5, int(value)))
    except (TypeError, ValueError):
        return default


def _similar(a: str, b: str) -> bool:
    """Одно и то же, сказанное чуть иначе: совпадение ключевых слов >= 75%."""
    if _norm(a) == _norm(b):
        return True
    ka, kb = _keywords(a), _keywords(b)
    if min(len(ka), len(kb)) < 3:
        return False
    return len(ka & kb) / len(ka | kb) >= 0.75


def resolve_scope(user_id, memory_type: str, subject: str = None, shared=None):
    """Возвращает (owner, subject_id): кому принадлежит запись и о ком она.

    Общие записи (couple / event / inside_joke) принадлежат паре (owner = None),
    остальные — тому, кто их рассказал. subject: self | partner | couple.
    """
    if shared is None:
        shared = memory_type in SHARED_MEMORY_TYPES
    owner = None if shared else user_id
    if subject not in SUBJECTS:
        subject = "couple" if memory_type in ("couple", "inside_joke") else "self"
    partner = partner_of(user_id)
    if subject == "partner" and partner is None:
        subject = "self"
    subject_id = {"self": user_id, "partner": partner, "couple": None}[subject]
    return owner, subject_id


def save_memory(
    user_id,
    memory_type: str,
    content: str,
    shared=None,
    importance=None,
    subject: str = None,
    expires_at=None,
) -> bool:
    """Сохраняет воспоминание.

    Возвращает False, если запись пустая или это дубль (тогда у дубля
    повышается счётчик подтверждений и, при необходимости, важность).
    """
    if memory_type not in MEMORY_TYPES:
        raise ValueError(f"Неизвестный тип воспоминания: {memory_type}")

    content = clean_fact(content)
    if not content or content == TEST_MEMORY_TEXT:
        return False

    owner, subject_id = resolve_scope(user_id, memory_type, subject, shared)
    importance = clamp_importance(
        importance, DEFAULT_IMPORTANCE.get(memory_type, 3)
    )
    now = _utcnow()

    with get_db() as conn:
        with conn.cursor() as cursor:
            if owner is None:
                cursor.execute(
                    "SELECT id, content, importance FROM memories"
                    " WHERE user_id IS NULL ORDER BY id DESC LIMIT 500"
                )
            else:
                cursor.execute(
                    "SELECT id, content, importance FROM memories"
                    " WHERE user_id = %s ORDER BY id DESC LIMIT 500",
                    (owner,),
                )
            for mem_id, old_content, old_imp in cursor.fetchall():
                if _similar(old_content, content):
                    cursor.execute(
                        "UPDATE memories SET mentions = COALESCE(mentions, 1) + 1,"
                        " importance = %s, updated_at = %s WHERE id = %s",
                        (max(clamp_importance(old_imp), importance), now, mem_id),
                    )
                    return False

            cursor.execute(
                "INSERT INTO memories (user_id, memory_type, content, importance,"
                " subject_id, author_id, mentions, updated_at, expires_at)"
                " VALUES (%s, %s, %s, %s, %s, %s, 1, %s, %s)",
                (owner, memory_type, content, importance, subject_id, user_id,
                 now, expires_at),
            )
    return True


def update_memory(user_id, mem_id: int, content: str = None, importance=None) -> bool:
    """Уточняет существующую запись (её текст и/или важность).

    Менять можно только свою или общую запись пары.
    """
    content = clean_fact(content) if content else None
    now = _utcnow()
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT importance FROM memories WHERE id = %s"
                " AND (user_id = %s OR user_id IS NULL)",
                (mem_id, user_id),
            )
            row = cursor.fetchone()
            if not row:
                return False
            new_imp = (
                clamp_importance(importance, row[0] or 3)
                if importance is not None else (row[0] or 3)
            )
            if content:
                cursor.execute(
                    "UPDATE memories SET content = %s, importance = %s,"
                    " mentions = COALESCE(mentions, 1) + 1, updated_at = %s"
                    " WHERE id = %s",
                    (content, new_imp, now, mem_id),
                )
            else:
                cursor.execute(
                    "UPDATE memories SET importance = %s,"
                    " mentions = COALESCE(mentions, 1) + 1, updated_at = %s"
                    " WHERE id = %s",
                    (new_imp, now, mem_id),
                )
    return True


def _keywords(text: str) -> set:
    return {w[:5] for w in re.findall(r"\w+", str(text).casefold()) if len(w) > 3}


def _memory_score(m: dict, kw: set, now: datetime) -> float:
    """Насколько воспоминание нужно прямо сейчас: важность + уместность + свежесть."""
    relevance = min(len(kw & _keywords(m["content"])), 3) if kw else 0
    half_life = HALF_LIFE_DAYS.get(m["type"], 240)
    stamp = m["updated_at"] or m["created_at"] or now
    age_days = max((now - stamp).total_seconds() / 86400, 0)
    freshness = 0.5 ** (age_days / half_life)
    # Важные записи (5) почти не стареют
    freshness = max(freshness, 0.6 if m["importance"] >= 5 else 0)
    return (
        m["importance"] * 2
        + min(m["mentions"], 5) * 0.5
        + relevance * 3
        + freshness * 2
    )


def _row_to_memory(r) -> dict:
    return {
        "id": r[0], "type": r[1], "content": r[2],
        "owner": r[3], "shared": r[3] is None,
        "importance": clamp_importance(r[4]),
        "subject_id": r[5], "author_id": r[6],
        "mentions": r[7] or 1,
        "created_at": _to_dt(r[8]), "updated_at": _to_dt(r[9]),
        "expires_at": _to_dt(r[10]),
    }


_MEM_COLUMNS = (
    "id, memory_type, content, user_id, importance, subject_id, author_id,"
    " mentions, created_at, updated_at, expires_at"
)


def get_memories(
    user_id: int,
    limit: int = 20,
    query: str = None,
    include_personal: bool = True,
    ranked: bool = True,
):
    """Воспоминания, которые ВИДИТ этот человек: его личные + общие пары.

    include_personal=False — только общие (групповой чат).
    ranked=True — отбор по важности, свежести и совпадению с query;
    ranked=False — просто последние записи (для /memory).
    Просроченные записи (expires_at в прошлом) не возвращаются.
    """
    fetch_limit = max(limit * 8, 300) if ranked else limit
    with get_db() as conn:
        with conn.cursor() as cursor:
            if include_personal:
                cursor.execute(
                    f"SELECT {_MEM_COLUMNS} FROM memories"
                    " WHERE (user_id = %s OR user_id IS NULL) AND content <> %s"
                    " ORDER BY id DESC LIMIT %s",
                    (user_id, TEST_MEMORY_TEXT, fetch_limit),
                )
            else:
                cursor.execute(
                    f"SELECT {_MEM_COLUMNS} FROM memories"
                    " WHERE user_id IS NULL AND content <> %s"
                    " ORDER BY id DESC LIMIT %s",
                    (TEST_MEMORY_TEXT, fetch_limit),
                )
            rows = cursor.fetchall()

    now = _utcnow()
    items = [_row_to_memory(r) for r in rows]
    items = [m for m in items if not (m["expires_at"] and m["expires_at"] < now)]

    if ranked:
        kw = _keywords(query) if query else set()
        for m in items:
            m["score"] = _memory_score(m, kw, now)
        items.sort(key=lambda m: -m["score"])
        # Ядро: самое важное берём всегда, остальное — по релевантности
        core = [m for m in items if m["importance"] >= 4][:MEMORY_CORE_LIMIT]
        taken = {m["id"] for m in core}
        rest = [m for m in items if m["id"] not in taken]
        items = (core + rest)[:limit]
    else:
        items = items[:limit]
    items.sort(key=lambda m: m["id"])  # хронологически
    return items


def format_memory_line(m: dict, speaker_id=None) -> str:
    """Одна строка памяти с понятной пометкой, о ком она."""
    tag = MEMORY_LABELS.get(m["type"], m["type"])
    stars = "⭐" * m.get("importance", 3) if m.get("importance", 3) >= 4 else ""
    return f"[{tag}] {m['content']}{(' ' + stars) if stars else ''}"


def build_memory_block(memories, existing_prompt: str, speaker_id=None, group=False) -> str:
    """Блок воспоминаний для системного промпта.

    Записи разложены по «чьё это»: о собеседнике, о его партнёре (со слов
    собеседника), общее у пары. Так модель не путает людей между собой.
    """
    existing = existing_prompt.casefold()
    about_me, about_partner, shared = [], [], []
    for m in memories:
        if m["content"].casefold() in existing:
            continue
        if m.get("shared", True):
            shared.append(m)
        elif m.get("subject_id") is not None and m["subject_id"] != speaker_id:
            about_partner.append(m)
        else:
            about_me.append(m)
    if not (about_me or about_partner or shared):
        return ""

    me = user_name(speaker_id) if speaker_id is not None else "собеседник"
    pid = partner_of(speaker_id) if speaker_id is not None else None
    partner = user_name(pid) if pid is not None else "партнёр"

    parts = [
        "\n\n🗂 ПАМЯТЬ. Не путай людей: каждая запись относится только к тому,"
        " кого указывает заголовок раздела. Факт про одного человека никогда не"
        " приписывай другому. Используй память естественно, к месту, не"
        " перечисляй её без повода. Внутренние шутки можно изредка"
        " обыгрывать; чувствами делись бережно, не давя и не цитируя дословно."
    ]
    if shared:
        parts.append(
            f"\n💞 Общее у пары ({me} и {partner}):\n"
            + "\n".join("- " + format_memory_line(m) for m in shared)
        )
    if about_me:
        parts.append(
            f"\n👤 Про {me} (твой собеседник сейчас, в личном разговоре):\n"
            + "\n".join("- " + format_memory_line(m) for m in about_me)
        )
    if about_partner:
        parts.append(
            f"\n🫶 Про {partner} (это рассказал(а) {me}; {partner} этого мог не"
            " говорить сам(а), не выдавай как чужие слова и не раскрывай"
            " секреты/сюрпризы):\n"
            + "\n".join("- " + format_memory_line(m) for m in about_partner)
        )
    return "\n".join(parts)


def memory_maintenance() -> dict:
    """Уборка: сливает почти-дубли, убирает просроченное и неважное старое."""
    now = _utcnow()
    stats = {"merged": 0, "expired": 0, "faded": 0}
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT {_MEM_COLUMNS} FROM memories ORDER BY id")
            items = [_row_to_memory(r) for r in cursor.fetchall()]

            dead = set()
            for m in items:
                if m["expires_at"] and m["expires_at"] < now - timedelta(days=7):
                    dead.add(m["id"]); stats["expired"] += 1
                    continue
                age = (now - (m["updated_at"] or m["created_at"] or now)).days
                if m["mentions"] <= 1 and (
                    (m["importance"] <= 2 and age > 60)
                    or (m["type"] == "emotion" and m["importance"] <= 3 and age > 120)
                ):
                    dead.add(m["id"]); stats["faded"] += 1

            # Слияние почти-дублей внутри одного владельца: остаётся более важная
            keep = [m for m in items if m["id"] not in dead]
            for i, a in enumerate(keep):
                if a["id"] in dead:
                    continue
                for b in keep[i + 1:]:
                    if b["id"] in dead or a["owner"] != b["owner"]:
                        continue
                    if _similar(a["content"], b["content"]):
                        winner, loser = (
                            (a, b) if (a["importance"], a["mentions"])
                            >= (b["importance"], b["mentions"]) else (b, a)
                        )
                        cursor.execute(
                            "UPDATE memories SET mentions = %s, importance = %s"
                            " WHERE id = %s",
                            (winner["mentions"] + loser["mentions"],
                             max(winner["importance"], loser["importance"]),
                             winner["id"]),
                        )
                        winner["mentions"] += loser["mentions"]
                        dead.add(loser["id"]); stats["merged"] += 1
                        if loser is a:
                            break
            for mem_id in dead:
                cursor.execute("DELETE FROM memories WHERE id = %s", (mem_id,))
    return stats


# --- СТАРАЯ ПАМЯТЬ (user_memory / couple_memory) ---


def get_user_memory(user_id: int) -> str:
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT memory_text FROM user_memory WHERE user_id = %s", (user_id,)
            )
            row = cursor.fetchone()
    return row[0] if row and row[0] else EMPTY_USER_MEMORY


def update_user_memory(user_id: int, new_fact: str):
    current_memory = get_user_memory(user_id)
    if current_memory == EMPTY_USER_MEMORY:
        updated = new_fact
    else:
        if new_fact.lower() in current_memory.lower():
            return
        updated = f"{current_memory}\n- {new_fact}"

    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO user_memory (user_id, memory_text) VALUES (%s, %s)"
                " ON CONFLICT (user_id) DO UPDATE SET memory_text ="
                " EXCLUDED.memory_text",
                (user_id, updated),
            )


def get_couple_memory() -> str:
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT memory_text FROM couple_memory WHERE id = 1")
            row = cursor.fetchone()
    return row[0] if row and row[0] else EMPTY_COUPLE_MEMORY


def update_couple_memory(new_fact: str):
    current_memory = get_couple_memory()
    if current_memory == EMPTY_COUPLE_MEMORY:
        updated = new_fact
    else:
        if new_fact.lower() in current_memory.lower():
            return
        updated = f"{current_memory}\n- {new_fact}"

    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO couple_memory (id, memory_text) VALUES (1, %s) ON"
                " CONFLICT (id) DO UPDATE SET memory_text = EXCLUDED.memory_text",
                (updated,),
            )


# --- УДАЛЕНИЕ И ОЧИСТКА ---


def delete_memory_phrase(user_id: int, phrase: str):
    """Удаляет строки с фразой из старой памяти и из таблицы memories.

    Затрагивает: личную память пользователя и общую память пары.
    Личные воспоминания партнёра не трогает.
    """
    phrase_lower = phrase.lower().strip()
    if not phrase_lower:
        return []
    deleted_from = []

    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT memory_text FROM user_memory WHERE user_id = %s", (user_id,)
            )
            row = cursor.fetchone()
            if row and row[0]:
                lines = row[0].split("\n")
                new_lines = [l for l in lines if phrase_lower not in l.lower()]
                if len(new_lines) < len(lines):
                    updated = "\n".join(new_lines).strip() or EMPTY_USER_MEMORY
                    cursor.execute(
                        "UPDATE user_memory SET memory_text = %s WHERE user_id = %s",
                        (updated, user_id),
                    )
                    deleted_from.append("личную память")

            cursor.execute("SELECT memory_text FROM couple_memory WHERE id = 1")
            row = cursor.fetchone()
            if row and row[0]:
                lines = row[0].split("\n")
                new_lines = [l for l in lines if phrase_lower not in l.lower()]
                if len(new_lines) < len(lines):
                    updated = "\n".join(new_lines).strip() or EMPTY_COUPLE_MEMORY
                    cursor.execute(
                        "UPDATE couple_memory SET memory_text = %s WHERE id = 1",
                        (updated,),
                    )
                    deleted_from.append("общую память пары")

            # Новая память: свои личные + общие
            cursor.execute(
                "SELECT id, content, user_id FROM memories"
                " WHERE user_id = %s OR user_id IS NULL",
                (user_id,),
            )
            personal_ids, shared_ids = [], []
            for mem_id, content, owner in cursor.fetchall():
                if phrase_lower in content.lower():
                    (shared_ids if owner is None else personal_ids).append(mem_id)
            for mem_id in personal_ids + shared_ids:
                cursor.execute("DELETE FROM memories WHERE id = %s", (mem_id,))
            if personal_ids:
                deleted_from.append("личные воспоминания")
            if shared_ids:
                deleted_from.append("общие воспоминания пары")

    return deleted_from


def delete_memory_id(user_id: int, mem_id: int) -> bool:
    """Удаляет запись по номеру: свою или общую (чужую личную — нельзя)."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM memories WHERE id = %s"
                " AND (user_id = %s OR user_id IS NULL)",
                (mem_id, user_id),
            )
            if not cursor.fetchone():
                return False
            cursor.execute("DELETE FROM memories WHERE id = %s", (mem_id,))
    return True


def clear_memory(user_id: int, include_shared: bool = False):
    """Очищает личную память пользователя. Общую память пары — только если include_shared."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM user_memory WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM memories WHERE user_id = %s", (user_id,))
            if include_shared:
                cursor.execute("DELETE FROM couple_memory WHERE id = 1")
                cursor.execute("DELETE FROM memories WHERE user_id IS NULL")


# ---------------------------------------------------------------------------
# УТИЛИТЫ
# ---------------------------------------------------------------------------


def is_allowed(user) -> bool:
    return bool(user) and user.id in ALLOWED_USER_IDS


def current_time_str() -> str:
    try:
        from zoneinfo import ZoneInfo

        now = datetime.now(ZoneInfo(BOT_TIMEZONE))
    except Exception:
        now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d %H:%M (%A), %Z")


def split_text(text: str, limit: int = TELEGRAM_TEXT_LIMIT):
    """Режет длинный текст на части по переводам строк (лимит Telegram — 4096)."""
    text = text or ""
    chunks = []
    while len(text) > limit:
        cut = text.rfind("\n", 0, limit)
        if cut < limit // 2:
            cut = text.rfind(" ", 0, limit)
        if cut < limit // 2:
            cut = limit
        chunks.append(text[:cut])
        text = text[cut:].lstrip("\n")
    if text:
        chunks.append(text)
    return chunks or [""]


async def send_long(message: types.Message, text: str, **kwargs):
    for chunk in split_text(text):
        await message.answer(chunk, **kwargs)


# --- ФОРМАТИРОВАНИЕ ОТВЕТОВ (Markdown от модели -> HTML Telegram) ---

FORMAT_HINT = (
    "\n\n✍️ Оформление ответа (Telegram): обычный разговор пиши живым текстом, без"
    " лишнего оформления. Если нужно выделить, используй **жирный** для главного,"
    " *курсив* для оттенков, `код` для команд и значений, списки через «- » и"
    " короткие заголовки через «# ». Не используй таблицы и не злоупотребляй"
    " выделением."
)

_TAG_RE = re.compile(r"<(/?)(b|i|s|u|code|pre|a|blockquote)(?:\s[^>]*)?>")


def html_is_balanced(text: str) -> bool:
    """Все ли теги закрыты в правильном порядке (иначе Telegram отклонит)."""
    stack = []
    for m in _TAG_RE.finditer(text):
        if m[1]:
            if not stack or stack.pop() != m[2]:
                return False
        else:
            stack.append(m[2])
    return not stack


def markdown_to_html(text: str) -> str:
    """Превращает Markdown (как его пишет Gemini) в HTML, понятный Telegram."""
    stash = []

    def keep(markup: str) -> str:
        stash.append(markup)
        return f"\x00{len(stash) - 1}\x00"

    esc = lambda s: html.escape(s, quote=False)
    text = str(text or "").replace("\x00", "")

    # 1. Код и таблицы прячем, чтобы внутри них ничего не форматировалось
    text = re.sub(
        r"```[ \t]*[\w+#-]*\n?(.*?)```",
        lambda m: keep(f"<pre>{esc(m[1].rstrip())}</pre>"),
        text, flags=re.S,
    )
    text = re.sub(
        r"`([^`\n]+)`", lambda m: keep(f"<code>{esc(m[1])}</code>"), text
    )

    def table(m):
        rows = [r.strip() for r in m[0].strip("\n").split("\n")]
        rows = [r for r in rows if not re.fullmatch(r"\|?[\s:|-]+\|?", r)]
        cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
        return keep("<pre>" + esc("\n".join("  ".join(r) for r in cells)) + "</pre>")

    text = re.sub(r"(?:^[ \t]*\|.*\|[ \t]*(?:\n|$)){2,}", lambda m: table(m) + "\n", text, flags=re.M)

    text = esc(text)

    # 2. Блочные элементы
    text = re.sub(r"^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$", r"<b>\1</b>", text, flags=re.M)
    text = re.sub(r"^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$", "──────────", text, flags=re.M)
    text = re.sub(
        r"^([ \t]*)[-*+•][ \t]+",
        lambda m: m[1].replace("\t", "  ") + "• ", text, flags=re.M,
    )
    text = re.sub(
        r"(?:^&gt;[ \t]?.*(?:\n|$))+",
        lambda m: "<blockquote>"
        + re.sub(r"^&gt;[ \t]?", "", m[0].rstrip("\n"), flags=re.M)
        + "</blockquote>\n",
        text, flags=re.M,
    )

    # 3. Выделения внутри строки
    text = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\w_])__(?=\S)(.+?)(?<=\S)__(?![\w_])", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"<i>\1</i>", text)
    text = re.sub(r"(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_])", r"<i>\1</i>", text)
    text = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"<s>\1</s>", text)
    text = re.sub(
        r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)",
        lambda m: f'<a href="{m[2].replace(chr(34), "%22")}">{m[1]}</a>', text,
    )

    # 4. Возвращаем спрятанное
    for _ in range(2):
        text = re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m[1])], text)
    return text.strip()


def strip_markdown(text: str) -> str:
    """Запасной вариант: убирает разметку, оставляя чистый текст."""
    text = re.sub(r"```[ \t]*[\w+#-]*\n?(.*?)```", r"\1", str(text or ""), flags=re.S)
    text = re.sub(r"^[ \t]{0,3}#{1,6}[ \t]+", "", text, flags=re.M)
    text = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m[1] or m[2], text)
    text = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"\1", text)
    text = re.sub(r"`([^`\n]+)`", r"\1", text)
    text = re.sub(r"^([ \t]*)[-*+][ \t]+", r"\1• ", text, flags=re.M)
    return text.strip()


async def send_markdown(message: types.Message, text: str, **kwargs):
    """Отправляет ответ модели с красивым форматированием.

    Если Telegram не принял HTML, шлёт чистый текст без разметки.
    """
    queue = split_text(text, 3500)
    while queue:
        chunk = queue.pop(0)
        rendered = markdown_to_html(chunk)
        if len(rendered) > TELEGRAM_TEXT_LIMIT and len(chunk) > 200:
            # HTML-теги удлиняют текст: делим кусок пополам и пробуем снова
            queue = split_text(chunk, len(chunk) // 2 + 1) + queue
            continue
        try:
            if not html_is_balanced(rendered):
                raise ValueError("теги не сбалансированы")
            await message.answer(rendered, parse_mode="HTML", **kwargs)
        except Exception as e:
            logging.info(f"Форматирование не прошло ({e}), шлю простым текстом")
            await message.answer(strip_markdown(chunk), **kwargs)


# --- ФУНКЦИЯ ПОГОДЫ ---


WIND_DIRS = {
    "N": "С", "NNE": "С-СВ", "NE": "СВ", "ENE": "В-СВ", "E": "В", "ESE": "В-ЮВ",
    "SE": "ЮВ", "SSE": "Ю-ЮВ", "S": "Ю", "SSW": "Ю-ЮЗ", "SW": "ЮЗ", "WSW": "З-ЮЗ",
    "W": "З", "WNW": "З-СЗ", "NW": "СЗ", "NNW": "С-СЗ",
}
WEATHER_ICONS = (
    (("гроза", "thunder"), "⛈"), (("снег", "snow", "метел", "sleet"), "🌨"),
    (("дожд", "ливень", "морос", "rain", "drizzle", "shower"), "🌧"),
    (("туман", "дымка", "fog", "mist"), "🌫"), (("пасмурно", "overcast"), "☁️"),
    (("облачно", "cloud"), "⛅"), (("ясно", "солнечно", "sunny", "clear"), "☀️"),
)


def _t(value) -> str:
    """Температура со знаком: +5°, −3°."""
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return "?"
    return "0°" if n == 0 else f"{n:+d}°".replace("-", "−")


def _clock24(value) -> str:
    """'06:20 PM' -> '18:20' (wttr.in отдаёт восход и закат в 12-часовом формате)."""
    try:
        return datetime.strptime(str(value).strip(), "%I:%M %p").strftime("%H:%M")
    except ValueError:
        return str(value).strip()[:5]


def _ru(item) -> str:
    """Описание погоды: русское, если есть, иначе английское."""
    for key in ("lang_ru", "weatherDesc"):
        try:
            return item[key][0]["value"].strip()
        except (KeyError, IndexError, TypeError):
            continue
    return ""


def weather_icon(description: str) -> str:
    d = description.casefold()
    for words, icon in WEATHER_ICONS:
        if any(w in d for w in words):
            return icon
    return "🌡"


def format_weather(data: dict, city: str) -> str:
    """Красивая сводка из JSON wttr.in (формат j1)."""
    cur = data["current_condition"][0]
    title = city
    desc = _ru(cur)
    pressure = ""
    try:
        pressure = f" · 🧭 {round(float(cur['pressure']) * 0.750062)} мм рт. ст."
    except (KeyError, TypeError, ValueError):
        pass
    wind_dir = WIND_DIRS.get(cur.get("winddir16Point", ""), cur.get("winddir16Point", ""))
    try:
        wind = round(float(cur["windspeedKmph"]) / 3.6)
        wind_text = f"💨 ветер {wind} м/с {wind_dir}".strip()
    except (KeyError, TypeError, ValueError):
        wind_text = ""

    lines = [
        f"{weather_icon(desc)} {title}",
        f"Сейчас {_t(cur.get('temp_C'))}, ощущается как {_t(cur.get('FeelsLikeC'))}"
        + (f", {desc.lower()}" if desc else ""),
        " · ".join(
            x for x in (f"💧 влажность {cur.get('humidity', '?')}%", wind_text) if x
        ) + pressure,
    ]
    try:
        uv = int(cur.get("uvIndex", 0))
        if uv >= 6:
            lines.append(f"🕶 высокий UV-индекс: {uv}")
    except (TypeError, ValueError):
        pass

    days = data.get("weather") or []
    try:
        astro = days[0]["astronomy"][0]
        lines.append(f"🌅 восход {_clock24(astro['sunrise'])} · закат {_clock24(astro['sunset'])}")
    except (KeyError, IndexError, TypeError):
        pass

    names = ["Сегодня", "Завтра", "Послезавтра"]
    forecast = []
    for name, day in zip(names, days[:3]):
        try:
            hourly = day.get("hourly") or []
            chance = max(
                [int(h.get("chanceofrain", 0)) for h in hourly]
                + [int(h.get("chanceofsnow", 0)) for h in hourly] + [0]
            )
            noon = hourly[len(hourly) // 2] if hourly else {}
            icon = weather_icon(_ru(noon)) if noon else "•"
            rain = f", осадки до {chance}%" if chance >= 30 else ""
            forecast.append(
                f"{icon} {name}: {_t(day['mintempC'])}…{_t(day['maxtempC'])}{rain}"
            )
        except (KeyError, TypeError, ValueError):
            continue
    if forecast:
        lines.append("")
        lines.extend(forecast)
    return "\n".join(lines)


DEFAULT_CITY = os.getenv("DEFAULT_CITY", "Омск")
_geo_cache = {}   # запрос -> (время, список мест)
_wx_cache = {}    # (lat, lon) -> (время, текст)
CACHE_TTL = 600


def _http() -> "httpx.Client":
    return httpx.Client(
        timeout=8.0, follow_redirects=True,
        headers={"User-Agent": "curl/8.0", "Accept-Language": "ru"},
    )


def geocode(name: str, count: int = 3):
    """Находит места по названию (Open-Meteo): точные названия и координаты.

    Возвращает список {"title", "lat", "lon"}; пусто, если ничего не нашлось
    или сервис недоступен.
    """
    name = " ".join(str(name or "").split())[:60]
    if len(name) < 2:
        return []
    key = (name.casefold(), count)
    cached = _geo_cache.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    try:
        with _http() as http:
            response = http.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": name, "count": count, "language": "ru", "format": "json"},
            )
            response.raise_for_status()
            results = response.json().get("results") or []
    except Exception as e:
        logging.warning(f"Геокодинг не сработал для «{name}»: {e}")
        return []

    places = []
    for r in results:
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        parts = []
        for part in (r.get("name"), r.get("admin1"), r.get("country")):
            if part and part not in parts:
                parts.append(part)
        places.append({"title": ", ".join(parts), "lat": lat, "lon": lon})
    if len(_geo_cache) > 200:
        _geo_cache.clear()
    _geo_cache[key] = (time.time(), places)
    return places


def get_weather(city: str, place: dict = None) -> str:
    """Погода через wttr.in (httpx): подробная сводка и прогноз на 3 дня.

    Если место известно (из геокодинга), запрос идёт по координатам, поэтому
    город всегда тот, что нужен. Иначе название сначала уточняется геокодером.
    """
    city = " ".join(str(city or "").split())[:60] or DEFAULT_CITY
    if place is None:
        found = geocode(city, 1)
        place = found[0] if found else None
    if place:
        query, title = f"{place['lat']:.3f},{place['lon']:.3f}", place["title"]
    else:
        query, title = city, city

    cached = _wx_cache.get(query)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    try:
        with _http() as http:
            response = http.get(
                f"https://wttr.in/{urllib.parse.quote(query)}",
                params={"format": "j1", "lang": "ru"},
            )
            response.raise_for_status()
            try:
                text = format_weather(response.json(), title)
            except (ValueError, KeyError, IndexError, TypeError) as e:
                logging.warning(f"Погода: нестандартный ответ ({e}), беру краткий формат")
                short = http.get(
                    f"https://wttr.in/{urllib.parse.quote(query)}",
                    params={"format": "3", "lang": "ru"},
                )
                short.raise_for_status()
                return short.text.strip()
    except Exception as e:
        logging.error(f"Ошибка получения погоды: {e}")
        return f"Не удалось получить погоду для города: {city}"
    if len(_wx_cache) > 200:
        _wx_cache.clear()
    _wx_cache[query] = (time.time(), text)
    return text


# ---------------------------------------------------------------------------
# GEMINI
# ---------------------------------------------------------------------------


_TRANSIENT_MARKERS = (
    "503", "502", "504", "500", "unavailable", "overloaded", "timeout",
    "timed out", "deadline", "connection", "reset by peer", "temporarily",
)


def _is_transient(exc: BaseException) -> bool:
    """Временный сбой (сеть, перегрузка), который стоит повторить.

    Квоту (429) не повторяем: быстрее перейти к следующей модели каскада.
    """
    text = f"{type(exc).__name__} {exc}".casefold()
    if "429" in text or "quota" in text or "resource_exhausted" in text:
        return False
    return any(marker in text for marker in _TRANSIENT_MARKERS)


llm_retry = retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=6),
    reraise=True,
)


@llm_retry
def _generate_reply_sync(model_name, history_contents, contents, system_prompt):
    chat = client.chats.create(
        model=model_name,
        history=history_contents,
        config=genai_types.GenerateContentConfig(system_instruction=system_prompt),
    )
    return chat.send_message(contents).text


async def process_with_cascade(
    history_contents,
    contents,
    system_prompt,
    user_id=None,
    chat_type="private",
):
    """Отправляет запрос в каскад моделей.

    Если передан user_id — к промпту добавляются воспоминания из таблицы memories
    (личные только владельцу, в группе — только общие). Без user_id (инлайн)
    работает как раньше.
    """
    if user_id is not None:
        try:
            query = (
                contents
                if isinstance(contents, str)
                else next((c for c in contents if isinstance(c, str)), None)
            )
            memories = await asyncio.to_thread(
                get_memories,
                user_id,
                MEMORY_PROMPT_LIMIT,
                query,
                chat_type == "private",
            )
            system_prompt += build_memory_block(
                memories, system_prompt, speaker_id=user_id, group=chat_type != "private"
            )
        except Exception as e:
            logging.warning(f"Новая память недоступна, отвечаю по старой: {e}")

    for model_name in MODELS_CASCADE:
        try:
            text = await asyncio.to_thread(
                _generate_reply_sync,
                model_name,
                history_contents,
                contents,
                system_prompt,
            )
            if not text or not text.strip():
                raise ValueError("пустой ответ модели")
            return text
        except Exception as e:
            logging.warning(
                f"Модель {model_name} недоступна: {e}. Пробуем следующую..."
            )
            continue
    raise Exception("Все модели из каскада временно недоступны.")


@llm_retry
def upload_to_gemini(file_bytes, mime_type: str):
    """Загружает файл в Gemini и ждёт, пока он обработается (важно для видео)."""
    uploaded = client.files.upload(file=file_bytes, config={"mime_type": mime_type})
    for _ in range(30):
        state = getattr(getattr(uploaded, "state", None), "name", None)
        if state != "PROCESSING":
            break
        time.sleep(2)
        uploaded = client.files.get(name=uploaded.name)
    return uploaded


def parse_memory_ops(text: str, valid_ids=None):
    """Разбирает JSON-ответ модели в список операций с памятью.

    Операции: add (новый факт), update (уточнить существующий по id),
    reinforce (факт снова подтвердился). Принимает и старый формат —
    список {"type", "fact"}. Бросает исключение при мусоре.
    """
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    data = json.loads(text)
    if isinstance(data, dict):
        data = data.get("ops") or data.get("facts") or [data]
    if not isinstance(data, list):
        raise ValueError("ожидался список")
    valid_ids = set(valid_ids) if valid_ids is not None else None

    ops = []
    for item in data:
        if not isinstance(item, dict):
            continue
        op = str(item.get("op", "add")).strip().lower()
        fact = clean_fact(item.get("fact", ""))
        if fact.strip(" .").upper() in {"НЕТ", "NONE", "N/A", "NULL"}:
            continue

        if op == "add":
            mem_type = str(item.get("type", "")).strip().lower()
            if mem_type not in MEMORY_TYPES or not fact:
                continue
            importance = clamp_importance(
                item.get("importance"), DEFAULT_IMPORTANCE[mem_type]
            )
            if importance < MIN_SAVE_IMPORTANCE:
                continue  # мелочь — не запоминаем
            about = str(item.get("about", "")).strip().lower()
            ops.append({
                "op": "add", "type": mem_type, "fact": fact,
                "importance": importance,
                "about": about if about in SUBJECTS else None,
                "until": parse_until(item.get("until")),
            })
        elif op in ("update", "reinforce"):
            try:
                mem_id = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            if valid_ids is not None and mem_id not in valid_ids:
                continue
            if op == "update" and not fact:
                continue
            ops.append({
                "op": op, "id": mem_id, "fact": fact or None,
                "importance": (
                    clamp_importance(item.get("importance"))
                    if item.get("importance") is not None else None
                ),
            })
    return ops[:4]


@llm_retry
def _generate_json_sync(model_name, prompt):
    return client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json"
        ),
    )


def _extract_ops_sync(prompt: str, valid_ids):
    for model_name in MODELS_CASCADE:
        try:
            response = _generate_json_sync(model_name, prompt)
            return parse_memory_ops(response.text, valid_ids)
        except Exception as e:
            logging.warning(
                f"Модель {model_name} не смогла выделить факты: {e}."
                " Пробуем следующую..."
            )
    return []


def get_recent_context(chat_id: int, limit: int = 6, skip_last_user: bool = True):
    """Последние реплики чата (для понимания шуток и чувств в контексте)."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT role, content FROM messages WHERE chat_id = %s"
                " ORDER BY id DESC LIMIT %s",
                (chat_id, limit + 1),
            )
            rows = cursor.fetchall()
    if skip_last_user and rows and rows[0][0] == "user":
        rows = rows[1:]  # само анализируемое сообщение
    lines = []
    for role, content in reversed(rows[:limit]):
        if content:
            lines.append(("Бот: " if role != "user" else "") + content[:300])
    return lines


def build_extraction_prompt(
    user_id: int, user_message: str, existing, context_lines
) -> str:
    me = user_name(user_id)
    pid = partner_of(user_id)
    partner = user_name(pid) if pid is not None else "партнёр"

    def about_label(m):
        if m["shared"] and m["subject_id"] is None:
            return "пара"
        return f"о {me}" if m["subject_id"] == user_id else f"о {partner}"

    existing_text = "\n".join(
        f"[id {m['id']}] ({MEMORY_LABELS.get(m['type'], m['type'])}, "
        f"{about_label(m)}, важность {m['importance']}) {m['content']}"
        for m in existing
    ) or "(пока ничего)"
    context_text = "\n".join(context_lines) or "(нет)"

    return (
        f"Сегодня: {current_time_str()}.\n"
        f"Ты ведёшь память чат-бота пары: {me} и {partner}. Сейчас пишет {me}.\n"
        f"Реши, что из НОВОЙ реплики стоит запомнить надолго.\n\n"
        f"ВАЖНОСТЬ (поле importance):\n"
        f"5 — критично: здоровье, аллергии, страхи и границы, главные даты и"
        f" события отношений, важные обещания;\n"
        f"4 — сильно описывает человека или пару: ценности, цели, устойчивые"
        f" предпочтения, важные планы, повторяющиеся переживания;\n"
        f"3 — полезно помнить: вкусы, привычки, договорённости;\n"
        f"2 и ниже — мелочи и сиюминутное: НЕ сохраняй (просто не добавляй).\n"
        f"Большинство реплик не содержат ничего достойного памяти — тогда верни [].\n\n"
        f"ТИПЫ (type) и ОТНОСИТЕЛЬНО КОГО (about: self — {me}, partner —"
        f" {partner}, couple — пара):\n"
        f"- personal — предпочтения, привычки, цели, черты характера. about:"
        f" self, или partner, если {me} рассказал это про {partner};\n"
        f"- couple — важное об отношениях пары (about: couple);\n"
        f"- event — значимые события и даты. Относительные даты ('завтра')"
        f" переведи в конкретные. Если событие разовое и после даты"
        f" теряет смысл, укажи until (YYYY-MM-DD);\n"
        f"- emotion — чувства: устойчивые закономерности ('{me} тревожится"
        f" перед выступлениями') или по-настоящему значимый эмоциональный момент"
        f" (с коротким поводом и датой). Обычное настроение ('устал', 'бесит"
        f" пробка') не сохраняй. Это всегда чувства самого {me} (about: self),"
        f" даже если они о {partner};\n"
        f"- inside_joke — внутренние шутки, прозвища, словечки пары. Пиши ФРАЗУ и"
        f" её смысл/происхождение, чтобы потом можно было обыграть"
        f" (например: «Шутка пары: «пельмени-ниндзя» — про тот случай с кухней»).\n\n"
        f"КАК ПИСАТЬ ФАКТ: коротко (до 150 символов), самодостаточно, с именем"
        f" человека ('{me} любит горы', '{partner} боится глубины'). Не путай"
        f" людей: если {me} говорит о {partner}, подлежащим должно быть имя"
        f" {partner}, а не {me}.\n\n"
        f"УЖЕ В ПАМЯТИ (не дублируй!):\n{existing_text}\n\n"
        f"Если новая информация уточняет или меняет существующую запись —"
        f' верни {{"op": "update", "id": N, "fact": "новая формулировка"}}.'
        f' Если она просто повторяет запись — {{"op": "reinforce", "id": N}}.\n\n'
        f"Ответ — строго JSON-массив (максимум 3 операции), без пояснений:\n"
        f'[{{"op": "add", "type": "personal", "about": "self",'
        f' "importance": 3, "fact": "...", "until": null}}]\n\n'
        f"КОНТЕКСТ (предыдущие реплики, только для понимания):\n{context_text}\n\n"
        f"НОВАЯ РЕПЛИКА от {me}: {user_message}"
    )


async def extract_and_save_facts(
    user_id: int, chat_type: str, user_message: str, chat_id=None
):
    try:
        existing = await asyncio.to_thread(
            get_memories, user_id, 12, user_message, chat_type == "private"
        )
        context_lines = (
            await asyncio.to_thread(get_recent_context, chat_id)
            if chat_id is not None else []
        )
        prompt = build_extraction_prompt(
            user_id, user_message, existing, context_lines
        )
        ops = await asyncio.to_thread(
            _extract_ops_sync, prompt, {m["id"] for m in existing}
        )
        for op in ops:
            if op["op"] == "add":
                saved = await asyncio.to_thread(
                    save_memory, user_id, op["type"], op["fact"],
                    None, op["importance"], op["about"], op["until"],
                )
                if saved:
                    logging.info(
                        f"Новая память [{op['type']}, важн. {op['importance']}]:"
                        f" {op['fact']}"
                    )
            else:
                await asyncio.to_thread(
                    update_memory, user_id, op["id"], op["fact"], op["importance"]
                )
                logging.info(f"Память #{op['id']}: {op['op']} {op['fact'] or ''}")
    except Exception:
        logging.exception("Не удалось сохранить факты в память")


# Ссылки на фоновые задачи, чтобы их не собрал сборщик мусора
_background_tasks = set()


def run_in_background(coro):
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# ---------------------------------------------------------------------------
# ОБРАБОТЧИКИ КОМАНД И СООБЩЕНИЙ
# ---------------------------------------------------------------------------


async def send_draw_prompt(message: types.Message):
    # Проверка на групповой чат (в группах Web App кнопки запрещены Telegram)
    if message.chat.type != "private":
        bot_info = await bot.get_me()
        private_link = f"https://t.me/{bot_info.username}?start=draw"
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[
                InlineKeyboardButton(
                    text="🎨 Перейти в ЛС для рисования", url=private_link
                )
            ]]
        )
        await message.answer(
            "🎨 Создание рисунков через холст доступно только в <b>личных"
            " сообщениях</b> с ботом.\n\nНажми на кнопку ниже:",
            reply_markup=keyboard,
            parse_mode="HTML",
        )
        return

    base_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
    if not base_url:
        await message.answer(
            "⚠️ Холст не настроен: в окружении нет RENDER_EXTERNAL_URL."
        )
        return
    if base_url.startswith("http://"):
        base_url = base_url.replace("http://", "https://", 1)

    web_app_url = f"{base_url.rstrip('/')}/draw"
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="🎨 Открыть холст", web_app=WebAppInfo(url=web_app_url)
            )
        ]]
    )
    try:
        await message.answer(
            "Нажми на кнопку ниже, чтобы нарисовать что-нибудь:",
            reply_markup=keyboard,
        )
    except Exception as e:
        logging.error(f"Ошибка при вызове холста: {e}")


@dp.message(Command("draw"))
async def cmd_draw(message: types.Message):
    if not is_allowed(message.from_user):
        return
    await send_draw_prompt(message)


@dp.message(Command("start"))
async def cmd_start(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    if command.args == "draw":
        await send_draw_prompt(message)
        return
    await message.answer(
        "Привет! Я твой личный ИИ-помощник.\n"
        "• В личке я общаюсь с тобой напрямую.\n"
        "• В общем чате я молча слушаю и запоминаю, а отзываюсь на префикс"
        " «чат» или ответ реплаем.\n"
        "• Список команд: /command"
    )


COMMANDS_HELP = (
    "📋 <b>Доступные команды бота:</b>\n\n"
    "• /start — приветствие и справка\n"
    "• /command — список команд\n"
    "• /draw — холст для рисования\n"
    "• /remind &lt;когда и что&gt; — напоминание (например: завтра в 18:00 купить цветы)\n"
    "• /reminders — список напоминаний, /reminddelete &lt;номер&gt; — удалить\n"
    "• /weather &lt;город&gt; — погода и прогноз на 3 дня\n"
    "• /memory — посмотреть общую и личную память\n"
    "• /remember [тип] &lt;текст&gt; — запомнить вручную как важное (типы: personal,"
    " partner — про партнёра, couple, event, emotion, inside_joke)\n"
    "• /memorydelete &lt;номер или фраза&gt; — удалить запись\n"
    "• /memoryclear — очистить память (с подтверждением)\n\n"
    "🌤 <b>Инлайн-режим (@имя_бота):</b>\n"
    "• погода &lt;город&gt; — узнать погоду\n"
    "• любой текст — быстрый ответ от ИИ"
)


@dp.message(Command("command"))
async def cmd_command_list(message: types.Message):
    if not is_allowed(message.from_user):
        return
    await message.answer(COMMANDS_HELP, parse_mode="HTML")


def _memory_section(title: str, items) -> str:
    if not items:
        return ""
    lines = []
    for m in items:
        stars = "⭐" * m["importance"] if m["importance"] >= 4 else ""
        tag = MEMORY_LABELS.get(m["type"], m["type"])
        lines.append(
            f"• <code>{m['id']}</code> [{html.escape(tag)}]"
            f" {html.escape(m['content'])}{(' ' + stars) if stars else ''}"
        )
    return f"\n<b>{title}</b>\n" + "\n".join(lines) + "\n"


@dp.message(Command("memory"))
async def cmd_memory(message: types.Message):
    if not is_allowed(message.from_user):
        return
    user_id = message.from_user.id
    remember_name(message.from_user)
    me = user_name(user_id)
    pid = partner_of(user_id)
    partner = user_name(pid) if pid is not None else "партнёр"

    couple = await asyncio.to_thread(get_couple_memory)
    personal = await asyncio.to_thread(get_user_memory, user_id)
    items = await asyncio.to_thread(get_memories, user_id, 80, None, True, False)

    shared = [m for m in items if m["shared"]]
    mine = [m for m in items if not m["shared"] and m["subject_id"] in (user_id, None)]
    about_partner = [
        m for m in items
        if not m["shared"] and m["subject_id"] not in (user_id, None)
    ]
    # сначала важное
    for group in (shared, mine, about_partner):
        group.sort(key=lambda m: (-m["importance"], -m["id"]))

    text = "🧠 <b>Память бота</b>\n(число — номер записи, ⭐ — важное)\n"
    text += _memory_section("💞 Общее у вас двоих", shared)
    text += _memory_section(f"👤 Про тебя ({html.escape(me)}) — видишь только ты", mine)
    text += _memory_section(
        f"🫶 Что ты рассказал(а) про {html.escape(partner)} — видишь только ты",
        about_partner,
    )
    if not items:
        text += "\nНовых воспоминаний пока нет.\n"
    if couple != EMPTY_COUPLE_MEMORY:
        text += f"\n💞 <b>Старая общая заметка:</b>\n{html.escape(couple)}\n"
    if personal != EMPTY_USER_MEMORY:
        text += f"\n👤 <b>Старая личная заметка:</b>\n{html.escape(personal)}\n"
    text += "\nУдалить: /memorydelete &lt;номер или фраза&gt;"
    await send_long(message, text, parse_mode="HTML")


REMEMBER_ALIASES = {"partner": ("personal", "partner"), "партнёр": ("personal", "partner")}


@dp.message(Command("remember"))
async def cmd_remember(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    args = (command.args or "").strip()
    mem_type, subject = "personal", None
    first, _, rest = args.partition(" ")
    key = first.lower()
    if key in REMEMBER_ALIASES and rest.strip():
        (mem_type, subject), args = REMEMBER_ALIASES[key], rest.strip()
    elif key in MEMORY_TYPES and rest.strip():
        mem_type, args = key, rest.strip()

    if not args:
        await message.answer(
            "⚠️ Напиши, что запомнить. Примеры:\n"
            "/remember couple Мы познакомились в апреле\n"
            "/remember partner Любит ромашки (факт про партнёра, видишь только ты)\n"
            "/remember inside_joke «Пельмени-ниндзя» — про тот случай на кухне\n"
            "Типы: personal, partner, couple, event, emotion, inside_joke."
        )
        return

    # Вручную сохранённое считаем важным
    saved = await asyncio.to_thread(
        save_memory, message.from_user.id, mem_type, args, None, 5, subject
    )
    label = MEMORY_LABELS[mem_type] + (" · про партнёра" if subject == "partner" else "")
    if saved:
        await message.answer(f"✅ Запомнил ({label}) как важное.")
    else:
        await message.answer("ℹ️ Такая запись уже есть (я отметил её как подтверждённую).")


@dp.message(Command("memorydelete"))
async def cmd_memory_delete(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    phrase = (command.args or "").strip()
    if not phrase:
        await message.answer(
            "⚠️ Укажи номер или текст. Примеры: /memorydelete 12 или /memorydelete горы"
        )
        return
    if phrase.isdigit():
        ok = await asyncio.to_thread(
            delete_memory_id, message.from_user.id, int(phrase)
        )
        await message.answer(
            "🗑 Запись удалена." if ok else "❌ Нет такой записи среди доступных тебе."
        )
        return
    deleted = await asyncio.to_thread(
        delete_memory_phrase, message.from_user.id, phrase
    )
    if deleted:
        await message.answer(
            f"🗑 Успешно удалено из разделов: <b>{', '.join(deleted)}</b>.",
            parse_mode="HTML",
        )
    else:
        await message.answer("❌ Совпадений с такой фразой в памяти не найдено.")


@dp.message(Command("memoryclear"))
async def cmd_memory_clear(message: types.Message):
    if not is_allowed(message.from_user):
        return
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🗑 Только мою память", callback_data="mclear:me")],
            [InlineKeyboardButton(
                text="💥 Мою и общую память пары", callback_data="mclear:all"
            )],
            [InlineKeyboardButton(text="Отмена", callback_data="mclear:cancel")],
        ]
    )
    await message.answer(
        "Что очистить?\n\n"
        "• «Только мою» — твои личные записи. Общая память пары и память"
        " партнёра останутся.\n"
        "• «Мою и общую» — ещё и всё, что общее для вас обоих (затронет и"
        " партнёра!).",
        reply_markup=keyboard,
    )


@dp.callback_query(F.data.startswith("mclear:"))
async def cb_memory_clear(callback: types.CallbackQuery):
    if not is_allowed(callback.from_user):
        await callback.answer()
        return
    action = callback.data.split(":", 1)[1]

    if action == "cancel":
        result = "Отменено, память не тронута."
    elif action in ("me", "all"):
        await asyncio.to_thread(clear_memory, callback.from_user.id, action == "all")
        result = (
            "🧹 Твоя личная память очищена."
            if action == "me"
            else "🧹 Очищена личная и общая память пары."
        )
    else:
        await callback.answer()
        return

    try:
        if callback.message:
            await callback.message.edit_text(result)
    except Exception:
        pass
    await callback.answer()


# --- ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ (ПАССИВ + АКТИВ) ---

MEDIA_PLACEHOLDERS = {"Голосовое сообщение", "Видеосообщение", "Фотография"}


@dp.message(F.text | F.voice | F.video_note | F.photo)
async def handle_media_or_text(message: types.Message):
    if not is_allowed(message.from_user):
        return

    user_id = message.from_user.id
    chat_id = message.chat.id
    chat_type = "private" if message.chat.type == "private" else "group"
    remember_name(message.from_user)
    speaker_name = user_name(user_id)

    user_text = ""
    file_bytes = None
    mime_type = None

    try:
        if message.text:
            user_text = message.text.strip()
        elif message.voice:
            file = await bot.get_file(message.voice.file_id)
            file_bytes = await bot.download_file(file.file_path)
            mime_type = "audio/ogg"
            user_text = message.caption or "Голосовое сообщение"
        elif message.video_note:
            file = await bot.get_file(message.video_note.file_id)
            file_bytes = await bot.download_file(file.file_path)
            mime_type = "video/mp4"
            user_text = message.caption or "Видеосообщение"
        elif message.photo:
            photo = message.photo[-1]
            file = await bot.get_file(photo.file_id)
            file_bytes = await bot.download_file(file.file_path)
            mime_type = "image/jpeg"
            user_text = message.caption or "Фотография"
    except Exception as e:
        logging.error(f"Не удалось скачать файл: {e}")
        await message.answer("Не получилось скачать файл (возможно, он слишком большой).")
        return

    # Определяем, нужно ли боту отвечать (активный режим) или просто слушать (пассивный)
    is_addressed_to_bot = False
    text_lower = user_text.lower()

    if chat_type == "private":
        is_addressed_to_bot = True  # В личке бот отвечает на всё
    else:
        # В группе проверяем префикс «чат» или ответ реплаем на сообщение бота
        if text_lower.startswith("чат"):
            is_addressed_to_bot = True
            user_text = user_text[3:].lstrip(" ,:;!?.-")
            if not user_text:
                user_text = "Привет!"
        elif (
            message.reply_to_message
            and message.reply_to_message.from_user
            and message.reply_to_message.from_user.id == bot.id
        ):
            is_addressed_to_bot = True

    # «Напомни завтра в 18:00 купить цветы» — ставим напоминание без Gemini
    if (
        is_addressed_to_bot
        and not file_bytes
        and re.match(r"^(?:пожалуйста[\s,]*)?напомни(?:ть)?\b", user_text, re.I)
        and len(user_text.split()) >= 3
    ):
        await add_reminder_from_text(message, user_text)
        return

    # История берётся ДО сохранения текущего сообщения, иначе оно уйдёт в Gemini дважды
    recent_history = []
    if is_addressed_to_bot:
        recent_history = await asyncio.to_thread(get_chat_history, chat_id, 10)

    # 1. ВСЕГДА сохраняем сообщение в историю БД, чтобы бот видел хронологию общения
    await asyncio.to_thread(
        save_message, chat_id, user_id, chat_type, "user", f"{speaker_name}: {user_text}"
    )

    # 2. Запускаем фоновый анализ фактов (пропускаем пустяки, команды и «голые» медиа)
    worth_analyzing = (
        len(user_text) >= 12
        and not user_text.startswith("/")
        and user_text not in MEDIA_PLACEHOLDERS
    )
    if worth_analyzing:
        run_in_background(
            extract_and_save_facts(
                user_id, chat_type, f"{speaker_name}: {user_text}", chat_id
            )
        )

    # 3. Если к боту не обращались (пассивный режим в группе) — просто выходим
    if not is_addressed_to_bot:
        return

    # --- АКТИВНЫЙ РЕЖИМ (отправка ответа пользователю) ---
    now_line = f"Сейчас: {current_time_str()}."
    couple_memory = await asyncio.to_thread(get_couple_memory)

    if chat_type == "private":
        user_memory = await asyncio.to_thread(get_user_memory, user_id)
        system_prompt = (
            f"Ты — эмпатичный ИИ-помощник. ЛИЧНЫЙ чат с {speaker_name}.\n"
            f"{now_line}\n\n"
            f"💞 Общая информация о паре:\n{couple_memory}\n\n"
            f"👤 Личная память:\n{user_memory}"
            f"{FORMAT_HINT}"
        )
    else:
        system_prompt = (
            f"Ты — эмпатичный ИИ-помощник. ГРУППОВОЙ чат пары.\n"
            f"Сейчас обращается: {speaker_name}.\n"
            f"{now_line}\n\n"
            f"💞 Общая информация о паре:\n{couple_memory}"
            f"{FORMAT_HINT}"
        )

    try:
        if file_bytes:
            uploaded_file = await asyncio.to_thread(
                upload_to_gemini, file_bytes, mime_type
            )
            contents = [uploaded_file, user_text]
        else:
            contents = user_text

        bot_response_text = await process_with_cascade(
            recent_history,
            contents,
            system_prompt,
            user_id=user_id,
            chat_type=chat_type,
        )

        await asyncio.to_thread(
            save_message, chat_id, user_id, chat_type, "model", bot_response_text
        )
        await send_markdown(message, bot_response_text)

    except Exception as e:
        logging.error(f"Ошибка при обработке запроса: {e}")
        await message.answer(
            "Произошла ошибка при обработке сообщения. Попробуйте еще раз."
        )


# ---------------------------------------------------------------------------
# НАПОМИНАНИЯ (APScheduler + dateparser)
# ---------------------------------------------------------------------------

scheduler = AsyncIOScheduler(timezone="UTC")

REPEAT_PATTERNS = (
    ("daily", re.compile(r"\b(?:каждый день|ежедневно|каждое утро|каждый вечер)\b", re.I)),
    ("weekly", re.compile(r"\b(?:каждую неделю|еженедельно)\b", re.I)),
)
BOTH_RE = re.compile(r"^(?:нам|обоим|обоих|мне и [а-яё]+)\b[\s,:-]*", re.I)
REMIND_PREFIX_RE = re.compile(r"^(?:пожалуйста[\s,]*)?напомни(?:ть)?(?:\s+(?:мне|нам))?[\s,:-]*", re.I)
REPEAT_LABELS = {"daily": "каждый день", "weekly": "каждую неделю"}


def local_tz():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(BOT_TIMEZONE)
    except Exception:
        return timezone.utc


def to_utc_naive(dt: datetime) -> datetime:
    """Любое время -> naive UTC (так хранится в базе). Без пояса = местное."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=local_tz())
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def format_local(dt_utc: datetime) -> str:
    local = dt_utc.replace(tzinfo=timezone.utc).astimezone(local_tz())
    return local.strftime("%d.%m.%Y %H:%M")


def _dateparser_settings():
    """Настройки dateparser. Время считаем «настенным» (по часам BOT_TIMEZONE).

    Пояс в настройки НЕ передаём: с TIMEZONE dateparser по-разному сдвигает
    относительные фразы («в 18:00», «через 2 минуты»). Вместо этого даём ему
    местное «сейчас» без пояса, а пояс добавляем сами в to_utc_naive().
    """
    now_local = datetime.now(local_tz()).replace(tzinfo=None, microsecond=0)
    return {"PREFER_DATES_FROM": "future", "RELATIVE_BASE": now_local}


def parse_reminder_text(raw: str):
    """Из «завтра в 18:00 купить цветы» делает (время_UTC, текст, повтор, обоим).

    Время и дело можно разделить знаком «|»: «завтра в 18:00 | купить цветы» —
    так надёжнее всего. Без него время ищется в начале фразы автоматически.
    Возвращает None, если время не нашлось.
    """
    text = REMIND_PREFIX_RE.sub("", " ".join(str(raw or "").split())).strip()
    both = False
    m = BOTH_RE.match(text)
    if m:
        both, text = True, text[m.end():].strip()

    repeat = None
    for name, pattern in REPEAT_PATTERNS:
        if pattern.search(text):
            repeat = name
            text = pattern.sub(" ", text)
            break
    text = " ".join(text.split())

    when, task = None, ""
    settings = _dateparser_settings()
    parse = lambda s: dateparser.parse(s, languages=["ru", "en"], settings=settings)
    phrase = ""
    if "|" in text:
        phrase, _, task = text.partition("|")
        phrase = phrase.strip()
        when = parse(phrase) if phrase else None
    else:
        # Самое длинное начало фразы, которое dateparser понимает как время
        words = text.split()
        for k in range(min(len(words), 7), 0, -1):
            candidate = " ".join(words[:k])
            when = parse(candidate)
            if when:
                phrase, task = candidate, " ".join(words[k:])
                break
        if when is None:  # время где-то в середине фразы
            found = [
                f for f in (search_dates(text, languages=["ru", "en"], settings=settings) or [])
                if f[0].strip()
            ]
            if found:
                phrase, when = max(found, key=lambda f: len(f[0]))
                task = text.replace(phrase, " ", 1)
    task = " ".join(task.split()).strip(" ,.:;-—|")
    if when is None:
        return None
    # «завтра» или «в пятницу» без часа: ищем время дальше во фразе
    # («завтра купить цветы в 18:00», «завтра в 6 вечера»), иначе ставим на
    # 9 утра, а не на «сейчас»
    if not re.search(
        r"\d{1,2}[:.]\d{2}|через|утр|вечер|дн[её]м|ноч|полд|час|мин", phrase, re.I
    ):
        time_re = re.compile(
            r"(?:\b[вк]\s+)?\b(\d{1,2})[:.](\d{2})\b"
            r"|\b[вк]\s+(\d{1,2})\b(?:\s*(утра|вечера|дня|ночи)\b)?",
            re.I,
        )
        hour, minute = 9, 0
        in_task = time_re.search(task)
        tm = in_task or time_re.search(phrase)
        if tm:
            h = int(tm[1] if tm[1] else tm[3])
            m_ = int(tm[2]) if tm[2] else 0
            part = (tm[4] or "").lower()
            if in_task:
                task = (task[:tm.start()] + " " + task[tm.end():]).strip(" ,.:;-—")
            else:  # время было в самой фразе; «вечера» могло остаться в деле
                lead = re.match(r"\s*(утра|вечера|дня|ночи)\b", task, re.I)
                if lead:
                    part = lead[1].lower()
                    task = task[lead.end():].strip(" ,.:;-—")
            if part in ("вечера", "дня") and h < 12:
                h += 12
            if h < 24 and m_ < 60:
                hour, minute = h, m_
        when = when.replace(hour=hour, minute=minute, second=0, microsecond=0)
    when_utc = to_utc_naive(when)
    return when_utc, task[:MAX_FACT_LENGTH * 2], repeat, both


def create_reminder(user_id, chat_id, text, remind_at, repeat=None, both=False) -> int:
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO reminders (user_id, chat_id, text, remind_at, repeat_rule,"
                " both_users, done) VALUES (%s, %s, %s, %s, %s, %s, %s)"
                " RETURNING id",
                (user_id, chat_id, text, remind_at, repeat, bool(both), False),
            )
            return cursor.fetchone()[0]


def get_reminder(rem_id: int):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, user_id, chat_id, text, remind_at, repeat_rule, both_users"
                " FROM reminders WHERE id = %s AND done = %s",
                (rem_id, False),
            )
            row = cursor.fetchone()
    if not row:
        return None
    return {
        "id": row[0], "user_id": row[1], "chat_id": row[2], "text": row[3],
        "remind_at": _to_dt(row[4]), "repeat": row[5], "both": bool(row[6]),
    }


def list_reminders(user_id: int):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, text, remind_at, repeat_rule, both_users FROM reminders"
                " WHERE user_id = %s AND done = %s ORDER BY remind_at, id",
                (user_id, False),
            )
            rows = cursor.fetchall()
    return [
        {"id": r[0], "text": r[1], "remind_at": _to_dt(r[2]), "repeat": r[3],
         "both": bool(r[4])}
        for r in rows
    ]


def finish_reminder(rem_id: int, next_at=None):
    """Одноразовое помечаем выполненным, повторяющееся переносим."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            if next_at:
                cursor.execute(
                    "UPDATE reminders SET remind_at = %s WHERE id = %s",
                    (next_at, rem_id),
                )
            else:
                cursor.execute(
                    "UPDATE reminders SET done = %s WHERE id = %s", (True, rem_id)
                )


def delete_reminder(user_id: int, rem_id: int) -> bool:
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM reminders WHERE id = %s AND user_id = %s AND done = %s",
                (rem_id, user_id, False),
            )
            if not cursor.fetchone():
                return False
            cursor.execute("UPDATE reminders SET done = %s WHERE id = %s", (True, rem_id))
    return True


def schedule_reminder(rem_id: int, remind_at: datetime):
    run_date = remind_at.replace(tzinfo=timezone.utc)
    scheduler.add_job(
        fire_reminder,
        DateTrigger(run_date=run_date),
        args=[rem_id],
        id=f"rem{rem_id}",
        replace_existing=True,
        misfire_grace_time=None,  # после простоя всё равно напомнить
    )


def unschedule_reminder(rem_id: int):
    try:
        scheduler.remove_job(f"rem{rem_id}")
    except Exception:
        pass


@llm_retry
async def _send_with_retry(chat_id: int, text: str):
    await bot.send_message(chat_id, text)


async def fire_reminder(rem_id: int):
    rem = await asyncio.to_thread(get_reminder, rem_id)
    if not rem:
        return
    author = user_name(rem["user_id"])
    targets = [rem["chat_id"]]
    if rem["both"]:
        partner = partner_of(rem["user_id"])
        if partner is not None and partner not in targets:
            targets.append(partner)
    body = rem["text"] or "Время пришло!"
    for chat in targets:
        prefix = "⏰ Напоминание"
        if chat != rem["chat_id"]:
            prefix += f" от {author}"
        try:
            await _send_with_retry(chat, f"{prefix}:\n{body}")
        except Exception as e:
            logging.error(f"Не удалось отправить напоминание {rem_id} в {chat}: {e}")

    step = {"daily": timedelta(days=1), "weekly": timedelta(days=7)}.get(rem["repeat"])
    if step:
        nxt = rem["remind_at"] + step
        now = _utcnow()
        while nxt <= now:
            nxt += step
        await asyncio.to_thread(finish_reminder, rem_id, nxt)
        schedule_reminder(rem_id, nxt)
    else:
        await asyncio.to_thread(finish_reminder, rem_id)


def load_pending_reminders() -> int:
    """После перезапуска заново ставит в расписание всё невыполненное."""
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, remind_at FROM reminders WHERE done = %s", (False,)
            )
            rows = cursor.fetchall()
    for rem_id, remind_at in rows:
        dt = _to_dt(remind_at)
        if dt:
            schedule_reminder(rem_id, dt)
    return len(rows)


REMIND_USAGE = (
    "⏰ <b>Как поставить напоминание</b>\n"
    "/remind завтра в 18:00 купить цветы\n"
    "/remind через 2 часа позвонить маме\n"
    "/remind в пятницу в 20:00 | сходить на ужин\n"
    "/remind каждый день в 9:00 выпить витамины\n"
    "/remind нам 14 февраля в 10:00 годовщина — придёт обоим\n\n"
    "Знак «|» отделяет время от дела — так бот не ошибётся.\n"
    "Можно и просто написать боту: «напомни завтра в 18:00 купить цветы».\n"
    "Список: /reminders, удалить: /reminddelete &lt;номер&gt;"
)


async def add_reminder_from_text(message: types.Message, raw: str):
    parsed = await asyncio.to_thread(parse_reminder_text, raw)
    if not parsed:
        await message.answer(
            "🤔 Не получилось понять, когда напомнить. Напиши время и дело, например:\n"
            "завтра в 18:00 | купить цветы",
        )
        return
    when, task, repeat, both = parsed
    if not task:
        await message.answer(
            "🤔 А о чём напомнить? Например: через 2 часа | позвонить маме"
        )
        return
    if repeat is None and when <= _utcnow():
        await message.answer(
            "⌛ Это время уже прошло. Укажи будущее, например: завтра в 9:00 | ..."
        )
        return
    if len(await asyncio.to_thread(list_reminders, message.from_user.id)) >= 50:
        await message.answer("📋 Уже 50 активных напоминаний. Удали ненужные: /reminders")
        return
    rem_id = await asyncio.to_thread(
        create_reminder, message.from_user.id, message.chat.id, task, when, repeat, both
    )
    schedule_reminder(rem_id, when)
    extra = f", {REPEAT_LABELS[repeat]}" if repeat else ""
    who = " (получите оба)" if both else ""
    await message.answer(
        f"✅ Напомню {format_local(when)}{extra}{who}:\n{task}\n"
        f"Номер {rem_id} — отменить: /reminddelete {rem_id}"
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


@dp.message(Command("weather"))
async def cmd_weather(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    city = (command.args or "").strip() or DEFAULT_CITY
    text = await asyncio.to_thread(get_weather, city)
    await message.answer(text)


# --- ИНЛАЙН-РЕЖИМ ---


_drawing_file_ids = {}  # метка -> file_id уже загруженного в Telegram рисунка

# Куда Telegram временно загружает рисунок, чтобы выдать file_id.
# Лучше всего — закрытый канал, где бот администратор: тогда в личных чатах
# ничего не появляется. Если не задан, используется личный чат с ботом, а
# копия удаляется через DRAWING_COPY_TTL секунд (KEEP_DRAWING_COPY=1 — не удалять).
_storage_raw = os.getenv("DRAWING_STORAGE_CHAT_ID", "").strip()
DRAWING_STORAGE_CHAT_ID = int(_storage_raw) if _storage_raw.lstrip("-").isdigit() else None
KEEP_DRAWING_COPY = os.getenv("KEEP_DRAWING_COPY", "0") == "1"
DRAWING_COPY_TTL = int(os.getenv("DRAWING_COPY_TTL", "120"))


async def delete_message_later(chat_id: int, message_id: int, delay: float):
    await asyncio.sleep(delay)
    try:
        await bot.delete_message(chat_id=chat_id, message_id=message_id)
    except Exception as e:
        logging.warning(f"Не удалось удалить служебную копию рисунка: {e}")


async def get_drawing_file_id(token: str, item, user_id: int) -> str:
    """Загружает рисунок в Telegram обычной отправкой фото и возвращает file_id.

    Фото попадает в личный чат пользователя с ботом (без звука) — это и есть
    надёжный способ получить file_id для инлайн-результата. Telegram сам
    перекодирует картинку, поэтому проблем с форматом не возникает.
    """
    if token in _drawing_file_ids:
        return _drawing_file_ids[token]
    _, data, mime = item
    ext = "png" if mime == "image/png" else "jpg"
    target_chat = DRAWING_STORAGE_CHAT_ID or user_id
    msg = await bot.send_photo(
        chat_id=target_chat,
        photo=BufferedInputFile(data, filename=f"drawing.{ext}"),
        caption="🎨 Служебная копия рисунка (удалится сама)",
        disable_notification=True,
    )
    file_id = msg.photo[-1].file_id
    if DRAWING_STORAGE_CHAT_ID is None and not KEEP_DRAWING_COPY:
        run_in_background(
            delete_message_later(target_chat, msg.message_id, DRAWING_COPY_TTL)
        )
    _drawing_file_ids[token] = file_id
    if len(_drawing_file_ids) > 200:
        _drawing_file_ids.pop(next(iter(_drawing_file_ids)))
    return file_id


def draw_inline_button():
    base = public_base_url()
    if not base:
        return None
    return types.InlineQueryResultsButton(
        text="🎨 Нарисовать", web_app=WebAppInfo(url=f"{base}/draw")
    )


@dp.inline_query()
async def inline_query_handler(query: types.InlineQuery):
    if not is_allowed(query.from_user):
        return

    button = draw_inline_button()
    query_text = query.query.strip()[:1000]
    if not query_text:
        # пустой запрос: показываем только кнопку «Нарисовать»
        await query.answer([], button=button, cache_time=0, is_personal=True)
        return

    # Рисунок, присланный холстом: «draw <метка>» -> фото-результат
    m = re.fullmatch(r"(?:draw|рисунок)\s+([0-9a-f]{32})", query_text.lower())
    if m:
        token = m.group(1)
        with _drawings_lock:
            item = _drawings.get(token)
        if item:
            name = clean_caption_name(query.from_user.first_name)
            try:
                file_id = await get_drawing_file_id(token, item, query.from_user.id)
                results = [
                    InlineQueryResultCachedPhoto(
                        id=token,
                        photo_file_id=file_id,
                        caption=f"От {name} ♥️",
                    )
                ]
            except Exception:
                logging.exception("Не удалось подготовить рисунок для инлайн-режима")
                results = [
                    InlineQueryResultArticle(
                        id="drawing_error",
                        title="Не удалось подготовить рисунок",
                        description="Нарисуй заново",
                        input_message_content=InputTextMessageContent(
                            message_text="🎨 Не удалось подготовить рисунок."
                        ),
                    )
                ]
        else:
            results = [
                InlineQueryResultArticle(
                    id="drawing_missing",
                    title="Рисунок не найден или устарел",
                    description="Открой холст и нарисуй заново",
                    input_message_content=InputTextMessageContent(
                        message_text="🎨 Рисунок не найден, нарисуй заново."
                    ),
                )
            ]
        await query.answer(results, button=button, cache_time=0, is_personal=True)
        return

    if query_text.lower().startswith(("погода", "weather")):
        parts = query_text.split(maxsplit=1)
        city = parts[1].strip() if len(parts) > 1 else ""

        def hint(title, description):
            return [
                InlineQueryResultArticle(
                    id="weather_hint",
                    title=title,
                    description=description,
                    input_message_content=InputTextMessageContent(
                        message_text=f"{title}. {description}"
                    ),
                )
            ]

        # Пока человек печатает, приходят неполные названия («Ом», «Омс»)
        if len(city) < 3:
            await query.answer(
                hint("🌤 Погода", "Допиши название города, например: погода Омск"),
                button=button, cache_time=0, is_personal=True,
            )
            return

        places = await asyncio.to_thread(geocode, city, 3)
        if not places:
            await query.answer(
                hint(f"Не нашёл город «{city[:40]}»", "Проверь написание или допиши название"),
                button=button, cache_time=0, is_personal=True,
            )
            return

        texts = await asyncio.gather(
            *(asyncio.to_thread(get_weather, city, p) for p in places)
        )
        articles = []
        for i, (place, text) in enumerate(zip(places, texts)):
            lines = text.splitlines()
            summary = lines[1] if len(lines) > 1 else text
            articles.append(
                InlineQueryResultArticle(
                    id=f"weather_{i}",
                    title=f"{lines[0] if lines else place['title']}",
                    description=summary[:120],
                    input_message_content=InputTextMessageContent(message_text=text),
                )
            )
        # Результаты с неполным вводом не кэшируем надолго
        await query.answer(articles, button=button, cache_time=30, is_personal=True)
        return

    system_prompt = (
        "Ты — быстрый встроенный ИИ-ассистент в Telegram. Отвечай точно, кратко и по делу."
    )
    try:
        response_text = await process_with_cascade(
            [], query_text, system_prompt + FORMAT_HINT
        )
        response_text = response_text[:3500]
        rendered = markdown_to_html(response_text)
        if html_is_balanced(rendered) and len(rendered) <= TELEGRAM_TEXT_LIMIT:
            content = InputTextMessageContent(
                message_text=rendered, parse_mode="HTML"
            )
        else:
            content = InputTextMessageContent(
                message_text=strip_markdown(response_text)
            )
        articles = [
            InlineQueryResultArticle(
                id="ai_response",
                title="Ответ от Gemini",
                input_message_content=content,
                description=strip_markdown(response_text)[:100] + "...",
            )
        ]
        await query.answer(articles, button=button, cache_time=1, is_personal=True)
    except Exception as e:
        logging.error(f"Ошибка в инлайн-режиме: {e}")


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

    scheduler.start()
    try:
        count = await asyncio.to_thread(load_pending_reminders)
        logging.info(f"Напоминаний в расписании: {count}")
    except Exception:
        logging.exception("Не удалось загрузить напоминания")

    try:
        await bot.set_my_commands([
            types.BotCommand(command="memory", description="Что бот помнит"),
            types.BotCommand(command="remember", description="Запомнить вручную"),
            types.BotCommand(command="memorydelete", description="Удалить факт"),
            types.BotCommand(command="memoryclear", description="Очистить память"),
            types.BotCommand(command="remind", description="Поставить напоминание"),
            types.BotCommand(command="reminders", description="Мои напоминания"),
            types.BotCommand(command="weather", description="Погода и прогноз"),
            types.BotCommand(command="draw", description="Холст для рисования"),
            types.BotCommand(command="command", description="Список команд"),
        ])
    except Exception as e:
        logging.warning(f"Не удалось обновить меню команд: {e}")

    logging.info("Бот запущен...")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


if __name__ == "__main__":
    # 1. Запускаем HTTP-сервер в фоновом потоке (чтобы Render видел порт и отдавал /draw)
    server_thread = threading.Thread(target=run_http_server, daemon=True)
    server_thread.start()

    # 2. Запускаем Telegram-бота в основном потоке
    asyncio.run(main())
