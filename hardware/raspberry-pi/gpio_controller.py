"""
gpio_controller.py — Relay and buzzer GPIO management.

Single Responsibility: owns everything to do with physical output pins.

Usage:
    ctrl = GPIOController(relay_pin=17, buzzer_pin=18)
    ctrl.setup()
    ctrl.set_outputs(relay=True, buzzer=True)
    ctrl.cleanup()

On non-Pi hardware RPi.GPIO is not available; the controller falls back
to a no-op stub so the rest of the agent runs unchanged in dev mode.
"""
import logging
from dataclasses import dataclass

log = logging.getLogger("gas-agent.gpio")

# ── Try to import RPi.GPIO; fall back silently ─────────────────────────────────
try:
    import RPi.GPIO as _GPIO  # type: ignore
    _HAS_GPIO = True
except ImportError:
    _GPIO = None  # type: ignore
    _HAS_GPIO = False
    log.warning("RPi.GPIO not available — relay/buzzer control disabled (dev mode)")


@dataclass
class GPIOController:
    """Controls two relays and a buzzer via GPIO (BCM pin numbers)."""

    relay_pin:           int
    relay2_pin:          int
    buzzer_pin:          int
    relay_active_high:   bool = True
    relay2_active_high:  bool = True
    buzzer_active_high:  bool = True

    # ── Lifecycle ──────────────────────────────────────────────────────────────
    def setup(self) -> None:
        """Configure pins as outputs and drive them low (inactive)."""
        if not _HAS_GPIO:
            return
        _GPIO.setmode(_GPIO.BCM)
        _GPIO.setwarnings(False)
        _GPIO.setup(self.relay_pin,  _GPIO.OUT)
        _GPIO.setup(self.relay2_pin, _GPIO.OUT)
        _GPIO.setup(self.buzzer_pin, _GPIO.OUT)
        self._write_pin(self.relay_pin,  active=False, active_high=self.relay_active_high)
        self._write_pin(self.relay2_pin, active=False, active_high=self.relay2_active_high)
        self._write_pin(self.buzzer_pin, active=False, active_high=self.buzzer_active_high)
        log.info("GPIO pins configured — relay1=%d  relay2=%d  buzzer=%d",
                 self.relay_pin, self.relay2_pin, self.buzzer_pin)

    def cleanup(self) -> None:
        """Deactivate outputs and release GPIO resources."""
        if not _HAS_GPIO:
            return
        self._write_pin(self.relay_pin,  active=False, active_high=self.relay_active_high)
        self._write_pin(self.relay2_pin, active=False, active_high=self.relay2_active_high)
        self._write_pin(self.buzzer_pin, active=False, active_high=self.buzzer_active_high)
        _GPIO.cleanup()
        log.info("GPIO cleaned up")

    # ── Control ────────────────────────────────────────────────────────────────
    def set_outputs(self, *, relay1: bool, relay2: bool, buzzer: bool) -> None:
        """Drive both relays and buzzer to the requested states."""
        log.debug("Outputs → relay1=%s  relay2=%s  buzzer=%s", _state(relay1), _state(relay2), _state(buzzer))
        if not _HAS_GPIO:
            return
        self._write_pin(self.relay_pin,  active=relay1, active_high=self.relay_active_high)
        self._write_pin(self.relay2_pin, active=relay2, active_high=self.relay2_active_high)
        self._write_pin(self.buzzer_pin, active=buzzer, active_high=self.buzzer_active_high)

    # ── Internal ───────────────────────────────────────────────────────────────
    @staticmethod
    def _write_pin(pin: int, *, active: bool, active_high: bool) -> None:
        level = _GPIO.HIGH if (active == active_high) else _GPIO.LOW
        _GPIO.output(pin, level)


def _state(flag: bool) -> str:
    return "ON" if flag else "OFF"
