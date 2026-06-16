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
        try:
            # Toggle DTR briefly to reset the Arduino on (re)connect
            self._ser.dtr = True
            self._ser.rts = False
            self._ser.open()
            time.sleep(0.1)
            self._ser.dtr = False
            time.sleep(2)
            self._ser.reset_input_buffer()
        except (serial.SerialException, OSError) as exc:
            log.warning("Serial open failed: %s", exc)
            self._ser = None
            raise
        log.info("Serial port open")

    def close(self) -> None:
        if self._ser and self._ser.is_open:
            self._ser.close()
            log.info("Serial port closed")

    def reopen(self) -> None:
        """Close and reopen the serial port to reset the Arduino."""
        self.close()
        time.sleep(1)
        self.open()

    # ── Iteration ──────────────────────────────────────────────────────────────
    def readings(self) -> Generator[dict, None, None]:
        """
        Accumulate sensor lines until '---' delimiter, then yield one dict.
        Auto-reconnects if no valid data received for >60 seconds.
        """
        if self._ser is None:
            raise RuntimeError("Call open() before iterating readings()")

        buf: dict[str, float] = {}
        missing: set[str] = set()
        idle_loops = 0

        while True:
            try:
                raw = self._ser.readline().decode("utf-8", errors="ignore").strip()
            except serial.SerialException as exc:
                log.warning("Serial read error: %s — reconnecting in 5s", exc)
                time.sleep(5)
                self.reopen()
                continue

            if not raw:
                idle_loops += 1
                if idle_loops == 5:  # ~15s
                    log.warning("No serial data for ~15s — waiting…")
                elif idle_loops >= 20:  # ~60s
                    log.warning("No serial data for ~60s — reconnecting")
                    idle_loops = 0
                    buf.clear()
                    missing.clear()
                    self.reopen()
                continue

            idle_loops = 0

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
