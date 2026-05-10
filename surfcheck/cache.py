"""Local JSON cache with date-aware invalidation.

Rule:
    - Past dates  → cache permanent (forecast won't change retroactively)
    - Today/future → cache valid only while `fetched_on == today`
"""
import json
from datetime import date as date_cls, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .config import TZ

CACHE_ROOT = Path.home() / ".surfcheck" / "cache"


def _path(namespace: str, key: str) -> Path:
    return CACHE_ROOT / namespace / f"{key}.json"


def _today_iso() -> str:
    return datetime.now(ZoneInfo(TZ)).date().isoformat()


def get_cached(namespace: str, target_date: str):
    """Return cached value if fresh per date rule, else None."""
    path = _path(namespace, target_date)
    if not path.exists():
        return None
    with path.open() as f:
        entry = json.load(f)
    target_d = date_cls.fromisoformat(target_date)
    today_d = date_cls.fromisoformat(_today_iso())
    if target_d < today_d:
        return entry["data"]
    if entry.get("fetched_on") == _today_iso():
        return entry["data"]
    return None


def set_cached(namespace: str, target_date: str, data) -> None:
    path = _path(namespace, target_date)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump({"data": data, "fetched_on": _today_iso()}, f)
