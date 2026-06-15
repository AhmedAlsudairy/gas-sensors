// GET /api/sse — Server-Sent Events stream
import { sql } from "@/lib/db";
import { getLatestReadings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

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
          let latest: Record<string, { value: number; unit: string; status: string; recorded_at: string }> = {};

          try {
            const rows = await sql`
              SELECT DISTINCT ON (sensor_id)
                sensor_id, value, unit, status, recorded_at
              FROM sensor_readings
              ORDER BY sensor_id, recorded_at DESC
            `;
            for (const row of rows) {
              latest[row.sensor_id as string] = {
                value: row.value as number,
                unit: row.unit as string,
                status: row.status as string,
                recorded_at: (row.recorded_at as Date).toISOString(),
              };
            }
          } catch {
            const mem = getLatestReadings();
            latest = mem;
          }

          send({ type: "readings", data: latest });
        } catch {
          // skip
        }
      }, 1500);

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
