import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const sql = neon(process.env.DATABASE_URL);

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS sensor_readings (
      id          BIGSERIAL PRIMARY KEY,
      sensor_id   TEXT        NOT NULL,
      value       REAL        NOT NULL,
      unit        TEXT        NOT NULL DEFAULT 'ppm',
      status      TEXT        NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_id
      ON sensor_readings (sensor_id, recorded_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS relay_events (
      id          BIGSERIAL PRIMARY KEY,
      triggered   BOOLEAN     NOT NULL,
      reason      TEXT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS thresholds (
      id          BIGSERIAL PRIMARY KEY,
      sensor_id   TEXT        NOT NULL UNIQUE,
      warn        REAL        NOT NULL,
      danger      REAL        NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Seed default thresholds if table is empty
  const [count] = await sql`SELECT COUNT(*)::int AS cnt FROM thresholds`;
  if (count && count.cnt === 0) {
    const defaults: { sensor_id: string; warn: number; danger: number }[] = [
      { sensor_id: "mq2",         warn: 600, danger: 800 },
      { sensor_id: "mq136",       warn: 600, danger: 800 },
      { sensor_id: "mq7",         warn: 500, danger: 700 },
      { sensor_id: "water_level", warn: 80,  danger: 95 },
      { sensor_id: "temp_c",      warn: 35,  danger: 50 },
    ];
    for (const d of defaults) {
      await sql`
        INSERT INTO thresholds (sensor_id, warn, danger)
        VALUES (${d.sensor_id}, ${d.warn}, ${d.danger})
        ON CONFLICT (sensor_id) DO NOTHING
      `;
    }
  }
}
