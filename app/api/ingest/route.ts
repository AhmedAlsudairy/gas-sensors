import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { pushReading } from "@/lib/store";

// POST /api/ingest
// Body: { readings: [{ sensor_id, value, unit?, status }], relay: boolean, reason?: string }
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (process.env.INGEST_SECRET && secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDB();
    const body = await req.json();
    const { readings, relay, reason } = body as {
      readings: { sensor_id: string; value: number; unit?: string; status: string }[];
      relay: boolean;
      reason?: string;
    };

    for (const r of readings) {
      await sql`
        INSERT INTO sensor_readings (sensor_id, value, unit, status)
        VALUES (${r.sensor_id}, ${r.value}, ${r.unit ?? "raw"}, ${r.status})
      `;
      pushReading({
        sensor_id: r.sensor_id,
        value: r.value,
        unit: r.unit ?? "raw",
        status: r.status,
        recorded_at: new Date().toISOString(),
      });
    }

    await sql`
      INSERT INTO relay_events (triggered, reason)
      VALUES (${relay}, ${reason ?? null})
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Ingest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
