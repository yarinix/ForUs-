"""Мебель: домашняя, уличная и стандартная. Рисунки — в static/pet/js/furniture/ под теми же id."""

FURNITURE = {
    # --- мебель ---
    "cactus":    {"k": "furn", "n": "Кактус",         "p": 25,  "pl": "floor", "w": "any"},
    "pouf":      {"k": "furn", "n": "Пуф",            "p": 35,  "pl": "floor"},
    "plant":     {"k": "furn", "n": "Фикус",          "p": 40,  "pl": "floor", "w": "any"},
    "table":     {"k": "furn", "n": "Столик с чаем",  "p": 50,  "pl": "floor"},
    "lamp":      {"k": "furn", "n": "Торшер",         "p": 55,  "pl": "floor", "w": "any"},
    "tree":      {"k": "furn", "n": "Ёлочка",         "p": 80,  "pl": "floor", "w": "any"},
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
    # --- уличная мебель (w: out — только на улице; any — и дома, и на улице; остальное — только дома) ---
    "mushrooms": {"k": "furn", "n": "Грибочки",       "p": 30,  "pl": "floor", "w": "out"},
    "flowerbed": {"k": "furn", "n": "Клумба",         "p": 45,  "pl": "floor", "w": "out"},
    "picnic":    {"k": "furn", "n": "Плед для пикника", "p": 50, "pl": "floor", "w": "out"},
    "birdhouse": {"k": "furn", "n": "Скворечник",     "p": 55,  "pl": "floor", "w": "out"},
    "bench":     {"k": "furn", "n": "Скамейка",       "p": 60,  "pl": "floor", "w": "out"},
    "lamppost":  {"k": "furn", "n": "Уличный фонарь", "p": 70,  "pl": "floor", "w": "out"},
    "campfire":  {"k": "furn", "n": "Костёр",         "p": 90,  "pl": "floor", "w": "out"},
    "boat":      {"k": "furn", "n": "Лодочка",        "p": 120, "pl": "floor", "w": "out"},
    "tent":      {"k": "furn", "n": "Палатка",        "p": 140, "pl": "floor", "w": "out"},
    # --- стандартная мебель дома: есть у всех с самого начала, стоит на своих местах, но её можно убирать и переставлять.
    #     std — стандартная (в магазине не продаётся и в достижениях «собрать мебель» не считается);
    #     flat — ковёр: лежит на полу под выдрой и другой мебелью. Рисунки лежат в pet.html под теми же id.
    "shelf":      {"k": "furn", "n": "Полка с цветами",   "p": 0, "pl": "wall",  "std": True},
    "hpicture":   {"k": "furn", "n": "Картина с цветком", "p": 0, "pl": "wall",  "std": True},
    "hrug":       {"k": "furn", "n": "Ковёр в гостиной",  "p": 0, "pl": "floor", "std": True, "flat": True},
    "lounger":    {"k": "furn", "n": "Лежанка",           "p": 0, "pl": "floor", "std": True},
    "chest":      {"k": "furn", "n": "Сундук с игрушками", "p": 0, "pl": "floor", "std": True},
    "ball":       {"k": "furn", "n": "Мячик",             "p": 0, "pl": "floor", "std": True},
    "bone":       {"k": "furn", "n": "Косточка",          "p": 0, "pl": "floor", "std": True},
    "counter":    {"k": "furn", "n": "Кухонная стойка",   "p": 0, "pl": "floor", "std": True},
    "fridge":     {"k": "furn", "n": "Холодильник",       "p": 0, "pl": "floor", "std": True},
    "kclock":     {"k": "furn", "n": "Кухонные часы",     "p": 0, "pl": "wall",  "std": True},
    "krug":       {"k": "furn", "n": "Коврик на кухне",   "p": 0, "pl": "floor", "std": True, "flat": True},
    "bowl":       {"k": "furn", "n": "Миска",             "p": 0, "pl": "floor", "std": True},
    "bed":        {"k": "furn", "n": "Кровать",           "p": 0, "pl": "floor", "std": True},
    "nightstand": {"k": "furn", "n": "Тумбочка с лампой", "p": 0, "pl": "floor", "std": True},
    "brug":       {"k": "furn", "n": "Ковёр в спальне",   "p": 0, "pl": "floor", "std": True, "flat": True},
    "plush":      {"k": "furn", "n": "Плюшевая игрушка",  "p": 0, "pl": "floor", "std": True},
}

# Где стандартная мебель стоит по умолчанию: id -> (комната, x в %, y в %). Числа — как расставлено в игре сначала.
STD_PLACE = {
    "shelf": ("home", 73, 59), "hpicture": ("home", 89, 33), "hrug": ("home", 47, 74), "lounger": ("home", 80, 82),
    "chest": ("home", 13, 88), "ball": ("home", 59, 90), "bone": ("home", 70, 89),
    "counter": ("kitchen", 52, 0), "fridge": ("kitchen", 88, 0), "kclock": ("kitchen", 52, 33), "krug": ("kitchen", 47, 74),
    "bowl": ("kitchen", 20, 92),
    "bed": ("bedroom", 81, 29), "nightstand": ("bedroom", 14, 71), "brug": ("bedroom", 47, 75), "plush": ("bedroom", 74, 91),
}
