"""Local JSON cache with date-aware invalidation.

Rule:
    - Past dates  → cache permanent (forecast won't change retroactively)
    - Today/future → cache valid only while `fetched_on == today`

Filesystem I/O degrades gracefully: on a read-only FS (e.g. serverless
lambdas where $HOME isn't writable) reads return None and writes are
no-ops, so callers fall back to refetching instead of crashing.
"""
import json
import os
from datetime import date as date_cls, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .config import TZ


def _default_cache_root() -> Path:
    """Honor SURFCHECK_CACHE_DIR; else ~/.surfcheck/cache. Falls back to /tmp
    when $HOME isn't resolvable (some serverless runtimes)."""
    override = os.environ.get("SURFCHECK_CACHE_DIR")
    if override:
        return Path(override)
    try:
        return Path.home() / ".surfcheck" / "cache"
    except RuntimeError:
        return Path("/tmp/surfcheck/cache")


CACHE_ROOT = _default_cache_root()


def _path(namespace: str, key: str) -> Path:
    return CACHE_ROOT / namespace / f"{key}.json"


def _today_iso() -> str:
    return datetime.now(ZoneInfo(TZ)).date().isoformat()


def get_cached(namespace: str, target_date: str):
    """Return cached value if fresh per date rule, else None."""
    path = _path(namespace, target_date)
    try:
        if not path.exists():
            return None
        with path.open() as f:
            entry = json.load(f)
    except OSError:
        return None
    target_d = date_cls.fromisoformat(target_date)
    today_d = date_cls.fromisoformat(_today_iso())
    if target_d < today_d:
        return entry["data"]
    if entry.get("fetched_on") == _today_iso():
        return entry["data"]
    return None


def set_cached(namespace: str, target_date: str, data) -> None:
    path = _path(namespace, target_date)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w") as f:
            json.dump({"data": data, "fetched_on": _today_iso()}, f)
    except OSError:
        # Read-only FS (serverless lambda) — skip caching silently so the
        # caller still returns its freshly-fetched data.
        pass
