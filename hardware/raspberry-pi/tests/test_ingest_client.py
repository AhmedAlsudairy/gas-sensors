"""
test_ingest_client.py — Unit tests for ingest_client.py

Tests cover:
  - Successful POST on the first attempt
  - Correct URL construction (dashboard_url + /api/ingest)
  - x-ingest-secret header sent when secret is non-empty
  - No x-ingest-secret header when secret is empty
  - Payload structure (readings list, relay flag, reason field)
  - Retry on transient failure (RequestException), succeed on 2nd attempt
  - Retry on non-OK HTTP status, succeed later
  - Exhausting all retries → no exception raised (errors are absorbed)
  - Back-off sleep called between retries
"""
from unittest.mock import MagicMock, patch, call
import pytest
import requests

from threshold_service import SensorReading
from ingest_client import IngestClient


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _ok_response(status=200):
    r = MagicMock()
    r.ok = True
    r.status_code = status
    return r


def _err_response(status=500):
    r = MagicMock()
    r.ok = False
    r.status_code = status
    r.text = "Internal Server Error"
    return r


SAMPLE_READINGS = [
    SensorReading("mq2",   145.3, "safe"),
    SensorReading("mq136", 4.1,   "safe"),
    SensorReading("mq7",   22.8,  "safe"),
]


def _client(**kwargs):
    defaults = dict(
        dashboard_url="http://localhost:3000",
        secret="testsecret",
        retries=3,
        timeout=5.0,
    )
    defaults.update(kwargs)
    return IngestClient(**defaults)


# ── Success path ─────────────────────────────────────────────────────────────────

@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_successful_post_calls_requests_once(mock_sleep, mock_post):
    mock_post.return_value = _ok_response()
    _client().post(SAMPLE_READINGS, relay=False, reason=None)

    assert mock_post.call_count == 1
    mock_sleep.assert_not_called()


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_correct_url_constructed(mock_sleep, mock_post):
    mock_post.return_value = _ok_response()
    _client(dashboard_url="https://gas-sensors.vercel.app").post(
        SAMPLE_READINGS, relay=False, reason=None
    )

    url = mock_post.call_args[0][0]
    assert url == "https://gas-sensors.vercel.app/api/ingest"


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_ingest_secret_header_sent(mock_sleep, mock_post):
    mock_post.return_value = _ok_response()
    _client(secret="mys3cr3t").post(SAMPLE_READINGS, relay=False, reason=None)

    headers = mock_post.call_args[1]["headers"]
    assert headers["x-ingest-secret"] == "mys3cr3t"


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_no_secret_header_when_secret_empty(mock_sleep, mock_post):
    mock_post.return_value = _ok_response()
    _client(secret="").post(SAMPLE_READINGS, relay=False, reason=None)

    headers = mock_post.call_args[1]["headers"]
    assert "x-ingest-secret" not in headers


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_payload_structure(mock_sleep, mock_post):
    mock_post.return_value = _ok_response()
    _client().post(SAMPLE_READINGS, relay=True, reason="Danger: MQ2")

    payload = mock_post.call_args[1]["json"]
    assert payload["relay"] is True
    assert payload["reason"] == "Danger: MQ2"
    assert len(payload["readings"]) == 3

    first = payload["readings"][0]
    assert first["sensor_id"] == "mq2"
    assert first["ppm"]       == pytest.approx(145.3)
    assert first["status"]    == "safe"


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_relay_false_and_no_reason_in_payload(mock_sleep, mock_post):
    mock_post.return_value = _ok_response()
    _client().post(SAMPLE_READINGS, relay=False, reason=None)

    payload = mock_post.call_args[1]["json"]
    assert payload["relay"]  is False
    assert payload["reason"] is None


# ── Retry path ───────────────────────────────────────────────────────────────────

@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_retries_on_request_exception_then_succeeds(mock_sleep, mock_post):
    mock_post.side_effect = [
        requests.RequestException("timeout"),
        _ok_response(),
    ]
    _client(retries=3).post(SAMPLE_READINGS, relay=False, reason=None)

    assert mock_post.call_count == 2
    mock_sleep.assert_called_once_with(1)   # 2**0 = 1 s after first failure


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_retries_on_http_error_then_succeeds(mock_sleep, mock_post):
    mock_post.side_effect = [
        _err_response(500),
        _ok_response(),
    ]
    _client(retries=3).post(SAMPLE_READINGS, relay=False, reason=None)

    assert mock_post.call_count == 2


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_all_retries_exhausted_no_exception_raised(mock_sleep, mock_post):
    mock_post.side_effect = requests.RequestException("network down")
    # Should NOT raise — agent loop must continue
    _client(retries=3).post(SAMPLE_READINGS, relay=False, reason=None)

    assert mock_post.call_count == 3


@patch("ingest_client.requests.post")
@patch("ingest_client.time.sleep")
def test_exponential_backoff_sleep_values(mock_sleep, mock_post):
    mock_post.side_effect = [
        requests.RequestException("err"),
        requests.RequestException("err"),
        requests.RequestException("err"),
    ]
    _client(retries=3).post(SAMPLE_READINGS, relay=False, reason=None)

    # sleep is called after every attempt (including the last), so 3 sleeps total
    sleep_values = [c[0][0] for c in mock_sleep.call_args_list]
    assert sleep_values == [1, 2, 4]   # 2**0, 2**1, 2**2
