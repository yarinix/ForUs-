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
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg2
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InlineQueryResultPhoto,
    InputTextMessageContent,
    WebAppInfo,
)
from google import genai
from google.genai import types as genai_types

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

USER_NAMES = {
    5084782149: "Основной пользователь",
    1253880871: "Полина",
}

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
                if not image_bytes.startswith(b"\xff\xd8\xff"):
                    self._reply(400, b"JPEG only")
                    return
                # у целого JPEG в конце маркер FF D9; без него файл оборван
                if not image_bytes.rstrip(b"\x00").endswith(b"\xff\xd9"):
                    logging.warning(f"stash: JPEG оборван, {len(image_bytes)} байт")
                    self._reply(400, b"Truncated JPEG")
                    return
                token = store_drawing(image_bytes, "image/jpeg")
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
                    data.get("name") or USER_NAMES.get(chat_id)
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


def save_memory(user_id, memory_type: str, content: str, shared=None) -> bool:
    """Сохраняет воспоминание. Возвращает False, если это пустая запись или точный дубль.

    Типы couple / event / inside_joke по умолчанию общие (user_id = NULL),
    personal / emotion — личные.
    """
    if memory_type not in MEMORY_TYPES:
        raise ValueError(f"Неизвестный тип воспоминания: {memory_type}")

    content = clean_fact(content)
    if not content or content == TEST_MEMORY_TEXT:
        return False

    if shared is None:
        shared = memory_type in SHARED_MEMORY_TYPES
    owner = None if shared else user_id
    norm = _norm(content)

    with get_db() as conn:
        with conn.cursor() as cursor:
            if owner is None:
                cursor.execute(
                    "SELECT content FROM memories WHERE memory_type = %s"
                    " AND user_id IS NULL ORDER BY id DESC LIMIT 500",
                    (memory_type,),
                )
            else:
                cursor.execute(
                    "SELECT content FROM memories WHERE memory_type = %s"
                    " AND user_id = %s ORDER BY id DESC LIMIT 500",
                    (memory_type, owner),
                )
            if any(_norm(row[0]) == norm for row in cursor.fetchall()):
                return False

            cursor.execute(
                "INSERT INTO memories (user_id, memory_type, content)"
                " VALUES (%s, %s, %s)",
                (owner, memory_type, content),
            )
    return True


def _keywords(text: str) -> set:
    return {w[:5] for w in re.findall(r"\w+", str(text).casefold()) if len(w) > 3}


def get_memories(
    user_id: int,
    limit: int = 20,
    query: str = None,
    include_personal: bool = True,
):
    """Воспоминания для пользователя: его личные + общие пары.

    include_personal=False — только общие (для группового чата).
    Если передан query, сначала идут записи, пересекающиеся с ним по словам.
    """
    fetch_limit = limit * 5 if query else limit
    with get_db() as conn:
        with conn.cursor() as cursor:
            if include_personal:
                cursor.execute(
                    "SELECT id, memory_type, content, user_id FROM memories"
                    " WHERE (user_id = %s OR user_id IS NULL) AND content <> %s"
                    " ORDER BY id DESC LIMIT %s",
                    (user_id, TEST_MEMORY_TEXT, fetch_limit),
                )
            else:
                cursor.execute(
                    "SELECT id, memory_type, content, user_id FROM memories"
                    " WHERE user_id IS NULL AND content <> %s"
                    " ORDER BY id DESC LIMIT %s",
                    (TEST_MEMORY_TEXT, fetch_limit),
                )
            rows = cursor.fetchall()

    items = [
        {"id": r[0], "type": r[1], "content": r[2], "shared": r[3] is None}
        for r in rows
    ]
    if query:
        kw = _keywords(query)
        items.sort(key=lambda m: (-len(kw & _keywords(m["content"])), -m["id"]))
    items = items[:limit]
    items.sort(key=lambda m: m["id"])  # хронологически
    return items


def build_memory_block(memories, existing_prompt: str) -> str:
    """Текст с воспоминаниями для системного промпта (без дублей старой памяти)."""
    existing = existing_prompt.casefold()
    lines = []
    for m in memories:
        if m["content"].casefold() in existing:
            continue
        label = MEMORY_LABELS.get(m["type"], m["type"])
        lines.append(f"- [{label}] {m['content']}")
    if not lines:
        return ""
    return (
        "\n\n🗂 Дополнительные воспоминания (используй естественно, не"
        " перечисляй без повода):\n" + "\n".join(lines)
    )


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


# --- ФУНКЦИЯ ПОГОДЫ ---


def get_weather(city: str) -> str:
    try:
        encoded_city = urllib.parse.quote(city)
        url = f"https://wttr.in/{encoded_city}?format=3&lang=ru"
        req = urllib.request.Request(url, headers={"User-Agent": "curl/7.68.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.read().decode("utf-8").strip()
    except Exception as e:
        logging.error(f"Ошибка получения погоды: {e}")
        return f"Не удалось получить погоду для города: {city}"


# ---------------------------------------------------------------------------
# GEMINI
# ---------------------------------------------------------------------------


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
                get_memories, user_id, 20, query, chat_type == "private"
            )
            system_prompt += build_memory_block(memories, system_prompt)
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


def parse_extracted_facts(text: str):
    """Разбирает JSON-ответ модели в список (type, fact). Бросает исключение при мусоре."""
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    data = json.loads(text)
    if isinstance(data, dict):
        data = data.get("facts", [data])
    if not isinstance(data, list):
        raise ValueError("ожидался список")

    facts = []
    for item in data:
        if not isinstance(item, dict):
            continue
        mem_type = str(item.get("type", "")).strip().lower()
        fact = clean_fact(item.get("fact", ""))
        if mem_type not in MEMORY_TYPES or not fact:
            continue
        if fact.strip(" .").upper() in {"НЕТ", "NONE", "N/A", "NULL"}:
            continue
        facts.append((mem_type, fact))
    return facts[:3]


def _extract_facts_sync(prompt: str):
    for model_name in MODELS_CASCADE:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            return parse_extracted_facts(response.text)
        except Exception as e:
            logging.warning(
                f"Модель {model_name} не смогла выделить факты: {e}."
                " Пробуем следующую..."
            )
    return []


async def extract_and_save_facts(user_id: int, chat_type: str, user_message: str):
    speaker_name = USER_NAMES.get(user_id, "Пользователь")

    prompt = (
        f"Сегодня: {current_time_str()}.\n"
        f"Проанализируй реплику от '{speaker_name}'. Найди в ней только"
        f" ВАЖНУЮ ДОЛГОВРЕМЕННУЮ информацию и классифицируй её:\n"
        f"- personal — предпочтения, привычки, цели, планы, черты характера"
        f" конкретного человека;\n"
        f"- couple — важные сведения об отношениях и паре;\n"
        f"- event — значимые события и даты (годовщины, дни рождения, поездки,"
        f" договорённости). Относительные даты ('завтра') переведи в"
        f" конкретные;\n"
        f"- emotion — устойчивые эмоциональные закономерности (а не настроение"
        f" одного дня);\n"
        f"- inside_joke — внутренние шутки и особые выражения пары.\n\n"
        f"⚠️ КАТЕГОРИЧЕСКИ ИГНОРИРУЙ временные состояния и бытовые действия"
        f" ('спит', 'устал сегодня', 'кушает', 'едет в транспорте', 'болит"
        f" голова', 'смотрит фильм сейчас'). Не сохраняй каждое сообщение подряд."
        f" Большинство реплик не содержат ничего важного.\n\n"
        f"Каждый факт пиши коротко (до 150 символов), самодостаточно и с именем"
        f" человека (например: '{speaker_name} любит горы').\n"
        f"Ответ — строго JSON-массив (максимум 3 элемента), без пояснений:\n"
        f'[{{"type": "personal", "fact": "..."}}]\n'
        f"Если сохранять нечего — верни [].\n\n"
        f"Реплика: {user_message}"
    )

    try:
        facts = await asyncio.to_thread(_extract_facts_sync, prompt)
        for mem_type, fact in facts:
            saved = await asyncio.to_thread(save_memory, user_id, mem_type, fact)
            if saved:
                logging.info(f"Новая память [{mem_type}]: {fact}")
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
    "• /memory — посмотреть общую и личную память\n"
    "• /remember [тип] &lt;текст&gt; — запомнить вручную (типы: personal, couple,"
    " event, emotion, inside_joke; по умолчанию personal)\n"
    "• /memorydelete &lt;фраза&gt; — удалить факты по ключевой фразе\n"
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


@dp.message(Command("memory"))
async def cmd_memory(message: types.Message):
    if not is_allowed(message.from_user):
        return
    user_id = message.from_user.id

    couple = await asyncio.to_thread(get_couple_memory)
    personal = await asyncio.to_thread(get_user_memory, user_id)
    extra = await asyncio.to_thread(get_memories, user_id, 50)

    if extra:
        extra_text = "\n".join(
            f"• [{html.escape(MEMORY_LABELS.get(m['type'], m['type']))}]"
            f" {html.escape(m['content'])}"
            for m in extra
        )
    else:
        extra_text = "Пока пусто."

    text = (
        "🧠 <b>Память бота</b>\n\n"
        f"💞 <b>Общая информация о паре:</b>\n{html.escape(couple)}\n\n"
        f"👤 <b>Твоя личная память:</b>\n{html.escape(personal)}\n\n"
        f"🗂 <b>Дополнительные воспоминания:</b>\n{extra_text}"
    )
    await send_long(message, text, parse_mode="HTML")


@dp.message(Command("remember"))
async def cmd_remember(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    args = (command.args or "").strip()
    mem_type = "personal"
    first, _, rest = args.partition(" ")
    if first.lower() in MEMORY_TYPES and rest.strip():
        mem_type, args = first.lower(), rest.strip()

    if not args:
        await message.answer(
            "⚠️ Напиши, что запомнить. Пример: /remember couple Мы познакомились"
            " в апреле"
        )
        return

    saved = await asyncio.to_thread(save_memory, message.from_user.id, mem_type, args)
    label = MEMORY_LABELS[mem_type]
    if saved:
        await message.answer(f"✅ Запомнил ({label}).")
    else:
        await message.answer("ℹ️ Такая запись уже есть (или текст пустой).")


@dp.message(Command("memorydelete"))
async def cmd_memory_delete(message: types.Message, command: CommandObject):
    if not is_allowed(message.from_user):
        return
    phrase = (command.args or "").strip()
    if not phrase:
        await message.answer(
            "⚠️ Укажи текст для удаления. Пример: /memorydelete горы"
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
    speaker_name = USER_NAMES.get(user_id, "Пользователь")

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
            extract_and_save_facts(user_id, chat_type, f"{speaker_name}: {user_text}")
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
        )
    else:
        system_prompt = (
            f"Ты — эмпатичный ИИ-помощник. ГРУППОВОЙ чат пары.\n"
            f"Сейчас обращается: {speaker_name}.\n"
            f"{now_line}\n\n"
            f"💞 Общая информация о паре:\n{couple_memory}"
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
        await send_long(message, bot_response_text)

    except Exception as e:
        logging.error(f"Ошибка при обработке запроса: {e}")
        await message.answer(
            "Произошла ошибка при обработке сообщения. Попробуйте еще раз."
        )


# --- ИНЛАЙН-РЕЖИМ ---


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
        base = public_base_url()
        if item and base:
            url = f"{base}/img/{token}.jpg"
            name = clean_caption_name(query.from_user.first_name)
            results = [
                InlineQueryResultPhoto(
                    id=token,
                    photo_url=url,
                    thumbnail_url=url,
                    caption=f"От {name} ♥️",
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
        city = parts[1].strip() if len(parts) > 1 else "Москва"
        weather_text = await asyncio.to_thread(get_weather, city)
        articles = [
            InlineQueryResultArticle(
                id="weather_res",
                title=f"Погода в городе: {city}",
                input_message_content=InputTextMessageContent(
                    message_text=weather_text
                ),
                description=weather_text,
            )
        ]
        await query.answer(articles, button=button, cache_time=60, is_personal=True)
        return

    system_prompt = (
        "Ты — быстрый встроенный ИИ-ассистент в Telegram. Отвечай точно, кратко и по делу."
    )
    try:
        response_text = await process_with_cascade([], query_text, system_prompt)
        response_text = response_text[:TELEGRAM_TEXT_LIMIT]
        articles = [
            InlineQueryResultArticle(
                id="ai_response",
                title="Ответ от Gemini",
                input_message_content=InputTextMessageContent(
                    message_text=response_text
                ),
                description=response_text[:100] + "...",
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


async def main():
    logging.info("Инициализация базы данных...")
    await asyncio.to_thread(init_db)
    logging.info("База данных готова.")

    try:
        await bot.set_my_commands([
            types.BotCommand(command="memory", description="Что бот помнит"),
            types.BotCommand(command="remember", description="Запомнить вручную"),
            types.BotCommand(command="memorydelete", description="Удалить факт"),
            types.BotCommand(command="memoryclear", description="Очистить память"),
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
