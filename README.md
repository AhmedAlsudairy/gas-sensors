# Gas Sensor Monitor

Real-time dashboard for **MQ-2**, **MQ-136**, and **MQ-7** gas sensors.
Arduino → Raspberry Pi → Neon PostgreSQL → Vercel (SSE stream) — works from anywhere in the world.

---

## How it works

```
Arduino UNO  (your desk)
  ├─ MQ-2  A0  — combustible gas / smoke
  ├─ MQ-136 A1 — hydrogen sulfide H2S
  ├─ MQ-7  A2  — carbon monoxide CO
  └─ Buzzer D8 — onboard alert
        │ USB serial 115200 baud
        ▼
Raspberry Pi  (same room as Arduino)
  ├─ Reads JSON from Arduino every ~1 s
  ├─ Drives GPIO 17 relay + GPIO 18 buzzer
  └─ POST https://your-app.vercel.app/api/ingest
        Header: x-ingest-secret: <your secret>
              │
              ▼
        Neon PostgreSQL  (cloud DB, free tier)
              │
              ▼
        Vercel Edge  (global CDN)
        GET /api/sse  — SSE stream, polled every 1.5 s
              │
              ▼
        Any browser, anywhere in the world
        Three.js 3D gauges + sparklines, green LIVE badge
```

---

## Hardware Wiring

### Arduino UNO → MQ Sensors + Buzzer

| Arduino Pin | Connect to          | Notes                        |
|-------------|---------------------|------------------------------|
| A0          | MQ-2  AOUT          | Combustible gas / smoke      |
| A1          | MQ-136 AOUT         | Hydrogen sulfide             |
| A2          | MQ-7  AOUT          | Carbon monoxide              |
| 5V          | All sensor VCC pins | Power for all 3 sensors      |
| GND         | All sensor GND pins | Ground for all 3 sensors     |
| D8          | Buzzer +            | Active buzzer, active-HIGH   |
| GND         | Buzzer −            |                              |

### Raspberry Pi GPIO (BCM pin numbers) → Relay + Buzzer

| Pi Pin    | BCM | Connect to   | Notes                          |
|-----------|-----|--------------|--------------------------------|
| Pin 11    | 17  | Relay IN     | Relay activates on danger      |
| Pin 12    | 18  | Buzzer +     | Pi-side buzzer (optional)      |
| Pin 2     | —   | Relay VCC    | 5 V power for relay module     |
| Pin 6     | —   | Relay GND    | Ground                         |

> Relay NO/COM connects to the 12 V alarm/fan circuit from the circuit diagram.

---

## Prerequisites

| What you need | Where to get it |
|---------------|-----------------|
| Raspberry Pi (any model with GPIO) | — |
| Python 3.9+ on the Pi | pre-installed on Pi OS |
| Node.js v20 LTS on the Pi / your PC | `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs` |
| Arduino IDE 2.x | https://www.arduino.cc/en/software |
| Neon account (free) | https://console.neon.tech — click **Sign up** |
| Vercel account (free) | https://vercel.com/signup |

---

## Part 1 — Neon database

1. Log in to https://console.neon.tech
2. Click **New Project** → give it a name (e.g. `gas-sensors`) → **Create**
3. On the project page click **Connection Details**
4. Copy the connection string — it looks like:
   ```
   postgresql://ahmed:AbCdEf@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   Save this — you will need it in Part 2 and Part 3.

> The database tables are created automatically the first time the Pi posts data. No SQL to run manually.

---

## Part 2 — Deploy to Vercel (the public dashboard)

### 2-a  Import the repo

1. Go to https://vercel.com/new
2. Click **Import** next to `AhmedAlsudairy/gas-sensors`
3. Framework preset: **Next.js** (auto-detected)
4. **Do not deploy yet** — add env vars first (next step)

### 2-b  Add environment variables

In the same Vercel import screen, scroll to **Environment Variables** and add:

| Name | Value | Notes |
|------|-------|-------|
| `DATABASE_URL` | `postgresql://...` | The Neon connection string from Part 1 |
| `INGEST_SECRET` | e.g. `mysecret123` | Any password you choose — write it down, you need the same value on the Pi |

### 2-c  Deploy

Click **Deploy**. After ~1 minute you get a URL like:
```
https://gas-sensors-ahmed.vercel.app
```
Open it — you should see the dashboard with a grey **SIMULATED** badge (real data starts in Part 4).

---

## Part 3 — Raspberry Pi setup

Run all commands below **on the Raspberry Pi** in a terminal.

### 3-a  Clone the repo

```bash
git clone https://github.com/AhmedAlsudairy/gas-sensors.git
cd gas-sensors
```

### 3-b  Create `.env`

```bash
cp .env.example .env
nano .env
```

Fill in **exactly these three lines** (replace the values):

```env
DATABASE_URL=postgresql://ahmed:AbCdEf@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
INGEST_SECRET=mysecret123
DASHBOARD_URL=https://gas-sensors-ahmed.vercel.app
```

- `DATABASE_URL` — same Neon string from Part 1
- `INGEST_SECRET` — same value you put in Vercel in Part 2-b
- `DASHBOARD_URL` — your Vercel URL from Part 2-c

Save and close (`Ctrl+X` → `Y` → Enter).

### 3-c  Run setup (installs everything)

```bash
bash setup.sh
```

This installs Python packages (`pyserial`, `requests`, `RPi.GPIO`) into a virtual environment. Takes ~2 minutes.

---

## Part 4 — Arduino

1. Connect Arduino to your PC via USB
2. Open **Arduino IDE**
3. **File → Open** → navigate to `hardware/arduino/gas_sensors.ino`
4. **Tools → Board → Arduino UNO**
5. **Tools → Port** → select the COM port for your Arduino
6. Click **Upload** (→ arrow button)
7. After upload, plug the Arduino USB into the Raspberry Pi

> The Arduino prints `{"status":"warming_up"}` for 20 seconds, then starts sending readings like:
> `{"mq2":145.3,"mq136":4.1,"mq7":22.8,"buzzer":false}`

---

## Part 5 — Start the Pi agent

```bash
bash run.sh
```

You should see log output like:
```
2026-05-14T10:23:01 [INFO] Opening serial port /dev/ttyUSB0 @ 115200 baud
2026-05-14T10:23:03 [INFO] Arduino status: warming_up
2026-05-14T10:23:23 [INFO] Arduino status: ready
2026-05-14T10:23:24 [INFO] MQ-2=145.3  MQ-136=4.1  MQ-7=22.8  alarm=OFF  reason=—
```

Now open your Vercel dashboard URL in any browser — the badge turns green: **LIVE 10:23:24**

---

## Part 6 — Auto-start on Pi reboot (optional)

```bash
sudo systemctl start gas-agent
sudo systemctl enable gas-agent
journalctl -fu gas-agent    # watch live logs
```

From now on the agent starts automatically every time the Pi boots.

---

## Sensor Thresholds

| Sensor  | Measures               | Warning   | Danger     | Max range   |
|---------|------------------------|-----------|------------|-------------|
| MQ-2    | Combustible gas/smoke  | 300 ppm   | 1000 ppm   | 10 000 ppm  |
| MQ-136  | Hydrogen sulfide H2S   | 10 ppm    | 50 ppm     | 200 ppm     |
| MQ-7    | Carbon monoxide CO     | 50 ppm    | 200 ppm    | 2 000 ppm   |

When **any** sensor hits **danger**: relay on GPIO 17 activates, buzzer on GPIO 18 sounds.

---

## Sensor Calibration

The MQ sensors ship with default R0 values. For accurate ppm readings:

1. Let sensors run in **clean outdoor air** for **24 hours**
2. Open Arduino IDE → **Tools → Serial Monitor** → set baud to `115200`
3. Note the Rs values printed in the JSON
4. Open `hardware/arduino/gas_sensors.ino` and update:
   ```cpp
   float R0_MQ2   = 9.83;   // replace with your measured value
   float R0_MQ136 = 3.60;
   float R0_MQ7   = 27.5;
   ```
5. Re-upload the sketch

---

## Environment Variables reference

### On Vercel (Settings → Environment Variables)

| Variable        | Example value | Description |
|-----------------|---------------|-------------|
| `DATABASE_URL`  | `postgresql://...` | Neon connection string |
| `INGEST_SECRET` | `mysecret123` | Locks the ingest endpoint — only the Pi can write data |

### On Raspberry Pi (.env file)

| Variable            | Example value | Description |
|---------------------|---------------|-------------|
| `DATABASE_URL`      | `postgresql://...` | Same Neon string |
| `INGEST_SECRET`     | `mysecret123` | Must match Vercel exactly |
| `DASHBOARD_URL`     | `https://gas-sensors-ahmed.vercel.app` | Your Vercel URL |
| `SERIAL_PORT`       | `/dev/ttyUSB0` | Leave empty to auto-detect |
| `BAUD_RATE`         | `115200` | Leave as-is |
| `RELAY_PIN`         | `17` | BCM pin for relay (default 17) |
| `BUZZER_PIN`        | `18` | BCM pin for buzzer (default 18) |

---

## Project file structure

```
gas-sensor/
├─ app/
│   ├─ page.tsx                 Main dashboard — Three.js gauges, SSE, light/dark
│   ├─ layout.tsx
│   └─ api/
│       ├─ ingest/route.ts      POST  — Pi agent writes readings here
│       ├─ readings/route.ts    GET   — last N readings per sensor
│       └─ sse/route.ts         SSE   — Edge runtime, streams to browser
├─ components/
│   └─ gauge-3d.tsx             WebGL 3D gauge (Three.js)
├─ lib/
│   └─ db.ts                    Neon DB connection + auto-creates tables
├─ hardware/
│   ├─ arduino/
│   │   └─ gas_sensors.ino      Arduino sketch (MQ-2/136/7 + buzzer)
│   └─ raspberry-pi/
│       ├─ agent.py             Orchestrator — thin entry point
│       ├─ config.py            All env-var config in one place
│       ├─ gpio_controller.py   Relay + buzzer GPIO (safe stub if no RPi.GPIO)
│       ├─ serial_reader.py     Serial port open + JSON line iterator
│       ├─ threshold_service.py ppm → safe/warning/danger + alarm decision
│       ├─ ingest_client.py     HTTP POST with exponential back-off
│       ├─ requirements.txt
│       └─ gas-agent.service    systemd unit for auto-start
├─ vercel.json                  Vercel function config
├─ .env.example                 Template — copy to .env and fill in
├─ setup.sh                     One-command setup script
└─ run.sh                       Start Pi agent in foreground
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Dashboard badge stays **SIMULATED** | Pi agent not running or wrong `DASHBOARD_URL` | Check `bash run.sh` output; verify `DASHBOARD_URL` in `.env` matches your Vercel URL exactly |
| `No Arduino serial port found` | Arduino not plugged in or wrong port | Run `ls /dev/tty*` on Pi, set `SERIAL_PORT=/dev/ttyUSB0` in `.env` |
| Ingest returns **401** | `INGEST_SECRET` mismatch | The value in Pi `.env` must be identical to the value in Vercel env vars |
| All ppm values stuck at **0** | Sensor wiring issue or cold sensor | Check 5V/GND connections; wait 60 s for warm-up |
| Pi agent crashes on import | Missing Python packages | Re-run `bash setup.sh` |
| Vercel deployment fails | Missing env vars | Add `DATABASE_URL` and `INGEST_SECRET` in Vercel → Settings → Environment Variables → Redeploy |
| GPIO warnings on non-Pi machine | RPi.GPIO not available | Normal — relay/buzzer are silently disabled; everything else works |
