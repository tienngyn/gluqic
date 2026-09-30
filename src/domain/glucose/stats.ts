import type { GlucoseRange, GlucoseReading, GlucoseTrend } from '@/types/models';

/**
 * A sensor value older than this is not used as "current" glucose for a
 * calculation. Apple Health data from some CGMs arrives hours late.
 */
export const SENSOR_FRESH_MIN = 15;

export const DEFAULT_RANGE: GlucoseRange = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };

export type GlucoseStats = {
  count: number;
  average: number;
  stdDev: number;
  /** Coefficient of variation, % */
  cv: number;
  /** Glucose management indicator, % (estimated A1c) */
  gmi: number;
  timeInRange: number;
  timeBelow: number;
  timeAbove: number;
  highEvents: number;
  lowEvents: number;
};

const byTime = (a: GlucoseReading, b: GlucoseReading) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

export function filterByWindow(readings: GlucoseReading[], from: Date, to: Date): GlucoseReading[] {
  const f = from.getTime();
  const t = to.getTime();
  return readings.filter((r) => {
    const ms = new Date(r.timestamp).getTime();
    return ms >= f && ms <= t;
  });
}

/**
 * Counts episodes: a run of consecutive readings past a threshold is one
 * event, so a long high doesn't count as dozens of highs.
 */
export function countEpisodes(values: number[], predicate: (v: number) => boolean): number {
  let events = 0;
  let inEvent = false;
  for (const v of values) {
    if (predicate(v)) {
      if (!inEvent) events += 1;
      inEvent = true;
    } else {
      inEvent = false;
    }
  }
  return events;
}

export function computeStats(readings: GlucoseReading[], range: GlucoseRange = DEFAULT_RANGE): GlucoseStats {
  const values = [...readings].sort(byTime).map((r) => r.value);
  const n = values.length;
  if (n === 0) {
    return {
      count: 0,
      average: 0,
      stdDev: 0,
      cv: 0,
      gmi: 0,
      timeInRange: 0,
      timeBelow: 0,
      timeAbove: 0,
      highEvents: 0,
      lowEvents: 0,
    };
  }
  const sum = values.reduce((s, v) => s + v, 0);
  const average = sum / n;
  const variance = values.reduce((s, v) => s + (v - average) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const inRange = values.filter((v) => v >= range.low && v <= range.high).length;
  const below = values.filter((v) => v < range.low).length;
  const above = values.filter((v) => v > range.high).length;

  return {
    count: n,
    average: Math.round(average),
    stdDev: Math.round(stdDev),
    cv: Math.round((stdDev / average) * 1000) / 10,
    // GMI (%) = 3.31 + 0.02392 × mean glucose (mg/dL)  — Bergenstal et al. 2018
    gmi: Math.round((3.31 + 0.02392 * average) * 10) / 10,
    timeInRange: Math.round((inRange / n) * 100),
    timeBelow: Math.round((below / n) * 100),
    timeAbove: Math.round((above / n) * 100),
    highEvents: countEpisodes(values, (v) => v > range.high),
    lowEvents: countEpisodes(values, (v) => v < range.low),
  };
}

/**
 * Trend from the rate of change over the last `lookbackMin` minutes,
 * using the same bands CGMs typically use (mg/dL per minute).
 */
export function computeTrend(
  readings: GlucoseReading[],
  now: Date,
  lookbackMin = 20,
): { trend: GlucoseTrend; ratePerMin: number } | undefined {
  const recent = filterByWindow(readings, new Date(now.getTime() - lookbackMin * 60000), now).sort(byTime);
  if (recent.length < 2) return undefined;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const minutes = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 60000;
  if (minutes <= 0) return undefined;
  const rate = (last.value - first.value) / minutes;
  let trend: GlucoseTrend = 'stable';
  if (rate >= 2) trend = 'rising-fast';
  else if (rate >= 1) trend = 'rising';
  else if (rate <= -2) trend = 'falling-fast';
  else if (rate <= -1) trend = 'falling';
  return { trend, ratePerMin: Math.round(rate * 100) / 100 };
}

export function latestReading(readings: GlucoseReading[]): GlucoseReading | undefined {
  let latest: GlucoseReading | undefined;
  for (const r of readings) {
    if (!latest || new Date(r.timestamp) > new Date(latest.timestamp)) latest = r;
  }
  return latest;
}

/** Nearest reading to `at` within ±`toleranceMin`. */
export function readingNear(
  readings: GlucoseReading[],
  at: Date,
  toleranceMin = 20,
): GlucoseReading | undefined {
  const target = at.getTime();
  let best: GlucoseReading | undefined;
  let bestDelta = Infinity;
  for (const r of readings) {
    const delta = Math.abs(new Date(r.timestamp).getTime() - target);
    if (delta < bestDelta) {
      best = r;
      bestDelta = delta;
    }
  }
  return bestDelta <= toleranceMin * 60000 ? best : undefined;
}

/**
 * Sorted index for repeated nearest-reading lookups (O(log n) each), used
 * when joining many meals against months of readings.
 */
export function createReadingIndex(readings: GlucoseReading[]) {
  const sorted = [...readings].sort(byTime);
  const times = sorted.map((r) => new Date(r.timestamp).getTime());
  return {
    sorted,
    near(at: Date, toleranceMin = 20): GlucoseReading | undefined {
      if (!sorted.length) return undefined;
      const target = at.getTime();
      let lo = 0;
      let hi = times.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      let best = lo;
      if (lo > 0 && Math.abs(times[lo - 1] - target) <= Math.abs(times[lo] - target)) best = lo - 1;
      return Math.abs(times[best] - target) <= toleranceMin * 60000 ? sorted[best] : undefined;
    },
    between(from: Date, to: Date): GlucoseReading[] {
      const f = from.getTime();
      const t = to.getTime();
      let lo = 0;
      let hi = times.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < f) lo = mid + 1;
        else hi = mid;
      }
      const out: GlucoseReading[] = [];
      for (let i = lo; i < times.length && times[i] <= t; i++) out.push(sorted[i]);
      return out;
    },
  };
}

export type ReadingIndex = ReturnType<typeof createReadingIndex>;

/** Average glucose per hour of day (0–23); `null` where no data. */
export function hourlyProfile(readings: GlucoseReading[]): (number | null)[] {
  const sums = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const r of readings) {
    const h = new Date(r.timestamp).getHours();
    sums[h] += r.value;
    counts[h] += 1;
  }
  return sums.map((s, h) => (counts[h] ? Math.round(s / counts[h]) : null));
}

export function classify(value: number, range: GlucoseRange = DEFAULT_RANGE): 'low' | 'in-range' | 'high' {
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'in-range';
}
