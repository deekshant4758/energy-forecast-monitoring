"""Application configuration.

The analysis scope is fixed by the product brief: day-ahead purchase decisions
made for the January 2026 delivery month, using only Elexon FUELHH (actual wind
generation) and WINDFOR (national wind generation forecast) data.
"""

from __future__ import annotations

import os
from datetime import date, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc

BASE_DIR = Path(__file__).resolve().parent.parent

# Data lives next to the backend code so a container can ship a pre-seeded DB.
DATA_DIR = Path(os.environ.get("WIND_DESK_DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "wind_desk.db"

# Delivery window covered by the pilot. Day-ahead decisions for these delivery
# days are taken at gate closure on the preceding day.
WINDOW_START = date(2026, 1, 1)
WINDOW_END = date(2026, 1, 31)

# Forecast lead-time horizons, in hours before gate closure.
HORIZONS: tuple[int, ...] = (0, 4, 12, 24, 36, 48)
DEFAULT_HORIZON = 4

# Day-ahead gate closure is 12:00 London time on the day before delivery.
GATE_CLOSURE_HOUR = 12
GATE_CLOSURE_MINUTE = 0

# Elexon BMRS "insights" API. No key is required for these public datasets.
ELEXON_BASE_URL = os.environ.get(
    "ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1"
)

# FUELHH rejects requests spanning more than 7 settlement days.
ELEXON_MAX_DAYS_PER_REQUEST = 7

# How far before the delivery window we pull forecasts from. Forecasts for the
# first delivery day are published up to ~72h ahead.
FORECAST_HISTORY_PAD_DAYS = 5

HTTP_TIMEOUT_SECONDS = float(os.environ.get("ELEXON_TIMEOUT_SECONDS", "45"))
HTTP_RETRIES = 4

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
    ).split(",")
    if origin.strip()
]
