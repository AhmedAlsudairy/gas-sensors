"""
serial_reader.py — Arduino serial communication.

Parses the Arduino's custom text format:
  STATUS:BOOT
  MQ2:<value>[:MISSING]
  MQ136:<value>[:MISSING]
  MQ7:<value>[:MISSING]
  WATER:<value>[:MISSING]
  TEMP:<value>[:MISSING]
  ---
"""
import logging
import time
from typing import Generator

import serial
import serial.tools.list_ports

log = logging.getLogger("gas-agent.serial")

_ARDUINO_KEYWORDS = ("arduino", "ch340", "cp210", "usb serial", "ttyacm", "ttyusb")

SENSOR_KEYS = ("MQ2", "MQ136", "MQ7", "WATER", "TEMP")

# Map Arduino sensor labels to our internal sensor IDs
_KEY_MAP = {
    "MQ2":   "mq2",
    "MQ136": "mq136",
    "MQ7":   "mq7",
    "WATER": "water_level",
    "TEMP":  "temp_c",
}


class SerialReader:
    """Reads sensor frames from an Arduino over USB serial."""

    def __init__(self, port: str, baud: int) -> None:
        self._port = port
        self._baud = baud
        self._ser: serial.Serial | None = None

    # ── Lifecycle ──────────────────────────────────────────────────────────────
    def open(self) -> None:
        port = self._port or _auto_detect_port()
        log.info("Opening serial port %s @ %d baud", port, self._baud)
        self._ser = serial.Serial()
        self._ser.port = port
        self._ser.baudrate = self._baud
        self._ser.timeout = 3
        # Don't toggle DTR/RTS – avoids resetting the Arduino
        self._ser.dtr = False
        self._ser.rts = False
        self._ser.open()
        time.sleep(2)
        self._ser.reset_input_buffer()
        log.info("Serial port open")

    def close(self) -> None:
        if self._ser and self._ser.is_open:
            self._ser.close()
            log.info("Serial port closed")

    # ── Iteration ──────────────────────────────────────────────────────────────
    def readings(self) -> Generator[dict, None, None]:
        """
        Accumulate sensor lines until '---' delimiter, then yield one dict.
        """
        if self._ser is None:
            raise RuntimeError("Call open() before iterating readings()")

        buf: dict[str, float] = {}
        missing: set[str] = set()

        while True:
            raw = self._ser.readline().decode("utf-8", errors="ignore").strip()
            if not raw:
                continue

            # Frame delimiter – yield accumulated reading
            if raw == "---":
                if buf:
                    out = {}
                    for key in SENSOR_KEYS:
                        sid = _KEY_MAP[key]
                        val = buf.get(sid, 0.0)
                        # Convert water level raw ADC (0-1023) to percentage
                        if sid == "water_level":
                            out["water_level_adc"] = val  # preserve raw value
                            val = (val / 1023.0) * 100.0
                        out[sid] = val
                    out["buzzer"] = False
                    yield out
                buf.clear()
                missing.clear()
                continue

            # Status messages
            if raw.startswith("STATUS:"):
                log.info("Arduino status: %s", raw.split(":", 1)[1])
                continue

            # Sensor lines: "MQ2:123" or "MQ2:123:MISSING"
            parts = raw.split(":")
            if len(parts) >= 2 and parts[0] in _KEY_MAP:
                sid = _KEY_MAP[parts[0]]
                try:
                    buf[sid] = float(parts[1])
                except ValueError:
                    log.debug("Bad value in %s", raw)
                if len(parts) >= 3 and parts[2] == "MISSING":
                    missing.add(parts[0])
            else:
                log.debug("Unparseable serial line: %s", raw)


# ── Internal helpers ───────────────────────────────────────────────────────────
def _auto_detect_port() -> str:
    candidates = serial.tools.list_ports.comports()

    for p in candidates:
        desc = (p.description or "").lower()
        if any(k in desc for k in _ARDUINO_KEYWORDS):
            log.info("Auto-detected Arduino on %s (%s)", p.device, p.description)
            return p.device

    for p in candidates:
        if "usb" in (p.device or "").lower():
            log.warning("Falling back to USB port %s", p.device)
            return p.device

    raise RuntimeError(
        "No Arduino serial port found. "
        "Set SERIAL_PORT env var or check USB connection."
    )
