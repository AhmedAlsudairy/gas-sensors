// /api/relay — manual relay state (persistent)
// POST:  { active: true | false | null } — null = release to auto
// GET:   returns { active: true | false | null }
import { NextRequest, NextResponse } from "next/server";

let manualOverride: boolean | null = null;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (process.env.INGEST_SECRET && secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { active } = body as { active: boolean | null };
    manualOverride = active;
    return NextResponse.json({ ok: true, active: manualOverride });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ active: manualOverride });
}
