"""Игра «Наша выдра»: общий питомец пары. Вся игровая логика — на сервере.

Модуль не создаёт своих подключений к базе: app.py передаёт в функции свой
`get_db` (контекстный менеджер с подключением psycopg2). Клиент (static/pet.html)
только показывает состояние и просит выполнить действие по имени.

Что умеет сервер:
  move / feed / play / sleep / pet — как раньше (feed теперь принимает item — id еды);
  buy      — купить вещь из каталога (еда копится в запасе, одежда и мебель покупаются один раз);
  wear / unwear — надеть / снять одежду (слоты: голова, верх, костюм, аксессуар, спина — в каждом одна вещь;
                  костюм и «верх» вместе не носятся);
  place / unplace — поставить мебель в комнату (room, x, y) / убрать в кладовую;
  rename   — сменить имя питомца;
  claim_daily — забрать ежедневный бонус за вход (награда растёт с серией дней подряд, см. pet_ach.py).
"""

import logging
import random
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import pet_quests as quests   # ежедневные задания (pet_quests.py лежит рядом)
import pet_ach as ach         # достижения (pet_ach.py лежит рядом)

# В PostgreSQL строка блокируется на время действия, чтобы два одновременных
# нажатия (два игрока) не затёрли друг друга.
FOR_UPDATE = " FOR UPDATE"

PET_KEY = "couple"          # питомец один на пару (доступ есть только у ALLOWED_USERS)
DEFAULT_NAME = "Бублик"
START_COINS = 20
NAME_MAX = 16

# Выдра никогда не «умирает»: характеристики не падают ниже этих значений
FLOORS = {"hunger": 15, "happy": 15, "energy": 20}
# Падение в час — идёт и когда никто не в игре (считается по реальным часам).
# Во сне сытость и радость тратятся вдвое медленнее, а энергия растёт.
DECAY_PER_HOUR = {"hunger": 2.0, "happy": 1.5, "energy": 2.0}
SLEEP_DECAY_FACTOR = 0.5
NIGHT_ENERGY_FACTOR = 1.5
MAX_DECAY_HOURS = 72
SLEEP_MIN_H, SLEEP_MAX_H = 2.0, 8.0
SLEEP_NEEDS_BELOW = 85

TZ = "Asia/Omsk"                      # app.py подставляет BOT_TIMEZONE
ADMIN_IDS = []                        # app.py подставляет id админов (PET_ADMIN_IDS)
USER_IDS = []                         # app.py подставляет двух игроков общей пары (COUPLE_USER_IDS)
NIGHT_FROM, NIGHT_TO = 22, 7          # ночь: с 22:00 до 7:00

# Комнаты: гостиная (home) соединена с кухней и спальней
INDOOR = ("home", "kitchen", "bedroom")
# Локация «Лес» (открывается за монеты): задний двор → лес → озеро. Из дома выходят через дверь (go_out).
OUTDOOR = ("yard", "forest", "lake")
ROOMS = INDOOR + OUTDOOR
ADJACENT = {"home": ("kitchen", "bedroom"), "kitchen": ("home",), "bedroom": ("home",),
            "yard": ("forest",), "forest": ("yard", "lake"), "lake": ("forest",)}
ROOM_NAMES = {"home": "в гостиную", "kitchen": "на кухню", "bedroom": "в спальню",
              "yard": "на задний двор", "forest": "в лес", "lake": "к озеру"}
LOCATIONS = {"forest": {"n": "Лес", "e": "🌲", "p": 1500, "rooms": list(OUTDOOR),
                        "d": "Задний двор, лес и озеро: грибы, рыбалка и своя уличная мебель"}}
FORAGE_COINS = (8, 14)      # грибы и ягоды в лесу

PET_COOLDOWN_SEC = 20       # монетка за поглаживание — не чаще, чем раз в 20 секунд
MAX_FOOD = 20               # сколько штук одной еды можно держать в запасе
MAX_PER_ROOM = 8            # сколько предметов мебели помещается в одну комнату дома
MAX_PER_ROOM_OUT = 12       # на улице места больше

# ---------------------------------------------------------------------------
# КАТАЛОГ МАГАЗИНА. Цены и эффекты лежат в папке pet_data/ по категориям:
#   pet_data/food.py — еда, pet_data/clothes.py — одежда и редкость, pet_data/furniture.py — мебель,
#   pet_data/texts.py — реплики выдры и тексты отказов. Клиент получает копию каталога для показа.
#   k  — вид: food / wear / furn         n — название       p — цена
#   food: e — эмодзи, hu — сытость, hp — радость, en — энергия, xp — опыт
#   wear: s — слот (head / top / suit / acc / back), r — редкость (common / rare / epic / legendary),
#         цена зависит от редкости (таблица RARITY), legacy — снята с продажи, но у купивших остаётся
#   furn: pl — floor (стоит на полу) или wall (висит на стене)
# ---------------------------------------------------------------------------
from pet_data.clothes import RARITY, SLOTS, CONFLICTS, _wear, WEAR  # noqa: E402,F401
from pet_data.food import FOOD  # noqa: E402
from pet_data.furniture import FURNITURE, STD_PLACE  # noqa: E402,F401
from pet_data.texts import SAY, REFUSE  # noqa: E402,F401
from pet_data import fishing  # noqa: E402
from pet_data.furniture_use import USE, SAY_CD as USE_SAY_CD  # noqa: E402

_USE_CD = {}   # (питомец, вещь) -> когда последний раз давали награду за действие с мебелью

CATALOG = {**FOOD, **WEAR, **FURNITURE}   # порядок как раньше: еда → одежда → мебель


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
            # для таблицы, созданной прошлыми версиями игры
            cur.execute(
                "ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS room TEXT NOT NULL DEFAULT 'home'"
            )
            cur.execute(
                "ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS sleep_until DOUBLE PRECISION NOT NULL DEFAULT 0"
            )
            cur.execute(
                "ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS wake_pending BOOLEAN NOT NULL DEFAULT FALSE"
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
            quests.init(cur)
            ach.init(cur)
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


def local_hour(now: float) -> float:
    d = datetime.fromtimestamp(now, ZoneInfo(TZ))
    return d.hour + d.minute / 60.0


def is_night(now: float) -> bool:
    h = local_hour(now)
    return h >= NIGHT_FROM or h < NIGHT_TO


def _awake_step(st: dict, t0: float, t1: float) -> None:
    """Бодрствование: всё медленно тратится (энергия ночью — быстрее)."""
    # шагаем по 30 минут, чтобы ночной коэффициент считался честно
    t = t0
    while t < t1:
        t_next = min(t1, t + 1800)
        hours = (t_next - t) / 3600.0
        for key, per_hour in DECAY_PER_HOUR.items():
            if key == "energy" and is_night(t):
                per_hour *= NIGHT_ENERGY_FACTOR
            if st[key] > FLOORS[key]:
                st[key] = max(FLOORS[key], st[key] - per_hour * hours)
        t = t_next


def _decay(st: dict, now: float) -> None:
    """Пересчёт характеристик за прошедшее время — работает и без захода в игру.

    Сон: энергия линейно растёт до 100 к моменту пробуждения. Когда срок сна
    вышел, питомец просыпается (wake_pending — сигнал отправить уведомление).
    """
    t0 = st["updated_ts"]
    if now - t0 > MAX_DECAY_HOURS * 3600:
        t0 = now - MAX_DECAY_HOURS * 3600
    until = st.get("sleep_until") or 0
    if until > t0:                                   # был сон
        t1 = min(now, until)
        total = until - t0
        frac = max(0.0, min(1.0, (t1 - t0) / total)) if total > 0 else 1.0
        st["energy"] = st["energy"] + (100.0 - st["energy"]) * frac
        hours = (t1 - t0) / 3600.0
        for key in ("hunger", "happy"):
            if st[key] > FLOORS[key]:
                st[key] = max(FLOORS[key], st[key] - DECAY_PER_HOUR[key] * SLEEP_DECAY_FACTOR * hours)
        t0 = t1
        if now >= until:
            st["energy"] = 100.0
            st["sleep_until"] = 0
            st["wake_pending"] = True
            until = 0
    if not (st.get("sleep_until") or 0) and t0 < now:
        _awake_step(st, t0, now)
    st["updated_ts"] = now


def _mood(st: dict) -> str:
    if st.get("sleep_until"):
        return "sleeping"
    low = min(st["hunger"], st["happy"], st["energy"])
    if low == st["hunger"] and low < 35:
        return "hungry"
    if low == st["energy"] and low < 35:
        return "sleepy"
    if low == st["happy"] and low < 35:
        return "sad"
    return "happy" if st["happy"] >= 70 else "ok"


def public_catalog() -> dict:
    # use — что выдра делает с этой мебелью (rest / play / watch …): клиент выбирает по нему позу и эффекты
    return {k: ({**v, "use": USE[k]["k"]} if k in USE else v) for k, v in CATALOG.items()}


def public_state(st: dict, names=None, now: float = None, uid=None, quests_view=None, ach_view=None, daily_view=None) -> dict:
    names = names or {}
    now = now or time.time()
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
    out = {
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
        "sleeping": bool(st.get("sleep_until")),
        "sleep_until": st.get("sleep_until") or 0,
        "now": now,                       # серверное время — клиент считает по нему остаток сна
        "hour": round(local_hour(now), 2),  # местный час (BOT_TIMEZONE) — для дня и ночи
        "night": is_night(now),
        "is_admin": bool(uid and uid in ADMIN_IDS),
        "locs": unlocked_locs(st),           # открытые локации
        "loc_info": LOCATIONS,               # название, цена и состав локаций для экрана «Локация»
    }
    if quests_view is not None:
        out["quests"] = quests_view
    if ach_view is not None:
        out["ach"] = ach_view
    if daily_view is not None:
        out["daily"] = daily_view        # ежедневный бонус: серия, 7 дней цикла, можно ли забрать сегодня
    return out


_COLUMNS = (
    "name", "level", "xp", "coins", "hunger", "happy", "energy",
    "updated_ts", "last_pet_ts", "last_actor", "last_action", "last_ts", "room",
    "sleep_until", "wake_pending",
)


def _load_items(cur, pet_key=PET_KEY) -> dict:
    cur.execute(
        "SELECT item_id, qty, worn, room, x, y FROM pet_items WHERE pet_key = %s",
        (pet_key,),
    )
    return {
        r[0]: {"qty": r[1], "worn": bool(r[2]), "room": r[3], "x": r[4], "y": r[5]}
        for r in cur.fetchall()
    }


def _save_items(cur, st: dict, pet_key=PET_KEY) -> None:
    for iid in st.pop("_dirty", set()):
        it = st["items"].get(iid)
        if it is None or it["qty"] <= 0:
            cur.execute("DELETE FROM pet_items WHERE pet_key=%s AND item_id=%s", (pet_key, iid))
        else:
            cur.execute(
                "INSERT INTO pet_items (pet_key, item_id, qty, worn, room, x, y)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s)"
                " ON CONFLICT (pet_key, item_id) DO UPDATE SET"
                " qty=EXCLUDED.qty, worn=EXCLUDED.worn, room=EXCLUDED.room,"
                " x=EXCLUDED.x, y=EXCLUDED.y",
                (pet_key, iid, it["qty"], it["worn"], it["room"], it["x"], it["y"]),
            )


def _ensure_std(st: dict) -> None:
    """Стандартная мебель дома есть у каждого питомца с самого начала: если вещи нет в базе — создаём на её месте по умолчанию.
    Если игрок убрал её в кладовую, запись остаётся (room пустая) и вторично не создаётся."""
    for iid, (room, x, y) in STD_PLACE.items():
        if iid not in st["items"]:
            st["items"][iid] = {"qty": 1, "worn": False, "room": room, "x": x, "y": y}
            _touch(st, iid)


def _load(cur, lock: bool, pet_key=PET_KEY) -> dict:
    cur.execute(
        "INSERT INTO pet_state (pet_key, name, coins, updated_ts) VALUES (%s, %s, %s, %s)"
        " ON CONFLICT (pet_key) DO NOTHING",
        (pet_key, DEFAULT_NAME, START_COINS, time.time()),
    )
    cur.execute(
        f"SELECT {', '.join(_COLUMNS)} FROM pet_state WHERE pet_key = %s"
        + (FOR_UPDATE if lock else ""),
        (pet_key,),
    )
    row = cur.fetchone()
    st = dict(zip(_COLUMNS, row))
    st["items"] = _load_items(cur, pet_key)
    _ensure_std(st)
    return st


def get_state(get_db, names=None, uid=None, pet_key=PET_KEY) -> dict:
    """Текущее состояние (с учётом времени, без записи в базу, кроме первого создания)."""
    now = time.time()
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=False, pet_key=pet_key)
            qv = _quests_view(cur, st, uid, names, now, pet_key)   # None, если это чужой питомец (гость)
            stats = ach.load_stats(cur, pet_key)
            av = _ach_view(cur, st, stats, pet_key)
            dv = ach.daily_view(stats, _today(now), names) if qv is not None else None   # у чужого питомца (гость) бонус не показываем
    _decay(st, now)
    return public_state(st, names, now, uid, qv, av, dv)


def _clean_name(raw) -> str:
    s = "".join(ch for ch in str(raw or "") if ch.isprintable() and ch not in "<>&\"'`\\")
    return " ".join(s.split())[:NAME_MAX].strip()


def _touch(st: dict, iid: str) -> None:
    st.setdefault("_dirty", set()).add(iid)


def unlocked_locs(st: dict) -> list:
    return sorted(k[4:] for k in st.get("items", {}) if k.startswith("loc_") and k[4:] in LOCATIONS)


def _new_item() -> dict:
    return {"qty": 0, "worn": False, "room": None, "x": None, "y": None}


def _apply(st: dict, action: str, now: float, p: dict):
    """Меняет st по правилам игры. Возвращает (ok, say, coins_delta, xp_delta)."""
    coins_delta = xp_delta = 0
    room = st.get("room") or "home"
    items = st["items"]
    to = p.get("to")
    iid = p.get("item") or ""

    asleep = bool(st.get("sleep_until"))
    if action == "wake":
        if not asleep:
            return False, REFUSE["not_asleep"], 0, 0
        st["sleep_until"] = 0
        st["wake_pending"] = False
        st["happy"] = _clamp(st["happy"] - 3)
        return True, random.choice(SAY["wake"]), 0, 0
    if asleep and action in ("move", "feed", "play", "sleep", "pet", "forage", "angle", "use", "go_out", "go_in"):
        return False, REFUSE["asleep"], 0, 0
    locs = unlocked_locs(st)

    # ---------- локации: открыть, выйти на улицу, вернуться домой ----------
    if action == "unlock":
        loc = LOCATIONS.get(iid)
        if not loc:
            return False, REFUSE["loc_unknown"], 0, 0
        if iid in locs:
            return False, REFUSE["loc_owned"], 0, 0
        if st["coins"] < loc["p"]:
            return False, REFUSE["buy_poor"], 0, 0
        st["coins"] -= loc["p"]
        it = items.setdefault("loc_" + iid, _new_item())
        it["qty"] = 1
        _touch(st, "loc_" + iid)
        return True, f"Открыто: {loc['n']} {loc['e']} Теперь можно выйти на улицу!", -loc["p"], 0
    if action == "go_out":
        if "forest" not in locs:
            return False, REFUSE["loc_locked"], 0, 0
        if room in OUTDOOR:
            return True, "", 0, 0
        st["room"] = "yard"
        return True, random.choice(SAY["go_out"]), 0, 0
    if action == "go_in":
        if room in INDOOR:
            return True, "", 0, 0
        st["room"] = "home"
        return True, random.choice(SAY["go_in"]), 0, 0

    if action == "move":
        if to not in ROOMS:
            return False, REFUSE["move_far"], 0, 0
        if to == room:
            return True, "", 0, 0
        if to not in ADJACENT[room]:
            return False, REFUSE["move_far"], 0, 0
        if to in OUTDOOR and "forest" not in locs:
            return False, REFUSE["loc_locked"], 0, 0
        st["room"] = to
        return True, f"{{name}} идёт {ROOM_NAMES[to]} 🐾", 0, 0

    # ---------- магазин ----------
    if action == "buy":
        c = CATALOG.get(iid)
        if not c:
            return False, REFUSE["no_item"], 0, 0
        if c.get("legacy"):                      # старая одежда больше не продаётся (клиент её и не показывает)
            return False, REFUSE["legacy"], 0, 0
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
        label = f"{c['n']} · {RARITY[c['r']]['n'].lower()}" if c["k"] == "wear" else c["n"]   # у одежды в сообщении видна редкость
        return True, f"Куплено: {label} 🛍", -c["p"], 0

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
        # в слоте может быть только одна вещь; плюс снимаем вещи несовместимых слотов (костюм ↔ верх)
        blocked = {c["s"], *CONFLICTS.get(c["s"], ())}
        removed = []
        for oid, o in items.items():
            oc = CATALOG.get(oid, {})
            if o["worn"] and oid != iid and oc.get("s") in blocked:
                o["worn"] = False
                _touch(st, oid)
                if oc.get("s") != c["s"]:
                    removed.append(oc["n"])
        it["worn"] = True
        _touch(st, iid)
        extra = f" (снято: {', '.join(removed)})" if removed else ""
        return True, f"Надето: {c['n']} ✨{extra}", 0, 0

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
        kind = c.get("w", "in")
        if kind == "out" and target not in OUTDOOR or kind == "in" and target in OUTDOOR:
            return False, REFUSE["bad_place"], 0, 0
        if target in OUTDOOR and "forest" not in locs:
            return False, REFUSE["loc_locked"], 0, 0
        if it.get("room") != target and not c.get("std"):          # стандартную мебель лимит не касается
            others = sum(1 for oid, o in items.items()
                         if o.get("room") == target and oid != iid and not CATALOG.get(oid, {}).get("std"))
            if others >= (MAX_PER_ROOM_OUT if target in OUTDOOR else MAX_PER_ROOM):
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

    elif action == "forage":
        if room != "forest":
            return False, REFUSE["forage_room"], 0, 0
        if st["energy"] < 15:
            return False, REFUSE["play_tired"], 0, 0
        st["energy"] = _clamp(st["energy"] - 6)
        st["happy"] = _clamp(st["happy"] + 5)
        st["hunger"] = _clamp(st["hunger"] - 4)
        if random.random() < 0.60:
            coins_delta = random.randint(*FORAGE_COINS)
            st["coins"] += coins_delta
            xp_delta = 12
        else:
            xp_delta = 2

    elif action == "angle":
        if room != "lake":
            return False, REFUSE["angle_room"], 0, 0
        if st["energy"] < 15:
            return False, REFUSE["play_tired"], 0, 0
        st["energy"] = _clamp(st["energy"] - 5)
        st["happy"] = _clamp(st["happy"] + 5)
        st["hunger"] = _clamp(st["hunger"] - 3)
        # мини-игра присылает силу заброса (x: 0–100) и подсёк ли игрок рыбу (y: 1/0); старый клиент — ничего
        if p.get("x") is None or p.get("y") is None:
            caught = "fish_std" if random.random() < 0.45 else None
        else:
            caught = fishing.roll(_int(p.get("x"), 50), _int(p.get("y"), 0) == 1)
        st["_catch"] = caught
        if caught:
            f = fishing.FISH[caught]
            st["coins"] += f["c"]
            coins_delta = f["c"]
            xp_delta = f["xp"]
            if f["food"]:
                fish = items.setdefault("fish", _new_item())
                if fish["qty"] < MAX_FOOD:
                    fish["qty"] += 1
                    _touch(st, "fish")
        else:
            xp_delta = 2

    elif action == "use":
        # выдра пользуется мебелью: вещь должна стоять в этой же комнате
        u, it = USE.get(iid), items.get(iid)
        if not u or not it or it.get("room") != room:
            return False, REFUSE["use_none"], 0, 0
        if u.get("need_en") and st["energy"] < 15:
            return False, REFUSE["play_tired"], 0, 0
        key = (p.get("pk"), iid)
        if now - _USE_CD.get(key, 0) < u["cd"]:
            return True, USE_SAY_CD, 0, 0
        _USE_CD[key] = now
        st["energy"] = _clamp(st["energy"] + u.get("en", 0))
        st["happy"] = _clamp(st["happy"] + u.get("hp", 0))
        st["hunger"] = _clamp(st["hunger"] + u.get("hu", 0))
        coins_delta = u.get("c", 0)
        st["coins"] += coins_delta
        xp_delta = u.get("xp", 0)
        st["xp"] += xp_delta
        bonus = _level_up(st)
        coins_delta += bonus
        say = random.choice(u["say"])
        if bonus:
            say = f"🎉 Новый уровень: {st['level']}! +{bonus} монет. " + say
        return True, say, coins_delta, xp_delta

    elif action == "play":
        if room not in ("home", "yard"):
            return False, REFUSE["play_room"], 0, 0
        if st["energy"] < 15:
            return False, REFUSE["play_tired"], 0, 0
        st["energy"] = _clamp(st["energy"] - 4)
        st["happy"] = _clamp(st["happy"] + 15)
        st["hunger"] = _clamp(st["hunger"] - 3)
        st["coins"] += 6
        coins_delta = 6
        xp_delta = 10

    elif action == "sleep":
        tent_ready = room in OUTDOOR and bool((items.get("tent") or {}).get("room") == room)
        if room != "bedroom" and not tent_ready:
            return False, REFUSE["sleep_room"], 0, 0
        if st["energy"] >= SLEEP_NEEDS_BELOW:
            return False, REFUSE["sleep_rested"], 0, 0
        hours = SLEEP_MIN_H + (SLEEP_MAX_H - SLEEP_MIN_H) * (100.0 - st["energy"]) / 100.0
        st["sleep_until"] = now + hours * 3600
        st["wake_pending"] = False
        xp_delta = 2
        st["xp"] += xp_delta
        bonus_coins = _level_up(st)
        coins_delta += bonus_coins
        h, m = int(hours), int(round((hours - int(hours)) * 60))
        if m == 60:
            h += 1
            m = 0
        left = (f"{h} ч " if h else "") + (f"{m} мин" if m else "")
        place_text = " в палатке" if tent_ready else ""
        say = random.choice(SAY["sleep"]) + place_text + f" Проспит около {left.strip()}."
        if bonus_coins:
            say = f"🎉 Новый уровень: {st['level']}! +{bonus_coins} монет. " + say
        return True, say, coins_delta, xp_delta

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
    if action == "angle":
        f = fishing.FISH.get(caught or "")
        if not f:
            say = "Сегодня без улова… Попробуем ещё раз? 🎣"
        elif f["food"]:
            say = f"Поймался улов: {f['e']} {f['n']}! Рыбка уже в запасе для кормления"
        else:
            say = f"Ой, это же {f['n'].lower()} {f['e']} Ну хоть монетка нашлась!"
    if action == "forage":
        say = "Нашёл грибочки и ягоды! 🍄" if coins_delta else "Сегодня грибочки не нашлись… В следующий раз повезёт! 🍃"
    if leveled:
        say = f"🎉 Новый уровень: {st['level']}! +10 монет. " + say
    return True, say, coins_delta, xp_delta


def _users_for(pet_key: str) -> list:
    """Кто играет с этим питомцем: общий питомец пары — оба, отдельный («user:<id>») и админский для «Проверки» («admin:<id>») — один человек."""
    if pet_key == PET_KEY:
        return list(USER_IDS)
    try:
        return [int(pet_key.split(":", 1)[1])]
    except (IndexError, ValueError):
        return []


def _owned_kinds(st: dict) -> set:
    return {CATALOG[i]["k"] for i in st.get("items", {}) if i in CATALOG and CATALOG[i]["k"] != "food"}


def _ensure_quests(cur, st: dict, now: float, pet_key: str):
    day = quests.day_key(now, TZ)
    users = _users_for(pet_key)
    quests.ensure_daily(cur, pet_key, day, users, _owned_kinds(st))
    return day, users


def _quests_view(cur, st: dict, uid, names, now: float, pet_key: str):
    """Задания дня для игрока uid (создаёт их, если день новый). Чужому питомцу — ничего."""
    if not uid or uid not in _users_for(pet_key):
        return None
    day, users = _ensure_quests(cur, st, now, pet_key)
    return quests.view(cur, pet_key, day, uid, users, names or {}, st["name"], now, TZ)


def _level_up(st: dict) -> int:
    """Повышает уровень, пока хватает опыта. Возвращает монеты-бонус за новые уровни."""
    bonus = 0
    while st["xp"] >= xp_needed(st["level"]):
        st["xp"] -= xp_needed(st["level"])
        st["level"] += 1
        st["coins"] += 10
        bonus += 10
    return bonus


def _give(st: dict, coins: int, xp: int, item) -> None:
    st["coins"] += coins
    st["xp"] += xp
    if item and item in CATALOG:
        it = st["items"].setdefault(item, _new_item())
        it["qty"] = min(MAX_FOOD, it["qty"] + 1)
        _touch(st, item)


def _claim(cur, st: dict, uid: int, qkey: str, now: float, pet_key: str):
    """Выдаёт награду за задание. Возвращает (ok, say, coins_delta, xp_delta)."""
    day, _users = _ensure_quests(cur, st, now, pet_key)
    status, rw = quests.claim(cur, pet_key, day, str(qkey or ""), uid)
    if status != "ok":
        msg = {"none": "Такого задания нет 🤔", "forbidden": "Это личное задание партнёра 🙈",
               "not_done": "Задание ещё не выполнено ⏳", "claimed": "Награда уже получена ✅"}[status]
        return False, msg, 0, 0
    coins, xp = rw["coins"], rw["xp"]
    _give(st, coins, xp, rw["item"])
    st["_last_claim"] = bool(rw["last"])
    parts = [f"+{coins} 🪙", f"+{xp} XP"] + ([f"{CATALOG[rw['item']]['e']} {CATALOG[rw['item']]['n']}"] if rw["item"] in CATALOG else [])
    say = "🎁 Награда: " + ", ".join(parts)
    if rw["last"]:                                   # забрали последнее задание дня
        b = quests.DAY_BONUS
        _give(st, b["coins"], b["xp"], b["item"])
        coins += b["coins"]
        xp += b["xp"]
        say += f"\n🎉 Все задания дня выполнены! Бонус: +{b['coins']} 🪙, +{b['xp']} XP, {CATALOG[b['item']]['e']} {CATALOG[b['item']]['n']}"
    lv = _level_up(st)
    if lv:
        coins += lv
        say += f"\n🎉 Новый уровень: {st['level']}! +{lv} 🪙"
    return True, say, coins, xp


def _today(now: float) -> int:
    """Порядковый номер сегодняшнего дня по времени игры (BOT_TIMEZONE) — по нему считаются серия и ежедневный бонус."""
    return datetime.fromtimestamp(now, ZoneInfo(TZ)).date().toordinal()


def _claim_daily(st: dict, stats: dict, user_id: int, now: float):
    """Ежедневный бонус за вход. Возвращает (ok, say, coins_delta, xp_delta).
    Сначала проверяем, не получен ли уже бонус сегодня, затем засчитываем сегодняшний заход и выдаём награду."""
    today = _today(now)
    if ach.daily_claimed(stats, today):
        return False, "Бонус дня уже получен ✅ Заходите завтра!", 0, 0
    ach.touch_day(stats, today)
    rw = ach.daily_reward(stats.get("streak", 1))
    coins, xp, item = rw["coins"], rw["xp"], rw["item"]
    _give(st, coins, xp, item)
    ach.mark_daily(stats, today, user_id)
    parts = [f"+{coins} 🪙", f"+{xp} XP"]
    c = CATALOG.get(item or "")
    if c:
        parts.append(f"{c['e']} {c['n']}")
    say = f"🎁 Бонус дня {rw['day']} из 7 (серия {stats.get('streak', 1)} 🔥): " + ", ".join(parts)
    if rw["day"] == 7:
        say += "\n🎉 Неделя без пропусков! Дальше награды ещё щедрее"
    lv = _level_up(st)
    if lv:
        coins += lv
        say += f"\n🎉 Новый уровень: {st['level']}! +{lv} 🪙"
    return True, say, coins, xp


def _ach_vals(st: dict, stats: dict) -> dict:
    kinds = [CATALOG[i]["k"] for i in st.get("items", {}) if i in CATALOG and not CATALOG[i].get("legacy") and not CATALOG[i].get("std")]
    return ach.values(stats, st["level"], kinds.count("wear"), kinds.count("furn"), len(unlocked_locs(st)))


def _ach_view(cur, st: dict, stats: dict, pet_key: str) -> dict:
    return ach.view(cur, pet_key, _ach_vals(st, stats))


def _claim_ach(cur, st: dict, stats: dict, ach_id: str, pet_key: str):
    """Выдаёт награду за достижение. Возвращает (ok, say, coins_delta, xp_delta)."""
    status, rw = ach.claim(cur, pet_key, str(ach_id or ""), _ach_vals(st, stats))
    if status != "ok":
        msg = {"none": "Такого достижения нет 🤔", "not_done": "Достижение ещё не открыто ⏳",
               "claimed": "Награда уже получена ✅"}[status]
        return False, msg, 0, 0
    coins, xp, item = rw["coins"], rw["xp"], rw["item"]
    parts = [f"+{coins} 🪙", f"+{xp} XP"]
    c = CATALOG.get(item or "")
    if c and c["k"] == "food":
        _give(st, 0, 0, item)
        parts.append(f"{c['e']} {c['n']}")
    elif c:
        if item in st["items"]:
            coins += 20
            parts[0] = f"+{coins} 🪙"
        else:
            it = _new_item(); it["qty"] = 1
            st["items"][item] = it
            _touch(st, item)
            parts.append(f"🎁 {c['n']}")
    _give(st, coins, xp, None)
    say = f"🏅 «{rw['name']}»: " + ", ".join(parts)
    lv = _level_up(st)
    if lv:
        coins += lv
        say += f"\n🎉 Новый уровень: {st['level']}! +{lv} 🪙"
    return True, say, coins, xp


def _game_events(action: str, item, coins_delta: int, xp_delta: int, lvl_gain: int,
                 room_changed: bool, newly_placed: bool) -> dict:
    """Какие «события заданий» породило действие в игре."""
    ev = {}
    if action == "feed":
        ev["feed"] = 1
        if (item or "fish") != "fish":
            ev["fancy"] = 1
    elif action in ("play", "sleep", "pet", "wear", "forage", "angle"):
        ev[action] = 1
    elif action == "use" and xp_delta > 0:       # мебель засчитывается в задания только когда дала награду
        k = USE.get(item or "", {}).get("ev")
        if k:
            ev[k] = 1
    elif action == "move" and room_changed:
        ev["move"] = 1
    elif action == "place" and newly_placed:
        ev["place"] = 1
    elif action == "buy":
        ev["buy"] = 1
        kind = CATALOG.get(item or "", {}).get("k")
        if kind:
            ev["buy_" + kind] = 1
    if coins_delta > 0:
        ev["earn"] = coins_delta
    elif coins_delta < 0:
        ev["spend"] = -coins_delta
    if xp_delta > 0:
        ev["xp"] = xp_delta
    if lvl_gain > 0:
        ev["level"] = lvl_gain
    return ev


CARE_ACTIONS = ("feed", "play", "sleep", "pet", "wake")   # только они показываются партнёру как «кто что сделал»


def _write(cur, st: dict, pet_key=PET_KEY) -> None:
    cur.execute(
        "UPDATE pet_state SET name=%s, level=%s, xp=%s, coins=%s, hunger=%s, happy=%s,"
        " energy=%s, updated_ts=%s, last_pet_ts=%s, last_actor=%s,"
        " last_action=%s, last_ts=%s, room=%s, sleep_until=%s, wake_pending=%s WHERE pet_key=%s",
        (st["name"], st["level"], st["xp"], st["coins"], st["hunger"], st["happy"],
         st["energy"], st["updated_ts"], st["last_pet_ts"], st["last_actor"],
         st["last_action"], st["last_ts"], st["room"], st.get("sleep_until") or 0,
         bool(st.get("wake_pending")), pet_key),
    )


def perform(get_db, action: str, user_id: int, names=None, to: str = None,
            item: str = None, name: str = None, room: str = None, x=None, y=None, pet_key=PET_KEY) -> dict:
    """Выполняет действие игрока. Возвращает {"ok", "say", "state", "ach_new"}."""
    now = time.time()
    params = {"to": to, "item": item, "name": name, "room": room, "x": x, "y": y, "pk": pet_key}
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=True, pet_key=pet_key)
            _decay(st, now)
            stats = ach.load_stats(cur, pet_key)
            unlocked0 = ach.unlocked(_ach_vals(st, stats))
            ev = {}
            catch = None
            if action == "claim":
                st.pop("_last_claim", None)
                ok, say, coins_delta, xp_delta = _claim(cur, st, user_id, item, now, pet_key)
                if ok:
                    ach.add(stats, "quests", 1)
                    if st.pop("_last_claim", False):
                        ach.add(stats, "allquests", 1)
            elif action == "claim_ach":
                ok, say, coins_delta, xp_delta = _claim_ach(cur, st, stats, item, pet_key)
            elif action == "claim_daily":
                ok, say, coins_delta, xp_delta = _claim_daily(st, stats, user_id, now)
            else:
                lvl0, room0 = st["level"], st.get("room")
                prev_room = (st["items"].get(item or "") or {}).get("room")
                ok, say, coins_delta, xp_delta = _apply(st, action, now, params)
                catch = st.pop("_catch", None)
                if ok:                                   # прогресс заданий от действий в игре
                    ev = _game_events(action, item, coins_delta, xp_delta, st["level"] - lvl0,
                                      st.get("room") != room0, prev_room != room)
                    if ev:
                        day, users = _ensure_quests(cur, st, now, pet_key)
                        quests.bump(cur, pet_key, day, user_id, ev, users)
                    for k, n in ev.items():              # счётчики достижений
                        ach.add(stats, k, n)
                    if action == "rename":
                        ach.add(stats, "rename", 1)
            if ok and action not in ("claim_ach",):
                local = datetime.fromtimestamp(now, ZoneInfo(TZ))
                ach.touch_day(stats, local.date().toordinal())
                if action in ("feed", "play", "pet", "sleep"):
                    if local.hour < 5:
                        ach.add(stats, "late", 1)
                    elif local.hour < 7:
                        ach.add(stats, "early", 1)
            say = say.replace("{name}", st["name"])
            if ok and action in CARE_ACTIONS:
                st["last_actor"], st["last_action"], st["last_ts"] = user_id, action, now
            # Время и сниженные за отсутствие характеристики сохраняем в любом случае
            _write(cur, st, pet_key)
            _save_items(cur, st, pet_key)
            vals = _ach_vals(st, stats)
            ach_new = sorted(ach.unlocked(vals) - unlocked0)
            ach.save(cur, pet_key, stats)
            tag = str(action)
            if action == "move":
                tag += f":{to}"
            elif item:
                tag += f":{item}"
            cur.execute(
                "INSERT INTO pet_log (pet_key, user_id, action, ok, coins_delta, xp_delta)"
                " VALUES (%s, %s, %s, %s, %s, %s)",
                (pet_key, user_id, tag[:20], bool(ok), coins_delta, xp_delta),
            )
            qv = _quests_view(cur, st, user_id, names, now, pet_key)
            av = ach.view(cur, pet_key, vals)
            dv = ach.daily_view(stats, _today(now), names)
    logging.info(f"🦦 {user_id}: {action} -> {'ок' if ok else 'отказ'}")
    out = {"ok": ok, "say": say, "state": public_state(st, names, now, user_id, qv, av, dv)}
    if action == "angle" and ok:                 # мини-игре рыбалки — что именно попалось
        f = fishing.FISH.get(catch or "")
        out["catch"] = {"id": catch, "n": f["n"], "e": f["e"], "c": f["c"], "xp": f["xp"], "food": f["food"]} if f else None
    if ach_new:
        out["ach_new"] = [{"id": a, "e": ach.BY_ID[a][1], "n": ach.BY_ID[a][2]} for a in ach_new]
    return out


def process_wakeups(get_db, pet_key=PET_KEY):
    """Вызывается фоновым циклом раз в минуту. Сохраняет пересчитанное состояние и
    возвращает имя питомца, если он только что проснулся и об этом ещё не сообщали."""
    now = time.time()
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=True, pet_key=pet_key)
            _decay(st, now)
            name = None
            if st.get("wake_pending"):
                st["wake_pending"] = False
                name = st["name"]
            _write(cur, st, pet_key)
    return name


# ---------------------------------------------------------------------------
# АДМИН-ПАНЕЛЬ (доступ проверяет app.py по подписи Telegram и ADMIN_IDS)
# ---------------------------------------------------------------------------
def _fresh(st: dict, now: float) -> None:
    st.update(level=1, xp=0, coins=START_COINS, hunger=80.0, happy=80.0, energy=80.0,
              updated_ts=now, last_pet_ts=0, last_actor=None, last_action=None,
              last_ts=None, room="home", sleep_until=0, wake_pending=False)


def admin(get_db, user_id: int, op: str, p: dict, names=None, pet_key=PET_KEY) -> dict:
    now = time.time()
    msg = "Готово ✅"
    log = None
    with get_db() as conn:
        with conn.cursor() as cur:
            st = _load(cur, lock=True, pet_key=pet_key)
            _decay(st, now)
            if op == "set":
                for k in ("hunger", "happy", "energy"):
                    if p.get(k) not in (None, ""):
                        st[k] = _clamp(float(_int(p[k], st[k])))
                if p.get("coins") not in (None, ""):
                    st["coins"] = max(0, min(999999, _int(p["coins"], st["coins"])))
                if p.get("level") not in (None, ""):
                    st["level"] = max(1, min(999, _int(p["level"], st["level"])))
                if p.get("xp") not in (None, ""):
                    st["xp"] = max(0, min(999999, _int(p["xp"], st["xp"])))
                if p.get("room") in ROOMS:
                    st["room"] = p["room"]
                if p.get("name") not in (None, ""):
                    nm = _clean_name(p["name"])
                    if nm:
                        st["name"] = nm
            elif op == "add_coins":
                st["coins"] = max(0, min(999999, st["coins"] + _int(p.get("amount"), 0)))
            elif op == "fill":                       # все характеристики на максимум
                st["hunger"] = st["happy"] = st["energy"] = 100.0
            elif op == "sleep":
                try:
                    raw_h = float(p.get("hours") or 1)
                except (TypeError, ValueError):
                    raw_h = 1.0
                hours = max(0.05, min(24.0, raw_h))
                st["room"] = "bedroom"
                st["sleep_until"] = now + hours * 3600
                st["wake_pending"] = False
                msg = f"Спит {hours:g} ч 💤"
            elif op == "wake":
                st["sleep_until"] = 0
                st["wake_pending"] = bool(p.get("notify"))
            elif op == "reset":
                _fresh(st, now)
                st["name"] = DEFAULT_NAME
                cur.execute("DELETE FROM pet_items WHERE pet_key=%s", (pet_key,))
                cur.execute("DELETE FROM pet_quests WHERE pet_key=%s", (pet_key,))
                ach.reset(cur, pet_key)
                st["items"] = {}
                _ensure_std(st)
                msg = "Игра сброшена с нуля 🔄"
            elif op == "reset_stats":                # только персонаж, вещи остаются
                keep = {k: st[k] for k in ("name", "coins")}
                _fresh(st, now)
                st.update(keep)
                msg = "Характеристики сброшены 🔄"
            elif op == "clear_items":
                cur.execute("DELETE FROM pet_items WHERE pet_key=%s", (pet_key,))
                st["items"] = {}
                _ensure_std(st)                      # дом снова обставлен стандартной мебелью
            elif op in ("loc_unlock", "loc_lock"):
                for lid in LOCATIONS:
                    if op == "loc_unlock":
                        it = st["items"].setdefault("loc_" + lid, _new_item()); it["qty"] = 1
                    else:
                        st["items"].pop("loc_" + lid, None)
                        if st.get("room") in OUTDOOR:
                            st["room"] = "home"
                    _touch(st, "loc_" + lid)
                msg = "Локация открыта 🌲" if op == "loc_unlock" else "Локация закрыта 🔒"
            elif op == "unlock_all":
                for iid, c in CATALOG.items():
                    if c["k"] != "food" and not c.get("legacy") and iid not in st["items"]:
                        it = _new_item(); it["qty"] = 1
                        st["items"][iid] = it
                        _touch(st, iid)
            elif op == "quests_done":                # для проверки: выполнить все задания дня
                day, _users = _ensure_quests(cur, st, now, pet_key)
                cur.execute("UPDATE pet_quests SET progress = target, done = TRUE"
                            " WHERE pet_key=%s AND day=%s AND claimed = FALSE", (pet_key, day))
                msg = "Все задания дня выполнены ✅ Заберите награды в «Заданиях»"
            elif op == "quests_reset":               # сбросить прогресс сегодняшних заданий
                cur.execute("DELETE FROM pet_quests WHERE pet_key=%s AND day=%s", (pet_key, quests.day_key(now, TZ)))
                msg = "Прогресс заданий сброшен 🔄"
            elif op == "ach_all":                    # для проверки: довести счётчики до максимума
                ach.complete_all(cur, pet_key)
                msg = "Счётчики достижений на максимуме ✅ (уровень и вещи — по факту)"
            elif op == "ach_reset":                  # обнулить счётчики и забранные награды
                ach.reset(cur, pet_key)
                msg = "Достижения сброшены 🔄"
            elif op == "daily_reset":                # для проверки: бонус сегодняшнего дня можно забрать снова
                stats = ach.load_stats(cur, pet_key)
                ach.admin_daily_reset(stats)
                ach.save(cur, pet_key, stats)
                msg = "Бонус дня снова можно забрать 🎁"
            elif op == "streak_set":                 # для проверки: сегодняшний бонус будет за день N серии
                stats = ach.load_stats(cur, pet_key)
                n = max(1, min(400, _int(p.get("amount"), 1)))
                ach.admin_set_streak(stats, _today(now), n)
                ach.save(cur, pet_key, stats)
                msg = f"Серия подстроена: сегодняшний бонус за день {n} 🔥"
            elif op == "log":
                cur.execute(
                    "SELECT user_id, action, ok, coins_delta, created_at FROM pet_log"
                    " WHERE pet_key=%s ORDER BY id DESC LIMIT 30", (pet_key,))
                names = names or {}
                log = [{"who": names.get(r[0], str(r[0])), "action": r[1], "ok": bool(r[2]),
                        "coins": r[3], "at": str(r[4])[:19]} for r in cur.fetchall()]
                msg = ""
            else:
                return {"ok": False, "say": "Неизвестная команда админки"}
            if op != "log":
                st["updated_ts"] = now
                _write(cur, st, pet_key)
                _save_items(cur, st, pet_key)
                cur.execute(
                    "INSERT INTO pet_log (pet_key, user_id, action, ok) VALUES (%s, %s, %s, %s)",
                    (pet_key, user_id, ("admin:" + op)[:20], True))
            qv = _quests_view(cur, st, user_id, names, now, pet_key)
            stats2 = ach.load_stats(cur, pet_key)
            av = _ach_view(cur, st, stats2, pet_key)
            dv = ach.daily_view(stats2, _today(now), names)
    logging.info(f"🛠 админ {user_id}: {op}")
    out = {"ok": True, "say": msg, "state": public_state(st, names, now, user_id, qv, av, dv)}
    if log is not None:
        out["log"] = log
    return out
