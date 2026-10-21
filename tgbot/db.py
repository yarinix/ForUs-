"""База данных PostgreSQL: пул подключений, создание таблиц, история сообщений.

Часть бывшего app.py — код перенесён без изменений логики."""

import logging
import os
import threading
from contextlib import contextmanager

import psycopg2
from psycopg2.pool import ThreadedConnectionPool, PoolError

from tgbot.config import ALLOWED_USER_IDS, BOT_OWNER_ID, DATABASE_URL, TEST_MEMORY_TEXT

# ---------------------------------------------------------------------------
# БАЗА ДАННЫХ
# ---------------------------------------------------------------------------


# Пул подключений: раньше на каждый запрос открывалось новое соединение с
# PostgreSQL (TCP + TLS + авторизация), теперь соединения переиспользуются.
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "8"))
_db_pool = None
_db_pool_lock = threading.Lock()


def _get_db_pool():
    global _db_pool
    if _db_pool is None:
        with _db_pool_lock:
            if _db_pool is None:
                _db_pool = ThreadedConnectionPool(1, DB_POOL_MAX, DATABASE_URL)
    return _db_pool


def _checkout_conn():
    """Берёт живое соединение из пула. Если пул занят — открывает разовое."""
    pool = _get_db_pool()
    for _ in range(2):
        try:
            conn = pool.getconn()
        except PoolError:
            logging.warning("Пул БД занят, открываю разовое соединение")
            return psycopg2.connect(DATABASE_URL), False
        try:
            if conn.closed:
                raise psycopg2.InterfaceError("connection closed")
            with conn.cursor() as cur:  # проверка: сервер мог закрыть простаивавшее соединение
                cur.execute("SELECT 1")
            conn.rollback()
            return conn, True
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            pool.putconn(conn, close=True)
    return psycopg2.connect(DATABASE_URL), False


@contextmanager
def get_db():
    conn, pooled = _checkout_conn()
    broken = False
    try:
        yield conn
        conn.commit()
    except Exception as e:
        broken = isinstance(e, (psycopg2.OperationalError, psycopg2.InterfaceError)) or conn.closed
        if not conn.closed:
            try:
                conn.rollback()
            except Exception:
                broken = True
        logging.error(f"Ошибка базы данных: {e}")
        raise
    finally:
        if pooled:
            _get_db_pool().putconn(conn, close=broken or bool(conn.closed))
        else:
            conn.close()


def init_db():
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute("CREATE TABLE IF NOT EXISTS bot_allowed_users (user_id BIGINT PRIMARY KEY, added_by BIGINT, added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            for _uid in ALLOWED_USER_IDS:
                cursor.execute("INSERT INTO bot_allowed_users (user_id, added_by) VALUES (%s, %s) ON CONFLICT (user_id) DO NOTHING", (_uid, BOT_OWNER_ID))
            cursor.execute("SELECT user_id FROM bot_allowed_users ORDER BY user_id")
            ALLOWED_USER_IDS[:] = [int(row[0]) for row in cursor.fetchall()]
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
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS llm_usage (
                    day DATE NOT NULL,
                    model TEXT NOT NULL,
                    calls INT DEFAULT 0,
                    ok INT DEFAULT 0,
                    quota_errors INT DEFAULT 0,
                    errors INT DEFAULT 0,
                    PRIMARY KEY (day, model)
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
