#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  Gas Sensor System — One-command setup
#  Run: bash setup.sh
#  Supported on: Raspberry Pi OS (Debian-based), Ubuntu, macOS (dev only)
# ══════════════════════════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 0. Check .env ──────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env created from .env.example — EDIT IT before continuing"
    warn "  Open .env and set DATABASE_URL and INGEST_SECRET, then re-run setup.sh"
    exit 0
  else
    die ".env file not found. Create it from .env.example first."
  fi
fi

source .env

if [[ -z "$DATABASE_URL" ]]; then
  die "DATABASE_URL is not set in .env"
fi

info "DATABASE_URL is set ✓"

# ── 1. Node.js dependencies ────────────────────────────────────────────────────
info "Installing Node.js dependencies…"
npm install

# ── 2. DB initialisation (runs the SQL via Next.js API on first start) ─────────
# We trigger it by calling the /api/readings endpoint after the server starts.
# The server is started momentarily during next build step if needed.

# ── 3. Next.js production build ───────────────────────────────────────────────
info "Building Next.js production app…"
npm run build
info "Next.js build complete ✓"

# ── 4. Python venv for Raspberry Pi agent ─────────────────────────────────────
PI_DIR="$SCRIPT_DIR/hardware/raspberry-pi"

if command -v python3 &>/dev/null; then
  info "Setting up Python virtual environment for the Pi agent…"
  python3 -m venv "$PI_DIR/venv"
  "$PI_DIR/venv/bin/pip" install --upgrade pip -q
  "$PI_DIR/venv/bin/pip" install -r "$PI_DIR/requirements.txt" -q
  info "Python venv ready ✓"
else
  warn "python3 not found — skipping Pi agent venv setup"
fi

# ── 5. systemd service install (Raspberry Pi only) ────────────────────────────
if [[ "$(uname -m)" == arm* || "$(uname -m)" == aarch64 ]]; then
  info "Raspberry Pi detected — installing systemd service…"
  SERVICE_SRC="$PI_DIR/gas-agent.service"
  SERVICE_DST="/etc/systemd/system/gas-agent.service"

  # Patch WorkingDirectory and EnvironmentFile paths
  sed \
    -e "s|/home/pi/gas-sensor|$SCRIPT_DIR|g" \
    -e "s|User=pi|User=$(whoami)|g" \
    "$SERVICE_SRC" | sudo tee "$SERVICE_DST" > /dev/null

  sudo systemctl daemon-reload
  sudo systemctl enable gas-agent
  info "systemd service installed and enabled ✓"
fi

# ── 6. Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Start the dashboard:"
echo "    npm start              (production)"
echo "    npm run dev            (development)"
echo ""
echo "  Start the Pi agent (foreground):"
echo "    bash run.sh"
echo ""
echo "  Start the Pi agent as a service (Raspberry Pi):"
echo "    sudo systemctl start gas-agent"
echo "    journalctl -fu gas-agent"
echo ""
