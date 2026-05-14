import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

// POST /api/ingest
// Body: { readings: [{ sensor_id, ppm, status }], relay: boolean, reason?: string }
// Called by the Raspberry Pi agent every second
export async function POST(req: NextRequest) {
  // Simple shared-secret auth – set INGEST_SECRET in .env
  const secret = req.headers.get("x-ingest-secret");
  if (process.env.INGEST_SECRET && secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDB();
    const body = await req.json();
    const { readings, relay, reason } = body as {
      readings: { sensor_id: string; ppm: number; status: string }[];
      relay: boolean;
      reason?: string;
    };

    // Insert all sensor readings in one round-trip
    for (const r of readings) {
      await sql`
        INSERT INTO sensor_readings (sensor_id, ppm, status)
        VALUES (${r.sensor_id}, ${r.ppm}, ${r.status})
      `;
    }

    // Log relay state change
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
