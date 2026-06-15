"""
threshold_fetcher.py — Periodically fetches thresholds from dashboard API.

Runs a background daemon thread that calls GET /api/thresholds every N
seconds and pushes the result to the ThresholdService via a callback.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable

import requests

log = logging.getLogger("gas-agent.threshold-fetcher")


class ThresholdFetcher:
    """Fetches thresholds from the dashboard on a background timer."""

    def __init__(
        self,
        dashboard_url: str,
        secret: str,
        interval_s: int,
        on_update: Callable[[dict[str, dict[str, float]]], None],
    ) -> None:
        self._url = f"{dashboard_url}/api/thresholds"
        self._headers = {"Accept": "application/json"}
        if secret:
            self._headers["x-ingest-secret"] = secret
        self._interval = interval_s
        self._on_update = on_update
        self._timer: threading.Timer | None = None
        self._started = False

    def start(self) -> None:
        """Start the background fetch loop."""
        self._started = True
        log.info("Threshold fetcher started (interval=%ds, url=%s)", self._interval, self._url)
        self._fetch()
        self._tick()

    def stop(self) -> None:
        """Stop the background fetch loop."""
        self._started = False
        if self._timer:
            self._timer.cancel()
            self._timer = None
        log.info("Threshold fetcher stopped")

    # ── Internal ───────────────────────────────────────────────────────────────

    def _tick(self) -> None:
        if not self._started:
            return
        self._timer = threading.Timer(self._interval, self._tick)
        self._timer.daemon = True
        self._timer.start()

    def _fetch(self) -> None:
        try:
            resp = requests.get(self._url, headers=self._headers, timeout=5)
            if not resp.ok:
                log.warning("Fetch thresholds HTTP %d", resp.status_code)
                return
            rows = resp.json()
            if not isinstance(rows, list):
                return
            thresholds: dict[str, dict[str, float]] = {}
            for row in rows:
                sid = row.get("sensor_id")
                if not sid:
                    continue
                thresholds[sid] = {
                    "warn": float(row["warn"]),
                    "danger": float(row["danger"]),
                }
            if thresholds:
                self._on_update(thresholds)
                log.info("Thresholds updated from dashboard (%d sensors)", len(thresholds))
        except requests.RequestException as exc:
            log.warning("Failed to fetch thresholds: %s", exc)
