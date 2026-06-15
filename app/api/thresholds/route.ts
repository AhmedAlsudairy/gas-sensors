import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

// GET /api/thresholds — return all thresholds
export async function GET() {
  await initDB();
  const rows = await sql`
    SELECT sensor_id, warn, danger, updated_at
    FROM thresholds
    ORDER BY sensor_id
  `;
  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}

// PUT /api/thresholds — upsert a single threshold
// Body: { sensor_id: string, warn: number, danger: number }
export async function PUT(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (process.env.INGEST_SECRET && secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDB();
    const body = await req.json();
    const { sensor_id, warn, danger } = body as {
      sensor_id: string;
      warn: number;
      danger: number;
    };

    if (!sensor_id || typeof warn !== "number" || typeof danger !== "number") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await sql`
      INSERT INTO thresholds (sensor_id, warn, danger, updated_at)
      VALUES (${sensor_id}, ${warn}, ${danger}, NOW())
      ON CONFLICT (sensor_id)
      DO UPDATE SET warn = ${warn}, danger = ${danger}, updated_at = NOW()
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Thresholds error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
