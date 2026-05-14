"""
test_serial_reader.py — Unit tests for serial_reader.py

We mock `serial.Serial` so no real USB port is needed.

Tests cover:
  - readings() raises RuntimeError if open() was never called
  - Valid JSON sensor line → yielded as dict
  - Status message lines ({"status": "…"}) → skipped, not yielded
  - Malformed / non-JSON lines → skipped silently
  - Empty lines → skipped
  - "buzzer" key present in JSON → passed through as-is (Arduino format)
  - close() closes the serial port
  - Auto-detect port helper uses keywords to find a matching port
"""
import json
import sys
from io import BytesIO
from unittest.mock import MagicMock, patch, PropertyMock
import pytest


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _make_serial_mock(lines: list[str]):
    """Return a mock serial.Serial whose readline() pops from `lines`."""
    mock_ser = MagicMock()
    mock_ser.is_open = True

    encoded = [l.encode() + b"\n" for l in lines]
    mock_ser.readline.side_effect = encoded + [b""]  # empty → stops iteration

    return mock_ser


def _first_n_readings(reader, n: int) -> list[dict]:
    """Collect exactly n yielded dicts from SerialReader.readings()."""
    results = []
    for reading in reader.readings():
        results.append(reading)
        if len(results) >= n:
            break
    return results


# ── open() / close() ─────────────────────────────────────────────────────────────

@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_open_creates_serial_connection(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    mock_serial_cls.return_value = _make_serial_mock([])
    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()

    mock_serial_cls.assert_called_once_with("/dev/ttyUSB0", 115200, timeout=3)


@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_close_closes_serial_port(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    mock_ser = _make_serial_mock([])
    mock_serial_cls.return_value = mock_ser

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()
    reader.close()

    mock_ser.close.assert_called_once()


# ── readings() — RuntimeError guard ──────────────────────────────────────────────

def test_readings_without_open_raises():
    from serial_reader import SerialReader

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    with pytest.raises(RuntimeError, match="open()"):
        next(reader.readings())


# ── readings() — valid sensor data ───────────────────────────────────────────────

@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_valid_json_line_is_yielded(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    line = json.dumps({"mq2": 145.3, "mq136": 4.1, "mq7": 22.8, "buzzer": False})
    mock_serial_cls.return_value = _make_serial_mock([line])

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()
    results = _first_n_readings(reader, 1)

    assert len(results) == 1
    assert results[0]["mq2"]    == pytest.approx(145.3)
    assert results[0]["mq136"]  == pytest.approx(4.1)
    assert results[0]["mq7"]    == pytest.approx(22.8)
    assert results[0]["buzzer"] is False


@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_multiple_valid_lines_all_yielded(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    lines = [
        json.dumps({"mq2": 100.0, "mq136": 3.0, "mq7": 15.0, "buzzer": False}),
        json.dumps({"mq2": 200.0, "mq136": 6.0, "mq7": 30.0, "buzzer": False}),
        json.dumps({"mq2": 300.0, "mq136": 9.0, "mq7": 45.0, "buzzer": False}),
    ]
    mock_serial_cls.return_value = _make_serial_mock(lines)

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()
    results = _first_n_readings(reader, 3)

    assert len(results) == 3
    assert results[2]["mq2"] == pytest.approx(300.0)


# ── readings() — lines to skip ───────────────────────────────────────────────────

@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_warming_up_status_message_is_skipped(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    lines = [
        json.dumps({"status": "warming_up"}),
        json.dumps({"status": "warming_up"}),
        json.dumps({"mq2": 50.0, "mq136": 2.0, "mq7": 10.0, "buzzer": False}),
    ]
    mock_serial_cls.return_value = _make_serial_mock(lines)

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()
    results = _first_n_readings(reader, 1)

    assert len(results) == 1
    assert "mq2" in results[0]


@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_ready_status_message_is_skipped(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    lines = [
        json.dumps({"status": "ready"}),
        json.dumps({"mq2": 50.0, "mq136": 2.0, "mq7": 10.0, "buzzer": False}),
    ]
    mock_serial_cls.return_value = _make_serial_mock(lines)

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()
    results = _first_n_readings(reader, 1)

    assert "status" not in results[0]


@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_malformed_json_is_skipped(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    lines = [
        "NOT JSON AT ALL",
        "{broken: json}",
        json.dumps({"mq2": 75.0, "mq136": 3.5, "mq7": 18.0, "buzzer": False}),
    ]
    mock_serial_cls.return_value = _make_serial_mock(lines)

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()
    results = _first_n_readings(reader, 1)

    assert len(results) == 1
    assert results[0]["mq2"] == pytest.approx(75.0)


@patch("serial_reader.serial.Serial")
@patch("serial_reader.time.sleep")
def test_empty_lines_are_skipped(mock_sleep, mock_serial_cls):
    from serial_reader import SerialReader

    # Patch readline to return empty bytes (skipped), then a real line
    mock_ser = MagicMock()
    mock_ser.is_open = True
    sensor_line = json.dumps({"mq2": 50.0, "mq136": 2.0, "mq7": 10.0, "buzzer": False}).encode() + b"\n"
    mock_ser.readline.side_effect = [b"\n", b"   \n", sensor_line, b""]
    mock_serial_cls.return_value = mock_ser

    reader = SerialReader(port="/dev/ttyUSB0", baud=115200)
    reader.open()
    results = _first_n_readings(reader, 1)

    assert len(results) == 1


# ── Auto-detect ───────────────────────────────────────────────────────────────────

def test_auto_detect_raises_when_no_port_found():
    from serial_reader import _auto_detect_port

    fake_port = MagicMock()
    fake_port.description = "Some Random Device"
    fake_port.device = "/dev/ttyS0"

    with patch("serial_reader.serial.tools.list_ports.comports", return_value=[fake_port]):
        with pytest.raises(RuntimeError, match="No Arduino"):
            _auto_detect_port()


def test_auto_detect_finds_ch340_port():
    from serial_reader import _auto_detect_port

    fake_port = MagicMock()
    fake_port.description = "USB-SERIAL CH340"
    fake_port.device = "/dev/ttyUSB0"

    with patch("serial_reader.serial.tools.list_ports.comports", return_value=[fake_port]):
        result = _auto_detect_port()

    assert result == "/dev/ttyUSB0"


def test_auto_detect_finds_arduino_port():
    from serial_reader import _auto_detect_port

    fake_port = MagicMock()
    fake_port.description = "Arduino Uno"
    fake_port.device = "/dev/ttyACM0"

    with patch("serial_reader.serial.tools.list_ports.comports", return_value=[fake_port]):
        result = _auto_detect_port()

    assert result == "/dev/ttyACM0"
