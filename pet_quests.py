"""Ежедневные задания «Нашей выдры».

Четыре категории (чем выше, тем сложнее и щедрее награда), каждый день набор
выпадает случайно:
  1 — уход за питомцем: кормить, играть, уложить спать, гладить, ходить по комнатам;
  2 — хозяйство: заработать/потратить монеты, купить вещь, переодеть, расставить мебель;
  3 — личные: у каждого свои, привязаны к Telegram ID (см. PERSONAL_POOLS);
  4 — испытания: много игры и заработка за день, новый уровень.

Сейчас задания ТОЛЬКО внутриигровые: прогресс считает pet.perform по действиям в игре.
Задания про чат (сообщения, «люблю тебя», темы) написаны и лежат в этом же файле, но
выключены флагом CHAT_QUESTS; когда понадобятся — в app.py нужен хук на сообщения чата
(распознавание detect() и подсчёт bump() уже готовы).

Питомцы бывают общие (у пары) и отдельные (у добавленных пользователей): задания
выдаются каждому питомцу свои. Награду игрок забирает кнопкой «Забрать» (действие claim).

Всё, что удобно менять, лежит в начале файла: сколько заданий в день, награды,
личные наборы, темы разговоров. Тексты и диапазоны чисел — в блоках _t(...) ниже.
"""

import json
import random
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

FOR_UPDATE = " FOR UPDATE"

CHAT_QUESTS = False                # True — подмешивать задания про сообщения в чате (нужен хук track_message)
DAY_START_HOUR = 0                 # новый день заданий начинается в это местное время
KEEP_DAYS = 14                     # сколько дней истории хранить

# Сколько заданий выпадает в день. Для категории 3 — НА КАЖДОГО человека.
PER_DAY = {1: 3, 2: 3, 3: 2, 4: 2}

CATS = {
    1: {"n": "Уход за питомцем", "e": "🐟", "d": "Кормить, играть, гулять"},
    2: {"n": "Хозяйство", "e": "🪙", "d": "Монеты, магазин и дом"},
    3: {"n": "Личные задания", "e": "💌", "d": "Только для тебя"},
    4: {"n": "Испытания", "e": "🏆", "d": "Самые сложные"},
}

# Награда зависит от категории (и чуть-чуть от размера задачи: ±20%).
# items — что может выпасть в подарок (id еды из каталога pet.CATALOG).
REWARD = {
    1: {"coins": 10, "xp": 8, "items": []},
    2: {"coins": 20, "xp": 15, "items": []},
    3: {"coins": 35, "xp": 25, "items": ["shrimp", "crab", "oyster"]},
    4: {"coins": 70, "xp": 45, "items": ["cake", "sushi"]},
}
# Если за день забраны ВСЕ задания (у обоих), падает бонус.
DAY_BONUS = {"coins": 40, "xp": 30, "item": "sushi"}

# Личные задания по Telegram ID (категория 3). Для остальных — общий набор «g_…».
PERSONAL_POOLS = {
    5084782149: ["yg_feed", "yg_fancy", "yg_pet", "yg_food", "yg_earn", "yg_place", "yg_xp", "yg_move",
                 # про чат (работают при CHAT_QUESTS = True):
                 "y_beauty", "y_feed", "y_love", "y_detail", "y_thanks", "y_nick", "y_hug", "y_date",
                 "y_voice", "y_photo", "y_howru", "y_support", "y_pet", "y_play", "y_gm", "y_gn", "y_proud"],
    1253880871: ["pg_play", "pg_pet", "pg_wear", "pg_buywear", "pg_buyfurn", "pg_earn", "pg_sleep", "pg_xp",
                 # про чат (работают при CHAT_QUESTS = True):
                 "p_praise", "p_play", "p_feed", "p_love", "p_compl", "p_thanks", "p_nick", "p_hug", "p_date",
                 "p_voice", "p_photo", "p_howru", "p_support", "p_pet", "p_wear", "p_place", "p_gm", "p_gn", "p_proud"],
}
DEFAULT_PERSONAL = ["gg_feed", "gg_play", "gg_pet", "gg_earn", "gg_xp", "gg_move", "gg_sleep",
                    # про чат:
                    "g_compl", "g_love", "g_thanks", "g_nick", "g_hug", "g_howru", "g_gm", "g_pet", "g_play", "g_feed"]

# Темы для разговора (категория 4): id -> (название, подсказка, слова-основы)
TOPICS = {
    "travel": ("Путешествия", "поездки, море, отпуск, билеты",
               r"поездк|путешеств|отпуск|море\b|моря\b|самолет|поезд\b|билет|страна\b|страны\b|за границ|отел[ьея]|курорт|пляж|горы\b|экскурси|чемодан|каникул|маршрут"),
    "food": ("Еда и готовка", "рецепты, ужин, десерты, кофе",
             r"готов|рецепт|вкусн|ужин|обед\b|завтрак|пицц|суши|борщ|десерт|торт\b|кофе|чай\b|кухн|выпечк|ресторан|кафе\b|голодн|салат|шашлык|мороженое"),
    "movies": ("Кино и сериалы", "фильмы, сериалы, актёры, аниме",
               r"фильм|кино\b|сериал|актер|режисс|кинотеатр|посмотр|смотрел|нетфликс|netflix|мультик|мультфильм|аниме|премьер|сезон\b"),
    "music": ("Музыка", "песни, плейлисты, концерты",
              r"музык|песн|трек\b|треки\b|альбом|плейлист|концерт|певец|певиц|группа\b|гитар|слушаю|клип\b|спел|петь\b"),
    "dreams": ("Мечты и планы", "будущее, цели, свадьба, переезд",
               r"мечт|планы\b|план на|будущ|цел[ьи]\b|когда-нибудь|переех|свой дом|свадьб|карьер|накопить|хочу чтобы|через год|лет через"),
    "memories": ("Воспоминания", "первая встреча, как познакомились",
                 r"помнишь|вспоминаю|вспомни|в тот день|познакомил|первая встреча|первый раз|в детств|тогда мы|а помнишь|ностальг"),
    "animals": ("Животные", "коты, собаки, выдры, зоопарк",
                r"\bкот\b|коты\b|кошк|собак|щен|котен|котёнок|выдр|хомяк|птиц|животн|питомц|зоопарк|\bпес\b|кролик|попуг|черепах"),
    "games": ("Игры", "компьютерные, настолки, любимые игры",
              r"игр[аыуе]\b|гейм|плейстейшн|playstation|стим\b|steam|майнкрафт|minecraft|настолк|геймер|играть|уровень|босс\b|геншин|ферма"),
    "work": ("Работа и учёба", "дела, проекты, экзамены, планы на неделю",
             r"работ[аеуы]|учеб|универ|институт|экзамен|сессия|начальник|коллег|проект|дедлайн|совещани|зарплат|курс\b|лекци|диплом|офис|смена\b"),
    "books": ("Книги", "что читаешь, любимые авторы",
              r"книг|читаю|читал|автор\b|роман\b|глава\b|библиотек|литератур|стихи|рассказ\b|фантастик|детектив"),
    "gifts": ("Подарки и праздники", "сюрпризы, дни рождения, цветы",
              r"подар|праздник|день рождени|сюрприз|новый год|8 марта|годовщин|открытк|цветы\b|букет|юбилей|поздравл"),
    "home": ("Дом и уют", "квартира, ремонт, пледы, свечи",
             r"\bдом\b|квартир|уют|диван|плед\b|мебел|ремонт|уборк|посуд|стирк|свеч[иа]|шторы|комнат|кровать"),
    "health": ("Здоровье и спорт", "тренировки, сон, прогулки",
               r"спорт|трениров|\bзал\b|\bбег\b|йога|здоровь|врач|болит|выспал|диет|прогулк|шаги\b|зарядк|бассейн|велосипед"),
    "feelings": ("Чувства и настроение", "как ты, что на душе, чем вдохновлён",
                 r"чувству|настроени|эмоци|переживаю|грустн|счастл|тревож|волнуюсь|вдохновл|устал|на душе|радост|обидн"),
}

W_TIMES = ("раз", "раза", "раз")
W_MSG = ("сообщение", "сообщения", "сообщений")
W_COIN = ("монета", "монеты", "монет")
W_Q = ("вопрос", "вопроса", "вопросов")

TEMPL = {}


# события, которые приходят из чата (а не из игры)
CHAT_EVENTS = {"msgs", "love", "praise", "proud", "beauty", "compliment", "miss", "thanks", "hug", "kiss", "nick",
               "laugh", "hearts", "gm", "gn", "howru", "support", "date", "detail", "ask", "long", "night", "morning",
               "affection", "compl_any", "photo", "voice"}


def _t(tid, cat, ev, lo, hi, text, w=W_TIMES, both=False, hint=None, topic=False, need=None):
    """Шаблон задания. text: «{pet}» {partner} {n} {w}; both — должны участвовать оба;
    need — что должно быть у питомца, чтобы задание имело смысл ('wear' — есть одежда, 'furn' — есть мебель)."""
    TEMPL[tid] = {"id": tid, "cat": cat, "ev": ev, "rng": (lo, hi), "text": text, "w": w, "both": both,
                  "hint": hint, "topic": topic, "need": need, "chat": ev in CHAT_EVENTS or ev.startswith("topic:")}


# ---- 1. уход за питомцем (действия в игре, считаются от обоих) ----
_t("feed", 1, "feed", 2, 4, "Покормить «{pet}»: {n} {w}")
_t("play", 1, "play", 4, 8, "Поиграть с «{pet}»: {n} {w}")
_t("sleep", 1, "sleep", 1, 1, "Уложить «{pet}» спать")
_t("pet", 1, "pet", 15, 30, "Погладить «{pet}»: {n} {w}")
_t("fancy", 1, "fancy", 1, 3, "Угостить «{pet}» едой из запаса (не обычной рыбкой): {n} {w}")
_t("move", 1, "move", 4, 8, "Прогулять «{pet}» по комнатам: {n} {w}")

# ---- 2. хозяйство (игра: монеты, магазин, дом) ----
_t("earn", 2, "earn", 40, 90, "Заработать монеты: {n} {w}", W_COIN)
_t("spend", 2, "spend", 30, 80, "Потратить монеты (еда, одежда, мебель): {n} {w}", W_COIN)
_t("buy_food", 2, "buy_food", 2, 4, "Купить еду про запас: {n} {w}")
_t("buy_wear", 2, "buy_wear", 1, 1, "Купить обновку для «{pet}»")
_t("buy_furn", 2, "buy_furn", 1, 1, "Купить мебель для дома")
_t("xp", 2, "xp", 30, 60, "Набрать опыт: {n} XP")
_t("wear", 2, "wear", 1, 3, "Переодеть «{pet}»: {n} {w}", need="wear")
_t("place", 2, "place", 1, 3, "Расставить мебель в доме: {n} {w}", need="furn")

# ---- 2. общий чат (считаются слова любого из вас) ----
_t("love", 2, "love", 1, 5, "Скажите друг другу «люблю тебя»: {n} {w}")
_t("msgs", 2, "msgs", 15, 30, "Напишите вместе в общий чат {n} {w}", W_MSG, both=True)
_t("praise", 2, "praise", 1, 3, "Похвалите друг друга: «умничка» или «молодец» — {n} {w}")
_t("miss", 2, "miss", 1, 3, "Скажите «скучаю»: {n} {w}")
_t("thanks", 2, "thanks", 2, 4, "Скажите друг другу «спасибо»: {n} {w}")
_t("hug", 2, "hug", 1, 3, "Обнимите друг друга в чате (обнимаю, обнимашки, 🤗): {n} {w}")
_t("kiss", 2, "kiss", 1, 3, "Отправьте виртуальный поцелуй (целую, чмок, 😘): {n} {w}")
_t("nick", 2, "nick", 2, 4, "Назовите друг друга ласково (зайка, солнышко, малыш…): {n} {w}")
_t("laugh", 2, "laugh", 3, 6, "Посмейтесь вместе (хаха, 😂): {n} {w}")
_t("hearts", 2, "hearts", 3, 6, "Отправьте сердечки ❤️: {n} {w}")
_t("gm", 2, "gm", 1, 1, "Пожелайте друг другу доброго утра")
_t("gn", 2, "gn", 1, 1, "Пожелайте друг другу спокойной ночи")
_t("howru", 2, "howru", 1, 2, "Спросите, как дела или как прошёл день: {n} {w}")
_t("photo", 2, "photo", 1, 2, "Отправьте фото в чат: {n} шт.")
_t("voice", 2, "voice", 1, 2, "Запишите голосовое или кружок: {n} шт.")
_t("ask", 2, "ask", 3, 5, "Задайте друг другу вопросы (сообщения со знаком «?»): {n} {w}", W_Q)

# ---- 3. личные (у каждого свой набор, см. PERSONAL_POOLS) ----
# Ярослав → Полина
_t("y_beauty", 3, "beauty", 1, 5, "Скажи, что {partner} красивая: {n} {w}")
_t("y_feed", 3, "feed", 1, 3, "Покорми «{pet}»: {n} {w}")
_t("y_love", 3, "love", 1, 3, "Признайся ей в любви: {n} {w}")
_t("y_detail", 3, "detail", 1, 2, "Сделай ей комплимент про глаза, улыбку, голос или волосы: {n} {w}")
_t("y_thanks", 3, "thanks", 1, 3, "Поблагодари её за что-нибудь: {n} {w}")
_t("y_nick", 3, "nick", 2, 4, "Назови её ласково: {n} {w}")
_t("y_hug", 3, "hug", 1, 3, "Обними её в чате: {n} {w}")
_t("y_date", 3, "date", 1, 1, "Предложи ей сходить куда-нибудь вместе")
_t("y_voice", 3, "voice", 1, 2, "Отправь ей голосовое или кружок: {n} шт.")
_t("y_photo", 3, "photo", 1, 1, "Пришли ей фото: что видишь вокруг или чем занят")
_t("y_howru", 3, "howru", 1, 2, "Спроси её, как дела или как прошёл день: {n} {w}")
_t("y_support", 3, "support", 1, 2, "Поддержи её тёплым словом (я рядом, верю в тебя, у тебя получится): {n} {w}")
_t("y_pet", 3, "pet", 10, 20, "Погладь «{pet}»: {n} {w}")
_t("y_play", 3, "play", 1, 3, "Поиграй с «{pet}»: {n} {w}")
_t("y_gm", 3, "gm", 1, 1, "Пожелай ей доброго утра")
_t("y_gn", 3, "gn", 1, 1, "Пожелай ей спокойной ночи")
_t("y_proud", 3, "proud", 1, 2, "Скажи ей, что гордишься ею: {n} {w}")
# Полина → Ярослав
_t("p_praise", 3, "praise", 1, 5, "Скажи, что {partner} молодец или умничка: {n} {w}")
_t("p_play", 3, "play", 1, 4, "Поиграй с «{pet}»: {n} {w}")
_t("p_feed", 3, "feed", 1, 3, "Покорми «{pet}»: {n} {w}")
_t("p_love", 3, "love", 1, 3, "Признайся ему в любви: {n} {w}")
_t("p_compl", 3, "compliment", 1, 3, "Сделай ему комплимент (классный, крутой, сильный, лучший): {n} {w}")
_t("p_thanks", 3, "thanks", 1, 3, "Поблагодари его за что-нибудь: {n} {w}")
_t("p_nick", 3, "nick", 2, 4, "Назови его ласково: {n} {w}")
_t("p_hug", 3, "hug", 1, 3, "Обними его в чате: {n} {w}")
_t("p_date", 3, "date", 1, 1, "Предложи ему свидание или уютный вечер")
_t("p_voice", 3, "voice", 1, 2, "Отправь ему голосовое или кружок: {n} шт.")
_t("p_photo", 3, "photo", 1, 1, "Пришли ему фото: что видишь вокруг или чем занята")
_t("p_howru", 3, "howru", 1, 2, "Спроси его, как дела или как прошёл день: {n} {w}")
_t("p_support", 3, "support", 1, 2, "Поддержи его тёплым словом (я рядом, верю в тебя, у тебя получится): {n} {w}")
_t("p_pet", 3, "pet", 10, 20, "Погладь «{pet}»: {n} {w}")
_t("p_wear", 3, "wear", 1, 1, "Переодень «{pet}» в обновку")
_t("p_place", 3, "place", 1, 1, "Переставь мебель в доме «{pet}»")
_t("p_gm", 3, "gm", 1, 1, "Пожелай ему доброго утра")
_t("p_gn", 3, "gn", 1, 1, "Пожелай ему спокойной ночи")
_t("p_proud", 3, "proud", 1, 2, "Скажи ему, что гордишься им: {n} {w}")
# для всех остальных (если в игре появится кто-то ещё)
_t("g_compl", 3, "compliment", 1, 3, "Сделай партнёру комплимент: {n} {w}")
_t("g_love", 3, "love", 1, 3, "Признайся партнёру в любви: {n} {w}")
_t("g_thanks", 3, "thanks", 1, 3, "Поблагодари партнёра за что-нибудь: {n} {w}")
_t("g_nick", 3, "nick", 2, 4, "Назови партнёра ласково: {n} {w}")
_t("g_hug", 3, "hug", 1, 3, "Обними партнёра в чате: {n} {w}")
_t("g_howru", 3, "howru", 1, 2, "Спроси партнёра, как дела: {n} {w}")
_t("g_gm", 3, "gm", 1, 1, "Пожелай партнёру доброго утра")
_t("g_pet", 3, "pet", 10, 20, "Погладь «{pet}»: {n} {w}")
_t("g_play", 3, "play", 1, 3, "Поиграй с «{pet}»: {n} {w}")
_t("g_feed", 3, "feed", 1, 3, "Покорми «{pet}»: {n} {w}")

# ---- 3. личные ВНУТРИИГРОВЫЕ (у каждого свои; считаются только действия этого человека) ----
_t("yg_feed", 3, "feed", 1, 4, "Покорми «{pet}»: {n} {w}")
_t("yg_fancy", 3, "fancy", 1, 2, "Угости «{pet}» вкусной едой из запаса: {n} {w}")
_t("yg_pet", 3, "pet", 10, 25, "Погладь «{pet}»: {n} {w}")
_t("yg_food", 3, "buy_food", 1, 3, "Купи «{pet}» еды про запас: {n} {w}")
_t("yg_earn", 3, "earn", 30, 70, "Заработай монеты: {n} {w}", W_COIN)
_t("yg_place", 3, "place", 1, 2, "Обустрой дом: расставь мебель {n} {w}", need="furn")
_t("yg_xp", 3, "xp", 20, 40, "Набери опыт для «{pet}»: {n} XP")
_t("yg_move", 3, "move", 3, 6, "Проведи «{pet}» по комнатам: {n} {w}")
_t("pg_play", 3, "play", 1, 5, "Поиграй с «{pet}»: {n} {w}")
_t("pg_pet", 3, "pet", 10, 25, "Погладь «{pet}»: {n} {w}")
_t("pg_wear", 3, "wear", 1, 2, "Переодень «{pet}»: {n} {w}", need="wear")
_t("pg_buywear", 3, "buy_wear", 1, 1, "Купи для «{pet}» обновку")
_t("pg_buyfurn", 3, "buy_furn", 1, 1, "Купи что-нибудь для уюта в доме")
_t("pg_earn", 3, "earn", 30, 70, "Заработай монеты: {n} {w}", W_COIN)
_t("pg_sleep", 3, "sleep", 1, 1, "Уложи «{pet}» спать")
_t("pg_xp", 3, "xp", 20, 40, "Набери опыт для «{pet}»: {n} XP")
_t("gg_feed", 3, "feed", 1, 3, "Покорми «{pet}»: {n} {w}")
_t("gg_play", 3, "play", 1, 4, "Поиграй с «{pet}»: {n} {w}")
_t("gg_pet", 3, "pet", 10, 25, "Погладь «{pet}»: {n} {w}")
_t("gg_earn", 3, "earn", 30, 70, "Заработай монеты: {n} {w}", W_COIN)
_t("gg_xp", 3, "xp", 20, 40, "Набери опыт: {n} XP")
_t("gg_move", 3, "move", 3, 6, "Проведи «{pet}» по комнатам: {n} {w}")
_t("gg_sleep", 3, "sleep", 1, 1, "Уложи «{pet}» спать")

# ---- 4. испытания (в игре) ----
_t("h_play", 4, "play", 10, 14, "Поиграть с «{pet}»: {n} {w}")
_t("h_feed", 4, "feed", 5, 7, "Покормить «{pet}»: {n} {w}")
_t("h_pet", 4, "pet", 60, 100, "Погладить «{pet}»: {n} {w}")
_t("h_earn", 4, "earn", 150, 250, "Заработать монеты: {n} {w}", W_COIN)
_t("h_xp", 4, "xp", 80, 150, "Набрать опыт: {n} XP")
_t("h_level", 4, "level", 1, 1, "Получить новый уровень")
_t("h_spend", 4, "spend", 100, 200, "Потратить монеты в магазине: {n} {w}", W_COIN)
_t("h_shop", 4, "buy", 3, 4, "Сделать покупки: {n} {w}")

# ---- 4. испытания про чат (выключены, пока CHAT_QUESTS = False) ----
_t("big_msgs", 4, "msgs", 50, 100, "Напишите вместе {n} {w} в общий чат", W_MSG, both=True)
_t("big_voice", 4, "voice", 3, 6, "Обменяйтесь голосовыми или кружками: {n} шт.", both=True)
_t("big_photo", 4, "photo", 3, 5, "Поделитесь фото из своего дня: {n} шт.", both=True)
_t("big_ask", 4, "ask", 8, 12, "Узнайте друг друга получше — задайте вопросы (со знаком «?»): {n} {w}", W_Q, both=True)
_t("big_long", 4, "long", 2, 4, "Напишите длинное душевное сообщение (от 200 символов): {n} {w}", W_MSG)
_t("big_night", 4, "night", 15, 25, "Ночной разговор после 22:00: {n} {w}", W_MSG, both=True)
_t("big_morning", 4, "morning", 10, 15, "Утренняя переписка с 6 до 11: {n} {w}", W_MSG, both=True)
_t("big_affect", 4, "affection", 10, 15, "Море нежности (люблю, скучаю, обнимашки, поцелуи, сердечки): {n} {w}", W_MSG, both=True)
_t("big_compl", 4, "compl_any", 6, 10, "Осыпьте друг друга комплиментами и похвалой: {n} {w}", W_MSG, both=True)
for _k, (_label, _hint, _rx) in TOPICS.items():
    _t("t_" + _k, 4, "topic:" + _k, 6, 10, "Поговорите на тему «" + _label + "»: {n} {w} по теме",
       W_MSG, both=True, hint="Например: " + _hint, topic=True)


def plural(n: int, forms) -> str:
    n = abs(int(n)) % 100
    if 11 <= n <= 14:
        return forms[2]
    n %= 10
    return forms[0] if n == 1 else forms[1] if 2 <= n <= 4 else forms[2]


# ---------------------------------------------------------------------------
# РАСПОЗНАВАНИЕ ФРАЗ В ЧАТЕ
# ---------------------------------------------------------------------------
def _rx(p):
    return re.compile(p)


RX = {
    "praise": _rx(r"умничк|умниц|молодец|молодчин|умняш|так держать"),
    "proud": _rx(r"горжусь|гордимся|я горжу"),
    "beauty": _rx(r"красив|красот|красавиц|красавч|симпатичн|прелестн|шикарн|обворожительн|милашк|привлекательн"),
    "compliment": _rx(r"классн|крутой|крутая|крутой|лучш|сильн(ый|ая)|умн(ый|ая|ица)|потрясающ|восхитительн|чудесн|замечательн|идеальн|обожаю|талантлив|невероятн|офигенн"),
    "miss": _rx(r"скучаю|соскучил|скучал"),
    "thanks": _rx(r"спасибо|благодарю|\bспс\b|благодарен|благодарна|мерси"),
    "hug": _rx(r"обним|обнимаю|обнимашк|🤗|прижм|в объят"),
    "kiss": _rx(r"целую|чмок|поцел|😘|💋"),
    "nick": _rx(r"зайк|зайчик|солнышк|солнце мо[её]|мо[её] солнце|котик|котен|котён|кисуль|кисонька|малыш|любим(ый|ая|ка|ок)\b|родн(ой|ая)\b|милый|милая|милашк|лапочк|сладк(ий|ая|ое)|принцесс|красотк|детка|дорог(ой|ая)\b|крошк|пупс|ласточк|бусинк|масик|мурзик|ёжик|ежик|зая\b"),
    "laugh": _rx(r"ха-?ха|ахах|хах|хех|\bлол\b|\bкек\b|ржу|смешно|😂|🤣|😆|😹"),
    "hearts": _rx("[❤♥💕💞💓💗💖💘💝💟🧡💛💚💙💜🖤🤍🤎]"),
    "gm": _rx(r"доброе утро|доброго утра|с добрым утром|утречк|доброе утречко"),
    "gn": _rx(r"спокойной ночи|споки|сладких снов|доброй ночи|добрых снов|спокойночи"),
    "howru": _rx(r"как дела|как ты\b|как день|как прош[её]л|как настроение|как самочувств|как себя чувствуешь|как у тебя|как твои дела"),
    "support": _rx(r"я рядом|я с тобой|держись|получится|верю в тебя|справишься|не переживай|не волнуйся|будет хорошо|всё наладится|все наладится"),
    "date": _rx(r"свидани|сходим|пойд[её]м|погуляем|в кафе|в ресторан|на прогулк|встретимся|уютный вечер|вечером вместе"),
    "detail": _rx(r"глаз|улыбк|голос|волос|смех\b|взгляд|ресниц|губ"),
    "positive": _rx(r"красив|нрав|любл|обожа|прекрасн|классн|мил|чудесн|шикарн|потрясающ|восхитительн|очаровательн|заразительн|тёпл|тепл"),
}
RX_LOVE_OBJ = _rx(r"тебя|тя\b|тебе|вас\b")
TOPIC_RX = {k: _rx(v[2]) for k, v in TOPICS.items()}


def detect(text: str, kind: str, hour: float) -> dict:
    """Какие события случились в одном сообщении -> {событие: 1}. Каждое — максимум раз на сообщение."""
    t = (text or "").lower()
    ev = {"msgs": 1}
    if kind == "voice" or kind == "video_note":
        ev["voice"] = 1
    elif kind == "photo":
        ev["photo"] = 1
    if "?" in t:
        ev["ask"] = 1
    if len(text or "") >= 200:
        ev["long"] = 1
    if hour >= 22 or hour < 7:
        ev["night"] = 1
    if 6 <= hour < 11:
        ev["morning"] = 1
    if not t:
        return ev
    for key in ("praise", "proud", "beauty", "compliment", "miss", "thanks", "hug", "kiss", "nick",
                "laugh", "hearts", "gm", "gn", "howru", "support", "date"):
        if RX[key].search(t):
            ev[key] = 1
    if "люблю" in t and "не люблю" not in t and (RX_LOVE_OBJ.search(t) or len(t.split()) <= 2):
        ev["love"] = 1
    if RX["detail"].search(t) and RX["positive"].search(t):
        ev["detail"] = 1
    if "beauty" in ev:
        ev["compliment"] = 1
    if any(k in ev for k in ("love", "miss", "hug", "kiss", "nick", "hearts")):
        ev["affection"] = 1
    if any(k in ev for k in ("praise", "beauty", "compliment", "proud")):
        ev["compl_any"] = 1
    for key, rx in TOPIC_RX.items():
        if rx.search(t):
            ev["topic:" + key] = 1
    return ev


# ---------------------------------------------------------------------------
# ДЕНЬ, ГЕНЕРАЦИЯ, БАЗА
# ---------------------------------------------------------------------------
def init(cur) -> None:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pet_quests (
            pet_key TEXT NOT NULL,
            day TEXT NOT NULL,
            qkey TEXT NOT NULL,
            cat INT NOT NULL,
            tmpl TEXT NOT NULL,
            ev TEXT NOT NULL,
            owner BIGINT,
            target INT NOT NULL,
            progress INT NOT NULL DEFAULT 0,
            by_user TEXT NOT NULL DEFAULT '{}',
            needs_both BOOLEAN NOT NULL DEFAULT FALSE,
            done BOOLEAN NOT NULL DEFAULT FALSE,
            claimed BOOLEAN NOT NULL DEFAULT FALSE,
            coins INT NOT NULL DEFAULT 0,
            xp INT NOT NULL DEFAULT 0,
            item TEXT,
            PRIMARY KEY (pet_key, day, qkey)
        );
    """)


def _local(now: float, tz: str) -> datetime:
    return datetime.fromtimestamp(now, ZoneInfo(tz)) - timedelta(hours=DAY_START_HOUR)


def day_key(now: float, tz: str) -> str:
    return _local(now, tz).strftime("%Y-%m-%d")


def day_end(now: float, tz: str) -> float:
    d = _local(now, tz).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    return (d + timedelta(hours=DAY_START_HOUR)).timestamp()


def personal_pool(owner) -> list:
    ids = PERSONAL_POOLS.get(owner) or DEFAULT_PERSONAL
    return [TEMPL[i] for i in ids if i in TEMPL]


def _generate(day: str, cat: int, owner: int, owned=None) -> list:
    """owned — какие виды вещей есть у питомца ({'wear','furn'}); None — не фильтровать."""
    rng = random.Random(f"{day}:{cat}:{owner}")
    pool = personal_pool(owner) if cat == 3 else [t for t in TEMPL.values() if t["cat"] == cat]
    pool = [t for t in pool if (CHAT_QUESTS or not t["chat"]) and not (t["need"] and owned is not None and t["need"] not in owned)]
    pool = sorted(pool, key=lambda t: t["id"])
    rng.shuffle(pool)
    picked, used, topic_taken = [], set(), False
    for t in pool:
        if t["ev"] in used or (t["topic"] and topic_taken):
            continue
        picked.append(t)
        used.add(t["ev"])
        topic_taken = topic_taken or t["topic"]
        if len(picked) >= PER_DAY[cat]:
            break
    rows = []
    for t in sorted(picked, key=lambda t: t["id"]):
        lo, hi = t["rng"]
        n = rng.randint(lo, hi)
        pos = (n - lo) / (hi - lo) if hi > lo else 0.5          # чем тяжелее вариант, тем выше награда
        rw = REWARD[cat]
        rows.append({
            "qkey": f"{cat}:{owner or 0}:{t['id']}", "cat": cat, "tmpl": t["id"], "ev": t["ev"],
            "owner": owner or None, "target": n, "both": t["both"],
            "coins": int(round(rw["coins"] * (0.8 + 0.4 * pos) / 5.0) * 5),
            "xp": int(round(rw["xp"] * (0.8 + 0.4 * pos))),
            "item": rng.choice(rw["items"]) if rw["items"] else None,
        })
    return rows


def ensure_daily(cur, pet_key: str, day: str, users: list, owned=None) -> None:
    """Если за сегодня заданий ещё нет — создаёт их (случайно, но одинаково для обоих)."""
    cur.execute("SELECT cat, owner FROM pet_quests WHERE pet_key = %s AND day = %s GROUP BY cat, owner", (pet_key, day))
    have = {(c, o or 0) for c, o in cur.fetchall()}
    blocks = [(1, 0), (2, 0), (4, 0)] + [(3, u) for u in users]
    made = False
    for cat, owner in blocks:
        if (cat, owner) in have:
            continue
        for r in _generate(day, cat, owner, owned):
            cur.execute(
                "INSERT INTO pet_quests (pet_key, day, qkey, cat, tmpl, ev, owner, target, needs_both, coins, xp, item)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
                " ON CONFLICT (pet_key, day, qkey) DO NOTHING",
                (pet_key, day, r["qkey"], r["cat"], r["tmpl"], r["ev"], r["owner"], r["target"],
                 r["both"], r["coins"], r["xp"], r["item"]))
        made = True
    if made:
        old = (datetime.strptime(day, "%Y-%m-%d") - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
        cur.execute("DELETE FROM pet_quests WHERE pet_key = %s AND day < %s", (pet_key, old))


def _is_done(target: int, progress: int, both: bool, by: dict, users: list) -> bool:
    if progress < target:
        return False
    if both and len(users) >= 2:
        need = max(1, target // 4)          # каждый должен внести хотя бы четверть
        return all(by.get(str(u), 0) >= need for u in users)
    return True


def bump(cur, pet_key: str, day: str, uid: int, events: dict, users: list) -> list:
    """Прибавляет прогресс всем подходящим заданиям. Возвращает [(cat, tmpl, owner, target)] только что выполненных."""
    cur.execute(
        "SELECT qkey, cat, tmpl, owner, ev, target, progress, by_user, needs_both FROM pet_quests"
        " WHERE pet_key = %s AND day = %s AND done = FALSE" + FOR_UPDATE, (pet_key, day))
    finished = []
    for qkey, cat, tmpl, owner, ev, target, progress, by_user, both in cur.fetchall():
        n = events.get(ev)
        if not n or (owner and owner != uid):
            continue
        try:
            by = json.loads(by_user or "{}")
        except ValueError:
            by = {}
        by[str(uid)] = by.get(str(uid), 0) + n
        progress = min(target, progress + n)
        done = _is_done(target, progress, both, by, users)
        cur.execute(
            "UPDATE pet_quests SET progress = %s, by_user = %s, done = %s WHERE pet_key = %s AND day = %s AND qkey = %s",
            (progress, json.dumps(by), done, pet_key, day, qkey))
        if done:
            finished.append((cat, tmpl, owner, target))
    return finished


def render_text(tmpl_id: str, target: int, pet: str, partner: str) -> str:
    t = TEMPL.get(tmpl_id)
    if not t:
        return ""
    return t["text"].format(pet=pet, partner=partner, n=target, w=plural(target, t["w"]))


def view(cur, pet_key: str, day: str, uid: int, users: list, names: dict, pet_name: str, now: float, tz: str) -> dict:
    """Задания дня для одного игрока (общие + его личные)."""
    others = [u for u in users if u != uid]
    partner = names.get(others[0]) if others else None
    partner = partner or "партнёр"
    cur.execute(
        "SELECT qkey, cat, tmpl, target, progress, needs_both, done, claimed, coins, xp, item, owner, by_user FROM pet_quests"
        " WHERE pet_key = %s AND day = %s AND (owner IS NULL OR owner = %s) ORDER BY cat, qkey", (pet_key, day, uid))
    items = []
    for qkey, cat, tmpl, target, progress, both, done, claimed, coins, xp, item, owner, by_user in cur.fetchall():
        t = TEMPL.get(tmpl)
        if not t:
            continue
        q = {"id": qkey, "cat": cat, "text": render_text(tmpl, target, pet_name, partner), "hint": t["hint"],
             "target": target, "progress": min(progress, target), "done": bool(done), "claimed": bool(claimed),
             "coins": coins, "xp": xp, "item": item, "mine": owner is not None, "both": bool(both) and len(users) >= 2}
        if q["both"]:
            try:
                by = json.loads(by_user or "{}")
            except ValueError:
                by = {}
            q["me"] = by.get(str(uid), 0)
            q["them"] = by.get(str(others[0]), 0) if others else 0
            q["need"] = max(1, target // 4)
        items.append(q)
    cur.execute("SELECT COUNT(*) FROM pet_quests WHERE pet_key = %s AND day = %s AND claimed = FALSE", (pet_key, day))
    left = cur.fetchone()[0]
    return {"day": day, "ends": day_end(now, tz), "cats": {str(k): v for k, v in CATS.items()},
            "items": items, "all_claimed": bool(items) and left == 0,
            "bonus": {"coins": DAY_BONUS["coins"], "xp": DAY_BONUS["xp"], "item": DAY_BONUS["item"]}}


def claim(cur, pet_key: str, day: str, qkey: str, uid: int):
    """Помечает награду полученной. Возвращает (статус, награда)."""
    cur.execute(
        "SELECT owner, done, claimed, coins, xp, item FROM pet_quests WHERE pet_key = %s AND day = %s AND qkey = %s" + FOR_UPDATE,
        (pet_key, day, qkey))
    row = cur.fetchone()
    if not row:
        return "none", None
    owner, done, claimed, coins, xp, item = row
    if owner and owner != uid:
        return "forbidden", None
    if not done:
        return "not_done", None
    if claimed:
        return "claimed", None
    cur.execute("UPDATE pet_quests SET claimed = TRUE WHERE pet_key = %s AND day = %s AND qkey = %s", (pet_key, day, qkey))
    cur.execute("SELECT COUNT(*) FROM pet_quests WHERE pet_key = %s AND day = %s AND claimed = FALSE", (pet_key, day))
    return "ok", {"coins": coins, "xp": xp, "item": item, "last": cur.fetchone()[0] == 0}
