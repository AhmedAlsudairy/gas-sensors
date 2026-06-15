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
}
