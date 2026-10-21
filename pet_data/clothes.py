"""Одежда: редкость, слоты и каталог вещей. Рисунки — в static/pet/js/clothes/clothes.js под теми же id."""

# ---------------------------------------------------------------------------
# РЕДКОСТЬ ОДЕЖДЫ. Цена вещи зависит только от редкости: чтобы поменять цены, правьте эту таблицу.
#   common — обычное, rare — редкое, epic — эпическое, legendary — легендарное
# ---------------------------------------------------------------------------
RARITY = {
    "common":    {"n": "Обычное",     "p": 50},
    "rare":      {"n": "Редкое",      "p": 110},
    "epic":      {"n": "Эпическое",   "p": 520},
    "legendary": {"n": "Легендарное", "p": 999},
}
# Слоты одежды (в каждом носится одна вещь) и эмодзи слота — он же показывается в наградах за задания
SLOTS = {"head": "🎩", "top": "👕", "suit": "🥋", "acc": "📿", "back": "🎒"}
# Какие слоты нельзя носить одновременно: костюм занимает место «верха»
CONFLICTS = {"top": ("suit",), "suit": ("top",)}


def _wear(name: str, slot: str, rarity: str, legacy: bool = False, price: int = None) -> dict:
    """Запись каталога для одежды. Цена берётся из редкости; у старых вещей (legacy) остаётся их прежняя цена."""
    it = {"k": "wear", "n": name, "s": slot, "r": rarity, "e": SLOTS[slot],
          "p": price if price is not None else RARITY[rarity]["p"]}
    if legacy:
        it["legacy"] = True
    return it


WEAR = {
    # --- одежда: 5 слотов × 3 вещи (рисунки лежат в pet.html под теми же id) ---
    # голова
    "bucket":   _wear("Панамка",             "head", "common"),
    "chef":     _wear("Колпак повара",       "head", "rare"),
    "halo":     _wear("Золотой нимб",        "head", "legendary"),
    # верх
    "hoodie":   _wear("Худи",                "top",  "common"),
    "aloha":    _wear("Гавайская рубашка",   "top",  "rare"),
    "armor":    _wear("Рыцарская кираса",    "top",  "epic"),
    # костюм (занимает место «верха» — вместе не носятся)
    "pajamas":  _wear("Пижама со звёздами",  "suit", "rare"),
    "pirate":   _wear("Костюм пирата",       "suit", "epic"),
    "robe":     _wear("Королевская мантия",  "suit", "legendary"),
    # аксессуар
    "shells":   _wear("Ожерелье из ракушек", "acc",  "common"),
    "monocle":  _wear("Монокль с цепочкой",  "acc",  "rare"),
    "amulet":   _wear("Кристальный амулет",  "acc",  "legendary"),
    # спина
    "backpack": _wear("Рюкзачок",            "back", "common"),
    "jetpack":  _wear("Ракетный ранец",      "back", "epic"),
    "wings":    _wear("Ангельские крылья",   "back", "legendary"),
    # --- старая одежда: снята с продажи, но у кого уже куплена — остаётся в гардеробе (слоты переведены на новые) ---
    # Чтобы вернуть вещь в магазин, уберите у неё legacy (последние два параметра) и поставьте цену по редкости.
    "flower":     _wear("Цветочек",           "head", "common", True, 20),
    "party":      _wear("Праздничный колпак", "head", "common", True, 25),
    "cap":        _wear("Кепка",              "head", "common", True, 30),
    "beanie":     _wear("Шапочка",            "head", "common", True, 35),
    "crown":      _wear("Корона",             "head", "epic",   True, 150),
    "round":      _wear("Круглые очки",       "acc",  "rare",   True, 40),
    "sunglasses": _wear("Тёмные очки",        "acc",  "rare",   True, 45),
    "hearts":     _wear("Очки-сердечки",      "acc",  "rare",   True, 60),
    "bandana":    _wear("Бандана",            "acc",  "common", True, 25),
    "scarf":      _wear("Шарфик",             "acc",  "common", True, 30),
    "bow":        _wear("Бабочка",            "acc",  "common", True, 35),
    "apron":      _wear("Фартук",             "top",  "common", True, 35),
    "tee":        _wear("Футболка",           "top",  "rare",   True, 40),
    "sweater":    _wear("Свитер",             "top",  "rare",   True, 60),
    "cape":       _wear("Плащ героя",         "back", "epic",   True, 100),
}
