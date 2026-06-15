"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Gauge3D = dynamic(
  () => import("../components/gauge-3d").then((m) => ({ default: m.Gauge3D })),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full aspect-square rounded-full"
        style={{ background: "rgba(30,41,59,0.4)", flexShrink: 0 }}
      />
    ),
  }
);

interface SensorConfig {
  id: string;
  name: string;
  gases: string[];
  unit: string;
  maxPpm: number;
  thresholds: { warn: number; danger: number };
  baseColor: string;
  description: string;
}

interface SensorReading {
  value: number;
  history: number[];
  recorded_at: string;
}

interface HistoryRow {
  value: number;
  recorded_at: string;
}

const SENSORS: SensorConfig[] = [
  {
    id: "mq2",
    name: "MQ-2",
    gases: ["LPG", "Propane", "H\u2082", "CO", "Smoke"],
    unit: "ppm",
    maxPpm: 10000,
    thresholds: { warn: 300, danger: 1000 },
    baseColor: "#3b82f6",
    description: "Combustible Gas & Smoke",
  },
  {
    id: "mq136",
    name: "MQ-136",
    gases: ["H\u2082S", "SO\u2082"],
    unit: "ppm",
    maxPpm: 200,
    thresholds: { warn: 10, danger: 50 },
    baseColor: "#a855f7",
    description: "Hydrogen Sulfide",
  },
  {
    id: "mq7",
    name: "MQ-7",
    gases: ["CO"],
    unit: "ppm",
    maxPpm: 2000,
    thresholds: { warn: 50, danger: 200 },
    baseColor: "#10b981",
    description: "Carbon Monoxide",
  },
  {
    id: "water_level",
    name: "Water Level",
    gases: ["Water"],
    unit: "%",
    maxPpm: 100,
    thresholds: { warn: 80, danger: 95 },
    baseColor: "#06b6d4",
    description: "Water Level Sensor",
  },
  {
    id: "temp_c",
    name: "DS18B20",
    gases: ["Temperature"],
    unit: "\u00b0C",
    maxPpm: 100,
    thresholds: { warn: 35, danger: 50 },
    baseColor: "#f97316",
    description: "Temperature Sensor",
  },
];

function getStatus(ppm: number, s: SensorConfig) {
  if (ppm >= s.thresholds.danger) return "danger";
  if (ppm >= s.thresholds.warn) return "warning";
  return "safe";
}

function statusColor(status: string) {
  return status === "danger" ? "#ef4444" : status === "warning" ? "#f59e0b" : "#22c55e";
}

function statusLabel(status: string) {
  return status === "danger" ? "DANGER" : status === "warning" ? "WARNING" : "SAFE";
}

function computeForecast(history: number[]): { slope: number; intercept: number; next: number } | null {
  if (history.length < 3) return null;
  const n = history.length;
  const sx = ((n - 1) * n) / 2;
  const sy = history.reduce((a, b) => a + b, 0);
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  const sxy = history.reduce((a, b, i) => a + i * b, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept, next: slope * n + intercept };
}

function SparkLine({ history, max, color, dark }: { history: number[]; max: number; color: string; dark: boolean }) {
  if (history.length < 2) return null;
  const W = 178; const H = 36;
  const pts = history.map((v, i) => `${(i / (history.length - 1)) * W},${H - (v / max) * H}`).join(" ");
  const gradId = `sg-${color.replace("#", "")}`;
  return (
    <svg width={W} height={H} className="w-full">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity={dark ? "0.2" : "0.15"} />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={`url(#${gradId})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ForecastChart({ history, fcResult, max, color, dark }: { history: number[]; fcResult: { slope: number; intercept: number; next: number }; max: number; color: string; dark: boolean }) {
  const { slope, intercept } = fcResult;
  const W = 178; const H = 60;
  const n = history.length;
  const forecastEnd = slope * (n + 1) + intercept;

  const clamp = (v: number) => Math.max(0, Math.min(H, (v / max) * H));
  const toX = (i: number) => (i / (n + 1)) * W;
  const toY = (v: number) => H - clamp(v);

  const histPts = history.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const regressAtLast = slope * (n - 1) + intercept;
  const linePts = `${toX(0)},${toY(intercept)} ${toX(n - 1)},${toY(regressAtLast)} ${toX(n + 1)},${toY(forecastEnd)}`;

  return (
    <div className="w-full">
      <p className="text-[10px] mb-1" style={{ color: dark ? "#334155" : "#cbd5e1" }}>
        Trend &amp; Forecast
      </p>
      <svg width={W} height={H} className="w-full">
        <polyline points={histPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" opacity={0.6} />
        <circle cx={toX(n + 1)} cy={toY(forecastEnd)} r="5" fill={color} stroke={dark ? "#0f172a" : "#ffffff"} strokeWidth="2" />
        <text x={toX(n + 1)} y={toY(forecastEnd) - 10} textAnchor="middle" fontSize="9" fontWeight="bold" fill={color}>
          {fcResult.next.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

function HistoryTable({ rows, dark, limit }: { rows: HistoryRow[]; dark: boolean; limit?: number }) {
  const display = limit ? rows.slice(-limit).reverse() : rows.slice().reverse();
  if (display.length === 0) return null;
  return (
    <div className="w-full max-h-[300px] overflow-y-auto">
      <table className="w-full text-[10px] font-mono" style={{ color: dark ? "#94a3b8" : "#64748b" }}>
        <thead className="sticky top-0" style={{ background: dark ? "#0f172a" : "#f8fafc" }}>
          <tr style={{ borderBottom: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}` }}>
            <th className="text-left py-1 pr-2 font-semibold">Value</th>
            <th className="text-right py-1 font-semibold">Time</th>
          </tr>
        </thead>
        <tbody>
          {display.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${dark ? "#1e293b55" : "#f1f5f9"}` }}>
              <td className="py-1 pr-2 font-bold">{row.value.toFixed(1)}</td>
              <td className="text-right py-1">{new Date(row.recorded_at).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SensorCard({ sensor, reading, historyRows, dark, thresholds, onThresholdChange }: { sensor: SensorConfig; reading?: SensorReading; historyRows: HistoryRow[]; dark: boolean; thresholds: { warn: number; danger: number }; onThresholdChange: (warn: number, danger: number) => void }) {
  const hasData = !!reading && reading.history.length > 0;
  const status = hasData ? getStatus(reading!.value, { ...sensor, thresholds }) : "safe";
  const sColor = statusColor(status);
  const [hovered, setHovered] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editWarn, setEditWarn] = useState(String(thresholds.warn));
  const [editDanger, setEditDanger] = useState(String(thresholds.danger));
  const fcResult = hasData ? computeForecast(reading!.history) : null;

  useEffect(() => {
    setEditWarn(String(thresholds.warn));
    setEditDanger(String(thresholds.danger));
  }, [thresholds.warn, thresholds.danger]);

  function saveThresholds() {
    const w = parseFloat(editWarn);
    const d = parseFloat(editDanger);
    if (!isNaN(w) && !isNaN(d) && w < d) {
      onThresholdChange(w, d);
    }
    setEditing(false);
  }

  const cardBg = dark
    ? "linear-gradient(150deg,#0f172a 0%,#1a2540 100%)"
    : "linear-gradient(150deg,#ffffff 0%,#f4f8ff 100%)";
  const borderColor = hasData && status !== "safe" ? sColor : dark ? "#1e3a5f" : "#dde4f2";
  const shadow = hovered
    ? `0 24px 64px ${sensor.baseColor}33, 0 0 32px ${sColor}22`
    : `0 8px 28px ${dark ? "rgba(0,0,0,0.45)" : "rgba(100,120,180,0.12)"}`;

  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-default select-none"
      style={{
        background: cardBg,
        border: `1.5px solid ${borderColor}`,
        boxShadow: shadow,
        transform: hovered ? "translateY(-5px) scale(1.012)" : "translateY(0) scale(1)",
        transition: "transform 0.35s cubic-bezier(.4,0,.2,1), box-shadow 0.35s, border-color 0.4s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg,${sensor.baseColor},${sColor})` }} />
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: dark ? "#64748b" : "#94a3b8" }}>
              {sensor.description}
            </p>
            <h2 className="text-2xl font-black mt-0.5" style={{ color: sensor.baseColor, filter: `drop-shadow(0 0 8px ${sensor.baseColor}66)` }}>
              {sensor.name}
            </h2>
          </div>
          {hasData && (
            <span
              className="rounded-full px-3 py-1 text-[10px] font-black tracking-[0.18em]"
              style={{
                background: `${sColor}18`,
                color: sColor,
                border: `1px solid ${sColor}55`,
                boxShadow: status === "danger" ? `0 0 12px ${sColor}44` : "none",
              }}
            >
              {statusLabel(status)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {sensor.gases.map((g) => (
            <span
              key={g}
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${sensor.baseColor}18`, color: sensor.baseColor, border: `1px solid ${sensor.baseColor}33` }}
            >
              {g}
            </span>
          ))}
        </div>

        {!hasData ? (
          <div className="py-8 text-center" style={{ color: dark ? "#475569" : "#94a3b8" }}>
            <p className="text-sm font-medium">Waiting for data...</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <Gauge3D
                ppm={reading!.value}
                maxPpm={sensor.maxPpm}
                statusColor={sColor}
                baseColor={sensor.baseColor}
                dark={dark}
                className="w-full max-w-[200px] aspect-square"
              />
              <div className="flex flex-col items-center gap-0.5 w-full">
                <span
                  className="font-black tabular-nums leading-none text-center w-full"
                  style={{
                    fontSize: "clamp(2rem, 8vw, 3.25rem)",
                    color: sColor,
                    textShadow: `0 0 28px ${sColor}88`,
                    transition: "color 0.4s, text-shadow 0.4s",
                  }}
                >
                  {reading!.value.toFixed(1)}
                </span>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: dark ? "#475569" : "#94a3b8" }}>
                  {sensor.unit}
                </span>
              </div>
            </div>

            <div className="w-full rounded-xl py-2 px-3 text-[11px] space-y-1 relative" style={{ background: dark ? "rgba(15,23,42,0.6)" : "rgba(226,232,240,0.5)" }}>
              <button
                onClick={() => { setEditing(true); setEditWarn(String(thresholds.warn)); setEditDanger(String(thresholds.danger)); }}
                className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
                style={{ background: dark ? "#1e293b" : "#e2e8f0", color: dark ? "#94a3b8" : "#64748b" }}
                title="Edit thresholds"
              >
                &#9998; edit
              </button>
              {editing ? (
                <>
                  <div className="flex justify-between items-center gap-2">
                    <span style={{ color: dark ? "#64748b" : "#94a3b8" }}>Warn</span>
                    <input
                      type="number"
                      step="0.1"
                      value={editWarn}
                      onChange={(e) => setEditWarn(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveThresholds(); if (e.key === "Escape") setEditing(false); }}
                      className="w-20 text-right font-semibold rounded px-1 py-0.5 outline-none"
                      style={{ background: dark ? "#0f172a" : "#ffffff", color: "#f59e0b", border: `1px solid ${dark ? "#334155" : "#dde4f2"}` }}
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span style={{ color: dark ? "#64748b" : "#94a3b8" }}>Danger</span>
                    <input
                      type="number"
                      step="0.1"
                      value={editDanger}
                      onChange={(e) => setEditDanger(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveThresholds(); if (e.key === "Escape") setEditing(false); }}
                      className="w-20 text-right font-semibold rounded px-1 py-0.5 outline-none"
                      style={{ background: dark ? "#0f172a" : "#ffffff", color: "#ef4444", border: `1px solid ${dark ? "#334155" : "#dde4f2"}` }}
                    />
                  </div>
                  <div className="flex justify-end gap-1 mt-1">
                    <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: dark ? "#334155" : "#e2e8f0", color: dark ? "#94a3b8" : "#64748b" }}>Cancel</button>
                    <button onClick={saveThresholds} className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: sensor.baseColor, color: "#ffffff" }}>Save</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span style={{ color: dark ? "#64748b" : "#94a3b8" }}>Warn</span>
                    <span className="font-semibold" style={{ color: "#f59e0b" }}>{thresholds.warn} {sensor.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: dark ? "#64748b" : "#94a3b8" }}>Danger</span>
                    <span className="font-semibold" style={{ color: "#ef4444" }}>{thresholds.danger} {sensor.unit}</span>
                  </div>
                </>
              )}
            </div>

            <div>
              <p className="text-[10px] mb-1" style={{ color: dark ? "#334155" : "#cbd5e1" }}>Last {reading!.history.length} readings</p>
              <SparkLine history={reading!.history} max={sensor.maxPpm} color={sColor} dark={dark} />
            </div>

            {fcResult !== null && (
              <ForecastChart history={reading!.history} fcResult={fcResult} max={sensor.maxPpm} color={sColor} dark={dark} />
            )}

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Min", value: Math.min(...reading!.history).toFixed(1) },
                { label: "Avg", value: (reading!.history.reduce((a, b) => a + b, 0) / reading!.history.length).toFixed(1) },
                { label: "Max", value: Math.max(...reading!.history).toFixed(1) },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl py-2 text-center"
                  style={{ background: dark ? "rgba(15,23,42,0.55)" : "rgba(241,245,249,0.8)" }}
                >
                  <p className="text-[10px]" style={{ color: dark ? "#475569" : "#94a3b8" }}>{label}</p>
                  <p className="text-sm font-bold" style={{ color: dark ? "#e2e8f0" : "#1e293b" }}>{value}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full rounded-xl py-2 px-3 text-[11px] font-bold text-left transition-all"
              style={{
                background: dark ? "rgba(15,23,42,0.5)" : "rgba(241,245,249,0.8)",
                color: dark ? "#94a3b8" : "#64748b",
              }}
            >
              {showHistory ? "\u25bc" : "\u25b6"} History ({historyRows.length} records)
            </button>
            {showHistory && <HistoryTable rows={historyRows} dark={dark} limit={50} />}
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [dark, setDark] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [readings, setReadings] = useState<Record<string, SensorReading>>({});
  const [histories, setHistories] = useState<Record<string, HistoryRow[]>>({});
  const [relay1, setRelay1] = useState<boolean | null>(null);
  const [relay2, setRelay2] = useState<boolean | null>(null);
  const [relayReason, setRelayReason] = useState<string | null>(null);
  const relayMode = relay1 === null && relay2 === null ? "auto" : "manual";
  const [tick, setTick] = useState(0);
  const [thresholds, setThresholds] = useState<Record<string, { warn: number; danger: number }>>(() =>
    Object.fromEntries(SENSORS.map((s) => [s.id, { ...s.thresholds }]))
  );

  useEffect(() => {
    fetch("/api/thresholds")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const t: Record<string, { warn: number; danger: number }> = {};
        for (const row of data) {
          t[row.sensor_id] = { warn: row.warn, danger: row.danger };
        }
        if (Object.keys(t).length > 0) setThresholds((prev) => ({ ...prev, ...t }));
      })
      .catch(() => {});
    fetch("/api/relay")
      .then((r) => r.json())
      .then((data) => {
        setRelay1(data.relay1 ?? null);
        setRelay2(data.relay2 ?? null);
      })
      .catch(() => {});
  }, []);

  async function handleThresholdChange(sensor_id: string, warn: number, danger: number) {
    setThresholds((prev) => ({ ...prev, [sensor_id]: { warn, danger } }));
    try {
      await fetch("/api/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensor_id, warn, danger }),
      });
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    fetch("/api/readings?limit=20")
      .then((r) => r.json())
      .then((data) => {
        const h: Record<string, HistoryRow[]> = {};
        for (const sensor of SENSORS) {
          const rows = data[sensor.id];
          if (Array.isArray(rows) && rows.length > 0) {
            h[sensor.id] = rows;
          }
        }
        if (Object.keys(h).length > 0) setHistories(h);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource("/api/sse");

      es.addEventListener("message", (e) => {
        try {
          const msg = JSON.parse(e.data) as {
            type: string;
            data: Record<string, { value: number; unit: string; status: string; recorded_at: string }>;
            relay?: { active: boolean; reason: string | null };
          };
          if (msg.type !== "readings") return;
          const hasData = Object.keys(msg.data).length > 0;
          if (!hasData) return;

          setIsLive(true);
          setLastSeen(new Date().toLocaleTimeString());

          setReadings((prev) => {
            const next = { ...prev };
            for (const sensor of SENSORS) {
              const incoming = msg.data[sensor.id];
              if (!incoming) continue;
              const old = prev[sensor.id];
              next[sensor.id] = {
                value: incoming.value,
                history: old ? [...old.history.slice(-19), incoming.value] : [incoming.value],
                recorded_at: incoming.recorded_at,
              };
            }
            return next;
          });

          setHistories((prev) => {
            const next = { ...prev };
            for (const sensor of SENSORS) {
              const incoming = msg.data[sensor.id];
              if (!incoming) continue;
              const old = next[sensor.id] || [];
              next[sensor.id] = [...old, { value: incoming.value, recorded_at: incoming.recorded_at }].slice(-50);
            }
            return next;
          });

          if (msg.relay) {
            setRelayReason(msg.relay.reason ?? null);
          }
          setTick((t) => t + 1);
        } catch {
          // malformed event
        }
      });

      es.onerror = () => {
        setIsLive(false);
        es?.close();
        reconnect = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      es?.close();
      clearTimeout(reconnect);
    };
  }, []);

  const anyDanger =
    Object.keys(readings).length > 0 &&
    SENSORS.some((s) => {
      const r = readings[s.id];
      const t = thresholds[s.id] || s.thresholds;
      return r && getStatus(r.value, { ...s, thresholds: t }) === "danger";
    });
  const anyWarn =
    Object.keys(readings).length > 0 &&
    SENSORS.some((s) => {
      const r = readings[s.id];
      const t = thresholds[s.id] || s.thresholds;
      return r && getStatus(r.value, { ...s, thresholds: t }) === "warning";
    });
  const sysStatus = anyDanger ? "danger" : anyWarn ? "warning" : "safe";
  const sysColor = statusColor(sysStatus);

  const pageBg = dark
    ? "linear-gradient(160deg,#020617 0%,#0b1124 50%,#020617 100%)"
    : "linear-gradient(160deg,#e8eeff 0%,#f5f7ff 50%,#f0e8ff 100%)";

  return (
    <div className="min-h-screen" style={{ background: pageBg }}>
      {dark && (
        <>
          <div
            className="pointer-events-none fixed top-[-80px] left-[-80px] h-[420px] w-[420px] rounded-full"
            style={{ background: "radial-gradient(circle,#3b82f622 0%,transparent 70%)", filter: "blur(70px)" }}
          />
          <div
            className="pointer-events-none fixed bottom-[-80px] right-[-80px] h-[420px] w-[420px] rounded-full"
            style={{ background: "radial-gradient(circle,#a855f722 0%,transparent 70%)", filter: "blur(70px)" }}
          />
          <div
            className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full"
            style={{ background: "radial-gradient(circle,#10b98108 0%,transparent 70%)", filter: "blur(80px)" }}
          />
        </>
      )}

      <header
        className="sticky top-0 z-20 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4"
        style={{
          background: dark ? "rgba(2,6,23,0.82)" : "rgba(255,255,255,0.82)",
          backdropFilter: "blur(18px)",
          borderBottom: `1px solid ${dark ? "#1e293b" : "#dde4f2"}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg,${SENSORS[0].baseColor},${SENSORS[2].baseColor})` }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="3.5" fill="white" />
              <path d="M11 2v3M11 17v3M2 11h3M17 11h3" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="11" cy="11" r="7.5" stroke="white" strokeWidth="1.5" strokeDasharray="3 2.2" fill="none" />
            </svg>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black leading-none" style={{ color: dark ? "#f8fafc" : "#0f172a" }}>
              Gas Sensor Monitor
            </h1>
            <p className="hidden sm:block text-[11px] mt-0.5" style={{ color: dark ? "#64748b" : "#94a3b8" }}>
              Gas &middot; Water &middot; Temperature &mdash; Real-time Monitor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className="flex items-center gap-2 rounded-full px-2 sm:px-4 py-1.5 text-xs font-black tracking-wider"
            style={{
              background: `${sysColor}18`,
              color: sysColor,
              border: `1px solid ${sysColor}44`,
              boxShadow: anyDanger ? `0 0 16px ${sysColor}33` : "none",
            }}
          >
            <span className="h-2 w-2 rounded-full animate-pulse shrink-0" style={{ background: sysColor }} />
            <span className="sm:hidden">{anyDanger ? "ALERT" : anyWarn ? "WARN" : "OK"}</span>
            <span className="hidden sm:inline">{anyDanger ? "\u26a0 DANGER ALERT" : anyWarn ? "\u26a0 WARNING" : "\u2713 ALL CLEAR"}</span>
          </span>

          <button
            onClick={async () => {
              const toAuto = relayMode === "manual";
              try {
                await fetch("/api/relay", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: toAuto ? "auto" : "manual" }),
                });
                if (toAuto) { setRelay1(null); setRelay2(null); }
                else { setRelay1(true); setRelay2(true); }
              } catch {}
            }}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all hover:scale-105 active:scale-95"
            style={{
              background: relayMode === "manual" ? "#ef444418" : "#22c55e18",
              color: relayMode === "manual" ? "#ef4444" : "#22c55e",
              border: `1px solid ${relayMode === "manual" ? "#ef444444" : "#22c55e44"}`,
              boxShadow: relayMode === "manual" ? "0 0 12px #ef444444" : "none",
            }}
            title={relayMode === "auto" ? "AUTO — click to force both relays ON" : "MANUAL — click to return to AUTO"}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${relayMode === "manual" ? "animate-pulse" : ""}`}
              style={{ background: relayMode === "manual" ? "#ef4444" : "#22c55e" }}
            />
            {relayMode === "auto" ? "AUTO" : "MANUAL"}
          </button>

          {([1, 2] as const).map((n) => {
            const val = n === 1 ? relay1 : relay2;
            const setVal = n === 1 ? setRelay1 : setRelay2;
            const on = val === true;
            const auto = val === null;
            return (
              <button
                key={n}
                onClick={async () => {
                  const key = `relay${n}` as "relay1" | "relay2";
                  const next = auto ? true : null; // ON ↔ AUTO
                  try {
                    await fetch("/api/relay", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ [key]: next }),
                    });
                    setVal(next);
                  } catch {}
                }}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all hover:scale-105 active:scale-95"
                style={{
                  background: on ? "#ef444418" : auto ? "#22c55e18" : "#94a3b818",
                  color: on ? "#ef4444" : auto ? "#22c55e" : "#94a3b8",
                  border: `1px solid ${on ? "#ef444444" : auto ? "#22c55e44" : "#94a3b844"}`,
                  boxShadow: on ? "0 0 12px #ef444444" : "none",
                }}
                title={on ? `Relay ${n} ON — click for AUTO` : auto ? `Relay ${n} AUTO — click for ON` : `Relay ${n} OFF`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#ef4444" : auto ? "#22c55e" : "#94a3b8" }} />
                R{n} {on ? "ON" : auto ? "AUTO" : "OFF"}
              </button>
            );
          })}

          <span
            className="hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{
              background: isLive ? "#22c55e18" : "#94a3b818",
              color: isLive ? "#22c55e" : "#94a3b8",
              border: `1px solid ${isLive ? "#22c55e44" : "#94a3b844"}`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: isLive ? "#22c55e" : "#94a3b8" }} />
            {isLive ? `LIVE ${lastSeen ?? ""}` : "WAITING"}
          </span>
          <span className="hidden sm:inline text-xs tabular-nums" style={{ color: dark ? "#334155" : "#cbd5e1" }}>
            #{tick}
          </span>

          <button
            onClick={() => setDark(!dark)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-base transition-all duration-200 hover:scale-110"
            style={{
              background: dark ? "#1e293b" : "#f1f5f9",
              border: `1px solid ${dark ? "#334155" : "#e2e8f0"}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
            title="Toggle light / dark mode"
          >
            {dark ? "\u2600\ufe0f" : "\ud83c\udf19"}
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {SENSORS.map((sensor) => (
            <SensorCard
              key={sensor.id}
              sensor={sensor}
              reading={readings[sensor.id]}
              historyRows={histories[sensor.id] || []}
              dark={dark}
              thresholds={thresholds[sensor.id] || sensor.thresholds}
              onThresholdChange={(warn, danger) => handleThresholdChange(sensor.id, warn, danger)}
            />
          ))}
        </div>

        {Object.keys(readings).length > 0 && (
          <section
            className="mt-10 rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${dark ? "#1e293b" : "#dde4f2"}`, boxShadow: `0 4px 24px ${dark ? "rgba(0,0,0,0.4)" : "rgba(100,120,200,0.08)"}` }}
          >
            <div className="px-6 py-4" style={{ background: dark ? "#0f172a" : "#f8fafc" }}>
              <h3 className="text-sm font-bold" style={{ color: dark ? "#e2e8f0" : "#1e293b" }}>
                Concentration Summary
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ background: dark ? "#0a1020" : "#ffffff" }}>
                <thead>
                  <tr
                    className="text-[11px] uppercase font-semibold"
                    style={{ borderBottom: `1px solid ${dark ? "#1e293b" : "#f1f5f9"}`, color: dark ? "#475569" : "#94a3b8" }}
                  >
                    {[
                      { label: "Sensor", cls: "text-left" },
                      { label: "Target Gas", cls: "text-left hidden sm:table-cell" },
                      { label: "Concentration", cls: "text-right" },
                      { label: "Max Range", cls: "text-right hidden md:table-cell" },
                      { label: "% of Max", cls: "text-right hidden sm:table-cell" },
                      { label: "Status", cls: "text-center" },
                    ].map(({ label, cls }) => (
                      <th key={label} className={`px-3 sm:px-6 py-2 sm:py-3 ${cls}`}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SENSORS.map((s, i) => {
                    const r = readings[s.id];
                    if (!r) return null;
                    const t = thresholds[s.id] || s.thresholds;
                    const status = getStatus(r.value, { ...s, thresholds: t });
                    const sColor = statusColor(status);
                    return (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: `1px solid ${dark ? "#1e293b55" : "#f1f5f9"}`,
                          background: i % 2 ? (dark ? "#0f172a" : "#f8fafc") : "transparent",
                        }}
                      >
                        <td className="px-3 sm:px-6 py-2 sm:py-4 font-black" style={{ color: s.baseColor }}>
                          {s.name}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 hidden sm:table-cell" style={{ color: dark ? "#94a3b8" : "#64748b" }}>
                          {s.gases.join(", ")}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-right font-mono font-bold" style={{ color: dark ? "#f1f5f9" : "#0f172a" }}>
                          {r.value.toFixed(2)} {s.unit}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-right hidden md:table-cell" style={{ color: dark ? "#475569" : "#94a3b8" }}>
                          {s.maxPpm} {s.unit}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <div
                              className="h-2 w-16 sm:w-24 rounded-full overflow-hidden"
                              style={{ background: dark ? "#1e293b" : "#e2e8f0" }}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${Math.min((r.value / s.maxPpm) * 100, 100)}%`,
                                  background: `linear-gradient(90deg,${s.baseColor},${sColor})`,
                                }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs" style={{ color: dark ? "#64748b" : "#94a3b8" }}>
                              {((r.value / s.maxPpm) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-center">
                          <span
                            className="rounded-full px-3 py-1 text-xs font-black"
                            style={{ background: `${sColor}18`, color: sColor, border: `1px solid ${sColor}44` }}
                          >
                            {statusLabel(status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs" style={{ color: dark ? "#475569" : "#94a3b8" }}>
          {[
            { color: "#22c55e", label: "Safe \u2014 below warning threshold" },
            { color: "#f59e0b", label: "Warning \u2014 elevated concentration" },
            { color: "#ef4444", label: "Danger \u2014 exceeds safe limit" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </main>

      <footer className="mt-8 pb-6 text-center text-[11px]" style={{ color: dark ? "#1e293b" : "#cbd5e1" }}>
        Gas Sensor Monitor &mdash; MQ-2 &middot; MQ-136 &middot; MQ-7 &middot; Water Level &middot; DS18B20 &mdash;{" "}
        {isLive ? `Live data \u00b7 last update ${lastSeen ?? ""}` : "Waiting for sensor data..."}
        {relayMode === "manual" && (
          <span className="ml-2 font-bold" style={{ color: "#ef4444" }}>
            &#9888; MANUAL &middot; R1: {relay1 === true ? "ON" : relay1 === false ? "OFF" : "AUTO"} &middot; R2: {relay2 === true ? "ON" : relay2 === false ? "OFF" : "AUTO"}
          </span>
        )}
      </footer>
    </div>
  );
}
