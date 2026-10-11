"""Игра «Наша выдра»: общий питомец пары. Вся игровая логика — на сервере.

Модуль не создаёт своих подключений к базе: app.py передаёт в функции свой
`get_db` (контекстный менеджер с подключением psycopg2). Клиент (static/pet.html)
только показывает состояние и просит выполнить действие по имени.

Что умеет сервер:
  move / feed / play / sleep / pet — как раньше (feed теперь принимает item — id еды);
  buy      — купить вещь из каталога (еда копится в запасе, одежда и мебель покупаются один раз);
  wear / unwear — надеть / снять одежду (в каждом слоте одна вещь);
  place / unplace — поставить мебель в комнату (room, x, y) / убрать в кладовую;
  rename   — сменить имя питомца.
"""

import logging
import random
import time

# В PostgreSQL строка блокируется на время действия, чтобы два одновременных
# нажатия (два игрока) не затёрли друг друга.
FOR_UPDATE = " FOR UPDATE"

PET_KEY = "couple"          # питомец один на пару (доступ есть только у ALLOWED_USERS)
DEFAULT_NAME = "Бублик"
START_COINS = 20
NAME_MAX = 16

# Выдра никогда не «умирает»: характеристики не падают ниже этих значений
FLOORS = {"hunger": 15, "happy": 15, "energy": 20}
# Падение в час (пока никто не заходит)
DECAY_PER_HOUR = {"hunger": 3.0, "happy": 2.0, "energy": 1.0}
MAX_DECAY_HOURS = 48

# Комнаты: гостиная (home) соединена с кухней и спальней
ROOMS = ("home", "kitchen", "bedroom")
ADJACENT = {"home": ("kitchen", "bedroom"), "kitchen": ("home",), "bedroom": ("home",)}
ROOM_NAMES = {"home": "в гостиную", "kitchen": "на кухню", "bedroom": "в спальню"}

PET_COOLDOWN_SEC = 20       # монетка за поглаживание — не чаще, чем раз в 20 секунд
MAX_FOOD = 20               # сколько штук одной еды можно держать в запасе
MAX_PER_ROOM = 8            # сколько предметов мебели помещается в одну комнату

# ---------------------------------------------------------------------------
# КАТАЛОГ МАГАЗИНА. Цены и эффекты — только здесь; клиент получает копию для показа.
#   k  — вид: food / wear / furn         n — название       p — цена
#   food: e — эмодзи, hu — сытость, hp — радость, en — энергия, xp — опыт
#   wear: s — слот (hat / face / neck / body)
#   furn: pl — floor (стоит на полу) или wall (висит на стене)
# Рисунки вещей лежат в клиенте (pet.html) под теми же id.
# ---------------------------------------------------------------------------
CATALOG = {
    # --- еда ---
    "fish":   {"k": "food", "n": "Рыбка",    "p": 5,  "e": "🐟", "hu": 28, "hp": 3,  "xp": 6, "base": True},
    "shrimp": {"k": "food", "n": "Креветки", "p": 8,  "e": "🦐", "hu": 35, "hp": 4,  "xp": 8},
    "crab":   {"k": "food", "n": "Краб",     "p": 12, "e": "🦀", "hu": 45, "hp": 6,  "xp": 11},
    "oyster": {"k": "food", "n": "Устрицы",  "p": 16, "e": "🦪", "hu": 40, "hp": 8,  "en": 8, "xp": 12},
    "cake":   {"k": "food", "n": "Тортик",   "p": 18, "e": "🍰", "hu": 25, "hp": 25, "xp": 14},
    "sushi":  {"k": "food", "n": "Суши-сет", "p": 22, "e": "🍣", "hu": 60, "hp": 10, "xp": 16},
    # --- одежда ---
    "flower":     {"k": "wear", "n": "Цветочек",        "p": 20,  "s": "hat"},
    "party":      {"k": "wear", "n": "Праздничный колпак", "p": 25, "s": "hat"},
    "cap":        {"k": "wear", "n": "Кепка",           "p": 30,  "s": "hat"},
    "beanie":     {"k": "wear", "n": "Шапочка",         "p": 35,  "s": "hat"},
    "crown":      {"k": "wear", "n": "Корона",          "p": 150, "s": "hat"},
    "round":      {"k": "wear", "n": "Круглые очки",    "p": 40,  "s": "face"},
    "sunglasses": {"k": "wear", "n": "Тёмные очки",     "p": 45,  "s": "face"},
    "hearts":     {"k": "wear", "n": "Очки-сердечки",   "p": 60,  "s": "face"},
    "bandana":    {"k": "wear", "n": "Бандана",         "p": 25,  "s": "neck"},
    "scarf":      {"k": "wear", "n": "Шарфик",          "p": 30,  "s": "neck"},
    "bow":        {"k": "wear", "n": "Бабочка",         "p": 35,  "s": "neck"},
    "apron":      {"k": "wear", "n": "Фартук",          "p": 35,  "s": "body"},
    "tee":        {"k": "wear", "n": "Футболка",        "p": 40,  "s": "body"},
    "sweater":    {"k": "wear", "n": "Свитер",          "p": 60,  "s": "body"},
    "cape":       {"k": "wear", "n": "Плащ героя",      "p": 100, "s": "body"},
    # --- мебель ---
    "cactus":    {"k": "furn", "n": "Кактус",         "p": 25,  "pl": "floor"},
    "pouf":      {"k": "furn", "n": "Пуф",            "p": 35,  "pl": "floor"},
    "plant":     {"k": "furn", "n": "Фикус",          "p": 40,  "pl": "floor"},
    "table":     {"k": "furn", "n": "Столик с чаем",  "p": 50,  "pl": "floor"},
    "lamp":      {"k": "furn", "n": "Торшер",         "p": 55,  "pl": "floor"},
    "tree":      {"k": "furn", "n": "Ёлочка",         "p": 80,  "pl": "floor"},
    "armchair":  {"k": "furn", "n": "Кресло",         "p": 90,  "pl": "floor"},
    "bookcase":  {"k": "furn", "n": "Книжный шкаф",   "p": 110, "pl": "floor"},
    "aquarium":  {"k": "furn", "n": "Аквариум",       "p": 160, "pl": "floor"},
    "tv":        {"k": "furn", "n": "Телевизор",      "p": 200, "pl": "floor"},
    "clock":     {"k": "furn", "n": "Часы",           "p": 30,  "pl": "wall"},
    "picture":   {"k": "furn", "n": "Картина «Закат»", "p": 35, "pl": "wall"},
    "photo":     {"k": "furn", "n": "Фото «Мы вдвоём»", "p": 40, "pl": "wall"},
    "poster":    {"k": "furn", "n": "Постер с выдрой", "p": 45, "pl": "wall"},
    "mirror":    {"k": "furn", "n": "Зеркало",        "p": 60,  "pl": "wall"},
    "garland":   {"k": "furn", "n": "Гирлянда",       "p": 70,  "pl": "wall"},
}

SAY = {
    "feed": ["Ам-ам-ам! Вкуснотища! 🐟", "Хрум-хрум! Спасибо за угощение!", "Хрум! А можно ещё?"],
    "play": ["Ура! Давай ещё! 🎾", "Лови мячик! Плюх-плюх!", "Поиграем?! Ура-ура!"],
    "sleep": ["Зевает… Спокойной ночи 💤", "{name} свернулся клубочком и сопит…", "Сопит… Zzz"],
    "pet": ["Хвостик виляет! 💕", "Мурлыкает от удовольствия!", "{name} прижимается к руке"],
}
REFUSE = {
    "feed_full": "{name} совсем не голоден, отложит угощение на потом 🙈",
    "feed_poor": "Не хватает монет на еду. Поиграйте с питомцем — заработаете!",
    "feed_none": "Такой еды нет в запасе. Загляните в Меню → Магазин 🛍",
    "play_tired": "{name} слишком устал для игр. Пусть поспит 💤",
    "feed_room": "Есть можно только на кухне 🍽",
    "play_room": "Играть можно только в гостиной 🎾",
    "sleep_room": "Спать можно только в спальне 🛏",
    "move_far": "Туда не пройти напрямую: сначала зайдите в гостиную 🚪",
    "sleep_rested": "{name} бодр и совсем не хочет спать ☀️",
    "no_item": "Такой вещи не существует 🤔",
    "owned": "Эта вещь у вас уже есть ✨",
    "stock_full": "Запас этой еды полон 📦",
    "buy_poor": "Не хватает монет 🪙 Поиграйте и погладьте питомца — заработаете!",
    "not_owned": "Сначала нужно купить эту вещь 🛍",
    "room_full": "В этой комнате уже тесновато — уберите что-нибудь 🛋",
    "bad_name": "Имя должно быть от 1 до 16 символов ✏️",
}


def init_tables(get_db):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS pet_state (
                    pet_key TEXT PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT 'Бублик',
                    level INT NOT NULL DEFAULT 1,
                    xp INT NOT NULL DEFAULT 0,
                    coins INT NOT NULL DEFAULT 20,
                    hunger DOUBLE PRECISION NOT NULL DEFAULT 80,
                    happy DOUBLE PRECISION NOT NULL DEFAULT 80,
                    energy DOUBLE PRECISION NOT NULL DEFAULT 80,
                    updated_ts DOUBLE PRECISION NOT NULL,
                    last_pet_ts DOUBLE PRECISION NOT NULL DEFAULT 0,
                    last_actor BIGINT,
                    last_action TEXT,
                    last_ts DOUBLE PRECISION,
                    room TEXT NOT NULL DEFAULT 'home'
                );
            """)
            # для таблицы, созданной первой версией игры
            cur.execute(
                "ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS room TEXT NOT NULL DEFAULT 'home'"
            )
            cur.execute("""
                CREATE TABLE IF NOT EXISTS pet_log (
                    id SERIAL PRIMARY KEY,
                    pet_key TEXT NOT NULL,
                    user_id BIGINT NOT NULL,
                    action TEXT NOT NULL,
                    ok BOOLEAN NOT NULL,
                    coins_delta INT NOT NULL DEFAULT 0,
                    xp_delta INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_pet_log_key ON pet_log (pet_key, id);"
            )
            # Вещи пары: еда (qty), одежда (worn), мебель (room/x/y — где стоит)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS pet_items (
                    pet_key TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    qty INT NOT NULL DEFAULT 1,
                    worn BOOLEAN NOT NULL DEFAULT FALSE,
                    room TEXT,
                    x INT,
                    y INT,
                    PRIMARY KEY (pet_key, item_id)
                );
            """)


def xp_needed(level: int) -> int:
    return 40 + 20 * level


def _clamp(v, lo=0.0, hi=100.0):
    return max(lo, min(hi, v))


def _int(v, default):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _decay(st: dict, now: float) -> None:
    """Медленно снижает характеристики за время отсутствия (но не ниже порога)."""
    hours = max(0.0, min(MAX_DECAY_HOURS, (now - st["updated_ts"]) / 3600.0))
    for key, per_hour in DECAY_PER_HOUR.items():
        floor = FLOORS[key]
        if st[key] > floor:
            st[key] = max(floor, st[key] - per_hour * hours)
    st["updated_ts"] = now


def _mood(st: dict) -> str:
    low = min(st["hunger"], st["happy"], st["energy"])
    if low == st["hunger"] and low < 35:
        return "hungry"
    if low == st["energy"] and low < 35:
        return "sleepy"
    if low == st["happy"] and low < 35:
        return "sad"
    return "happy" if st["happy"] >= 70 else "ok"


def public_catalog() -> dict:
    return CATALOG


def public_state(st: dict, names=None) -> dict:
    names = names or {}
    inv, owned, worn, placed = {}, [], {}, {}
    for iid, it in (st.get("items") or {}).items():
        c = CATALOG.get(iid)
        if not c:
            continue
        if c["k"] == "food":
            inv[iid] = it["qty"]
            continue
        owned.append(iid)
        if c["k"] == "wear" and it["worn"]:
            worn[c["s"]] = iid
        if c["k"] == "furn" and it.get("room"):
            placed[iid] = {"room": it["room"], "x": it["x"], "y": it["y"]}
    return {
        "name": st["name"],
        "level": st["level"],
        "xp": st["xp"],
        "xp_need": xp_needed(st["level"]),
        "coins": st["coins"],
        "hunger": round(st["hunger"]),
        "happy": round(st["happy"]),
        "energy": round(st["energy"]),
        "mood": _mood(st),
        "room": st.get("room") or "home",
        "last_actor": names.get(st.get("last_actor")) if st.get("last_actor") else None,
        "last_actor_id": st.get("last_actor"),
        "last_action": st.get("last_action"),
        "last_ts": st.get("last_ts"),
        "inv": inv,          # еда в запасе: {id: штук}
        "owned": owned,      # купленные одежда и мебель
        "worn": worn,        # надето: {слот: id}
        "placed": placed,    # мебель в комнатах: {id: {room, x, y}}
    }


_COLUMNS = (
    "name", "level", "xp", "coins", "hunger", "happy", "energy",
    "updated_ts", "last_pet_ts", "last_actor", "last_action", "last_ts", "room",
)


def _load_items(cur) -> dict:
    cur.execute(
        "SELECT item_id, qty, worn, room, x, y FROM pet_items WHERE pet_key = %s",
        (PET_KEY,),
    )
    return {
        r[0]: {"qty": r[1], "worn": bool(r[2]), "room": r[3], "x": r[4], "y": r[5]}
        for r in cur.fetchall()
    }


def _save_items(cur, st: dict) -> None:
    for iid in st.pop("_dirty", set()):
        it = st["items"].get(iid)
        if it is None or it["qty"] <= 0:
            cur.execute("DELETE FROM pet_items WHERE pet_key=%s AND item_id=%s", (PET_KEY, iid))
        else:
            cur.execute(
                "INSERT INTO pet_items (pet_key, item_id, qty, worn, room, x, y)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s)"
                " ON CONFLICT (pet_key, item_id) DO UPDATE SET"
                " qty=EXCLUDED.qty, worn=EXCLUDED.worn, room=EXCLUDED.room,"
                " x=EXCLUDED.x, y=EXCLUDED.y",
                (PET_KEY, iid, it["qty"], it["worn"], it["room"], it["x"], it["y"]),
            )


def _load(cur, lock: bool) -> dict:
    cur.execute(
        "INSERT INTO pet_state (pet_key, name, coins, updated_ts) VALUES (%s, %s, %s, %s)"
        " ON CONFLICT (pet_key) DO NOTHING",
        (PET_KEY, DEFAULT_NAME, START_COINS, time.time()),
    )
    cur.execute(
        f"SELECT {', '.join(_COLUMNS)} FROM pet_state WHERE pet_key = %s"
        + (FOR_UPDATE if lock else ""),
        (PET_KEY,),
    )
    row = cur.fetchone()
    st = dict(zip(_COLUMNS, row))
    st["items"] = _load_items(cur)
    return st


def get_state(get_db, names=None) -> dict:
    """Текущее состояние (с учётом времени, без записи в базу, кроме первого создания)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=False)
    _decay(st, time.time())
    return public_state(st, names)


def _clean_name(raw) -> str:
    s = "".join(ch for ch in str(raw or "") if ch.isprintable() and ch not in "<>&\"'`\\")
    return " ".join(s.split())[:NAME_MAX].strip()


def _touch(st: dict, iid: str) -> None:
    st.setdefault("_dirty", set()).add(iid)


def _new_item() -> dict:
    return {"qty": 0, "worn": False, "room": None, "x": None, "y": None}


def _apply(st: dict, action: str, now: float, p: dict):
    """Меняет st по правилам игры. Возвращает (ok, say, coins_delta, xp_delta)."""
    coins_delta = xp_delta = 0
    room = st.get("room") or "home"
    items = st["items"]
    to = p.get("to")
    iid = p.get("item") or ""

    if action == "move":
        if to not in ROOMS:
            return False, REFUSE["move_far"], 0, 0
        if to == room:
            return True, "", 0, 0
        if to not in ADJACENT[room]:
            return False, REFUSE["move_far"], 0, 0
        st["room"] = to
        return True, f"{{name}} идёт {ROOM_NAMES[to]} 🐾", 0, 0

    # ---------- магазин ----------
    if action == "buy":
        c = CATALOG.get(iid)
        if not c:
            return False, REFUSE["no_item"], 0, 0
        if c["k"] == "food":
            if items.get(iid, {}).get("qty", 0) >= MAX_FOOD:
                return False, REFUSE["stock_full"], 0, 0
        elif iid in items:
            return False, REFUSE["owned"], 0, 0
        if st["coins"] < c["p"]:
            return False, REFUSE["buy_poor"], 0, 0
        st["coins"] -= c["p"]
        it = items.setdefault(iid, _new_item())
        it["qty"] += 1
        _touch(st, iid)
        return True, f"Куплено: {c['n']} 🛍", -c["p"], 0

    # ---------- одежда ----------
    if action in ("wear", "unwear"):
        c, it = CATALOG.get(iid), items.get(iid)
        if not c or c["k"] != "wear":
            return False, REFUSE["no_item"], 0, 0
        if not it:
            return False, REFUSE["not_owned"], 0, 0
        if action == "unwear":
            it["worn"] = False
            _touch(st, iid)
            return True, f"Снято: {c['n']}", 0, 0
        for oid, o in items.items():           # в слоте может быть только одна вещь
            if o["worn"] and oid != iid and CATALOG.get(oid, {}).get("s") == c["s"]:
                o["worn"] = False
                _touch(st, oid)
        it["worn"] = True
        _touch(st, iid)
        return True, f"Надето: {c['n']} ✨", 0, 0

    # ---------- мебель ----------
    if action in ("place", "unplace"):
        c, it = CATALOG.get(iid), items.get(iid)
        if not c or c["k"] != "furn":
            return False, REFUSE["no_item"], 0, 0
        if not it:
            return False, REFUSE["not_owned"], 0, 0
        if action == "unplace":
            it["room"] = it["x"] = it["y"] = None
            _touch(st, iid)
            return True, "", 0, 0
        target = p.get("room")
        if target not in ROOMS:
            return False, REFUSE["move_far"], 0, 0
        if it.get("room") != target:
            others = sum(1 for oid, o in items.items() if o.get("room") == target and oid != iid)
            if others >= MAX_PER_ROOM:
                return False, REFUSE["room_full"], 0, 0
        it["room"] = target
        it["x"] = int(_clamp(_int(p.get("x"), 50), 5, 95))
        it["y"] = int(_clamp(_int(p.get("y"), 60), 0, 100))
        _touch(st, iid)
        return True, "", 0, 0

    # ---------- имя ----------
    if action == "rename":
        name = _clean_name(p.get("name"))
        if not name:
            return False, REFUSE["bad_name"], 0, 0
        st["name"] = name
        return True, f"Теперь меня зовут {name}! 🦦", 0, 0

    # ---------- уход за питомцем ----------
    if action == "feed":
        fid = iid or "fish"
        c = CATALOG.get(fid)
        if not c or c["k"] != "food":
            return False, REFUSE["no_item"], 0, 0
        if room != "kitchen":
            return False, REFUSE["feed_room"], 0, 0
        if st["hunger"] >= 92:
            return False, REFUSE["feed_full"], 0, 0
        stock = items.get(fid)
        if stock and stock["qty"] > 0:         # едим из запаса
            stock["qty"] -= 1
            _touch(st, fid)
        elif c.get("base"):                    # обычная рыбка — покупается прямо у миски
            if st["coins"] < c["p"]:
                return False, REFUSE["feed_poor"], 0, 0
            st["coins"] -= c["p"]
            coins_delta = -c["p"]
        else:
            return False, REFUSE["feed_none"], 0, 0
        st["hunger"] = _clamp(st["hunger"] + c["hu"])
        st["happy"] = _clamp(st["happy"] + c.get("hp", 0))
        st["energy"] = _clamp(st["energy"] + c.get("en", 0))
        xp_delta = c["xp"]

    elif action == "play":
        if room != "home":
            return False, REFUSE["play_room"], 0, 0
        if st["energy"] < 15:
            return False, REFUSE["play_tired"], 0, 0
        st["energy"] = _clamp(st["energy"] - 15)
        st["happy"] = _clamp(st["happy"] + 20)
        st["hunger"] = _clamp(st["hunger"] - 8)
        st["coins"] += 4
        coins_delta = 4
        xp_delta = 10

    elif action == "sleep":
        if room != "bedroom":
            return False, REFUSE["sleep_room"], 0, 0
        if st["energy"] >= 90:
            return False, REFUSE["sleep_rested"], 0, 0
        st["energy"] = _clamp(st["energy"] + 40)
        st["hunger"] = _clamp(st["hunger"] - 5)
        xp_delta = 2

    elif action == "pet":
        st["happy"] = _clamp(st["happy"] + 6)
        xp_delta = 2
        if now - st["last_pet_ts"] >= PET_COOLDOWN_SEC:
            st["coins"] += 1
            coins_delta = 1
            st["last_pet_ts"] = now

    else:
        return False, "{name} не понял, чего от него хотят 🤔", 0, 0

    st["xp"] += xp_delta
    leveled = False
    while st["xp"] >= xp_needed(st["level"]):
        st["xp"] -= xp_needed(st["level"])
        st["level"] += 1
        st["coins"] += 10
        coins_delta += 10
        leveled = True

    say = random.choice(SAY[action])
    if leveled:
        say = f"🎉 Новый уровень: {st['level']}! +10 монет. " + say
    return True, say, coins_delta, xp_delta


CARE_ACTIONS = ("feed", "play", "sleep", "pet")   # только они показываются партнёру как «кто что сделал»


def perform(get_db, action: str, user_id: int, names=None, to: str = None,
            item: str = None, name: str = None, room: str = None, x=None, y=None) -> dict:
    """Выполняет действие игрока. Возвращает {"ok", "say", "state"}."""
    now = time.time()
    params = {"to": to, "item": item, "name": name, "room": room, "x": x, "y": y}
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=True)
            _decay(st, now)
            ok, say, coins_delta, xp_delta = _apply(st, action, now, params)
            say = say.replace("{name}", st["name"])
            if ok and action in CARE_ACTIONS:
                st["last_actor"], st["last_action"], st["last_ts"] = user_id, action, now
            # Время и сниженные за отсутствие характеристики сохраняем в любом случае
            cur.execute(
                "UPDATE pet_state SET name=%s, level=%s, xp=%s, coins=%s, hunger=%s, happy=%s,"
                " energy=%s, updated_ts=%s, last_pet_ts=%s, last_actor=%s,"
                " last_action=%s, last_ts=%s, room=%s WHERE pet_key=%s",
                (st["name"], st["level"], st["xp"], st["coins"], st["hunger"], st["happy"],
                 st["energy"], st["updated_ts"], st["last_pet_ts"], st["last_actor"],
                 st["last_action"], st["last_ts"], st["room"], PET_KEY),
            )
            _save_items(cur, st)
            tag = str(action)
            if action == "move":
                tag += f":{to}"
            elif item:
                tag += f":{item}"
            cur.execute(
                "INSERT INTO pet_log (pet_key, user_id, action, ok, coins_delta, xp_delta)"
                " VALUES (%s, %s, %s, %s, %s, %s)",
                (PET_KEY, user_id, tag[:20], bool(ok), coins_delta, xp_delta),
            )
    logging.info(f"🦦 {user_id}: {action} -> {'ок' if ok else 'отказ'}")
    return {"ok": ok, "say": say, "state": public_state(st, names)}
