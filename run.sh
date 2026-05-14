#!/bin/bash
# Start the Raspberry Pi agent in the foreground
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/.env"
export DASHBOARD_URL INGEST_SECRET SERIAL_PORT BAUD_RATE RELAY_PIN

PI_DIR="$SCRIPT_DIR/hardware/raspberry-pi"
if [ -f "$PI_DIR/venv/bin/python" ]; then
  exec "$PI_DIR/venv/bin/python" "$PI_DIR/agent.py"
else
  exec python3 "$PI_DIR/agent.py"
fi
