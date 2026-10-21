"""Рыбалка-мини-игра: виды улова и шансы по дальности заброса.

Клиент присылает только силу заброса (0–100) и удалось ли подсечь рыбу.
Какая рыба попалась, решает сервер — по дальности (близко / средне / далеко).
"""
import random

# n — название, e — эмодзи, c — монеты, xp — опыт, food — кладётся ли рыбка в запас для кормления
FISH = {
    "fish_std": {"n": "Рыбка",          "e": "🐟", "c": 5,  "xp": 12, "food": True},    # старый клиент без мини-игры
    "boot":     {"n": "Старый ботинок", "e": "🥾", "c": 1,  "xp": 3,  "food": False},
    "perch":    {"n": "Окунёк",         "e": "🐟", "c": 5,  "xp": 10, "food": True},
    "crucian":  {"n": "Карась",         "e": "🐠", "c": 8,  "xp": 14, "food": True},
    "pike":     {"n": "Щука",           "e": "🐊", "c": 14, "xp": 20, "food": True},
    "goldfish": {"n": "Золотая рыбка",  "e": "✨", "c": 30, "xp": 35, "food": True},
}

# Чем дальше заброс, тем крупнее и реже рыба (и тем сложнее её вытащить в мини-игре)
WEIGHTS = {
    "near": {"perch": 55, "boot": 25, "crucian": 20},
    "mid":  {"perch": 35, "crucian": 45, "pike": 16, "goldfish": 4},
    "far":  {"perch": 10, "crucian": 30, "pike": 50, "goldfish": 10},
}


def band(power: int) -> str:
    power = max(0, min(100, int(power)))
    return "near" if power < 34 else "mid" if power < 71 else "far"


def roll(power: int, hooked: bool):
    """Что попалось: id рыбы или None, если рыба сорвалась."""
    if not hooked:
        return None
    w = WEIGHTS[band(power)]
    return random.choices(list(w), weights=list(w.values()))[0]
