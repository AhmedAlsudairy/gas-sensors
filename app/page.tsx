"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Load gauge with no SSR (Three.js requires browser APIs)
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

// ── Types ──────────────────────────────────────────────────────────────────────
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
}

// ── Sensor definitions ─────────────────────────────────────────────────────────
const SENSORS: SensorConfig[] = [
  {
    id: "mq2",
    name: "MQ-2",
    gases: ["LPG", "Propane", "H₂", "CO", "Smoke"],
    unit: "ppm",
    maxPpm: 10000,
    thresholds: { warn: 300, danger: 1000 },
    baseColor: "#3b82f6",
    description: "Combustible Gas & Smoke",
  },
  {
    id: "mq136",
    name: "MQ-136",
    gases: ["H₂S", "SO₂"],
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
    unit: "°C",
    maxPpm: 100,
    thresholds: { warn: 35, danger: 50 },
    baseColor: "#f97316",
    description: "Temperature Sensor",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
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

// ── SparkLine ──────────────────────────────────────────────────────────────────
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

// ── Sensor Card ────────────────────────────────────────────────────────────────
function SensorCard({ sensor, reading, dark }: { sensor: SensorConfig; reading: SensorReading; dark: boolean }) {
  const status = getStatus(reading.value, sensor);
  const sColor = statusColor(status);
  const [hovered, setHovered] = useState(false);

  const cardBg = dark
    ? "linear-gradient(150deg,#0f172a 0%,#1a2540 100%)"
    : "linear-gradient(150deg,#ffffff 0%,#f4f8ff 100%)";
  const borderColor = status !== "safe" ? sColor : dark ? "#1e3a5f" : "#dde4f2";
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
      {/* Top gradient bar */}
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg,${sensor.baseColor},${sColor})` }} />

      <div className="p-5 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: dark ? "#64748b" : "#94a3b8" }}>
              {sensor.description}
            </p>
            <h2 className="text-2xl font-black mt-0.5" style={{ color: sensor.baseColor, filter: `drop-shadow(0 0 8px ${sensor.baseColor}66)` }}>
              {sensor.name}
            </h2>
          </div>
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
        </div>

        {/* Gas tags */}
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

        {/* Gauge centred, reading below */}
        <div className="flex flex-col items-center gap-2">
          {/* 3D gauge — full card width on mobile, capped on larger screens */}
          <Gauge3D
            ppm={reading.value}
            maxPpm={sensor.maxPpm}
            statusColor={sColor}
            baseColor={sensor.baseColor}
            dark={dark}
            className="w-full max-w-[200px] aspect-square"
          />

          {/* Big reading number directly below gauge */}
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
              {reading.value.toFixed(1)}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: dark ? "#475569" : "#94a3b8" }}>
              {sensor.unit}
            </span>
          </div>

          {/* Threshold info row */}
          <div className="w-full rounded-xl py-2 px-3 text-[11px] space-y-1" style={{ background: dark ? "rgba(15,23,42,0.6)" : "rgba(226,232,240,0.5)" }}>
            <div className="flex justify-between">
              <span style={{ color: dark ? "#64748b" : "#94a3b8" }}>Warn</span>
              <span className="font-semibold" style={{ color: "#f59e0b" }}>{sensor.thresholds.warn} ppm</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: dark ? "#64748b" : "#94a3b8" }}>Danger</span>
              <span className="font-semibold" style={{ color: "#ef4444" }}>{sensor.thresholds.danger} ppm</span>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div>
          <p className="text-[10px] mb-1" style={{ color: dark ? "#334155" : "#cbd5e1" }}>Last 20 readings</p>
          <SparkLine history={reading.history} max={sensor.maxPpm} color={sColor} dark={dark} />
        </div>

        {/* Min / Avg / Max */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Min", value: Math.min(...reading.history).toFixed(1) },
            { label: "Avg", value: (reading.history.reduce((a, b) => a + b, 0) / reading.history.length).toFixed(1) },
            { label: "Max", value: Math.max(...reading.history).toFixed(1) },
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
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Home() {
  const [dark, setDark] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [readings, setReadings] = useState<Record<string, SensorReading>>(() =>
    Object.fromEntries(
      SENSORS.map((s) => {
        let v: number;
        if (s.id === "water_level") v = 40;
        else if (s.id === "temp_c") v = 25;
        else v = s.maxPpm * 0.03;
        return [s.id, { value: v, history: Array(20).fill(v) }];
      })
    )
  );
  const [tick, setTick] = useState(0);
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── SSE — connect to real sensor stream ──────────────────────────────────────
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
                history: [...old.history.slice(-19), incoming.value],
              };
            }
            return next;
          });
          setTick((t) => t + 1);
        } catch {
          // malformed event — ignore
        }
      });

      es.onerror = () => {
        setIsLive(false);
        es?.close();
        // Try to reconnect after 5 s
        reconnect = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      es?.close();
      clearTimeout(reconnect);
    };
  }, []);

  // ── Simulation fallback — only runs when no real data is coming ───────────────
  useEffect(() => {
    if (isLive) {
      // Real data active — stop simulation
      if (simRef.current) clearInterval(simRef.current);
      simRef.current = null;
      return;
    }
    simRef.current = setInterval(() => {
      setReadings((prev) => {
        const next = { ...prev };
        SENSORS.forEach((s) => {
          const old = prev[s.id];
          let newValue: number;
          if (s.id === "water_level") {
            const delta = (Math.random() - 0.5) * 5;
            newValue = Math.max(0, Math.min(100, old.value + delta));
          } else if (s.id === "temp_c") {
            const delta = (Math.random() - 0.5) * 2;
            newValue = Math.max(-10, Math.min(60, old.value + delta));
          } else {
            const delta = (Math.random() - 0.42) * s.maxPpm * 0.04;
            newValue = Math.max(0, Math.min(s.maxPpm, old.value + delta));
          }
          next[s.id] = { value: newValue, history: [...old.history.slice(-19), newValue] };
        });
        return next;
      });
      setTick((t) => t + 1);
    }, 1500);
    return () => {
      if (simRef.current) clearInterval(simRef.current);
    };
  }, [isLive]);

  const anyDanger = SENSORS.some((s) => getStatus(readings[s.id].value, s) === "danger");
  const anyWarn = SENSORS.some((s) => getStatus(readings[s.id].value, s) === "warning");
  const sysStatus = anyDanger ? "danger" : anyWarn ? "warning" : "safe";
  const sysColor = statusColor(sysStatus);

  const pageBg = dark
    ? "linear-gradient(160deg,#020617 0%,#0b1124 50%,#020617 100%)"
    : "linear-gradient(160deg,#e8eeff 0%,#f5f7ff 50%,#f0e8ff 100%)";

  return (
    <div className="min-h-screen" style={{ background: pageBg }}>
      {/* Ambient glow blobs (dark only) */}
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

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4"
        style={{
          background: dark ? "rgba(2,6,23,0.82)" : "rgba(255,255,255,0.82)",
          backdropFilter: "blur(18px)",
          borderBottom: `1px solid ${dark ? "#1e293b" : "#dde4f2"}`,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Logo */}
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
              Gas · Water · Temperature — Real-time Monitor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* System status */}
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
            {/* short label on xs, full label on sm */}
            <span className="sm:hidden">{anyDanger ? "ALERT" : anyWarn ? "WARN" : "OK"}</span>
            <span className="hidden sm:inline">{anyDanger ? "⚠ DANGER ALERT" : anyWarn ? "⚠ WARNING" : "✓ ALL CLEAR"}</span>
          </span>

          {/* Live / Simulated badge */}
          <span
            className="hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{
              background: isLive ? "#22c55e18" : "#94a3b818",
              color: isLive ? "#22c55e" : "#94a3b8",
              border: `1px solid ${isLive ? "#22c55e44" : "#94a3b844"}`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: isLive ? "#22c55e" : "#94a3b8" }} />
            {isLive ? `LIVE ${lastSeen ?? ""}` : "SIMULATED"}
          </span>
          {/* Tick */}
          <span className="hidden sm:inline text-xs tabular-nums" style={{ color: dark ? "#334155" : "#cbd5e1" }}>
            #{tick}
          </span>

          {/* Mode toggle */}
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
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────────── */}
      <main className="relative mx-auto max-w-6xl px-4 py-8">
        {/* Sensor Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {SENSORS.map((sensor) => (
            <SensorCard key={sensor.id} sensor={sensor} reading={readings[sensor.id]} dark={dark} />
          ))}
        </div>

        {/* ── Summary Table ─────────────────────────────────────────────────── */}
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
                  const status = getStatus(r.value, s);
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

        {/* Legend */}
        <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs" style={{ color: dark ? "#475569" : "#94a3b8" }}>
          {[
            { color: "#22c55e", label: "Safe — below warning threshold" },
            { color: "#f59e0b", label: "Warning — elevated concentration" },
            { color: "#ef4444", label: "Danger — exceeds safe limit" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </main>

      <footer className="mt-8 pb-6 text-center text-[11px]" style={{ color: dark ? "#1e293b" : "#cbd5e1" }}>
        Gas Sensor Monitor — MQ-2 · MQ-136 · MQ-7 · Water Level · DS18B20 —{" "}
        {isLive ? `Live data · last update ${lastSeen ?? ""}` : "Simulated data (no hardware connected)"}
      </footer>
    </div>
  );
}
