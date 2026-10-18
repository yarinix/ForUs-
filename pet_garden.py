"""Спокойный общий сад. Независимый модуль, общие с питомцем только монеты.
Хранение PostgreSQL, блокировка pet_state защищает от одновременных покупок.
Растения не погибают: без воды рост приостанавливается, урожай не портится.
"""
import copy
import hashlib
import json
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo
import pet

VERSION = 1
MOISTURE_HOURS = 36
MAX_STOCK = 999
MAX_REQUESTS = 40
CROPS = {
    "radish": {"name": "Редис", "price": 6, "hours": 6, "sell": 18, "yield": 1, "level": 0, "color": "#ed6d88", "desc": "Первый спокойный урожай за 6 часов."},
    "carrot": {"name": "Морковь", "price": 10, "hours": 12, "sell": 30, "yield": 1, "level": 0, "color": "#e99c46", "desc": "Неприхотливая классика огорода."},
    "sunflower": {"name": "Подсолнух", "price": 14, "hours": 18, "sell": 40, "yield": 1, "level": 0, "color": "#eec857", "desc": "Солнечные цветы для вашего двора."},
    "tomato": {"name": "Помидоры", "price": 20, "hours": 18, "sell": 26, "yield": 2, "level": 1, "color": "#de6650", "desc": "Два плода с одного кустика."},
    "strawberry": {"name": "Клубника", "price": 26, "hours": 24, "sell": 36, "yield": 2, "level": 1, "color": "#e75a79", "desc": "Сладкие ягоды, два плода за сбор."},
    "lavender": {"name": "Лаванда", "price": 30, "hours": 30, "sell": 86, "yield": 1, "level": 2, "color": "#ac8cd5", "desc": "Неспешный ароматный цветник."},
    "pumpkin": {"name": "Тыква", "price": 42, "hours": 36, "sell": 118, "yield": 1, "level": 2, "color": "#e49441", "desc": "Крупный урожай для терпеливых садоводов."},
    "blueberry": {"name": "Черника", "price": 48, "hours": 48, "sell": 48, "yield": 3, "level": 3, "color": "#7f88c9", "desc": "Три ягоды с одного кустика."},
}
EXPANSIONS = [
    {"name": "Первый сад", "cols": 4, "rows": 3, "price": 0},
    {"name": "Солнечная полянка", "cols": 5, "rows": 4, "price": 300},
    {"name": "Большой огород", "cols": 6, "rows": 5, "price": 800},
    {"name": "Сад вашей мечты", "cols": 8, "rows": 6, "price": 1800},
]
SUPPLIES = {
    "bed": {"name": "Грядка", "price": 45, "desc": "Постоянная грядка для одного растения. Можно переставлять."},
    "fertilizer": {"name": "Компост", "price": 8, "desc": "Один раз за посадку: +20% роста и +25% к цене урожая."},
    "well": {"name": "Колодец", "price": 220, "once": True, "desc": "После полива влага сохраняется 48 часов вместо 36."},
    "feed": {"name": "Корм", "price": 6, "desc": "Одна порция кормит одно животное. Хватает на 10–12 часов."},
    "sprinkler": {"name": "Автополив", "price": 1500, "once": True, "level": 2, "desc": "Все грядки всегда политы, даже пока вы не в игре."},
}
DECOR = {
    "bench": {"name": "Скамейка", "price": 65, "desc": "Уютное место для отдыха."},
    "flowers": {"name": "Клумба", "price": 55, "desc": "Цветёт круглый год, поливать не нужно."},
    "lantern": {"name": "Фонарь", "price": 85, "desc": "Тёплое свечение вечером."},
    "pond": {"name": "Мини-пруд", "price": 120, "desc": "Небольшой декоративный пруд."},
    "beehive": {"name": "Улей", "price": 100, "desc": "Тихое жужжание и украшение сада, без обязательного ухода."},
}
PEN_W, PEN_H = 76, 70
PEN_BOUNDS = (34, 30, 466, 288)          # min x, min y, max x, max y (левый верхний угол загона)
OLD_SLOTS = [(44, 118), (44, 188), (464, 118), (464, 188)]
GX, GY, CELL = 124, 92, 42
PEN = {"name": "Загон", "price": 150, "capacity": 4, "max": 4, "w": PEN_W, "h": PEN_H,
       "desc": "Загон на 4 животных, ставится где угодно. В одном загоне живёт только один вид."}
SPECIES = {
    "chicken": {"name": "Курица", "price": 40, "level": 0, "feed_hours": 10, "hours": 5, "product": "egg", "pname": "Яйцо", "sell": 12,
                "color": "#f4efe2", "desc": "Несёт яйца. Одной порции корма хватает на 10 часов."},
    "sheep": {"name": "Овечка", "price": 110, "level": 0, "feed_hours": 12, "hours": 12, "product": "wool", "pname": "Шерсть", "sell": 40,
              "color": "#ece8e0", "desc": "Даёт мягкую шерсть. Корма хватает на 12 часов."},
    "pig": {"name": "Свинья", "price": 150, "level": 1, "feed_hours": 12, "hours": 18, "product": "meat", "pname": "Мясо", "sell": 70,
            "color": "#f2a9a3", "desc": "Даёт мясо. Корма хватает на 12 часов."},
    "cow": {"name": "Корова", "price": 220, "level": 2, "feed_hours": 12, "hours": 8, "product": "milk", "pname": "Молоко", "sell": 32,
            "color": "#f1ece4", "desc": "Даёт молоко. Корма хватает на 12 часов."},
}
PRODUCTS = {s["product"]: {"name": s["pname"], "sell": s["sell"], "species": k} for k, s in SPECIES.items()}
CATALOG = {"crops": CROPS, "supplies": SUPPLIES, "decor": DECOR, "expansions": EXPANSIONS,
           "pen": PEN, "species": SPECIES, "products": PRODUCTS}


def init_tables(get_db):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS pet_garden (
                pet_key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_ts DOUBLE PRECISION NOT NULL
            )""")


def _new(now):
    return {"version": VERSION, "revision": 0, "level": 0,
            "seeds": {"radish": 6, "carrot": 4, "sunflower": 2},
            "supplies": {"bed": 0, "fertilizer": 2, "feed": 4}, "upgrades": [],
            "decor_stock": {"bench": 1}, "decor": [], "harvest": {},
            "beds": [{"id": 1, "x": 0, "y": 0, "crop": None},
                     {"id": 2, "x": 1, "y": 0, "crop": None}],
            "next_bed": 3, "next_decor": 1, "rain_day": 0,
            "pens": [], "pen_stock": 0, "animals": [], "goods": {}, "next_pen": 1, "next_animal": 1,
            "stats": {"planted": 0, "harvested": 0, "sold": 0, "earned": 0},
            "receipts": [], "created_at": now}


def _load(cur, key, now):
    cur.execute("SELECT data FROM pet_garden WHERE pet_key=%s", (key,))
    row = cur.fetchone()
    g = json.loads(row[0]) if row else _new(now)
    for k, v in (("pens", []), ("pen_stock", 0), ("animals", []), ("goods", {}), ("next_pen", 1), ("next_animal", 1)):
        g.setdefault(k, v)
    for pn in g["pens"]:
        if "x" not in pn:
            pn["x"], pn["y"] = OLD_SLOTS[pn.get("slot", 0) % 4]
    if "feed" not in g["supplies"]:
        g["supplies"]["feed"] = 4
    return g


def _save(cur, key, g, now):
    cur.execute("INSERT INTO pet_garden (pet_key,data,updated_ts) VALUES (%s,%s,%s) "
                "ON CONFLICT (pet_key) DO UPDATE SET data=EXCLUDED.data, updated_ts=EXCLUDED.updated_ts",
                (key, json.dumps(g, ensure_ascii=False, separators=(",", ":")), now))


def weather(key, now):
    local = datetime.fromtimestamp(now, ZoneInfo(pet.TZ))
    day = local.date().toordinal()
    rain = int(hashlib.sha256(f"{key}:{day}".encode()).hexdigest()[:8], 16) % 5 == 0
    return {"name": "Тихий дождь" if rain else "Ясно", "rain": rain, "day": day,
            "night": pet.is_night(now), "hour": pet.local_hour(now)}


def _advance(g, now, key):
    auto = "sprinkler" in g["upgrades"]
    for bed in g["beds"]:
        crop = bed.get("crop")
        if not crop:
            continue
        duration = CROPS[crop]["hours"] * 3600
        last = bed.get("last_at", now)
        end = now if auto else min(now, bed.get("water_until", last))
        bed["growth"] = min(duration, bed.get("growth", 0) + max(0, end - last))
        bed["last_at"] = max(now, last)
    for a in g["animals"]:
        sp = SPECIES.get(a.get("species"))
        if not sp:
            continue
        last = a.get("last_at", now)
        end = min(now, a.get("fed_until", last))
        a["growth"] = min(sp["hours"] * 3600, a.get("growth", 0) + max(0, end - last))
        a["last_at"] = max(now, last)
    w = weather(key, now)
    if w["rain"] and g.get("rain_day") != w["day"]:
        hours = 48 if "well" in g["upgrades"] else MOISTURE_HOURS
        for bed in g["beds"]:
            if bed.get("crop"):
                bed["water_until"] = max(bed.get("water_until", 0), now + hours * 3600)
        g["rain_day"] = w["day"]


def _integer(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _cell(g, x, y):
    x, y = _integer(x), _integer(y)
    a = EXPANSIONS[g["level"]]
    if x is None or y is None or not (0 <= x < a["cols"] and 0 <= y < a["rows"]):
        return None
    return x, y


def _rects_overlap(a, b):
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def _occupied(g, x, y, except_bed=None):
    cell = (GX + x * CELL, GY + y * CELL, CELL, CELL)
    if any(_rects_overlap(cell, (pn["x"], pn["y"], PEN_W, PEN_H)) for pn in g["pens"]):
        return True
    return any((b["x"], b["y"]) == (x, y) and b["id"] != except_bed for b in g["beds"]) or any(
        (d["x"], d["y"]) == (x, y) for d in g["decor"])


def _ready(bed):
    return bool(bed.get("crop") and bed.get("growth", 0) >= CROPS[bed["crop"]]["hours"] * 3600)


def _water_hours(g):
    return 48 if "well" in g["upgrades"] else MOISTURE_HOURS


def _result(ok, text):
    return ok, text


def _pen_species(g, pen_id):
    return next((a["species"] for a in g["animals"] if a["pen"] == pen_id), None)


def _animal_ready(a):
    sp = SPECIES.get(a.get("species"))
    return bool(sp and a.get("growth", 0) >= sp["hours"] * 3600)


def _animal_fed(a, now):
    return a.get("fed_until", 0) > now


def _pen_spot(g, x, y, except_pen=None):
    if x is None or y is None:
        return "Выберите место для загона."
    x0, y0, x1, y1 = PEN_BOUNDS
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return "Здесь загон не поместится: слишком близко к лесу."
    rect = (x, y, PEN_W, PEN_H)
    blocked = [(0, 0, 160, 112)]
    if "well" in g["upgrades"]:
        blocked.append((78, 118, 42, 42))
    if "sprinkler" in g["upgrades"]:
        blocked.append((84, 164, 42, 42))
    if any(_rects_overlap(rect, r) for r in blocked):
        return "Это место занято домом или постройкой."
    if any(pn["id"] != except_pen and _rects_overlap(rect, (pn["x"], pn["y"], PEN_W, PEN_H)) for pn in g["pens"]):
        return "Тут уже стоит другой загон."
    for b in g["beds"]:
        if _rects_overlap(rect, (GX + b["x"] * CELL, GY + b["y"] * CELL, CELL, CELL)):
            return "Загон не должен стоять на грядках."
    for d in g["decor"]:
        if _rects_overlap(rect, (GX + d["x"] * CELL, GY + d["y"] * CELL, CELL, CELL)):
            return "Загон не должен стоять на украшениях."
    return None


def _animals_apply(g, st, action, p, now):
    """Загоны и животные. Возвращает None, если действие не из этого блока."""
    if action == "buy_pen":
        if len(g["pens"]) + g["pen_stock"] >= PEN["max"]:
            return _result(False, "Больше загонов во дворе не поместится.")
        if st["coins"] < PEN["price"]:
            return _result(False, f"Не хватает монет. Нужно {PEN['price']}.")
        st["coins"] -= PEN["price"]
        g["pen_stock"] += 1
        return _result(True, "Загон куплен. Выберите на карте место, куда его поставить.")
    if action in ("place_pen", "move_pen"):
        x, y = _integer(p.get("x")), _integer(p.get("y"))
        pen = next((pn for pn in g["pens"] if pn["id"] == _integer(p.get("pen"))), None) if action == "move_pen" else None
        if action == "move_pen" and pen is None:
            return _result(False, "Загон не найден. Обновите сад.")
        if action == "place_pen" and g["pen_stock"] < 1:
            return _result(False, "Сначала купите загон.")
        err = _pen_spot(g, x, y, pen["id"] if pen else None)
        if err:
            return _result(False, err)
        if pen:
            pen["x"], pen["y"] = x, y
            return _result(True, "Загон переставлен вместе с животными.")
        g["pen_stock"] -= 1
        g["pens"].append({"id": g["next_pen"], "x": x, "y": y})
        g["next_pen"] += 1
        return _result(True, "Загон готов. Теперь можно поселить в нём животных.")
    if action == "remove_pen":
        pen = next((pn for pn in g["pens"] if pn["id"] == _integer(p.get("pen"))), None)
        if not pen:
            return _result(False, "Загон уже убран.")
        if any(a["pen"] == pen["id"] for a in g["animals"]):
            return _result(False, "В загоне ещё живут животные. Переставить его можно, убрать нельзя.")
        g["pens"].remove(pen)
        g["pen_stock"] += 1
        return _result(True, "Загон убран в запас.")
    if action == "buy_animal":
        pen = next((pn for pn in g["pens"] if pn["id"] == _integer(p.get("pen"))), None)
        species = p.get("item")
        if not pen:
            return _result(False, "Загон не найден. Обновите сад.")
        if not isinstance(species, str) or species not in SPECIES:
            return _result(False, "Такого животного нет.")
        sp = SPECIES[species]
        if g["level"] < sp["level"]:
            return _result(False, "Это животное появится после расширения сада.")
        current = _pen_species(g, pen["id"])
        if current and current != species:
            return _result(False, "В одном загоне живёт только один вид животных.")
        if sum(1 for a in g["animals"] if a["pen"] == pen["id"]) >= PEN["capacity"]:
            return _result(False, "Загон заполнен.")
        if st["coins"] < sp["price"]:
            return _result(False, f"Не хватает монет. Нужно {sp['price']}.")
        st["coins"] -= sp["price"]
        g["animals"].append({"id": g["next_animal"], "pen": pen["id"], "species": species, "growth": 0, "last_at": now, "fed_until": 0})
        g["next_animal"] += 1
        return _result(True, f"В загоне новая обитательница: {sp['name'].lower()}. Не забудьте покормить.")
    if action in ("feed", "feed_all"):
        pen_id = _integer(p.get("pen")) if action == "feed" else None
        if action == "feed" and not any(pn["id"] == pen_id for pn in g["pens"]):
            return _result(False, "Загон не найден. Обновите сад.")
        hungry = [a for a in g["animals"] if (action == "feed_all" or a["pen"] == pen_id) and not _animal_fed(a, now) and not _animal_ready(a)]
        if not hungry:
            return _result(False, "Все животные сыты." if g["animals"] else "Пока некого кормить.")
        have = g["supplies"].get("feed", 0)
        if have < 1:
            return _result(False, "Закончился корм. Купите его в лавке.")
        fed = hungry[:have]
        for a in fed:
            a["fed_until"] = now + SPECIES[a["species"]]["feed_hours"] * 3600
            a["last_at"] = now
        g["supplies"]["feed"] = have - len(fed)
        note = "" if len(fed) == len(hungry) else " Корма на всех не хватило."
        return _result(True, f"Накормлено: {len(fed)}.{note}")
    if action in ("collect", "collect_all"):
        pen_id = _integer(p.get("pen")) if action == "collect" else None
        if action == "collect" and not any(pn["id"] == pen_id for pn in g["pens"]):
            return _result(False, "Загон не найден. Обновите сад.")
        ready = [a for a in g["animals"] if (action == "collect_all" or a["pen"] == pen_id) and _animal_ready(a)]
        if not ready:
            return _result(False, "Пока нечего собирать.")
        got = {}
        for a in ready:
            prod = SPECIES[a["species"]]["product"]
            g["goods"][prod] = g["goods"].get(prod, 0) + 1
            got[prod] = got.get(prod, 0) + 1
            a["growth"] = 0
            a["last_at"] = now
        text = ", ".join(f"{PRODUCTS[k]['name'].lower()} × {n}" for k, n in got.items())
        return _result(True, f"Собрано: {text}. Всё лежит в корзине.")
    if action in ("sell_goods", "sell_good"):
        keys = list(g["goods"]) if action == "sell_goods" else [p.get("item")]
        money = count = 0
        for k in keys:
            if not isinstance(k, str) or k not in PRODUCTS or g["goods"].get(k, 0) < 1:
                continue
            n = g["goods"][k]
            money += n * PRODUCTS[k]["sell"]
            count += n
        if count == 0:
            return _result(False, "Продавать пока нечего.")
        for k in keys:
            g["goods"].pop(k, None)
        st["coins"] += money
        g["stats"]["sold"] += count
        g["stats"]["earned"] += money
        return _result(True, f"Продано: {count} шт. +{money} монет в общую копилку.")
    return None


def apply(g, st, action, p, now):
    """Чистая игровая логика. Неверные действия не изменяют экономику."""
    if action in ("buy_pen", "place_pen", "move_pen", "remove_pen", "buy_animal", "feed", "feed_all", "collect", "collect_all", "sell_goods", "sell_good"):
        return _animals_apply(g, st, action, p, now)
    if action == "buy":
        kind, item = p.get("kind"), p.get("item")
        table = {"seed": CROPS, "supply": SUPPLIES, "decor": DECOR}.get(kind) if isinstance(kind, str) else None
        if table is None or not isinstance(item, str) or item not in table:
            return _result(False, "В магазине нет такого товара.")
        count = _integer(p.get("count", 1))
        c = table[item]
        if count is None or not 1 <= count <= 20:
            return _result(False, "Выберите от 1 до 20 штук.")
        if g["level"] < c.get("level", 0):
            return _result(False, "Этот товар откроется после расширения сада.")
        if c.get("once"):
            if count != 1 or item in g["upgrades"]:
                return _result(False, "Это улучшение можно купить только один раз.")
            stock = None
        else:
            stock = g[{"seed": "seeds", "supply": "supplies", "decor": "decor_stock"}[kind]]
            if stock.get(item, 0) + count > MAX_STOCK:
                return _result(False, "В кладовой достаточно этого товара.")
            if item == "bed" and len(g["beds"]) + stock.get("bed", 0) + count > EXPANSIONS[-1]["cols"] * EXPANSIONS[-1]["rows"]:
                return _result(False, "Больше грядок не поместится даже в самом большом саду.")
        total = c["price"] * count
        if st["coins"] < total:
            return _result(False, f"Не хватает монет. Нужно {total}.")
        st["coins"] -= total
        if stock is None:
            g["upgrades"].append(item)
        else:
            stock[item] = stock.get(item, 0) + count
        return _result(True, f"Куплено: {c['name']}" + (f" × {count}" if count > 1 else "") + ".")
    if action == "expand":
        if g["level"] + 1 >= len(EXPANSIONS):
            return _result(False, "Сад уже расширен полностью.")
        c = EXPANSIONS[g["level"] + 1]
        if st["coins"] < c["price"]:
            return _result(False, f"Для расширения нужно {c['price']} монет.")
        st["coins"] -= c["price"]
        g["level"] += 1
        return _result(True, f"Теперь у вас {c['name'].lower()}: {c['cols']} × {c['rows']} клеток!")
    if action in ("place_bed", "place_decor", "move_bed"):
        cell = _cell(g, p.get("x"), p.get("y"))
        if cell is None:
            return _result(False, "Этот участок пока закрыт.")
        x, y = cell
        moving = next((b for b in g["beds"] if b["id"] == _integer(p.get("bed"))), None) if action == "move_bed" else None
        if action == "move_bed" and moving is None:
            return _result(False, "Грядка не найдена.")
        if _occupied(g, x, y, moving["id"] if moving else None):
            return _result(False, "Эта клетка уже занята.")
        if moving:
            moving["x"], moving["y"] = x, y
            return _result(True, "Грядка переставлена вместе с растением.")
        if action == "place_bed":
            if g["supplies"].get("bed", 0) < 1:
                return _result(False, "Сначала купите грядку в садовой лавке.")
            g["supplies"]["bed"] -= 1
            g["beds"].append({"id": g["next_bed"], "x": x, "y": y, "crop": None})
            g["next_bed"] += 1
            return _result(True, "Новая грядка готова к посадке.")
        item = p.get("item")
        if not isinstance(item, str) or item not in DECOR or g["decor_stock"].get(item, 0) < 1:
            return _result(False, "Такого украшения нет в кладовой.")
        g["decor_stock"][item] -= 1
        g["decor"].append({"id": g["next_decor"], "item": item, "x": x, "y": y})
        g["next_decor"] += 1
        return _result(True, "Сад стал немного уютнее.")
    if action == "remove_decor":
        d = next((d for d in g["decor"] if d["id"] == _integer(p.get("decor"))), None)
        if not d:
            return _result(False, "Украшение уже убрано.")
        g["decor"].remove(d)
        g["decor_stock"][d["item"]] = g["decor_stock"].get(d["item"], 0) + 1
        return _result(True, "Украшение возвращено в кладовую.")
    if action in ("plant", "water", "fertilize", "harvest", "remove_bed"):
        bed = next((b for b in g["beds"] if b["id"] == _integer(p.get("bed"))), None)
        if not bed:
            return _result(False, "Грядка не найдена. Обновите сад.")
        if action == "plant":
            crop = p.get("item")
            if bed.get("crop"):
                return _result(False, "Здесь уже растёт растение.")
            if not isinstance(crop, str) or crop not in CROPS or g["seeds"].get(crop, 0) < 1:
                return _result(False, "Нужны семена из садовой лавки.")
            if CROPS[crop]["level"] > g["level"]:
                return _result(False, "Этот сорт пока не открыт.")
            g["seeds"][crop] -= 1
            bed.update(crop=crop, growth=0, last_at=now, water_until=now + _water_hours(g) * 3600, fertilized=False)
            g["stats"]["planted"] += 1
            return _result(True, f"Посажено: {CROPS[crop]['name']}. Грядка уже полита.")
        if action == "remove_bed":
            if bed.get("crop"):
                return _result(False, "Сначала соберите урожай. Растение не будет потеряно.")
            g["beds"].remove(bed)
            g["supplies"]["bed"] = g["supplies"].get("bed", 0) + 1
            return _result(True, "Грядка убрана в кладовую.")
        if not bed.get("crop"):
            return _result(False, "Сначала посадите растение.")
        if action == "water":
            if _ready(bed):
                return _result(False, "Урожай уже готов, поливать не нужно.")
            if "sprinkler" in g["upgrades"]:
                return _result(False, "Автополив уже заботится об этой грядке.")
            if bed.get("water_until", 0) - now >= (_water_hours(g) - 1) * 3600:
                return _result(False, "Грядка ещё влажная, можно спокойно отдохнуть.")
            bed["water_until"] = now + _water_hours(g) * 3600
            return _result(True, "Грядка полита. Можно никуда не спешить.")
        if action == "fertilize":
            if bed.get("fertilized") or _ready(bed):
                return _result(False, "Этой посадке больше не нужен компост.")
            if g["supplies"].get("fertilizer", 0) < 1:
                return _result(False, "Купите компост в садовой лавке.")
            g["supplies"]["fertilizer"] -= 1
            bed["fertilized"] = True
            bed["growth"] = min(CROPS[bed["crop"]]["hours"] * 3600, bed.get("growth", 0) + CROPS[bed["crop"]]["hours"] * 720)
            return _result(True, "Компост добавлен: +20% роста и +25% к цене урожая.")
        if not _ready(bed):
            return _result(False, "Растение ещё растёт. Урожай дождётся вас.")
        return _harvest(g, bed)
    if action == "water_all":
        if "sprinkler" in g["upgrades"]:
            return _result(False, "Автополив уже включён для всего сада.")
        beds = [b for b in g["beds"] if b.get("crop") and not _ready(b) and b.get("water_until", 0) - now < (_water_hours(g) - 1) * 3600]
        if not beds:
            return _result(False, "Все растущие растения уже политы.")
        for bed in beds:
            bed["water_until"] = now + _water_hours(g) * 3600
        return _result(True, f"Полито грядок: {len(beds)}. Хорошего отдыха!")
    if action == "harvest_all":
        beds = [b for b in g["beds"] if _ready(b)]
        if not beds:
            return _result(False, "Пока нет готового урожая.")
        for bed in beds:
            _harvest(g, bed)
        return _result(True, f"Собран урожай с {len(beds)} грядок. Он ждёт продажи в корзине.")
    if action in ("sell", "sell_all"):
        keys = list(g["harvest"]) if action == "sell_all" else [p.get("item")]
        money = count = 0
        for k in keys:
            if not isinstance(k, str) or k not in g["harvest"] or g["harvest"][k] < 1:
                continue
            crop, quality = k.split(":")
            n = g["harvest"][k]
            money += n * unit_price(crop, quality)
            count += n
        if count == 0:
            return _result(False, "В корзине пока нет урожая.")
        for k in keys:
            g["harvest"].pop(k, None)
        st["coins"] += money
        g["stats"]["sold"] += count
        g["stats"]["earned"] += money
        return _result(True, f"Продано: {count} шт. +{money} монет в общую копилку.")
    return _result(False, "Такого действия в саду нет.")


def unit_price(crop, quality):
    price = CROPS[crop]["sell"]
    return (price * 125 + 99) // 100 if quality == "gold" else price


def _harvest(g, bed):
    crop = bed["crop"]
    key = crop + (":gold" if bed.get("fertilized") else ":normal")
    g["harvest"][key] = g["harvest"].get(key, 0) + CROPS[crop]["yield"]
    g["stats"]["harvested"] += 1
    bed.update(crop=None, growth=0, last_at=0, water_until=0, fertilized=False)
    return _result(True, f"Собрано: {CROPS[crop]['name']}. Грядка снова свободна.")


def public_state(g, st, now, key):
    out = copy.deepcopy(g)
    out.pop("receipts", None)
    out.pop("rain_day", None)
    out["area"] = EXPANSIONS[g["level"]]
    out["next_expansion"] = EXPANSIONS[g["level"] + 1] if g["level"] + 1 < len(EXPANSIONS) else None
    out["coins"] = st["coins"]
    out["now"] = now
    out["weather"] = weather(key, now)
    out["water_hours"] = _water_hours(g)
    out["auto_water"] = "sprinkler" in g["upgrades"]
    out["catalog"] = CATALOG
    out["pet_name"] = st["name"]
    out["pet_sleeping"] = bool(st.get("sleep_until"))
    out["harvest_value"] = sum(n * unit_price(*k.split(":")) for k, n in g["harvest"].items())
    out["goods_value"] = sum(n * PRODUCTS[k]["sell"] for k, n in g["goods"].items() if k in PRODUCTS)
    for a in out["animals"]:
        sp = SPECIES.get(a.get("species"))
        if not sp:
            continue
        duration = sp["hours"] * 3600
        a["progress"] = min(1, a.get("growth", 0) / duration)
        a["ready"] = a["progress"] >= 1
        a["fed"] = a.get("fed_until", 0) > now
        a["hungry"] = not a["ready"] and not a["fed"]
        a["remaining"] = max(0, duration - a.get("growth", 0))
        a["fed_left"] = max(0, a.get("fed_until", 0) - now)
    for b in out["beds"]:
        if b.get("crop"):
            duration = CROPS[b["crop"]]["hours"] * 3600
            b["progress"] = min(1, b.get("growth", 0) / duration)
            b["ready"] = b["progress"] >= 1
            b["dry"] = not b["ready"] and not out["auto_water"] and b.get("water_until", 0) <= now
            b["remaining"] = max(0, duration - b.get("growth", 0))
            b["stage"] = min(3, int(b["progress"] * 4))
        else:
            b.update(progress=0, ready=False, dry=False, remaining=0, stage=0)
    return out


def handle(get_db, user_id, names=None, pet_key=pet.PET_KEY, action=None, params=None):
    """Auth и выбор общего/админского питомца выполняются прежним обработчиком app.py."""
    now = time.time()
    p = params if isinstance(params, dict) else {}
    with get_db() as conn:
        with conn.cursor() as cur:
            # Всегда сначала блокируем питомца, как pet.perform. Единый порядок блокировок.
            st = pet._load(cur, lock=True, pet_key=pet_key)
            pet._decay(st, now)
            if "forest" not in pet.unlocked_locs(st):
                return {"ok": False, "say": "Сначала откройте локацию «Лес».", "locked": True}
            g = _load(cur, pet_key, now)
            _advance(g, now, pet_key)
            ok, say = True, ""
            conflict = False
            if action is not None:
                rid = p.get("request_id")
                safe = {k: p[k] for k in ("kind", "item", "count", "bed", "decor", "pen", "x", "y") if k in p}
                fingerprint = hashlib.sha256(json.dumps([action, safe], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                receipt = next((r for r in g["receipts"] if r["id"] == rid), None)
                if receipt:
                    ok, say = (True, receipt["say"]) if receipt["fingerprint"] == fingerprint else (False, "Обновите сад перед следующим действием.")
                elif not isinstance(rid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", rid):
                    ok, say = False, "Обновите сад перед следующим действием."
                elif _integer(p.get("revision")) != g["revision"]:
                    ok, say, conflict = False, "Сад изменился у партнёра. Состояние обновлено, попробуйте ещё раз.", True
                else:
                    candidate, candidate_st = copy.deepcopy(g), copy.deepcopy(st)
                    ok, say = apply(candidate, candidate_st, action, safe, now)
                    if ok:
                        before = st["coins"]
                        g, st = candidate, candidate_st
                        g["revision"] += 1
                        g["receipts"].append({"id": rid, "fingerprint": fingerprint, "say": say})
                        g["receipts"] = g["receipts"][-MAX_REQUESTS:]
                        cur.execute("INSERT INTO pet_log (pet_key,user_id,action,ok,coins_delta,xp_delta) VALUES (%s,%s,%s,%s,%s,%s)",
                                    (pet_key, user_id, "garden:" + str(action)[:13], True, st["coins"] - before, 0))
            _save(cur, pet_key, g, now)
            pet._write(cur, st, pet_key)
            pet._save_items(cur, st, pet_key)
            return {"ok": ok, "say": say, "conflict": conflict, "garden": public_state(g, st, now, pet_key),
                    "state": pet.public_state(st, names, now, user_id)}
