"""Vercel Python serverless function — forecast orchestrator.

Architectural decision (Phase 3): all data assembly happens in Python.
The TS side only fetches this endpoint, caches the JSON in Redis, and renders.
This keeps fetch + row-alignment + scoring in one language and avoids a fragile
TS port of `cli._build_rows`. The contract is JSON-over-HTTP: query params in,
ForecastDay JSON out.

Parity with `python -m surfcheck` is guaranteed because we import the same
`surfcheck.fetch` / `surfcheck.scoring` modules (vendored at build time by
`scripts/vendor-surfcheck.mjs`).
"""

import json
import os
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

# Vendored copy of `surfcheck/` lives next to this file. Prepended so we never
# accidentally import a site-packages module of the same name.
_VENDORED = Path(__file__).resolve().parent / "_vendored"
if str(_VENDORED) not in sys.path:
    sys.path.insert(0, str(_VENDORED))

from surfcheck.config import GEAR, TZ, normalize_gear_key  # noqa: E402
from surfcheck.fetch import fetch_forecast, fetch_marine  # noqa: E402
from surfcheck.geometry import deg_to_compass  # noqa: E402
from surfcheck.scoring import compute, compute_best, label  # noqa: E402


# Portuguese tide labels matching the UI's `TideState` type in lib/data.ts.
_TIDE_PT = {"rising": "subindo", "falling": "descendo", "high": "alta", "low": "baixa"}


def _tide_lookup(lat: float, lon: float, date: str | None = None, days: int = 1):
    """Mirror cli._tide_lookup — silently disabled when the API key is missing."""
    if "WORLDTIDES_API_KEY" not in os.environ:
        return None
    from surfcheck.tides import fetch_tide_heights, score_tide, tide_state

    try:
        return fetch_tide_heights(lat, lon, date, days), tide_state, score_tide
    except Exception as e:  # noqa: BLE001
        # WorldTides outages should never break the forecast — degrade
        # gracefully, but log so we notice when tides quietly drop out
        # (e.g. read-only FS, API quota, network error).
        print(f"tide_lookup failed: {type(e).__name__}: {e}", file=sys.stderr)
        return None


def _build_hour(
    iso: str, dt: datetime, mh: dict, mi: int, fh: dict, f_idx: dict,
    spot_tuple: tuple, gear_key: str, tide,
) -> dict:
    """Aligned hourly row, shaped to match lib/data.ts:ForecastHour."""
    sh = mh["swell_wave_height"][mi]
    sp = mh["swell_wave_period"][mi]
    sdd = mh["swell_wave_direction"][mi]
    j = f_idx[iso]
    ws = fh["wind_speed_10m"][j]
    wdd = fh["wind_direction_10m"][j]
    wg = fh["wind_gusts_10m"][j]

    tide_score = tide_h = tide_st_pt = None
    if tide is not None:
        heights, state_fn, score_fn = tide
        hour_iso = dt.strftime("%Y-%m-%dT%H:00")
        if hour_iso in heights:
            tide_h = heights[hour_iso]
            state_en = state_fn(heights, hour_iso)
            tide_st_pt = _TIDE_PT.get(state_en, "subindo")
            tide_score = score_fn(state_en, spot_tuple[6])

    if gear_key == "auto":
        score, ws_s, winner = compute_best(
            sh, sp, sdd, ws, wdd, wg, spot_tuple, GEAR, tide_score,
        )
    else:
        score, ws_s = compute(
            sh, sp, sdd, ws, wdd, wg, spot_tuple, GEAR[gear_key], tide_score,
        )
        winner = gear_key
    flag = label(score, sh, ws_s, GEAR[winner])
    # Only flag risky/danger conditions in the response. The UI re-derives the
    # green/yellow/red dot from the score itself.
    flag_str = flag if flag in ("⚠️", "\U0001f4a4") else ""

    return {
        "h": dt.strftime("%Hh"),
        "isoTime": iso,
        "score": round(score, 2),
        "swH": round(sh, 2),
        "swT": round(sp, 1),
        "swDir": int(round(sdd)) % 360,
        "wKmh": int(round(ws)),
        "wDir": int(round(wdd)) % 360,
        "gust": int(round(wg)),
        "tideH": round(tide_h, 2) if tide_h is not None else 0.0,
        "tide": tide_st_pt or "subindo",
        "hasTide": tide_h is not None,
        "flag": flag_str,
        "winner": winner,
        "_swDirLabel": deg_to_compass(sdd),
        "_wDirLabel": deg_to_compass(wdd),
        "_wsSub": round(ws_s, 2),
    }


def _build_rows(marine: dict, forecast: dict, cutoff: datetime, hours: int | None,
                spot_tuple: tuple, gear_key: str, tide):
    """Same alignment logic as `cli._build_rows` — keep them in sync."""
    mh = marine["hourly"]
    fh = forecast["hourly"]
    f_idx = {t: j for j, t in enumerate(fh["time"])}
    rows = []
    for mi, t in enumerate(mh["time"]):
        dt = datetime.fromisoformat(t)
        if dt < cutoff:
            continue
        if hours is not None and len(rows) >= hours:
            break
        if t not in f_idx:
            # Marine API can return hours the atmosphere API skips; mirror the
            # CLI which raises KeyError. Here we just skip rather than 500.
            continue
        rows.append(_build_hour(t, dt, mh, mi, fh, f_idx, spot_tuple, gear_key, tide))
    return rows


def _find_best_window(rows: list[dict], min_hours: int = 2, min_score: float = 7.0):
    """Longest contiguous run with score >= min_score. Returns (start_h, end_h) or None."""
    best = cur = None
    for i, r in enumerate(rows):
        if r["score"] >= min_score:
            if cur is None:
                cur = i
            length = i - cur + 1
            if length >= min_hours and (best is None or length > best[1] - best[0] + 1):
                best = (cur, i)
        else:
            cur = None
    if best is None:
        return None
    return f"{rows[best[0]]['h']}–{rows[best[1]]['h']}"


def build_forecast(params: dict) -> dict:
    """Pure function — easy to unit-test from Python.

    Required params: slug, name, region, lat, lon, facing, sizeTol,
                     breakType, tidePref. Optional: shelter (list of [s,e]),
                     gear (default 'all'), date (YYYY-MM-DD), hours.
    """
    slug = params["slug"]
    name = params["name"]
    region = params["region"]
    lat = float(params["lat"])
    lon = float(params["lon"])
    facing = float(params["facing"])
    size_tol = float(params["sizeTol"])
    shelter = [tuple(p) for p in params.get("shelter") or []]
    break_type = params.get("breakType", "beach")
    tide_pref = params.get("tidePref", "any")
    gear_key = normalize_gear_key(params.get("gear", "auto"))
    if gear_key != "auto" and gear_key not in GEAR:
        gear_key = "auto"
    date = params.get("date") or None
    hours = int(params["hours"]) if params.get("hours") else None

    # Build the same positional tuple shape `scoring.compute` reads:
    # (name, lat, lon, facing, shelter, break_type, tide_pref, size_tol)
    spot_tuple = (name, lat, lon, facing, shelter, break_type, tide_pref, size_tol)

    marine = fetch_marine(lat, lon, date)
    forecast_data = fetch_forecast(lat, lon, date)
    tide = _tide_lookup(lat, lon, date, 1)

    tz = ZoneInfo(TZ)
    if date:
        cutoff = datetime.fromisoformat(f"{date}T00:00")
    else:
        cutoff = datetime.now(tz).replace(
            tzinfo=None, minute=0, second=0, microsecond=0,
        )

    rows = _build_rows(marine, forecast_data, cutoff, hours, spot_tuple, gear_key, tide)

    # Daylight slice — the UI's "05h–18h · janela diurna" header expects this.
    daylight = [r for r in rows if 5 <= int(r["h"].rstrip("h")) <= 18]
    if not daylight and rows:
        daylight = rows[:14]

    today_peak = max((r["score"] for r in daylight), default=0.0)
    best_window = _find_best_window(daylight) or "—"

    # Mark the peak row visually (UI may use this; safe extra field).
    for r in daylight:
        r["isPeak"] = r["score"] == today_peak

    return {
        "generatedAt": datetime.now(tz).isoformat(),
        "spot": {
            "slug": slug,
            "name": name,
            "region": region,
            "facing": facing,
            "breakType": break_type,
            "tidePref": tide_pref,
            # waterTemp/sunrise/sunset are display-only metadata not derived
            # from Open-Meteo's hourly slice — leave 0/"—" until phase 5 wires
            # them. UI handles missing gracefully via formatting.
            "waterTemp": 0.0,
            "sunrise": "—",
            "sunset": "—",
            "bestWindow": best_window,
            "todayPeak": round(today_peak, 2),
        },
        "hours": daylight,
        "hasTide": tide is not None,
        "gear": gear_key,
    }


# --- Vercel Python runtime entrypoint -------------------------------------------------
# Vercel's @vercel/python runtime adapts a `BaseHTTPRequestHandler` subclass
# named `handler` into a serverless function. Local dev (without `vercel dev`)
# uses the standalone `__main__` block below.


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires lowercase
    def do_GET(self):  # noqa: N802
        try:
            url = urlparse(self.path)
            raw = {k: v[0] for k, v in parse_qs(url.query).items()}
            shelter_raw = raw.pop("shelter", None)
            if shelter_raw:
                raw["shelter"] = json.loads(shelter_raw)
            payload = build_forecast(raw)
            self._respond(200, payload)
        except KeyError as e:
            self._respond(400, {"error": f"missing param: {e.args[0]}"})
        except Exception as e:  # noqa: BLE001
            self._respond(500, {"error": str(e)})

    def _respond(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        # Short cache header — the real cache layer is Upstash on the TS side.
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


# --- Standalone CLI for local dev (no Vercel CLI required) ----------------------------

if __name__ == "__main__":
    # Usage: python api/forecast.py '{"slug":"itamambuca",...}'
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing JSON payload arg"}))
        sys.exit(1)
    out = build_forecast(json.loads(sys.argv[1]))
    print(json.dumps(out))
