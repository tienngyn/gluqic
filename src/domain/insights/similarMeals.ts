import type { BolusEvent, MealType } from '@/types/models';

export type MealSignature = {
  mealType: MealType;
  carbs: number;
  protein?: number;
  fat?: number;
  /** Minutes since midnight. */
  minuteOfDay: number;
  glucoseBefore?: number;
  activityAfter?: number;
};

export type SimilarityWeights = {
  carbs: number;
  protein: number;
  fat: number;
  time: number;
  glucoseBefore: number;
  activity: number;
};

export const DEFAULT_WEIGHTS: SimilarityWeights = {
  carbs: 0.4,
  fat: 0.15,
  protein: 0.1,
  time: 0.15,
  glucoseBefore: 0.1,
  activity: 0.1,
};

/** Relative difference in [0,1], tolerant of zeros. */
function relDiff(a: number, b: number, floor: number): number {
  return Math.min(1, Math.abs(a - b) / Math.max(floor, Math.max(a, b)));
}

function circularMinuteDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

export function signatureOf(e: BolusEvent): MealSignature {
  const d = new Date(e.timestamp);
  return {
    mealType: e.mealType,
    carbs: e.carbs,
    protein: e.protein,
    fat: e.fat,
    minuteOfDay: d.getHours() * 60 + d.getMinutes(),
    glucoseBefore: Number.isFinite(e.glucoseBefore) ? e.glucoseBefore : undefined,
    activityAfter: e.activityAfter,
  };
}

/**
 * Similarity score in [0,1]. Different meal types score 0 — a snack and a
 * dinner are never "similar" for pattern purposes.
 */
export function mealSimilarity(
  a: MealSignature,
  b: MealSignature,
  w: SimilarityWeights = DEFAULT_WEIGHTS,
): number {
  if (a.mealType !== b.mealType) return 0;
  let distance = 0;
  let totalWeight = 0;
  const add = (weight: number, d: number) => {
    distance += weight * d;
    totalWeight += weight;
  };

  add(w.carbs, relDiff(a.carbs, b.carbs, 20));
  if (a.fat != null && b.fat != null) add(w.fat, relDiff(a.fat, b.fat, 15));
  if (a.protein != null && b.protein != null) add(w.protein, relDiff(a.protein, b.protein, 15));
  add(w.time, Math.min(1, circularMinuteDiff(a.minuteOfDay, b.minuteOfDay) / 180));
  if (a.glucoseBefore != null && b.glucoseBefore != null) {
    add(w.glucoseBefore, Math.min(1, Math.abs(a.glucoseBefore - b.glucoseBefore) / 100));
  }
  add(w.activity, Math.min(1, Math.abs((a.activityAfter ?? 0) - (b.activityAfter ?? 0)) / 60));

  return totalWeight === 0 ? 0 : Math.round((1 - distance / totalWeight) * 1000) / 1000;
}

export type SimilarMatch = { event: BolusEvent; score: number };

export function findSimilarMeals(
  target: MealSignature,
  events: BolusEvent[],
  opts: { threshold?: number; limit?: number; excludeId?: string } = {},
): SimilarMatch[] {
  const threshold = opts.threshold ?? 0.75;
  return events
    .filter((e) => e.id !== opts.excludeId)
    .map((event) => ({ event, score: mealSimilarity(target, signatureOf(event)) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score || b.event.timestamp.localeCompare(a.event.timestamp))
    .slice(0, opts.limit ?? 20);
}

export type OutcomeSummary = {
  count: number;
  withOutcome: number;
  avgBefore: number | null;
  avg2h: number | null;
  aboveAt2h: number;
  belowAt2h: number;
  inRangeAt2h: number;
};

export function summarizeOutcomes(events: BolusEvent[], range: { low: number; high: number }): OutcomeSummary {
  const before = events.map((e) => e.glucoseBefore).filter(Number.isFinite);
  const twoH = events.map((e) => e.glucose2h).filter((v): v is number => v != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
  return {
    count: events.length,
    withOutcome: twoH.length,
    avgBefore: avg(before),
    avg2h: avg(twoH),
    aboveAt2h: twoH.filter((v) => v > range.high).length,
    belowAt2h: twoH.filter((v) => v < range.low).length,
    inRangeAt2h: twoH.filter((v) => v >= range.low && v <= range.high).length,
  };
}
