"""Достижения «Нашей выдры».

Считаются по счётчикам (pet_stats), которые копит pet.perform на каждое действие в игре,
плюс по «живым» значениям: уровень и сколько вещей куплено. Достижение открывается само,
как только счётчик дорос до цели; награду игрок забирает кнопкой «Забрать» (действие claim_ach).

Чтобы добавить достижение, допиши строку в ACH: (id, эмодзи, название, описание, счётчик, цель, ранг, подарок).
Ранг (1–4) задаёт награду монетами и опытом (REWARD); подарок — id вещи из каталога или None.

Счётчики: forage, angle, feed, fancy (угощение из запаса), play, pet, sleep, move, wear, place, buy_food,
buy_wear, buy_furn, earn, spend, quests (забрано заданий), allquests (идеальных дней),
days (дней в игре), streak_max (лучшая серия дней подряд), late (игра после полуночи),
early (игра утром), rename. «Живые»: level, owned_wear, owned_furn, locs (открытые локации).

Ежедневный бонус (см. раздел в конце файла) хранится в тех же pet_stats, отдельной таблицы нет:
daily_last (в какой день бонус забрали), daily_by (кто забрал), daily_total (сколько раз всего).
"""

import time

REWARD = {1: (10, 8), 2: (25, 20), 3: (60, 45), 4: (150, 100)}

# (id, эмодзи, название, описание, счётчик, цель, ранг, подарок)
ACH = [
    # --- уход за питомцем ---
    ("feed1", "🐟", "Первая рыбка", "Покормить питомца", "feed", 1, 1, None),
    ("feed25", "🍤", "Сытый друг", "Покормить 25 раз", "feed", 25, 2, None),
    ("feed100", "🍣", "Шеф-повар", "Покормить 100 раз", "feed", 100, 3, None),
    ("fancy10", "🦀", "Гурман", "Угостить деликатесами из запаса 10 раз", "fancy", 10, 2, None),
    ("play1", "🎾", "Первая игра", "Поиграть с питомцем", "play", 1, 1, None),
    ("play25", "⚽", "Заводила", "Поиграть 25 раз", "play", 25, 2, None),
    ("play100", "🏅", "Неутомимые", "Поиграть 100 раз", "play", 100, 3, None),
    ("pet1", "💕", "Первая ласка", "Погладить питомца", "pet", 1, 1, None),
    ("pet100", "🤗", "Мастер почёсывания", "Погладить 100 раз", "pet", 100, 2, None),
    ("pet500", "💖", "Король нежности", "Погладить 500 раз", "pet", 500, 3, None),
    ("sleep1", "💤", "Сладкие сны", "Уложить питомца спать", "sleep", 1, 1, None),
    ("sleep10", "🌙", "Соня", "Уложить спать 10 раз", "sleep", 10, 2, None),
    ("sleep30", "🛏", "Сон-богатырь", "Уложить спать 30 раз", "sleep", 30, 3, None),
    ("move25", "🚪", "По комнатам", "Походить между комнатами 25 раз", "move", 25, 1, None),
    ("move150", "🧭", "Путешественник", "Походить между комнатами 150 раз", "move", 150, 2, None),
    # --- деньги и дом ---
    ("earn100", "🪙", "Первые монетки", "Заработать 100 монет", "earn", 100, 1, None),
    ("earn1000", "💰", "Копилка", "Заработать 1000 монет", "earn", 1000, 2, None),
    ("earn5000", "🏦", "Богачи", "Заработать 5000 монет", "earn", 5000, 3, "crab"),
    ("earn20000", "💎", "Миллионеры", "Заработать 20 000 монет", "earn", 20000, 4, None),
    ("spend100", "🛍", "Покупатели", "Потратить 100 монет", "spend", 100, 1, None),
    ("spend1000", "🛒", "Транжиры", "Потратить 1000 монет", "spend", 1000, 2, None),
    ("spend5000", "💳", "Шопоголики", "Потратить 5000 монет", "spend", 5000, 3, None),
    ("buy_wear1", "👕", "Обновка", "Купить первую одежду", "buy_wear", 1, 1, None),
    ("owned_wear8", "🧣", "Модники", "Собрать 8 вещей одежды", "owned_wear", 8, 2, None),
    ("owned_wear15", "👑", "Весь гардероб", "Собрать всю одежду", "owned_wear", 15, 4, None),
    ("buy_furn1", "🛋", "Уют", "Купить первую мебель", "buy_furn", 1, 1, None),
    ("owned_furn8", "🪴", "Домовитые", "Собрать 8 предметов мебели", "owned_furn", 8, 2, None),
    ("owned_furn25", "🏰", "Дворец", "Собрать всю мебель, домашнюю и уличную", "owned_furn", 25, 4, None),
    ("wear10", "🧢", "Переодевашки", "Переодеть питомца 10 раз", "wear", 10, 1, None),
    ("place10", "🖼", "Дизайнеры", "Расставить мебель 10 раз", "place", 10, 1, None),
    # --- локация «Лес» ---
    ("loc1", "🌲", "За порог", "Открыть локацию «Лес»", "locs", 1, 3, None),
    ("forage10", "🍄", "Грибники", "Собрать грибы и ягоды 10 раз", "forage", 10, 1, None),
    ("forage50", "🧺", "Лесные добытчики", "Собрать грибы и ягоды 50 раз", "forage", 50, 3, "oyster"),
    ("angle10", "🎣", "Рыбаки", "Порыбачить на озере 10 раз", "angle", 10, 1, None),
    ("angle50", "🐟", "Мастера рыбалки", "Порыбачить на озере 50 раз", "angle", 50, 3, "sushi"),
    # --- рост ---
    ("level5", "⭐", "Подрастаем", "Достичь 5 уровня", "level", 5, 2, None),
    ("level10", "🌟", "Взрослая выдра", "Достичь 10 уровня", "level", 10, 3, None),
    ("level20", "🏆", "Легенда", "Достичь 20 уровня", "level", 20, 4, "crown"),
    # --- задания ---
    ("quests1", "📋", "Первое задание", "Забрать награду за задание", "quests", 1, 1, None),
    ("quests15", "✅", "Трудяги", "Забрать 15 заданий", "quests", 15, 2, None),
    ("quests60", "🎖", "Заслуженные", "Забрать 60 заданий", "quests", 60, 3, "sushi"),
    ("allquests1", "🎁", "Идеальный день", "Забрать все задания за один день", "allquests", 1, 2, None),
    ("allquests10", "🌈", "Десять идеальных дней", "Забрать все задания за день 10 раз", "allquests", 10, 3, "cake"),
    # --- вместе ---
    ("streak3", "🔥", "Три дня подряд", "Заходить 3 дня подряд", "streak_max", 3, 1, None),
    ("streak7", "🔥", "Неделя вместе", "Заходить 7 дней подряд", "streak_max", 7, 2, None),
    ("streak14", "🔥", "Две недели вместе", "Заходить 14 дней подряд", "streak_max", 14, 3, "cake"),
    ("streak30", "🔥", "Месяц вместе", "Заходить 30 дней подряд", "streak_max", 30, 4, "garland"),
    ("days30", "📅", "Тридцать дней в игре", "Поиграть в 30 разных дней", "days", 30, 3, None),
    # --- забавные ---
    ("late1", "🦉", "Сова", "Поиграть после полуночи", "late", 1, 1, None),
    ("early1", "🐦", "Жаворонок", "Заглянуть к питомцу рано утром (5–7 ч)", "early", 1, 1, None),
    ("rename1", "✏️", "Новое имя", "Переименовать питомца", "rename", 1, 1, None),
]
BY_ID = {a[0]: a for a in ACH}
LIVE = ("level", "owned_wear", "owned_furn", "locs")          # считаются не счётчиками, а по состоянию питомца
TRACKED = {a[4] for a in ACH} - set(LIVE)              # какие счётчики вообще нужно копить


def init(cur) -> None:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pet_stats (
            pet_key TEXT NOT NULL,
            stat TEXT NOT NULL,
            val BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (pet_key, stat)
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pet_ach (
            pet_key TEXT NOT NULL,
            ach_id TEXT NOT NULL,
            claimed_ts DOUBLE PRECISION NOT NULL,
            PRIMARY KEY (pet_key, ach_id)
        );
    """)


def load_stats(cur, pet_key: str) -> dict:
    cur.execute("SELECT stat, val FROM pet_stats WHERE pet_key = %s", (pet_key,))
    return {r[0]: int(r[1]) for r in cur.fetchall()}


def add(stats: dict, name: str, n: int = 1) -> None:
    if name in TRACKED and n:
        stats[name] = stats.get(name, 0) + int(n)
        stats.setdefault("_dirty", set()).add(name)


def _set(stats: dict, name: str, v: int) -> None:
    stats[name] = int(v)
    stats.setdefault("_dirty", set()).add(name)


def touch_day(stats: dict, today: int) -> None:
    """Серия дней: today — порядковый номер дня (date.toordinal()). Один раз за день."""
    last = stats.get("last_day", 0)
    if last == today:
        return
    streak = stats.get("streak", 0) + 1 if last == today - 1 else 1
    _set(stats, "last_day", today)
    _set(stats, "streak", streak)
    _set(stats, "streak_max", max(stats.get("streak_max", 0), streak))
    _set(stats, "days", stats.get("days", 0) + 1)


def save(cur, pet_key: str, stats: dict) -> None:
    for name in stats.pop("_dirty", set()):
        cur.execute(
            "INSERT INTO pet_stats (pet_key, stat, val) VALUES (%s, %s, %s)"
            " ON CONFLICT (pet_key, stat) DO UPDATE SET val = EXCLUDED.val",
            (pet_key, name, stats.get(name, 0)))


def values(stats: dict, level: int, owned_wear: int, owned_furn: int, locs: int = 0) -> dict:
    v = {k: x for k, x in stats.items() if k != "_dirty"}
    v.update(level=level, owned_wear=owned_wear, owned_furn=owned_furn, locs=locs)
    return v


def unlocked(vals: dict) -> set:
    return {a[0] for a in ACH if vals.get(a[4], 0) >= a[5]}


def view(cur, pet_key: str, vals: dict) -> dict:
    cur.execute("SELECT ach_id FROM pet_ach WHERE pet_key = %s", (pet_key,))
    claimed = {r[0] for r in cur.fetchall()}
    items, ready = [], 0
    for aid, e, n, d, stat, goal, tier, item in ACH:
        have = vals.get(stat, 0)
        done = have >= goal
        coins, xp = REWARD[tier]
        if done and aid not in claimed:
            ready += 1
        items.append({"id": aid, "e": e, "n": n, "d": d, "goal": goal, "progress": min(goal, have), "tier": tier,
                      "done": done, "claimed": aid in claimed, "coins": coins, "xp": xp, "item": item})
    return {"items": items, "done": sum(1 for i in items if i["done"]), "total": len(items), "ready": ready}


def claim(cur, pet_key: str, ach_id: str, vals: dict):
    """Помечает награду полученной. Возвращает (статус, награда)."""
    a = BY_ID.get(ach_id)
    if not a:
        return "none", None
    if vals.get(a[4], 0) < a[5]:
        return "not_done", None
    cur.execute("SELECT 1 FROM pet_ach WHERE pet_key = %s AND ach_id = %s", (pet_key, ach_id))
    if cur.fetchone():
        return "claimed", None
    cur.execute("INSERT INTO pet_ach (pet_key, ach_id, claimed_ts) VALUES (%s, %s, %s)"
                " ON CONFLICT (pet_key, ach_id) DO NOTHING RETURNING 1", (pet_key, ach_id, time.time()))
    if not cur.fetchone():
        return "claimed", None
    coins, xp = REWARD[a[6]]
    return "ok", {"coins": coins, "xp": xp, "item": a[7], "name": a[2]}


def reset(cur, pet_key: str) -> None:
    cur.execute("DELETE FROM pet_ach WHERE pet_key = %s", (pet_key,))
    cur.execute("DELETE FROM pet_stats WHERE pet_key = %s", (pet_key,))


def complete_all(cur, pet_key: str) -> None:
    """Для проверки: довести все счётчики до максимальной цели (уровень и вещи — только реальные)."""
    best = {}
    for a in ACH:
        if a[4] not in LIVE:
            best[a[4]] = max(best.get(a[4], 0), a[5])
    for stat, v in best.items():
        cur.execute("INSERT INTO pet_stats (pet_key, stat, val) VALUES (%s, %s, %s)"
                    " ON CONFLICT (pet_key, stat) DO UPDATE SET val = GREATEST(pet_stats.val, EXCLUDED.val)",
                    (pet_key, stat, v))


# ===========================================================================
# ЕЖЕДНЕВНЫЙ БОНУС ЗА ВХОД И СЕРИЯ ДНЕЙ
# Награда зависит от серии (сколько дней подряд заходили): цикл из 7 дней, каждый день награда больше,
# седьмой — самый щедрый, с подарком. Пропустили день — серия и цикл начинаются заново.
# Каждая полностью пройденная неделя серии даёт ещё прибавку к монетам и опыту (WEEK_BOOST).
# Питомец общий, поэтому бонус общий: его забирает тот из пары, кто зашёл первым, а серию двигает любой из вас.
# ===========================================================================
# (монеты, опыт, подарок-еда или None) на каждый день цикла
DAILY = [
    (15, 5, None),
    (20, 8, None),
    (30, 10, "shrimp"),
    (40, 12, None),
    (55, 15, "crab"),
    (70, 20, None),
    (120, 40, None),          # день 7: подарок берётся из DAILY_GIFTS
]
DAILY_GIFTS = ("cake", "sushi", "oyster")   # подарок седьмого дня по неделям: 1-я неделя тортик, 2-я суши, 3-я устрицы, дальше по кругу
WEEK_BOOST = 0.25                           # +25% за каждую пройденную неделю серии…
WEEK_BOOST_MAX = 4                          # …но не больше четырёх недель (то есть до +100%)


def streak_today(stats: dict, today: int) -> int:
    """Какая серия будет (или уже есть) сегодня: вчера заходили, значит +1; сегодня уже заходили, значит текущая; иначе 1."""
    last = stats.get("last_day", 0)
    if last == today:
        return max(1, stats.get("streak", 1))
    if last == today - 1:
        return stats.get("streak", 0) + 1
    return 1


def daily_reward(streak: int) -> dict:
    """Награда за день серии streak (1, 2, 3 …): номер дня в цикле, монеты, опыт и подарок с учётом недельной прибавки."""
    week, d = divmod(max(1, streak) - 1, 7)
    coins, xp, item = DAILY[d]
    if d == 6:
        item = DAILY_GIFTS[week % len(DAILY_GIFTS)]
    k = 1 + WEEK_BOOST * min(week, WEEK_BOOST_MAX)
    return {"day": d + 1, "week": week, "coins": round(coins * k), "xp": round(xp * k), "item": item}


def daily_claimed(stats: dict, today: int) -> bool:
    return stats.get("daily_last", 0) == today


def mark_daily(stats: dict, today: int, user_id: int) -> None:
    """Запоминает, что бонус дня забран (и кем), и считает забранные бонусы."""
    _set(stats, "daily_last", today)
    _set(stats, "daily_by", user_id)
    _set(stats, "daily_total", stats.get("daily_total", 0) + 1)


def daily_view(stats: dict, today: int, names: dict = None) -> dict:
    """Всё, что нужно клиенту для экрана «Ежедневный бонус»: серия, 7 дней цикла с наградами и состоянием каждого дня."""
    s = streak_today(stats, today)
    claimed = daily_claimed(stats, today)
    week = (s - 1) // 7
    days = []
    for d in range(7):
        n = week * 7 + d + 1                                   # номер этого дня в серии
        r = daily_reward(n)
        state = "claimed" if (n < s or (n == s and claimed)) else "today" if n == s else "future"
        days.append({"day": d + 1, "coins": r["coins"], "xp": r["xp"], "item": r["item"], "state": state})
    by = stats.get("daily_by") if claimed else None
    return {"can_claim": not claimed, "today": today, "streak": s, "best": max(stats.get("streak_max", 0), s), "day": (s - 1) % 7 + 1,
            "week": week, "boost": round(100 * WEEK_BOOST * min(week, WEEK_BOOST_MAX)), "total": stats.get("daily_total", 0),
            "by": (names or {}).get(by) if by else None, "days": days}


def admin_daily_reset(stats: dict) -> None:
    """Для проверки: бонус сегодняшнего дня снова можно забрать."""
    _set(stats, "daily_last", 0)


def admin_set_streak(stats: dict, today: int, n: int) -> None:
    """Для проверки: подстроить серию так, чтобы сегодняшний бонус был за день n (и его можно было забрать)."""
    n = max(1, min(400, int(n)))
    if n == 1:
        _set(stats, "streak", 0)
        _set(stats, "last_day", 0)
    else:
        _set(stats, "streak", n - 1)
        _set(stats, "last_day", today - 1)
    _set(stats, "daily_last", 0)
    _set(stats, "streak_max", max(stats.get("streak_max", 0), n - 1))
