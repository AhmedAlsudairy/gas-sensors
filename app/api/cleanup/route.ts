// GET /api/cleanup — deletes sensor_readings and relay_events older than 23 hours
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - 23 * 3_600_000).toISOString();
    const sr: any = await sql`
      DELETE FROM sensor_readings WHERE recorded_at < ${cutoff}::timestamptz
    `;
    const re: any = await sql`
      DELETE FROM relay_events WHERE recorded_at < ${cutoff}::timestamptz
    `;
    return NextResponse.json({ ok: true, deleted: { sensor_readings: sr.count ?? 0, relay_events: re.count ?? 0 }, cutoff });
  } catch (err) {
    console.error("Cleanup error:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
