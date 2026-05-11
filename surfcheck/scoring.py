"""Scoring functions — composable building blocks for the composite score.

Each `score_*` returns 0-10. Weights live in `compute()`.
"""
from .geometry import angle_diff, in_arc, curve


def score_swell_dir(swell_deg, facing):
    """How well swell direction matches beach orientation. 10 = dead-on."""
    d = angle_diff(swell_deg, facing)
    return 10 if d <= 22 else 7 if d <= 45 else 4 if d <= 67 else 2 if d <= 90 else 0


def shelter_factor(wind_deg, shelter):
    """Multiplier on wind speed (0.3-1.0). Lower = more blocked.

    Gradient: 0.3 at center of arc, 1.0 at edges and outside.
    """
    factor = 1.0
    for s, e in shelter:
        if e >= s:
            half = (e - s) / 2
            center = (s + e) / 2
        else:
            half = (360 - s + e) / 2
            center = ((s + e + 360) / 2) % 360
        d = angle_diff(wind_deg, center)
        if d < half:
            factor = min(factor, 0.3 + 0.7 * (d / half))
    return factor


def score_wind(speed, wind_deg, facing, shelter, gust):
    """Continuous wind score.

    Direction: 0° offshore (terral) = 10, alongshore = ~7, full onshore = 1.
    Speed penalty kicks in above 18-25 km/h. Gust > 25 applies -3 hit.
    """
    eff_speed = speed * shelter_factor(wind_deg, shelter)
    if eff_speed < 8:
        s = 8
    else:
        d = angle_diff(wind_deg, (facing + 180) % 360)
        s = 1 + 9 * (1 - (d / 180) ** 1.5)
        if eff_speed > 25:
            s *= 0.6
        elif eff_speed > 18:
            s *= 0.85
    if gust > 25:
        s -= 3
    return max(0, s)


def score_power(sh, sp, gear, size_tol):
    """Wave power score from H × T, with spot-specific size tolerance.

    Higher size_tol means the spot holds bigger size cleaner — divide the
    raw product by tol so the same H×T scores higher on tolerant spots.
    """
    return curve(sh * sp / size_tol, gear["power"])


def compute(sh, sp, sd_deg, ws, wd_deg, wg, spot, gear, tide_score=None):
    """Composite score 0-10. Returns (score, wind_subscore).

    Weights: swell_dir(3) + power(5) + wind(2) = 10 without tide.
    With tide: swell_dir(3) + power(4) + wind(2) + tide(1) = 10.
    """
    facing, shelter, size_tol = spot[3], spot[4], spot[7]
    sd_s = score_swell_dir(sd_deg, facing)
    pw_s = score_power(sh, sp, gear, size_tol)
    sw_s = score_wind(ws, wd_deg, facing, shelter, wg)
    if tide_score is None:
        weighted = sd_s * 3 + pw_s * 5 + sw_s * 2
    else:
        weighted = sd_s * 3 + pw_s * 4 + sw_s * 2 + tide_score * 1
    return max(0.0, weighted / 10), sw_s


def compute_best(sh, sp, sd_deg, ws, wd_deg, wg, spot, gear_profiles, tide_score=None):
    """Pick the gear profile that maximizes the composite score.

    Iterates `gear_profiles` (dict of key → gear) in insertion order so ties
    resolve to the first profile listed (caller controls ordering via
    config.GEAR_ORDER). Returns (best_score, wind_subscore, winning_key).
    """
    best_score = -1.0
    best_ws = 0.0
    best_key = None
    for key, gear in gear_profiles.items():
        score, ws_s = compute(sh, sp, sd_deg, ws, wd_deg, wg, spot, gear, tide_score)
        if score > best_score:
            best_score = score
            best_ws = ws_s
            best_key = key
    return best_score, best_ws, best_key


def label(score, height, wind_s, gear):
    """Visual label: ⚠️ danger, 💤 flat, 🟢/🟡/🔴 by score."""
    if height > gear["danger_h"] and wind_s < 5:
        return "⚠️"
    if height < 0.5:
        return "💤"
    if score >= 7:
        return "🟢"
    if score >= 4:
        return "🟡"
    return "🔴"
