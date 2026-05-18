"""Monthly climatology — multi-year averages of swell, period, and score.

Used by the web app's "Comparado à média" card. We fetch the same calendar
month over the past N years from Open-Meteo's historical archive (marine +
atmosphere), then average the hourly samples and the per-hour composite score.

Open-Meteo's hobby tier is free for non-commercial use; the marine archive
goes back to 2022 and the atmosphere archive (ERA5) goes back to 1940. We
default to 3 years of lookback which keeps cold-start latency reasonable
while smoothing out single-year anomalies (e.g. a freak storm month).
"""
import calendar
from datetime import date

import requests

from .config import TZ
from .scoring import compute, compute_best

MARINE_ARCHIVE_URL = "https://marine-api.open-meteo.com/v1/marine"
FORECAST_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

MARINE_HOURLY = "swell_wave_height,swell_wave_period,swell_wave_direction"
FORECAST_HOURLY = "wind_speed_10m,wind_direction_10m,wind_gusts_10m"

DEFAULT_YEARS_BACK = 3


def _fetch_year_month(lat: float, lon: float, year: int, month: int):
    """One year of the target calendar month — marine + atmosphere."""
    last_day = calendar.monthrange(year, month)[1]
    start, end = f"{year}-{month:02d}-01", f"{year}-{month:02d}-{last_day:02d}"
    common = {
        "latitude": lat,
        "longitude": lon,
        "timezone": TZ,
        "start_date": start,
        "end_date": end,
    }
    marine = requests.get(
        MARINE_ARCHIVE_URL,
        params={**common, "hourly": MARINE_HOURLY},
        timeout=10,
    ).json()
    forecast = requests.get(
        FORECAST_ARCHIVE_URL,
        params={**common, "hourly": FORECAST_HOURLY},
        timeout=10,
    ).json()
    return marine, forecast


def _aggregate(marine: dict, forecast: dict, spot_tuple: tuple, gear_key: str,
               gear_profiles: dict):
    """Walk aligned hourly rows and accumulate sums + counts. Score uses the
    same gear selection logic as the live forecast so the comparison is fair."""
    mh = marine.get("hourly") or {}
    fh = forecast.get("hourly") or {}
    if not mh or not fh:
        return 0, 0.0, 0.0, 0.0
    f_idx = {t: j for j, t in enumerate(fh.get("time") or [])}
    n = 0
    sh_sum = sp_sum = sc_sum = 0.0
    for mi, t in enumerate(mh.get("time") or []):
        if t not in f_idx:
            continue
        sh = mh["swell_wave_height"][mi]
        sp = mh["swell_wave_period"][mi]
        sd = mh["swell_wave_direction"][mi]
        j = f_idx[t]
        ws = fh["wind_speed_10m"][j]
        wd = fh["wind_direction_10m"][j]
        wg = fh["wind_gusts_10m"][j]
        if sh is None or sp is None or sd is None:
            continue
        if ws is None or wd is None or wg is None:
            continue
        if gear_key == "auto":
            score, _, _ = compute_best(
                sh, sp, sd, ws, wd, wg, spot_tuple, gear_profiles,
            )
        else:
            score, _ = compute(
                sh, sp, sd, ws, wd, wg, spot_tuple, gear_profiles[gear_key],
            )
        sh_sum += sh
        sp_sum += sp
        sc_sum += score
        n += 1
    return n, sh_sum, sp_sum, sc_sum


def compute_monthly_avg(
    spot_tuple: tuple,
    gear_profiles: dict,
    target_date: str,
    gear_key: str = "auto",
    years_back: int = DEFAULT_YEARS_BACK,
) -> dict | None:
    """Average swH/swT/score across the same calendar month over past `years_back` years.

    Returns None when no historical data is available (e.g. archive APIs are
    out, or the spot's coordinates don't have marine coverage). Callers should
    fall back to omitting the historic card.
    """
    target = date.fromisoformat(target_date)
    month = target.month
    lat = float(spot_tuple[1])
    lon = float(spot_tuple[2])

    total_n = 0
    sh_total = sp_total = sc_total = 0.0
    for y in range(target.year - years_back, target.year):
        try:
            marine, forecast = _fetch_year_month(lat, lon, y, month)
        except (requests.RequestException, ValueError):
            # Open-Meteo blip — skip this year rather than failing the whole call.
            continue
        n, sh_s, sp_s, sc_s = _aggregate(
            marine, forecast, spot_tuple, gear_key, gear_profiles,
        )
        total_n += n
        sh_total += sh_s
        sp_total += sp_s
        sc_total += sc_s

    if total_n == 0:
        return None
    return {
        "avgScore": round(sc_total / total_n, 2),
        "avgSwH": round(sh_total / total_n, 2),
        "avgSwT": round(sp_total / total_n, 1),
        "sampleHours": total_n,
        "yearsBack": years_back,
    }
