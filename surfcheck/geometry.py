"""Angular and curve utilities — pure, side-effect-free helpers."""

COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def deg_to_compass(d):
    """Convert degrees (0-360) to 16-point compass label."""
    return COMPASS[int((d % 360) / 22.5 + 0.5) % 16]


def angle_diff(a, b):
    """Smallest angular distance between two compass directions, 0-180."""
    return abs(((a - b + 180) % 360) - 180)


def in_arc(deg, start, end):
    """True if deg falls inside arc [start, end], handling wrap-around."""
    deg = deg % 360
    return start <= deg <= end if start <= end else (deg >= start or deg <= end)


def curve(value, points):
    """Step-curve lookup: returns score for first (threshold, score) where value < threshold."""
    for thr, sc in points:
        if value < thr:
            return sc
    return 0
