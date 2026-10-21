"""Погода: геокодинг, прогноз и красивое форматирование.

Часть бывшего app.py — код перенесён без изменений логики."""

import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

import httpx

# --- ФУНКЦИЯ ПОГОДЫ ---


WIND_DIRS = {
    "N": "С", "NNE": "С-СВ", "NE": "СВ", "ENE": "В-СВ", "E": "В", "ESE": "В-ЮВ",
    "SE": "ЮВ", "SSE": "Ю-ЮВ", "S": "Ю", "SSW": "Ю-ЮЗ", "SW": "ЮЗ", "WSW": "З-ЮЗ",
    "W": "З", "WNW": "З-СЗ", "NW": "СЗ", "NNW": "С-СЗ",
}
WEATHER_ICONS = (
    (("гроза", "thunder"), "⛈"), (("снег", "snow", "метел", "sleet"), "🌨"),
    (("дожд", "ливень", "морос", "rain", "drizzle", "shower"), "🌧"),
    (("туман", "дымка", "fog", "mist"), "🌫"), (("пасмурно", "overcast"), "☁️"),
    (("облачно", "cloud"), "⛅"), (("ясно", "солнечно", "sunny", "clear"), "☀️"),
)


def _t(value) -> str:
    """Температура со знаком: +5°, −3°."""
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return "?"
    return "0°" if n == 0 else f"{n:+d}°".replace("-", "−")


def _clock24(value) -> str:
    """'06:20 PM' -> '18:20' (wttr.in отдаёт восход и закат в 12-часовом формате)."""
    try:
        return datetime.strptime(str(value).strip(), "%I:%M %p").strftime("%H:%M")
    except ValueError:
        return str(value).strip()[:5]


def _ru(item) -> str:
    """Описание погоды: русское, если есть, иначе английское."""
    for key in ("lang_ru", "weatherDesc"):
        try:
            return item[key][0]["value"].strip()
        except (KeyError, IndexError, TypeError):
            continue
    return ""


def weather_icon(description: str) -> str:
    d = description.casefold()
    for words, icon in WEATHER_ICONS:
        if any(w in d for w in words):
            return icon
    return "🌡"


def format_weather(data: dict, city: str) -> str:
    """Красивая сводка из JSON wttr.in (формат j1)."""
    cur = data["current_condition"][0]
    title = city
    desc = _ru(cur)
    pressure = ""
    try:
        pressure = f" · 🧭 {round(float(cur['pressure']) * 0.750062)} мм рт. ст."
    except (KeyError, TypeError, ValueError):
        pass
    wind_dir = WIND_DIRS.get(cur.get("winddir16Point", ""), cur.get("winddir16Point", ""))
    try:
        wind = round(float(cur["windspeedKmph"]) / 3.6)
        wind_text = f"💨 ветер {wind} м/с {wind_dir}".strip()
    except (KeyError, TypeError, ValueError):
        wind_text = ""

    lines = [
        f"{weather_icon(desc)} {title}",
        f"Сейчас {_t(cur.get('temp_C'))}, ощущается как {_t(cur.get('FeelsLikeC'))}"
        + (f", {desc.lower()}" if desc else ""),
        " · ".join(
            x for x in (f"💧 влажность {cur.get('humidity', '?')}%", wind_text) if x
        ) + pressure,
    ]
    try:
        uv = int(cur.get("uvIndex", 0))
        if uv >= 6:
            lines.append(f"🕶 высокий UV-индекс: {uv}")
    except (TypeError, ValueError):
        pass

    days = data.get("weather") or []
    try:
        astro = days[0]["astronomy"][0]
        lines.append(f"🌅 восход {_clock24(astro['sunrise'])} · закат {_clock24(astro['sunset'])}")
    except (KeyError, IndexError, TypeError):
        pass

    names = ["Сегодня", "Завтра", "Послезавтра"]
    forecast = []
    for name, day in zip(names, days[:3]):
        try:
            hourly = day.get("hourly") or []
            chance = max(
                [int(h.get("chanceofrain", 0)) for h in hourly]
                + [int(h.get("chanceofsnow", 0)) for h in hourly] + [0]
            )
            noon = hourly[len(hourly) // 2] if hourly else {}
            icon = weather_icon(_ru(noon)) if noon else "•"
            rain = f", осадки до {chance}%" if chance >= 30 else ""
            forecast.append(
                f"{icon} {name}: {_t(day['mintempC'])}…{_t(day['maxtempC'])}{rain}"
            )
        except (KeyError, TypeError, ValueError):
            continue
    if forecast:
        lines.append("")
        lines.extend(forecast)
    return "\n".join(lines)


DEFAULT_CITY = os.getenv("DEFAULT_CITY", "Омск")
_geo_cache = {}   # запрос -> (время, список мест)
_wx_cache = {}    # (lat, lon) -> (время, текст)
CACHE_TTL = 600


def _http() -> "httpx.Client":
    return httpx.Client(
        timeout=8.0, follow_redirects=True,
        headers={"User-Agent": "curl/8.0", "Accept-Language": "ru"},
    )


def geocode(name: str, count: int = 3):
    """Находит места по названию (Open-Meteo): точные названия и координаты.

    Возвращает список {"title", "lat", "lon"}; пусто, если ничего не нашлось
    или сервис недоступен.
    """
    name = " ".join(str(name or "").split())[:60]
    if len(name) < 2:
        return []
    key = (name.casefold(), count)
    cached = _geo_cache.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    try:
        with _http() as http:
            response = http.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": name, "count": count, "language": "ru", "format": "json"},
            )
            response.raise_for_status()
            results = response.json().get("results") or []
    except Exception as e:
        logging.warning(f"Геокодинг не сработал для «{name}»: {e}")
        return []

    places = []
    for r in results:
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        parts = []
        for part in (r.get("name"), r.get("admin1"), r.get("country")):
            if part and part not in parts:
                parts.append(part)
        places.append({"title": ", ".join(parts), "lat": lat, "lon": lon,
                       "name": str(r.get("name") or "")})
    # убираем повторы: одинаковые названия или почти те же координаты
    unique = []
    for p in places:
        if not any(p["title"] == q["title"] or
                   (abs(p["lat"] - q["lat"]) < 0.08 and abs(p["lon"] - q["lon"]) < 0.08)
                   for q in unique):
            unique.append(p)
    places = unique
    if len(_geo_cache) > 200:
        _geo_cache.clear()
    _geo_cache[key] = (time.time(), places)
    return places


def get_weather(city: str, place: dict = None) -> str:
    """Погода через wttr.in (httpx): подробная сводка и прогноз на 3 дня.

    Если место известно (из геокодинга), запрос идёт по координатам, поэтому
    город всегда тот, что нужен. Иначе название сначала уточняется геокодером.
    """
    city = " ".join(str(city or "").split())[:60] or DEFAULT_CITY
    if place is None:
        found = geocode(city, 1)
        place = found[0] if found else None
    if place:
        query, title = f"{place['lat']:.3f},{place['lon']:.3f}", place["title"]
    else:
        query, title = city, city

    cached = _wx_cache.get(query)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    try:
        with _http() as http:
            response = http.get(
                f"https://wttr.in/{urllib.parse.quote(query)}",
                params={"format": "j1", "lang": "ru"},
            )
            response.raise_for_status()
            try:
                text = format_weather(response.json(), title)
            except (ValueError, KeyError, IndexError, TypeError) as e:
                logging.warning(f"Погода: нестандартный ответ ({e}), беру краткий формат")
                short = http.get(
                    f"https://wttr.in/{urllib.parse.quote(query)}",
                    params={"format": "3", "lang": "ru"},
                )
                short.raise_for_status()
                return short.text.strip()
    except Exception as e:
        logging.error(f"Ошибка получения погоды: {e}")
        return f"Не удалось получить погоду для города: {city}"
    if len(_wx_cache) > 200:
        _wx_cache.clear()
    _wx_cache[query] = (time.time(), text)
    return text
