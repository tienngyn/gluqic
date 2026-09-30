/**
 * Links glucose values the user typed in with the sensor readings that
 * arrive later (e.g. Dexcom via Apple Health, ~3 h late).
 *
 * Time is the key: sensor readings carry their measurement time, not their
 * arrival time. Among sensor readings within ±`windowMin` of the typed
 * value, the one closest in value wins (people often read the CGM app a
 * few minutes before typing). Agreement uses the ISO 15197 accuracy band:
 * ±15 mg/dL below 100 mg/dL, ±15 % at or above.
 */
import type { GlucoseReading } from '@/types/models';

export const MATCH_WINDOW_MIN = 10;

export type ManualMatch =
  | {
      status: 'matched';
      sensorId: string;
      sensorValue: number;
      /** sensor − typed, mg/dL */
      difference: number;
      /** sensor time − typed time, minutes */
      minutesApart: number;
      agrees: boolean;
    }
  /** Sensor data has not reached this time yet. */
  | { status: 'waiting' }
  /** Sensor data covers this time but has a gap here. */
  | { status: 'no-sensor-data' };

export const isManual = (r: GlucoseReading) => r.source === 'manual';

/** ISO 15197:2013 system accuracy band. */
export function withinAgreement(typed: number, sensor: number): boolean {
  const ref = sensor;
  return ref < 100 ? Math.abs(typed - sensor) <= 15 : Math.abs(typed - sensor) / ref <= 0.15;
}

export function matchManualReadings(
  readings: GlucoseReading[],
  windowMin = MATCH_WINDOW_MIN,
): Map<string, ManualMatch> {
  const sensor = readings
    .filter((r) => !isManual(r))
    .map((r) => ({ r, t: new Date(r.timestamp).getTime() }))
    .sort((a, b) => a.t - b.t);
  const latestSensor = sensor.length ? sensor[sensor.length - 1].t : -Infinity;
  const out = new Map<string, ManualMatch>();
  const windowMs = windowMin * 60000;

  for (const m of readings.filter(isManual)) {
    const t = new Date(m.timestamp).getTime();
    // Binary search for the first sensor reading at or after t − window.
    let lo = 0;
    let hi = sensor.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sensor[mid].t < t - windowMs) lo = mid + 1;
      else hi = mid;
    }
    let best: { r: GlucoseReading; t: number } | undefined;
    for (let i = lo; i < sensor.length && sensor[i].t <= t + windowMs; i++) {
      const c = sensor[i];
      if (
        !best ||
        Math.abs(c.r.value - m.value) < Math.abs(best.r.value - m.value) ||
        (c.r.value === best.r.value && Math.abs(c.t - t) < Math.abs(best.t - t))
      ) {
        best = c;
      }
    }
    if (best) {
      out.set(m.id, {
        status: 'matched',
        sensorId: best.r.id,
        sensorValue: best.r.value,
        difference: best.r.value - m.value,
        minutesApart: Math.round((best.t - t) / 60000),
        agrees: withinAgreement(m.value, best.r.value),
      });
    } else {
      out.set(m.id, { status: latestSensor < t + windowMs ? 'waiting' : 'no-sensor-data' });
    }
  }
  return out;
}

/** True when a sensor reading confirms the typed value and can stand in for it. */
export function isReplacedBySensor(match: ManualMatch | undefined): boolean {
  return match?.status === 'matched' && match.agrees;
}

/**
 * Readings for charts, stats and learning: sensor readings plus typed
 * values. A typed value is dropped only when a sensor reading confirms it
 * (so the same moment isn't counted twice). A typed value that disagrees
 * with the sensor is kept — it is never silently replaced.
 */
export function effectiveReadings(readings: GlucoseReading[], matches: Map<string, ManualMatch>): GlucoseReading[] {
  return readings.filter((r) => !isManual(r) || !isReplacedBySensor(matches.get(r.id)));
}
