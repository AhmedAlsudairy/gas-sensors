import { NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

// GET /api/readings?limit=20&hours=1
// Returns the latest N readings for every sensor within the time window
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 200);
  const hours = parseFloat(searchParams.get("hours") ?? "0");
  const windowMs = hours > 0 ? hours * 3_600_000 : 5 * 60_000; // 5 min default
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  await initDB();

  const rows = await sql`
    SELECT sensor_id, value, unit, status, recorded_at
    FROM sensor_readings
    WHERE recorded_at > ${cutoff}::timestamptz
    ORDER BY recorded_at DESC
    LIMIT ${limit * 3}
  `;

  // Group by sensor
  const grouped: Record<string, { value: number; unit: string; status: string; recorded_at: string }[]> = {};
  for (const row of rows) {
    const sid = row.sensor_id as string;
    if (!grouped[sid]) grouped[sid] = [];
    if (grouped[sid].length < limit)
      grouped[sid].push({
        value: row.value as number,
        unit: row.unit as string,
        status: row.status as string,
        recorded_at: (row.recorded_at as Date).toISOString(),
      });
  }

  return NextResponse.json(grouped, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
