"""Open-Meteo API clients."""
import requests

from .config import TZ

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

MARINE_HOURLY = "swell_wave_height,swell_wave_period,swell_wave_direction,wave_height"
FORECAST_HOURLY = "wind_speed_10m,wind_direction_10m,wind_gusts_10m"


def _date_params(date):
    return {"start_date": date, "end_date": date} if date else {}


def fetch_marine(lat, lon, date=None):
    params = {"latitude": lat, "longitude": lon, "timezone": TZ,
              "hourly": MARINE_HOURLY, **_date_params(date)}
    return requests.get(MARINE_URL, params=params).json()


def fetch_forecast(lat, lon, date=None):
    params = {"latitude": lat, "longitude": lon, "timezone": TZ,
              "hourly": FORECAST_HOURLY, **_date_params(date)}
    return requests.get(FORECAST_URL, params=params).json()
