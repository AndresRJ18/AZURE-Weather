"""
Azure Weather Function
Endpoint: GET /api/weather?city={city}
Returns normalized current weather + 5-day forecast from OpenWeatherMap.
"""

import json
import logging
import os

import azure.functions as func
import requests

# ── Constants ──────────────────────────────────────────────────────────────────
OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"
TIMEOUT_SECONDS = 8


def main(req: func.HttpRequest) -> func.HttpResponse:
    """HTTP trigger entry point."""
    logging.info("WeatherFunction triggered.")

    # ── 1. Validate input ──────────────────────────────────────────────────────
    city: str = req.params.get("city", "").strip()
    if not city:
        return _error(400, "Missing required parameter: city")

    # ── 2. Read API key from environment ───────────────────────────────────────
    api_key: str = os.environ.get("OPENWEATHER_API_KEY", "")
    if not api_key:
        logging.error("OPENWEATHER_API_KEY is not configured.")
        return _error(500, "Server configuration error: missing API key")

    # ── 3. Fetch data from OpenWeatherMap ──────────────────────────────────────
    try:
        current = _fetch_current(city, api_key)
        forecast = _fetch_forecast(city, api_key)
    except requests.exceptions.Timeout:
        return _error(504, "Upstream API timed out. Please try again.")
    except requests.exceptions.RequestException as exc:
        logging.exception("OpenWeather request failed: %s", exc)
        return _error(502, "Failed to reach weather service.")

    # ── 4. Handle upstream errors (e.g. city not found) ────────────────────────
    if current.get("cod") != 200:
        msg = current.get("message", "City not found")
        return _error(404, f"OpenWeather error: {msg}")

    # ── 5. Normalize and return ────────────────────────────────────────────────
    payload = _normalize(current, forecast)
    return func.HttpResponse(
        body=json.dumps(payload),
        status_code=200,
        mimetype="application/json",
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fetch_current(city: str, api_key: str) -> dict:
    """Call /weather endpoint."""
    resp = requests.get(
        f"{OPENWEATHER_BASE}/weather",
        params={"q": city, "appid": api_key, "units": "metric"},
        timeout=TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_forecast(city: str, api_key: str) -> dict:
    """Call /forecast endpoint (3-hour steps, 5 days)."""
    resp = requests.get(
        f"{OPENWEATHER_BASE}/forecast",
        params={"q": city, "appid": api_key, "units": "metric", "cnt": 40},
        timeout=TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return resp.json()


def _normalize(current: dict, forecast: dict) -> dict:
    """
    Build a lean, frontend-friendly payload.
    Forecast: one entry per day (noon reading), up to 5 days.
    """
    # Current weather
    now = {
        "temp": round(current["main"]["temp"]),
        "feels_like": round(current["main"]["feels_like"]),
        "desc": current["weather"][0]["description"].capitalize(),
        "icon": current["weather"][0]["icon"],
        "humidity": current["main"]["humidity"],
        "wind": round(current["wind"]["speed"], 1),
    }

    # Forecast: group by date, keep the closest-to-noon entry per day
    days: dict[str, list] = {}
    for item in forecast.get("list", []):
        date = item["dt_txt"][:10]          # "YYYY-MM-DD"
        days.setdefault(date, []).append(item)

    daily_forecast = []
    today = current["dt"]
    # Skip today; take up to 5 future days
    for date, readings in sorted(days.items()):
        if len(daily_forecast) >= 5:
            break
        # Pick noon reading if available, else first
        noon = next(
            (r for r in readings if "12:00" in r["dt_txt"]),
            readings[0],
        )
        daily_forecast.append({
            "date": date,
            "min": round(min(r["main"]["temp_min"] for r in readings)),
            "max": round(max(r["main"]["temp_max"] for r in readings)),
            "desc": noon["weather"][0]["description"].capitalize(),
            "icon": noon["weather"][0]["icon"],
        })

    return {
        "city": current["name"],
        "country": current["sys"]["country"],
        "now": now,
        "forecast": daily_forecast,
    }


def _error(status: int, message: str) -> func.HttpResponse:
    """Return a JSON error response."""
    return func.HttpResponse(
        body=json.dumps({"error": message}),
        status_code=status,
        mimetype="application/json",
        headers={"Access-Control-Allow-Origin": "*"},
    )
