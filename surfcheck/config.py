"""Static configuration: timezone, spots, gear profiles."""

TZ = "America/Sao_Paulo"

# Spot tuple: (name, lat, lon, facing_deg, shelter_arcs, break_type, tide_pref, size_tol)
#   facing_deg     — direction the beach "looks at" (ideal swell entry)
#   shelter_arcs   — (start, end) wind directions blocked by terrain
#   break_type     — "beach" | "point" | "reef" (informational; affects size_tol default)
#   tide_pref      — "any" | "rising" | "falling" | "high" | "low" | "mid"
#   size_tol       — multiplier on power upper-bound: 1.0 baseline, >1 holds bigger size
SPOTS = {
    "arpoador": ("Arpoador",     -22.989, -43.193, 195, [],             "beach", "rising", 1.0),
    "leblon":   ("Leblon",       -22.988, -43.222, 180, [(220, 290)],   "beach", "any",     0.7),
    "ipanema":  ("Ipanema P9",   -22.985, -43.205, 190, [],             "beach", "any",     1.0),
    "barra":    ("Barra (Pepe)", -23.011, -43.366, 180, [],             "beach", "any",     1.2),
    "reserva":  ("Reserva",      -23.020, -43.402, 185, [],             "beach", "any",     1.3),
    "macumba":  ("Macumba",      -23.026, -43.500, 195, [(170, 220)],   "beach", "rising", 1.1),
    "prainha":  ("Prainha",      -23.044, -43.504, 200, [(170, 230)],   "point", "high",    1.2),
    "grumari":  ("Grumari",      -23.048, -43.530, 205, [(170, 240)],   "beach", "any",     1.1),
}

# Gear profile: power curve (upper_threshold, score) where power = swell_height × period.
# Captures the H × T interaction — 1m × 13s ≠ 1m × 7s.
# danger_h triggers ⚠️ when wind is also bad.
#
# Four real shapes covering the volume/maneuverability axis. We deliberately
# do NOT model fish/hybrid as a separate category: with only H×T as input the
# model can't resolve fish vs high-volume-shortboard, so the extra category
# would be fake precision. Same reason we don't split by liters/weight —
# intra-category variation is below forecast noise. "auto" is not a real
# curve, it's a marker for compute_best() to pick the winning shape per hour.
GEAR = {
    "bodyboard": {"power": [(3, 2), (5, 5), (7, 8), (10, 10), (15, 9), (20, 6), (28, 3), (35, 1), (99, 0)],
                  "danger_h": 2.0},
    "longboard": {"power": [(1, 3), (3, 6), (6, 9), (12, 10), (18, 6), (25, 2), (40, 0)],
                  "danger_h": 2.0},
    "funboard":  {"power": [(2, 2), (4, 5), (8, 8), (15, 10), (22, 7), (30, 3), (40, 1), (99, 0)],
                  "danger_h": 2.4},
    "shortboard": {"power": [(5, 1), (8, 4), (12, 7), (18, 9), (30, 10), (40, 7), (50, 3), (99, 1)],
                   "danger_h": 2.8},
}

# Order shown in the UI gear picker; also the iteration order used by
# compute_best() so ties resolve deterministically (first match wins).
GEAR_ORDER = ["bodyboard", "longboard", "funboard", "shortboard"]

# Legacy keys (pre-2026-05 rename). Accepted on input so old session logs and
# bookmarked URLs still resolve. New code should always use the canonical
# names above. trekkinho/fish both map to shortboard — see GEAR comment.
_LEGACY_GEAR_ALIASES = {
    "all": "auto",
    "bb": "bodyboard",
    "short": "shortboard",
    "trekkinho": "shortboard",
    "fish": "shortboard",
}


def normalize_gear_key(key):
    """Map legacy gear keys to canonical names; pass through unknown values.

    The caller decides what to do with an unknown key — `cli.py` uses it as a
    dict lookup (raises KeyError), the web layer falls back to "auto".
    """
    if key is None:
        return "auto"
    return _LEGACY_GEAR_ALIASES.get(key, key)
