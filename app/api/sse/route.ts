// GET /api/sse
// Server-Sent Events stream – browser subscribes, server pushes fresh readings
// every 1.5 s by polling Neon DB
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send a heartbeat comment so the connection stays alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          clearInterval(poll);
        }
      }, 15_000);

      const poll = setInterval(async () => {
        try {
          const rows = await sql`
            SELECT DISTINCT ON (sensor_id)
              sensor_id, ppm, status, recorded_at
            FROM sensor_readings
            ORDER BY sensor_id, recorded_at DESC
          `;

          const latest: Record<string, { ppm: number; status: string; recorded_at: string }> = {};
          for (const row of rows) {
            latest[row.sensor_id as string] = {
              ppm: row.ppm as number,
              status: row.status as string,
              recorded_at: (row.recorded_at as Date).toISOString(),
            };
          }
          send({ type: "readings", data: latest });
        } catch {
          // DB blip — skip this tick
        }
      }, 1500);

      // Clean up when client disconnects
      return () => {
        clearInterval(heartbeat);
        clearInterval(poll);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
