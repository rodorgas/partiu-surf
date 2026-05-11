"""Command-line entry: argv parsing + orchestration.

Subcommands:
    (default)        — scan: forecast next 12h (or --days N for daily summary)
    log              — record an actual session
    history          — list past logged sessions
"""
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from .config import TZ, SPOTS, GEAR, normalize_gear_key
from .fetch import fetch_marine, fetch_forecast
from .geometry import deg_to_compass
from .render import render_hours, render_summary, render_multiday, render_history
from .scoring import compute, compute_best
from .session import log_session, list_sessions


def _parse_scan(args):
    spot, hours, gear, date, days = "arpoador", 12, "auto", None, 1
    i = 0
    while i < len(args):
        if args[i] == "--spot":
            spot = args[i + 1].lower(); i += 2
        elif args[i] == "--hours":
            hours = int(args[i + 1]); i += 2
        elif args[i] == "--gear":
            gear = args[i + 1].lower(); i += 2
        elif args[i] == "--date":
            date = args[i + 1]; i += 2
        elif args[i] == "--days":
            days = int(args[i + 1]); i += 2
        else:
            i += 1
    return spot, hours, gear, date, days


def _parse_log(args):
    spot, gear, rating, notes = "arpoador", "shortboard", None, ""
    i = 0
    while i < len(args):
        if args[i] == "--spot":
            spot = args[i + 1].lower(); i += 2
        elif args[i] == "--gear":
            gear = args[i + 1].lower(); i += 2
        elif args[i] == "--rating":
            rating = int(args[i + 1]); i += 2
        elif args[i] == "--notes":
            notes = args[i + 1]; i += 2
        else:
            i += 1
    if rating is None:
        sys.stderr.write("error: --rating N required (1-10)\n")
        sys.exit(1)
    return spot, gear, rating, notes


def _tide_lookup(lat, lon, date=None, days=1):
    """Return (heights_dict, state_fn, score_fn) or None if no API key."""
    if "WORLDTIDES_API_KEY" not in os.environ:
        return None
    from .tides import fetch_tide_heights, tide_state, score_tide
    return fetch_tide_heights(lat, lon, date, days), tide_state, score_tide


def _build_row(t, dt, mh, mi, fh, f_idx, spot, gear_key, tide):
    sh, sp, sdd = mh["swell_wave_height"][mi], mh["swell_wave_period"][mi], mh["swell_wave_direction"][mi]
    j = f_idx[t]
    ws, wdd, wg = fh["wind_speed_10m"][j], fh["wind_direction_10m"][j], fh["wind_gusts_10m"][j]

    tide_score = tide_h = tide_st = None
    if tide is not None:
        heights, state_fn, score_fn = tide
        hour_iso = dt.strftime("%Y-%m-%dT%H:00")
        if hour_iso in heights:
            tide_h = heights[hour_iso]
            tide_st = state_fn(heights, hour_iso)
            tide_score = score_fn(tide_st, spot[6])

    if gear_key == "auto":
        score, ws_s, winner = compute_best(sh, sp, sdd, ws, wdd, wg, spot, GEAR, tide_score)
    else:
        score, ws_s = compute(sh, sp, sdd, ws, wdd, wg, spot, GEAR[gear_key], tide_score)
        winner = gear_key
    return {
        "dt": dt, "sh": sh, "sp": sp, "sd": deg_to_compass(sdd),
        "ws": ws, "wd": deg_to_compass(wdd),
        "score": score, "ws_s": ws_s,
        "tide_h": tide_h, "tide_st": tide_st,
        "winner": winner, "winner_gear": GEAR[winner],
    }


def _build_rows(marine, forecast, cutoff, hours, spot, gear_key, tide):
    mh, fh = marine["hourly"], forecast["hourly"]
    f_idx = {t: j for j, t in enumerate(fh["time"])}
    rows = []
    for mi, t in enumerate(mh["time"]):
        dt = datetime.fromisoformat(t)
        if dt < cutoff:
            continue
        if hours is not None and len(rows) >= hours:
            break
        rows.append(_build_row(t, dt, mh, mi, fh, f_idx, spot, gear_key, tide))
    return rows


def cmd_scan(args):
    spot_key, hours, gear_key, date, days = _parse_scan(args)
    gear_key = normalize_gear_key(gear_key)
    if gear_key != "auto" and gear_key not in GEAR:
        sys.stderr.write(f"error: unknown gear '{gear_key}' (use auto/{'/'.join(GEAR)})\n")
        sys.exit(1)
    spot = SPOTS[spot_key]
    name, lat, lon = spot[0], spot[1], spot[2]

    marine = fetch_marine(lat, lon, date)
    forecast = fetch_forecast(lat, lon, date)
    tide = _tide_lookup(lat, lon, date, days)

    cutoff = (datetime.fromisoformat(f"{date}T00:00") if date
              else datetime.now(ZoneInfo(TZ)).replace(
                  tzinfo=None, minute=0, second=0, microsecond=0))

    if days > 1:
        rows = _build_rows(marine, forecast, cutoff, None, spot, gear_key, tide)
        render_multiday(rows, name, gear_key, days)
        return

    rows = _build_rows(marine, forecast, cutoff, hours, spot, gear_key, tide)
    when = date if date else f"próximas {hours}h"
    render_hours(rows, name, gear_key, when, with_tide=tide is not None)
    render_summary(rows)


def cmd_log(args):
    spot_key, gear_key, rating, notes = _parse_log(args)
    gear_key = normalize_gear_key(gear_key)
    if gear_key not in GEAR:
        # `log` requires a real shape — "auto" doesn't tell us what the user
        # actually rode, which is the whole point of calibration data.
        sys.stderr.write(f"error: --gear must be one of {'/'.join(GEAR)}\n")
        sys.exit(1)
    spot = SPOTS[spot_key]
    lat, lon = spot[1], spot[2]

    marine = fetch_marine(lat, lon)
    forecast = fetch_forecast(lat, lon)
    tide = _tide_lookup(lat, lon)

    cutoff = datetime.now(ZoneInfo(TZ)).replace(
        tzinfo=None, minute=0, second=0, microsecond=0)
    rows = _build_rows(marine, forecast, cutoff, 1, spot, gear_key, tide)
    if not rows:
        sys.stderr.write("error: no current-hour data available\n")
        sys.exit(1)
    r = rows[0]
    conditions = {"sh": r["sh"], "sp": r["sp"], "sd": r["sd"],
                  "ws": r["ws"], "wd": r["wd"], "score": r["score"]}
    log_session(spot_key, gear_key, conditions, rating, notes)
    print(f"logged: {spot[0]} ({gear_key}) score={r['score']:.1f} rating={rating}")


def cmd_history(args):
    limit = 20
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])
    render_history(list_sessions(limit))


def main():
    args = sys.argv[1:]
    if args and args[0] == "log":
        return cmd_log(args[1:])
    if args and args[0] == "history":
        return cmd_history(args[1:])
    return cmd_scan(args)
