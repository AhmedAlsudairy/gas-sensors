"""
config.py — All configuration in one place.

Every value can be overridden by an environment variable so the agent
works in dev (laptop, no GPIO) and production (Raspberry Pi) with the
same code and no code changes.
"""
import os


# ── Network ────────────────────────────────────────────────────────────────────
DASHBOARD_URL: str = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
INGEST_SECRET: str = os.environ.get("INGEST_SECRET", "")

# ── Serial / Arduino ───────────────────────────────────────────────────────────
SERIAL_PORT: str = os.environ.get("SERIAL_PORT", "")   # empty → auto-detect
BAUD_RATE:   int = int(os.environ.get("BAUD_RATE", "115200"))

# ── GPIO pins (BCM numbering) ──────────────────────────────────────────────────
RELAY_PIN:        int  = int(os.environ.get("RELAY_PIN",   "17"))
BUZZER_PIN:       int  = int(os.environ.get("BUZZER_PIN",  "18"))
RELAY_ACTIVE_HIGH: bool = os.environ.get("RELAY_ACTIVE_HIGH", "1") == "1"
BUZZER_ACTIVE_HIGH: bool = os.environ.get("BUZZER_ACTIVE_HIGH", "1") == "1"

# ── Sensor thresholds ───────────────────────────────────────────────────────────
# Gas sensor values are raw ADC (0-1023), water_level is % (0-100), temp_c is °C
THRESHOLDS: dict[str, dict[str, float]] = {
    "mq2":         {"warn": 600.0,  "danger": 800.0},
    "mq136":       {"warn": 600.0,  "danger": 800.0},
    "mq7":         {"warn": 500.0,  "danger": 700.0},
    "water_level": {"warn": 80.0,   "danger": 95.0},
    "temp_c":      {"warn": 35.0,   "danger": 50.0},
}

# ── HTTP client ────────────────────────────────────────────────────────────────
INGEST_RETRIES:    int   = 5
INGEST_TIMEOUT_S:  float = 5.0
