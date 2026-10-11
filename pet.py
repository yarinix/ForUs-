"""Игра «Наша выдра»: общий питомец пары. Вся игровая логика — на сервере.

Модуль не создаёт своих подключений к базе: app.py передаёт в функции свой
`get_db` (контекстный менеджер с подключением psycopg2). Клиент (static/pet.html)
только показывает состояние и просит выполнить действие по имени.
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

SAY = {
    "feed": ["Ам-ам-ам! Вкуснотища! 🐟", "Рыбка закончилась, Бублик счастлив!", "Хрум! А можно ещё рыбки?"],
    "play": ["Ура! Давай ещё! 🎾", "Лови мячик! Плюх-плюх!", "Поиграем?! Ура-ура!"],
    "sleep": ["Зевает… Спокойной ночи 💤", "Свернулся клубочком и сопит…", "Сопит… Zzz"],
    "pet": ["Хвостик виляет! 💕", "Мурлыкает от удовольствия!", "Бублик прижимается к руке"],
}
REFUSE = {
    "feed_full": "Бублик совсем не голоден, отложит рыбку на потом 🙈",
    "feed_poor": "Не хватает монет на еду. Поиграйте с Бубликом — заработаете!",
    "play_tired": "Бублик слишком устал для игр. Пусть поспит 💤",
    "feed_room": "Есть можно только на кухне 🍽",
    "play_room": "Играть можно только в гостиной 🎾",
    "sleep_room": "Спать можно только в спальне 🛏",
    "move_far": "Туда не пройти напрямую: сначала зайдите в гостиную 🚪",
    "sleep_rested": "Бублик бодр и совсем не хочет спать ☀️",
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


def xp_needed(level: int) -> int:
    return 40 + 20 * level


def _clamp(v, lo=0.0, hi=100.0):
    return max(lo, min(hi, v))


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


def public_state(st: dict, names=None) -> dict:
    names = names or {}
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
    }


_COLUMNS = (
    "name", "level", "xp", "coins", "hunger", "happy", "energy",
    "updated_ts", "last_pet_ts", "last_actor", "last_action", "last_ts", "room",
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
    return dict(zip(_COLUMNS, row))


def get_state(get_db, names=None) -> dict:
    """Текущее состояние (с учётом времени, без записи в базу, кроме первого создания)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=False)
    _decay(st, time.time())
    return public_state(st, names)


def _apply(st: dict, action: str, now: float, to: str = None):
    """Меняет st по правилам игры. Возвращает (ok, say, coins_delta, xp_delta)."""
    coins_delta = xp_delta = 0
    room = st.get("room") or "home"

    if action == "move":
        if to not in ROOMS:
            return False, REFUSE["move_far"], 0, 0
        if to == room:
            return True, "", 0, 0
        if to not in ADJACENT[room]:
            return False, REFUSE["move_far"], 0, 0
        st["room"] = to
        return True, f"Бублик идёт {ROOM_NAMES[to]} 🐾", 0, 0

    if action == "feed":
        if room != "kitchen":
            return False, REFUSE["feed_room"], 0, 0
        if st["hunger"] >= 92:
            return False, REFUSE["feed_full"], 0, 0
        if st["coins"] < 5:
            return False, REFUSE["feed_poor"], 0, 0
        st["coins"] -= 5
        coins_delta = -5
        st["hunger"] = _clamp(st["hunger"] + 28)
        st["happy"] = _clamp(st["happy"] + 3)
        xp_delta = 6

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
        return False, "Бублик не понял, чего от него хотят 🤔", 0, 0

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


def perform(get_db, action: str, user_id: int, names=None, to: str = None) -> dict:
    """Выполняет действие игрока. Возвращает {"ok", "say", "state"}."""
    now = time.time()
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=True)
            _decay(st, now)
            ok, say, coins_delta, xp_delta = _apply(st, action, now, to)
            if ok and action != "move":
                st["last_actor"], st["last_action"], st["last_ts"] = user_id, action, now
            # Время и сниженные за отсутствие характеристики сохраняем в любом случае
            cur.execute(
                "UPDATE pet_state SET level=%s, xp=%s, coins=%s, hunger=%s, happy=%s,"
                " energy=%s, updated_ts=%s, last_pet_ts=%s, last_actor=%s,"
                " last_action=%s, last_ts=%s, room=%s WHERE pet_key=%s",
                (st["level"], st["xp"], st["coins"], st["hunger"], st["happy"],
                 st["energy"], st["updated_ts"], st["last_pet_ts"], st["last_actor"],
                 st["last_action"], st["last_ts"], st["room"], PET_KEY),
            )
            cur.execute(
                "INSERT INTO pet_log (pet_key, user_id, action, ok, coins_delta, xp_delta)"
                " VALUES (%s, %s, %s, %s, %s, %s)",
                (PET_KEY, user_id, (f"move:{to}" if action == "move" else str(action))[:20],
                 bool(ok), coins_delta, xp_delta),
            )
    logging.info(f"🦦 {user_id}: {action} -> {'ок' if ok else 'отказ'}")
    return {"ok": ok, "say": say, "state": public_state(st, names)}
