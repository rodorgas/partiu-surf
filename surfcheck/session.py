"""Local JSONL persistence of logged surf sessions for model calibration."""
import json
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

STORE_DIR = Path.home() / ".surfcheck"
STORE_PATH = STORE_DIR / "sessions.jsonl"


def log_session(spot: str, gear: str, conditions: dict, rating: int, notes: str = "") -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "spot": spot,
        "gear": gear,
        "rating": rating,
        "notes": notes,
        "conditions": conditions,
    }
    with STORE_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def list_sessions(limit: int = 20) -> List[dict]:
    if not STORE_PATH.exists():
        return []
    with STORE_PATH.open("r", encoding="utf-8") as f:
        lines = [ln for ln in f.read().splitlines() if ln.strip()]
    return [json.loads(ln) for ln in lines[-limit:][::-1]]


def calibration_data() -> Tuple[List[float], List[int]]:
    if not STORE_PATH.exists():
        return [], []
    preds: List[float] = []
    actuals: List[int] = []
    with STORE_PATH.open("r", encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            rec = json.loads(ln)
            score = rec.get("conditions", {}).get("score")
            rating = rec.get("rating")
            if score is not None and rating is not None:
                preds.append(float(score))
                actuals.append(int(rating))
    return preds, actuals
