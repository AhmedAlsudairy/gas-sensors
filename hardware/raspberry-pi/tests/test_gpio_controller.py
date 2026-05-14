"""
test_gpio_controller.py — Unit tests for gpio_controller.py

Strategy:
  - In the test environment RPi.GPIO is not installed, so the controller
    runs in "dev-mode" (no-op). These tests verify it is safe to call
    all public methods without a real GPIO chip.
  - A second set of tests patches the internal _GPIO / _HAS_GPIO globals
    to simulate a Pi environment and asserts the correct GPIO calls are
    made with the right pin levels.
"""
import sys
from unittest.mock import MagicMock, call, patch
import pytest


# ── Dev-mode tests (no RPi.GPIO available) ──────────────────────────────────────

class TestGPIOControllerDevMode:
    """When RPi.GPIO is absent the controller must be a safe no-op."""

    def _make_controller(self, **kwargs):
        from gpio_controller import GPIOController
        defaults = dict(relay_pin=17, buzzer_pin=18,
                        relay_active_high=True, buzzer_active_high=True)
        defaults.update(kwargs)
        return GPIOController(**defaults)

    def test_setup_does_not_raise(self):
        ctrl = self._make_controller()
        ctrl.setup()   # should do nothing, not raise

    def test_cleanup_does_not_raise(self):
        ctrl = self._make_controller()
        ctrl.cleanup()

    def test_set_outputs_does_not_raise(self):
        ctrl = self._make_controller()
        ctrl.set_outputs(relay=True, buzzer=True)
        ctrl.set_outputs(relay=False, buzzer=False)
        ctrl.set_outputs(relay=True, buzzer=False)

    def test_dataclass_fields_stored(self):
        ctrl = self._make_controller(relay_pin=22, buzzer_pin=23,
                                     relay_active_high=False, buzzer_active_high=False)
        assert ctrl.relay_pin == 22
        assert ctrl.buzzer_pin == 23
        assert ctrl.relay_active_high is False
        assert ctrl.buzzer_active_high is False


# ── Simulated Pi environment (RPi.GPIO mocked) ─────────────────────────────────

class TestGPIOControllerWithMockedGPIO:
    """Patch _GPIO and _HAS_GPIO in gpio_controller to simulate real hardware."""

    @pytest.fixture(autouse=True)
    def mock_gpio(self):
        """Inject a mock GPIO module into gpio_controller's globals."""
        import gpio_controller as gc

        mock = MagicMock()
        mock.BCM    = 11   # arbitrary constant
        mock.OUT    = 0
        mock.HIGH   = 1
        mock.LOW    = 0

        self._orig_gpio    = gc._GPIO
        self._orig_has_gpio = gc._HAS_GPIO
        gc._GPIO     = mock
        gc._HAS_GPIO = True
        self.gpio = mock

        yield

        gc._GPIO     = self._orig_gpio
        gc._HAS_GPIO = self._orig_has_gpio

    def _ctrl(self, **kwargs):
        from gpio_controller import GPIOController
        defaults = dict(relay_pin=17, buzzer_pin=18,
                        relay_active_high=True, buzzer_active_high=True)
        defaults.update(kwargs)
        return GPIOController(**defaults)

    # setup()
    def test_setup_sets_bcm_mode(self):
        self._ctrl().setup()
        self.gpio.setmode.assert_called_once_with(self.gpio.BCM)

    def test_setup_configures_both_pins_as_output(self):
        self._ctrl().setup()
        assert call(17, self.gpio.OUT) in self.gpio.setup.call_args_list
        assert call(18, self.gpio.OUT) in self.gpio.setup.call_args_list

    def test_setup_drives_both_pins_low_initially(self):
        # active_high=True → inactive means LOW
        self._ctrl().setup()
        output_calls = self.gpio.output.call_args_list
        # Both relay (17) and buzzer (18) should be driven LOW (inactive)
        assert call(17, self.gpio.LOW) in output_calls
        assert call(18, self.gpio.LOW) in output_calls

    # set_outputs() — active HIGH polarity
    def test_relay_on_drives_high_when_active_high(self):
        ctrl = self._ctrl(relay_active_high=True)
        ctrl.set_outputs(relay=True, buzzer=False)
        self.gpio.output.assert_any_call(17, self.gpio.HIGH)

    def test_relay_off_drives_low_when_active_high(self):
        ctrl = self._ctrl(relay_active_high=True)
        ctrl.set_outputs(relay=False, buzzer=False)
        self.gpio.output.assert_any_call(17, self.gpio.LOW)

    def test_buzzer_on_drives_high_when_active_high(self):
        ctrl = self._ctrl(buzzer_active_high=True)
        ctrl.set_outputs(relay=False, buzzer=True)
        self.gpio.output.assert_any_call(18, self.gpio.HIGH)

    # set_outputs() — active LOW polarity
    def test_relay_on_drives_low_when_active_low(self):
        # active_low module: to activate we drive LOW
        ctrl = self._ctrl(relay_active_high=False)
        ctrl.set_outputs(relay=True, buzzer=False)
        self.gpio.output.assert_any_call(17, self.gpio.LOW)

    def test_relay_off_drives_high_when_active_low(self):
        ctrl = self._ctrl(relay_active_high=False)
        ctrl.set_outputs(relay=False, buzzer=False)
        self.gpio.output.assert_any_call(17, self.gpio.HIGH)

    # cleanup()
    def test_cleanup_calls_gpio_cleanup(self):
        ctrl = self._ctrl()
        ctrl.cleanup()
        self.gpio.cleanup.assert_called_once()

    def test_cleanup_drives_pins_low_before_cleanup(self):
        ctrl = self._ctrl(relay_active_high=True, buzzer_active_high=True)
        ctrl.cleanup()
        output_calls = self.gpio.output.call_args_list
        assert call(17, self.gpio.LOW) in output_calls
        assert call(18, self.gpio.LOW) in output_calls
