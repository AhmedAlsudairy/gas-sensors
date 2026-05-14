import { NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

// GET /api/readings?limit=20
// Returns the latest N readings for every sensor
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  await initDB();

  const rows = await sql`
    SELECT sensor_id, ppm, status, recorded_at
    FROM sensor_readings
    WHERE recorded_at > NOW() - INTERVAL '10 minutes'
    ORDER BY recorded_at DESC
    LIMIT ${limit * 3}
  `;

  // Group by sensor
  const grouped: Record<string, { ppm: number; status: string; recorded_at: string }[]> = {};
  for (const row of rows) {
    const sid = row.sensor_id as string;
    if (!grouped[sid]) grouped[sid] = [];
    if (grouped[sid].length < limit)
      grouped[sid].push({
        ppm: row.ppm as number,
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
