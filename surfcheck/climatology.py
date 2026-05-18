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
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import requests

from .config import TZ
from .scoring import compute, compute_best

MARINE_ARCHIVE_URL = "https://marine-api.open-meteo.com/v1/marine"
FORECAST_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

MARINE_HOURLY = "swell_wave_height,swell_wave_period,swell_wave_direction"
FORECAST_HOURLY = "wind_speed_10m,wind_direction_10m,wind_gusts_10m"

DEFAULT_YEARS_BACK = 3


def _get_json(url: str, params: dict) -> dict:
    return requests.get(url, params=params, timeout=10).json()


def _year_params(lat: float, lon: float, year: int, month: int) -> tuple[dict, dict]:
    """Open-Meteo query params for (marine, atmosphere) for a given month."""
    last_day = calendar.monthrange(year, month)[1]
    start, end = f"{year}-{month:02d}-01", f"{year}-{month:02d}-{last_day:02d}"
    common = {
        "latitude": lat,
        "longitude": lon,
        "timezone": TZ,
        "start_date": start,
        "end_date": end,
    }
    return (
        {**common, "hourly": MARINE_HOURLY},
        {**common, "hourly": FORECAST_HOURLY},
    )


def _aggregate(marine: dict, forecast: dict, spot_tuple: tuple, gear_key: str,
               gear_profiles: dict):
    """For each historical day, take the daylight-hour peak; aggregate across
    days. This mirrors the live forecast's `today_peak` (max score over the
    05h–18h daylight slice) so today vs. average is apples-to-apples — peak vs.
    peak, not peak vs. flat hourly mean."""
    mh = marine.get("hourly") or {}
    fh = forecast.get("hourly") or {}
    if not mh or not fh:
        return 0, 0.0, 0.0, 0.0
    f_idx = {t: j for j, t in enumerate(fh.get("time") or [])}

    # day → (best_score, sh_at_peak, sp_at_peak)
    days: dict[str, tuple[float, float, float]] = {}

    for mi, t in enumerate(mh.get("time") or []):
        if t not in f_idx:
            continue
        try:
            hour = int(t[11:13])
        except (ValueError, IndexError):
            continue
        # Daylight slice — matches the UI's "05h–18h · janela diurna" filter.
        if not (5 <= hour <= 18):
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
        day = t[:10]
        cur = days.get(day)
        if cur is None or score > cur[0]:
            days[day] = (score, sh, sp)

    n = len(days)
    sh_sum = sum(d[1] for d in days.values())
    sp_sum = sum(d[2] for d in days.values())
    sc_sum = sum(d[0] for d in days.values())
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

    # Fan out all (years_back × 2) archive calls in parallel — these are pure
    # I/O against Open-Meteo and benefit linearly from concurrency. Previously
    # ran sequentially and dominated cold-cache TTFB (~2.9s on Vercel).
    years = list(range(target.year - years_back, target.year))
    requests_per_year = [_year_params(lat, lon, y, month) for y in years]
    pairs: list[tuple[dict | None, dict | None]] = []
    with ThreadPoolExecutor(max_workers=years_back * 2) as ex:
        futures = []
        for marine_params, forecast_params in requests_per_year:
            futures.append((
                ex.submit(_get_json, MARINE_ARCHIVE_URL, marine_params),
                ex.submit(_get_json, FORECAST_ARCHIVE_URL, forecast_params),
            ))
        for marine_f, forecast_f in futures:
            try:
                pairs.append((marine_f.result(), forecast_f.result()))
            except (requests.RequestException, ValueError):
                # Open-Meteo blip — skip this year rather than failing the whole call.
                pairs.append((None, None))

    total_n = 0
    sh_total = sp_total = sc_total = 0.0
    for marine, forecast in pairs:
        if marine is None or forecast is None:
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
        "sampleDays": total_n,
        "yearsBack": years_back,
    }
