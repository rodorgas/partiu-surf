#!/usr/bin/env python3
"""Generate JSON fixtures for the TS geometry parity test.

Imports `surfcheck.geometry` from the repo root and dumps the results of a
fixed input set so `lib/geometry.test.ts` can compare TS output against the
Python source of truth without runtime Python dependency.

Run from the repo root:
    python3 apps/web/scripts/gen-geometry-fixtures.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from surfcheck.geometry import angle_diff, curve, deg_to_compass, in_arc  # noqa: E402


# Spread covers normal cases, wrap-around, negatives, and float noise.
DEG_TO_COMPASS_INPUTS = [
    0, 11.24, 11.25, 22.5, 45, 90, 135, 180, 225, 270, 315,
    359, 360, 720, -1, -22.5, -45, 11.249,
]

ANGLE_DIFF_INPUTS = [
    (0, 0), (0, 180), (180, 0), (90, 270), (270, 90),
    (10, 350), (350, 10), (45, 315), (-30, 30), (359, 1),
    (165, 185), (165, 245), (200, 20),
]

IN_ARC_INPUTS = [
    # (deg, start, end)
    (90, 0, 180), (200, 0, 180), (350, 350, 10), (5, 350, 10),
    (180, 350, 10), (45, 0, 90), (91, 0, 90), (220, 170, 230),
    (290, 220, 290), (291, 220, 290), (-5, 350, 10),
]

# Sample power curve from GEAR['all']. Format mirrors curve()'s contract.
CURVE_POINTS = [(3, 1), (6, 4), (10, 7), (15, 9), (25, 10), (35, 6), (45, 3), (60, 1), (99, 0)]
CURVE_VALUES = [0, 2.9, 3, 5.999, 6, 9.9, 10, 14.5, 24.99, 25, 34, 35, 99, 100, -1]


def main() -> None:
    out = {
        "degToCompass": [{"deg": d, "label": deg_to_compass(d)} for d in DEG_TO_COMPASS_INPUTS],
        "angleDiff": [{"a": a, "b": b, "diff": angle_diff(a, b)} for a, b in ANGLE_DIFF_INPUTS],
        "inArc": [
            {"deg": d, "start": s, "end": e, "result": in_arc(d, s, e)}
            for d, s, e in IN_ARC_INPUTS
        ],
        "curve": {
            "points": CURVE_POINTS,
            "samples": [{"value": v, "score": curve(v, CURVE_POINTS)} for v in CURVE_VALUES],
        },
    }
    dest = Path(__file__).parent.parent / "lib" / "__fixtures__" / "geometry.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
