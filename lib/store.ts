// In-memory store for sensor readings (used when no DB is available)

export interface StoredReading {
  sensor_id: string;
  value: number;
  unit: string;
  status: string;
  recorded_at: string;
}

const readings: Record<string, StoredReading> = {};
const history: Record<string, StoredReading[]> = {};
const MAX_HISTORY = 20;

export function pushReading(r: StoredReading) {
  readings[r.sensor_id] = r;
  if (!history[r.sensor_id]) history[r.sensor_id] = [];
  history[r.sensor_id].push(r);
  if (history[r.sensor_id].length > MAX_HISTORY) {
    history[r.sensor_id] = history[r.sensor_id].slice(-MAX_HISTORY);
  }
}

export function getLatestReadings(): Record<string, StoredReading> {
  return { ...readings };
}

export function getHistory(sensor_id: string): StoredReading[] {
  return history[sensor_id] || [];
}
