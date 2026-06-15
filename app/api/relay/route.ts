// /api/relay — per-relay manual state (persistent)
// POST:  { mode: "auto" | "manual" }  — set both
//        { relay1: true | false | null }
//        { relay2: true | false | null }
// GET:   { relay1: true | false | null, relay2: true | false | null }
import { NextRequest, NextResponse } from "next/server";

let manualRelay1: boolean | null = null;
let manualRelay2: boolean | null = null;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (process.env.INGEST_SECRET && secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (body.mode === "auto") {
      manualRelay1 = null;
      manualRelay2 = null;
    } else if (body.mode === "manual") {
      manualRelay1 = true;
      manualRelay2 = true;
    } else {
      if (body.relay1 !== undefined) manualRelay1 = body.relay1;
      if (body.relay2 !== undefined) manualRelay2 = body.relay2;
    }

    return NextResponse.json({ ok: true, relay1: manualRelay1, relay2: manualRelay2 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ relay1: manualRelay1, relay2: manualRelay2 });
}
