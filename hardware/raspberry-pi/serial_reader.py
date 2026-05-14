"""
serial_reader.py — Arduino serial communication.

Single Responsibility: open the serial port, iterate JSON lines from
the Arduino, and yield parsed dictionaries to the caller.

Usage:
    reader = SerialReader(port="", baud=115200)
    reader.open()
    for reading in reader.readings():
        print(reading)   # {"mq2": 123.4, "mq136": 5.6, "mq7": 78.9, "buzzer": False}
    reader.close()
"""
import json
import logging
import time
from typing import Generator

import serial
import serial.tools.list_ports

log = logging.getLogger("gas-agent.serial")

# Keywords that appear in descriptions of Arduino-compatible USB-serial adapters
_ARDUINO_KEYWORDS = ("arduino", "ch340", "cp210", "usb serial", "ttyacm", "ttyusb")


class SerialReader:
    """Reads JSON frames from an Arduino over USB serial."""

    def __init__(self, port: str, baud: int) -> None:
        self._port = port   # empty string → auto-detect
        self._baud = baud
        self._ser: serial.Serial | None = None

    # ── Lifecycle ──────────────────────────────────────────────────────────────
    def open(self) -> None:
        port = self._port or _auto_detect_port()
        log.info("Opening serial port %s @ %d baud", port, self._baud)
        self._ser = serial.Serial(port, self._baud, timeout=3)
        time.sleep(2)                        # allow Arduino to reset after DTR
        self._ser.reset_input_buffer()
        log.info("Serial port open — waiting for Arduino ready signal…")

    def close(self) -> None:
        if self._ser and self._ser.is_open:
            self._ser.close()
            log.info("Serial port closed")

    # ── Iteration ──────────────────────────────────────────────────────────────
    def readings(self) -> Generator[dict, None, None]:
        """
        Yield one dict per valid sensor-reading JSON line.
        Status messages (warming_up / ready) are logged and skipped.
        Malformed lines are silently discarded.
        """
        if self._ser is None:
            raise RuntimeError("Call open() before iterating readings()")

        while True:
            raw = self._ser.readline().decode("utf-8", errors="ignore").strip()
            if not raw:
                continue

            try:
                data: dict = json.loads(raw)
            except json.JSONDecodeError:
                log.debug("Unparseable serial line: %s", raw)
                continue

            # Arduino status messages (e.g. {"status": "warming_up"})
            if "status" in data:
                log.info("Arduino status: %s", data["status"])
                continue

            yield data


# ── Internal helpers ───────────────────────────────────────────────────────────
def _auto_detect_port() -> str:
    candidates = serial.tools.list_ports.comports()

    for p in candidates:
        desc = (p.description or "").lower()
        if any(k in desc for k in _ARDUINO_KEYWORDS):
            log.info("Auto-detected Arduino on %s (%s)", p.device, p.description)
            return p.device

    # Fallback: first port with "usb" in the device path
    for p in candidates:
        if "usb" in (p.device or "").lower():
            log.warning("Falling back to USB port %s", p.device)
            return p.device

    raise RuntimeError(
        "No Arduino serial port found. "
        "Set SERIAL_PORT env var or check USB connection."
    )
