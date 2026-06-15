// /api/relay — manual relay trigger endpoint
// POST:  set a manual relay override (payload: { active: boolean })
// GET:   return the current manual override (cleared after read)
import { NextRequest, NextResponse } from "next/server";

let manualOverride: { active: boolean; reason: string } | null = null;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (process.env.INGEST_SECRET && secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { active } = body as { active: boolean };
    manualOverride = { active, reason: active ? "Manual trigger from dashboard" : "Manual release from dashboard" };
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function GET() {
  const cmd = manualOverride;
  manualOverride = null; // clear after read
  return NextResponse.json(cmd ?? { active: null });
}
