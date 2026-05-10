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
# danger_h triggers ⚠️ when wind is also ruim. tide_weight = 0..2 weight in composite.
GEAR = {
    "all":       {"power": [(3, 1), (6, 4), (10, 7), (15, 9), (25, 10), (35, 6), (45, 3), (60, 1), (99, 0)],
                  "danger_h": 2.5},
    "bb":        {"power": [(3, 2), (5, 5), (7, 8), (10, 10), (15, 9), (20, 6), (28, 3), (35, 1), (99, 0)],
                  "danger_h": 2.0},
    "short":     {"power": [(5, 1), (8, 4), (12, 7), (18, 9), (30, 10), (40, 7), (50, 3), (99, 1)],
                  "danger_h": 2.8},
    "trekkinho": {"power": [(5, 1), (10, 3), (15, 7), (20, 9), (28, 10), (33, 5), (40, 2), (99, 0)],
                  "danger_h": 2.0},
}
