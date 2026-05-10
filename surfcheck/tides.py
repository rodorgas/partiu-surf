"""WorldTides API client + tide state scoring + per-day cache."""
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests

from .cache import get_cached, set_cached
from .config import TZ

WORLDTIDES_URL = "https://www.worldtides.info/api/v3"


def _api_fetch_day(lat, lon, date_iso):
    """Single uncached fetch from WorldTides for a calendar date (24h)."""
    tz = ZoneInfo(TZ)
    d = datetime.strptime(date_iso, "%Y-%m-%d").replace(tzinfo=tz)
    params = {
        "heights": "",
        "lat": lat,
        "lon": lon,
        "key": os.environ["WORLDTIDES_API_KEY"],
        "start": int(d.timestamp()),
        "length": 86400,
        "step": 3600,
        "localtime": "true",
    }
    data = requests.get(WORLDTIDES_URL, params=params).json()
    out = {}
    for h in data["heights"]:
        iso = h["date"][:13] + ":00"
        out[iso] = h["height"]
    return out


def fetch_tide_for_date(lat, lon, date_iso):
    """Per-day cached fetch. Past dates cache forever; today/future per-day TTL."""
    namespace = f"tide/{lat}_{lon}"
    cached = get_cached(namespace, date_iso)
    if cached is not None:
        return cached
    data = _api_fetch_day(lat, lon, date_iso)
    set_cached(namespace, date_iso, data)
    return data


def fetch_tide_heights(lat, lon, date=None, days=1):
    """Hourly tide heights spanning the requested period.

    date=None, days=1 → today + tomorrow (handles 24h windows that cross midnight).
    date=None, days>1 → exactly `days` days starting today.
    date=ISO          → `days` days starting from that date (no overflow).
    """
    tz = ZoneInfo(TZ)
    start = datetime.strptime(date, "%Y-%m-%d").date() if date else datetime.now(tz).date()
    span = 2 if (date is None and days == 1) else days
    out = {}
    for i in range(span):
        d_iso = (start + timedelta(days=i)).isoformat()
        out.update(fetch_tide_for_date(lat, lon, d_iso))
    return out


def tide_state(heights_by_hour, hour_iso):
    """Classify tide at a given hour: low | rising | high | falling.

    Day-local min/max so multi-day input doesn't bleed across days.
    """
    keys = sorted(heights_by_hour)
    i = keys.index(hour_iso)
    h = heights_by_hour[hour_iso]
    same_day = [v for k, v in heights_by_hour.items() if k.startswith(hour_iso[:10])]
    day_min, day_max = min(same_day), max(same_day)
    prev_h = heights_by_hour[keys[i - 1]] if i > 0 else h
    next_h = heights_by_hour[keys[i + 1]] if i < len(keys) - 1 else h
    is_local_min = h <= prev_h and h <= next_h
    is_local_max = h >= prev_h and h >= next_h
    if is_local_min and abs(h - day_min) <= 0.20:
        return "low"
    if is_local_max and abs(h - day_max) <= 0.20:
        return "high"
    return "rising" if next_h > h else "falling"


_TIDE_NEIGHBORS = {
    "rising": {"high", "mid", "low"},
    "falling": {"low", "mid", "high"},
    "high": {"rising", "falling"},
    "low": {"rising", "falling"},
    "mid": {"rising", "falling"},
}


def score_tide(state, spot_pref):
    if spot_pref == "any":
        return 8
    if state == spot_pref:
        return 10
    if spot_pref in _TIDE_NEIGHBORS.get(state, set()):
        return 6
    return 3
