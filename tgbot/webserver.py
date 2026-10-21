"""HTTP-сервер для Render: health-check, холст /draw, игра /pet, сад /pet-garden/*, API игры и загрузка рисунков.

Часть бывшего app.py — код перенесён без изменений логики."""

import base64
import hashlib
import hmac
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
from http.server import BaseHTTPRequestHandler

import pet
import pet_garden

from tgbot.config import (
    ALLOWED_USER_IDS,
    BASE_DIR,
    COUPLE_USER_IDS,
    DRAWINGS_TOTAL_BYTES,
    MAX_STASH_BYTES,
    MAX_UPLOAD_BYTES,
    REQUIRE_WEBAPP_AUTH,
    STASH_PER_HOUR,
    TELEGRAM_TOKEN,
    admin_pet_key,
    clean_caption_name,
    pet_key_for_user,
    user_name,
)
from tgbot.db import get_db

# ---------------------------------------------------------------------------
# HTTP-сервер для Render (health-check + холст для рисования)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Сборка страниц из частей. Строка вида «// @include js/ui/shop.js» или
# «/* @include css/base.css */» заменяется содержимым файла (путь — от папки root).
# Готовый результат кэшируется и пересобирается, только если какой-то файл изменился.
# ---------------------------------------------------------------------------
_INCLUDE_RE = re.compile(r"^[ \t]*(?:/\*|//)\s*@include\s+([\w./-]+)\s*(?:\*/)?[ \t]*$", re.M)
_page_cache = {}
_page_cache_lock = threading.Lock()


def _assemble(root: str, name: str):
    """Возвращает (текст, список файлов) или бросает OSError/ValueError."""
    root = os.path.realpath(root)
    files = [os.path.join(root, name)]
    with open(files[0], encoding="utf-8") as f:
        text = f.read()

    def include(match):
        full = os.path.realpath(os.path.join(root, match.group(1)))
        if not full.startswith(root + os.sep):
            raise ValueError(f"@include вне папки: {match.group(1)}")
        files.append(full)
        with open(full, encoding="utf-8") as part:
            body = part.read()
        return body[:-1] if body.endswith("\n") else body

    return _INCLUDE_RE.sub(include, text), files


def build_page(root: str, name: str):
    """Собранная страница в байтах (или None, если файлов нет)."""
    key = (root, name)
    with _page_cache_lock:
        cached = _page_cache.get(key)
    if cached:
        try:
            if all(os.path.getmtime(p) == m for p, m in cached["mtimes"]):
                return cached["body"]
        except OSError:
            pass
    try:
        text, files = _assemble(root, name)
    except (OSError, ValueError) as e:
        logging.warning(f"Не удалось собрать {name}: {e}")
        return None
    body = text.encode("utf-8")
    with _page_cache_lock:
        _page_cache[key] = {"body": body, "mtimes": [(p, os.path.getmtime(p)) for p in files]}
    return body


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
        auth_date = int(pairs.get("auth_date", "0"))
        now = time.time()
        if auth_date <= 0 or now - auth_date > max_age or auth_date - now > 300:
            return None
        user = json.loads(pairs.get("user", "{}"))
        if not isinstance(user.get("id"), int):
            return None
        user["_query_id"] = pairs.get("query_id")  # есть, если холст открыт из инлайна
        return user
    except Exception:
        return None



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
        # общий лимит памяти: удаляем самые старые, пока новый рисунок не поместится
        while _drawings and sum(len(v[1]) for v in _drawings.values()) + len(image) > DRAWINGS_TOTAL_BYTES:
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
            # Холст собирается из частей static/draw/ (index.html + css/ + js/)
            content = build_page(os.path.join(BASE_DIR, "static", "draw"), "index.html")
            if content is None:
                self._reply(404, b"Drawing page not found")
            else:
                self._reply(200, content, "text/html; charset=utf-8")
        elif path == "/pet":
            # Игра собирается из файлов-частей static/pet/ (см. static/pet/README.md):
            # index.html со строками «@include путь», каждая заменяется содержимым файла.
            page = build_page(os.path.join(BASE_DIR, "static", "pet"), "index.html")
            if page is None:
                self._reply(404, b"Pet page not found")
            else:
                self._reply(200, page, "text/html; charset=utf-8")
        elif path.startswith("/pet-garden/"):
            # Только известные файлы. garden.js собирается из частей static/garden/js/.
            assets = {
                "garden.js": "application/javascript; charset=utf-8",
                "garden.css": "text/css; charset=utf-8",
                "assets/clearing.webp": "image/webp",
            }
            asset = path[len("/pet-garden/"):]
            if asset not in assets:
                self._reply(404)
                return
            garden_dir = os.path.join(BASE_DIR, "static", "garden")
            if asset == "garden.js":
                body = build_page(garden_dir, "garden.js")
            else:
                try:
                    with open(os.path.join(garden_dir, asset), "rb") as f:
                        body = f.read()
                except OSError:
                    body = None
            if body is None:
                self._reply(404)
            else:
                self._reply(200, body, assets[asset])
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
        if path in ("/api/pet/state", "/api/pet/action", "/api/pet/admin", "/api/pet/garden/state", "/api/pet/garden/action"):
            self._pet_api(path)
            return
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
                # Первое значение X-Forwarded-For задаёт сам клиент и может его подделать.
                # Последнее добавляет прокси Render — ему и доверяем.
                ip = (
                    self.headers.get("X-Forwarded-For", "").split(",")[-1].strip()
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
                logging.info(f"stash: принят рисунок {len(image_bytes)} байт ({note}), ip={ip}")
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

    def _pet_api(self, path: str):
        """API игры «Наша выдра». Личность берётся ТОЛЬКО из подписи Telegram."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 8192:
                self._reply(413, b"Bad size")
                return
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            tg_user = validate_webapp_init_data(str(data.get("init_data") or ""))
            if tg_user is None or tg_user["id"] not in ALLOWED_USER_IDS:
                self._reply(403, b"Forbidden")
                return
            names = {uid: user_name(uid) for uid in ALLOWED_USER_IDS}
            # Режим «Проверка» (test): админ играет с отдельным питомцем admin:<id>, общий питомец пары не затрагивается.
            # Проверяем по подписи Telegram, а не по флагу из запроса: не-админу флаг test просто запрещён.
            test_mode = bool(data.get("test"))
            if test_mode and tg_user["id"] not in pet.ADMIN_IDS:
                self._reply(403, b"Forbidden")
                return
            my_key = admin_pet_key(tg_user["id"]) if test_mode else pet_key_for_user(tg_user["id"])   # с каким питомцем работает этот запрос
            if path in ("/api/pet/garden/state", "/api/pet/garden/action"):
                # Гости не могут изменять чужой сад; ключ берётся только из подписи.
                if data.get("view_user_id") is not None:
                    self._reply(403, b"Forbidden")
                    return
                action = str(data.get("action") or "")[:32] if path.endswith("/action") else None
                result = pet_garden.handle(get_db, tg_user["id"], names, pet_key=my_key,
                                           action=action, params=data)
            elif path == "/api/pet/state":
                caller_id = tg_user["id"]
                if data.get("people") and test_mode:
                    result = {"ok": True, "people": [], "you": caller_id}      # админского питомца навестить нельзя
                elif data.get("people"):
                    # Показываем только людей с отдельным питомцем; у исходной пары питомец общий.
                    own_key = pet_key_for_user(caller_id)
                    people, seen_keys = [], set()
                    for uid in ALLOWED_USER_IDS:
                        key = pet_key_for_user(uid)
                        if uid == caller_id or key == own_key or key in seen_keys:
                            continue
                        seen_keys.add(key)
                        if key == "couple":     # у пары один питомец на двоих — показываем одной записью
                            label = " и ".join(user_name(u) for u in sorted(COUPLE_USER_IDS))
                        else:
                            label = user_name(uid)
                            if not label or label == "Пользователь":
                                label = f"Гость {uid}"
                        people.append({"id": uid, "name": label})
                    result = {"ok": True, "people": people, "you": caller_id}
                else:
                    target_id = caller_id
                    if data.get("view_user_id") is not None and not test_mode:     # в «Проверке» гостевой режим не нужен
                        try:
                            target_id = int(data.get("view_user_id"))
                        except (TypeError, ValueError):
                            self._reply(400, b"Bad user id")
                            return
                        if target_id not in ALLOWED_USER_IDS:
                            self._reply(403, b"Forbidden")
                            return
                    # В гостевом режиме только читаем состояние чужого питомца.
                    result = {"ok": True, "state": pet.get_state(get_db, names, caller_id, pet_key=my_key if test_mode else pet_key_for_user(target_id)), "you": caller_id, "viewing": target_id}
                    if data.get("catalog"):       # каталог магазина нужен клиенту один раз при запуске
                        result["catalog"] = pet.public_catalog()
            elif path == "/api/pet/admin":
                if tg_user["id"] not in pet.ADMIN_IDS:      # только админ, по подписи Telegram
                    self._reply(403, b"Forbidden")
                    return
                params = data.get("params") if isinstance(data.get("params"), dict) else {}
                result = pet.admin(get_db, tg_user["id"], str(data.get("op") or "")[:20], params, names, pet_key=my_key)
            else:
                action = str(data.get("action") or "")[:20]
                to = str(data.get("to") or "")[:12]
                result = pet.perform(
                    get_db, action, tg_user["id"], names, to,
                    item=str(data.get("item") or "")[:32],
                    name=str(data.get("name") or "")[:60],
                    room=str(data.get("room") or "")[:12],
                    x=data.get("x"), y=data.get("y"),
                    pet_key=my_key,
                )
            result["you"] = tg_user["id"]
            result["test"] = test_mode
            self._reply(200, json.dumps(result).encode("utf-8"), "application/json")
        except Exception as e:
            logging.error(f"Ошибка API выдры: {e}")
            self._reply(500, b"Error")

    def log_message(self, format, *args):
        # не засоряем логи Render health-check'ами
        pass
