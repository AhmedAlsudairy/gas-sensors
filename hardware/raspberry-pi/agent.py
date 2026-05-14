#!/usr/bin/env python3
"""
agent.py — Orchestrator (entry point).

Wires the individual modules together:
  SerialReader → ThresholdService → GPIOController + IngestClient

Hardware wiring
───────────────
  Arduino USB   → Raspberry Pi USB  (auto-detected, or set SERIAL_PORT)
  Relay IN      → GPIO 17 (BCM)
  Buzzer +      → GPIO 18 (BCM)
  Relay/Buzzer GND → Pi GND
  Relay/Buzzer VCC → Pi 5 V

All settings are controlled via environment variables; see config.py.
"""

import logging
import sys

import config
from gpio_controller import GPIOController
from ingest_client import IngestClient
from serial_reader import SerialReader
from threshold_service import ThresholdService

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("gas-agent")


def run() -> None:
    gpio = GPIOController(
        relay_pin=config.RELAY_PIN,
        buzzer_pin=config.BUZZER_PIN,
        relay_active_high=config.RELAY_ACTIVE_HIGH,
        buzzer_active_high=config.BUZZER_ACTIVE_HIGH,
    )
    reader = SerialReader(port=config.SERIAL_PORT, baud=config.BAUD_RATE)
    classifier = ThresholdService(thresholds=config.THRESHOLDS)
    client = IngestClient(
        dashboard_url=config.DASHBOARD_URL,
        secret=config.INGEST_SECRET,
        retries=config.INGEST_RETRIES,
        timeout=config.INGEST_TIMEOUT_S,
    )

    gpio.setup()
    reader.open()

    try:
        for raw in reader.readings():
            result = classifier.evaluate(raw)

            gpio.set_outputs(relay=result.alarm_active, buzzer=result.alarm_active)

            log.info(
                "MQ-2=%.1f  MQ-136=%.1f  MQ-7=%.1f  alarm=%s  reason=%s",
                raw.get("mq2",   0.0),
                raw.get("mq136", 0.0),
                raw.get("mq7",   0.0),
                "ON" if result.alarm_active else "OFF",
                result.alarm_reason or "—",
            )

            client.post(
                readings=result.readings,
                relay=result.alarm_active,
                reason=result.alarm_reason,
            )

    except KeyboardInterrupt:
        log.info("Interrupted — shutting down…")
    finally:
        gpio.cleanup()
        reader.close()
        log.info("Agent stopped")


if __name__ == "__main__":
    run()

