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
  /** Above target at 2 h, or needed a correction afterwards. */
  aboveAt2h: number;
  belowAt2h: number;
  inRangeAt2h: number;
  /** How many of `aboveAt2h` needed a correction. */
  corrected: number;
};

export type MealOutcome = 'in-range' | 'high' | 'low' | 'corrected';

/**
 * A meal that needed a correction ran high, even if the 2 h reading looks
 * fine — the correction is what brought it down.
 */
export function outcomeOf(e: BolusEvent, range: { low: number; high: number }): MealOutcome | null {
  if (e.correctionAfter) return 'corrected';
  if (e.glucose2h == null) return null;
  if (e.glucose2h > range.high) return 'high';
  if (e.glucose2h < range.low) return 'low';
  return 'in-range';
}

export function summarizeOutcomes(events: BolusEvent[], range: { low: number; high: number }): OutcomeSummary {
  const before = events.map((e) => e.glucoseBefore).filter(Number.isFinite);
  const twoH = events.map((e) => e.glucose2h).filter((v): v is number => v != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
  const outcomes = events.map((e) => outcomeOf(e, range)).filter((o): o is MealOutcome => o != null);
  const n = (o: MealOutcome) => outcomes.filter((x) => x === o).length;
  return {
    count: events.length,
    withOutcome: outcomes.length,
    avgBefore: avg(before),
    avg2h: avg(twoH),
    aboveAt2h: n('high') + n('corrected'),
    belowAt2h: n('low'),
    inRangeAt2h: n('in-range'),
    corrected: n('corrected'),
  };
}

/** " (3 needed a correction)" or "" — appended after a count of high meals. */
export function correctionNote(s: OutcomeSummary): string {
  if (!s.corrected) return '';
  return ` (${s.corrected === s.aboveAt2h && s.corrected > 1 ? 'all' : s.corrected} needed a correction)`;
}
