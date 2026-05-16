"""Run with:
    python3 apps/web/api/forecast_test.py

Lightweight smoke + parity tests for api/forecast.py. No pytest dep — we use
plain `assert` + `unittest.mock`. Keeps CI dependency-light (the build only
needs Node + Python stdlib).
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "_vendored"))

import forecast as fc  # noqa: E402
from surfcheck.scoring import compute  # noqa: E402


def _fake_marine() -> dict:
    times = [f"2026-05-11T{h:02d}:00" for h in range(24)]
    return {
        "hourly": {
            "time": times,
            "swell_wave_height": [1.5] * 24,
            "swell_wave_period": [11.0] * 24,
            "swell_wave_direction": [185.0] * 24,
            "wave_height": [1.6] * 24,
        }
    }


def _fake_forecast() -> dict:
    times = [f"2026-05-11T{h:02d}:00" for h in range(24)]
    return {
        "hourly": {
            "time": times,
            "wind_speed_10m": [10.0] * 24,
            "wind_direction_10m": [240.0] * 24,
            "wind_gusts_10m": [18.0] * 24,
        }
    }


SPOT_PARAMS = {
    "slug": "itamambuca",
    "name": "Itamambuca",
    "region": "Ubatuba · SP",
    "lat": -23.397,
    "lon": -45.039,
    "facing": 165,
    "sizeTol": 1.1,
    "breakType": "beach",
    "tidePref": "any",
    "shelter": [],
    "date": "2026-05-11",
}


class ForecastFunctionTests(unittest.TestCase):
    def test_build_forecast_returns_daylight_slice(self):
        with patch.object(fc, "fetch_marine", return_value=_fake_marine()), \
             patch.object(fc, "fetch_forecast", return_value=_fake_forecast()), \
             patch.dict("os.environ", {}, clear=False):
            out = fc.build_forecast(SPOT_PARAMS)
        self.assertEqual(out["spot"]["slug"], "itamambuca")
        self.assertEqual(out["hasTide"], False)
        # Daylight slice = 05h..18h inclusive = 14 hours.
        self.assertEqual(len(out["hours"]), 14)
        for r in out["hours"]:
            self.assertIn("score", r)
            self.assertGreaterEqual(r["score"], 0)
            self.assertLessEqual(r["score"], 10)

    def test_parity_with_compute_for_a_single_hour(self):
        """The exposed score must match surfcheck.scoring.compute_best() exactly
        (modulo our JSON 2-decimal rounding) — default mode is "auto"."""
        with patch.object(fc, "fetch_marine", return_value=_fake_marine()), \
             patch.object(fc, "fetch_forecast", return_value=_fake_forecast()), \
             patch.dict("os.environ", {}, clear=False):
            out = fc.build_forecast({**SPOT_PARAMS, "gear": "auto"})
        spot_tuple = ("Itamambuca", -23.397, -45.039, 165, [], "beach", "any", 1.1)
        from surfcheck.config import GEAR
        from surfcheck.scoring import compute_best
        score, _, _ = compute_best(
            1.5, 11.0, 185.0, 10.0, 240.0, 18.0, spot_tuple, GEAR, None,
        )
        # Match the first daylight hour (05h) — homogeneous inputs make every
        # hour identical, but we still pin to the first one.
        self.assertAlmostEqual(out["hours"][0]["score"], round(score, 2), places=2)

    def test_legacy_gear_alias_resolves_to_canonical(self):
        with patch.object(fc, "fetch_marine", return_value=_fake_marine()), \
             patch.object(fc, "fetch_forecast", return_value=_fake_forecast()), \
             patch.dict("os.environ", {}, clear=False):
            # "all" was the pre-2026 generic key; should map to auto.
            out = fc.build_forecast({**SPOT_PARAMS, "gear": "all"})
        self.assertEqual(out["gear"], "auto")

    def test_missing_required_param_raises_key_error(self):
        with self.assertRaises(KeyError):
            fc.build_forecast({"slug": "x"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
