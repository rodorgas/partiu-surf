"""Vercel Python serverless function — monthly climatology.

Separate from `api/forecast.py` because the cache lifetimes differ sharply:
the daily forecast refreshes every 12h, while monthly climatology averages
are stable for the whole calendar month. Splitting them lets the TS layer
key each cache independently and avoids re-running 6 archive API calls on
every per-day request.

Query params mirror `/api/forecast` (same spot tuple). Returns
{ avgScore, avgSwH, avgSwT, sampleHours, yearsBack } or
{ historic: null } when no archive data is available.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

_VENDORED = Path(__file__).resolve().parent / "_vendored"
if str(_VENDORED) not in sys.path:
    sys.path.insert(0, str(_VENDORED))

from surfcheck.climatology import compute_monthly_avg  # noqa: E402
from surfcheck.config import GEAR, normalize_gear_key  # noqa: E402


def build_climatology(params: dict) -> dict:
    name = params["name"]
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
    date = params["date"]

    spot_tuple = (name, lat, lon, facing, shelter, break_type, tide_pref, size_tol)
    result = compute_monthly_avg(spot_tuple, GEAR, date, gear_key=gear_key)
    return {"historic": result}


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires lowercase
    def do_GET(self):  # noqa: N802
        try:
            url = urlparse(self.path)
            raw = {k: v[0] for k, v in parse_qs(url.query).items()}
            shelter_raw = raw.pop("shelter", None)
            if shelter_raw:
                raw["shelter"] = json.loads(shelter_raw)
            payload = build_climatology(raw)
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
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing JSON payload arg"}))
        sys.exit(1)
    out = build_climatology(json.loads(sys.argv[1]))
    print(json.dumps(out))
