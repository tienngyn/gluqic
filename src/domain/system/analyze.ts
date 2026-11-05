/**
 * "Dein System": turns doses given by feel into the system behind them.
 *
 * The user logs carbs and NovoRapid units the way they dose today. Once the
 * sensor data around a meal is in, each meal is judged by where glucose is
 * about 3 h later compared with where it started (the usual carb-ratio check:
 * a well-matched dose brings glucose back to the starting level). From the
 * meals that worked, gluciq shows the carb ratio the user's own good doses
 * used, per time of day — plus the correction effect and a night-time basal
 * (Tresiba) check.
 *
 * Pure and deterministic: no clock (pass `now`), no I/O. It describes the
 * user's data; it never changes a setting.
 */
import { analyzeCorrections } from '@/domain/insights/corrections';
import { createReadingIndex, type ReadingIndex } from '@/domain/glucose/stats';
import { classifyDose, MEAL_DOSE_WINDOW_MIN } from '@/domain/insulin/purpose';
import type { GlucoseReading, InsulinDose, Meal } from '@/types/models';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const SYSTEM_RULES = {
  /** Smaller snacks say little about the carb ratio. */
  minCarbs: 10,
  /** Glucose ~3 h after the meal is compared with the start. */
  outcomeAtMin: 180,
  /** The "after" reading may come from this window (a typed value counts too). */
  outcomeFromMin: 150,
  outcomeToMin: 240,
  /** Back to within ± this of the start (mg/dL) counts as a good match. */
  tolerance: 40,
  /** Only meals that start in this range are used for the ratio (otherwise a correction is mixed in). */
  startMin: 70,
  startMax: 180,
  /** Below this after the meal (within `lowWindowMin`) = too much insulin. */
  low: 70,
  lowWindowMin: 240,
  /** A correction this soon after the meal means the meal dose was too small. */
  correctionFromMin: 20,
  correctionToMin: 180,
  /** Another meal in this window mixes two meals together. */
  otherMealMin: 180,
  /** Delayed sensor data (Dexcom → Apple Health ≈ 3 h) can still arrive until then. */
  waitForDataHours: 8,
  /** Good meals needed for a ratio estimate, and for a confident one. */
  minGood: 3,
  confidentGood: 6,
  /** Only the recent past counts: older doses reflect older habits. */
  lookbackDays: 28,
} as const;

export type Slot = 'morning' | 'midday' | 'evening' | 'late';

/** Time-of-day windows (start hour inclusive). Late runs 22–5. */
export const SLOTS: { slot: Slot; label: string; from: number; to: number }[] = [
  { slot: 'morning', label: 'Morgens', from: 5, to: 11 },
  { slot: 'midday', label: 'Mittags', from: 11, to: 16 },
  { slot: 'evening', label: 'Abends', from: 16, to: 22 },
  { slot: 'late', label: 'Spät', from: 22, to: 5 },
];

export function slotFor(date: Date): Slot {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  if (h >= 16 && h < 22) return 'evening';
  return 'late';
}

export type MealOutcome =
  /** Not 3 h yet, or sensor data may still arrive. */
  | 'pending'
  /** No glucose value around 3 h after the meal. */
  | 'no-data'
  /** Started outside 70–180: a correction is mixed in, so it says nothing about the ratio. */
  | 'off-start'
  /** Another meal within 3 h. */
  | 'mixed'
  | 'good'
  /** Ended more than 40 above the start, or needed a correction. */
  | 'too-little'
  /** Ended more than 40 below the start, or went low. */
  | 'too-much';

export type MealSample = {
  mealId: string;
  doseId?: string;
  timestamp: string;
  slot: Slot;
  carbs: number;
  carbsWeighed?: boolean;
  units: number;
  /** grams per 1 U the user used for this meal */
  gramsPerUnit: number;
  glucoseBefore?: number;
  glucoseAfter?: number;
  /** minutes after the meal of `glucoseAfter` */
  afterMinutes?: number;
  lowestAfter?: number;
  correctionAfter?: number;
  outcome: MealOutcome;
};

export const JUDGED: MealOutcome[] = ['good', 'too-little', 'too-much'];

export type RatioEstimate = {
  /** grams per 1 U, rounded to 0.5 */
  gramsPerUnit: number;
  /** Range of the ratios that worked, when there are several. */
  from?: number;
  to?: number;
  confidence: 'low' | 'medium' | 'high';
};

export type SlotSummary = {
  slot: Slot;
  label: string;
  /** Every meal with a meal dose in the look-back period. */
  samples: MealSample[];
  judged: number;
  good: number;
  tooLittle: number;
  tooMuch: number;
  /** The ratios the user dosed with (all meals): shows how random dosing is. */
  used?: { min: number; max: number; median: number };
  estimate: RatioEstimate | null;
  /** When there is no estimate yet but the outcomes lean one way. */
  lean?: 'more-insulin' | 'less-insulin';
};

export type NightResult = {
  date: string;
  start: number;
  end: number;
  change: number;
  lowest: number;
  kind: 'stable' | 'rising' | 'falling' | 'low';
};

export type BasalCheck = {
  nights: NightResult[];
  verdict: 'stable' | 'rising' | 'falling' | 'lows' | 'mixed' | null;
  /** median change 1:00 → 6:00 (mg/dL) */
  medianChange?: number;
};

export type CorrectionSummary = {
  /** mg/dL drop per 1 U, or null while there are too few clean corrections. */
  dropPerUnit: number | null;
  usable: number;
  needed: number;
};

export type SystemAnalysis = {
  slots: SlotSummary[];
  /** Newest first, every meal with a meal dose. */
  samples: MealSample[];
  correction: CorrectionSummary;
  basal: BasalCheck;
  /** Sensor (CGM) readings in the last 24 h — tells whether Dexcom data is coming in. */
  sensorReadings24h: number;
};

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/** Judges one meal by glucose ~3 h later relative to the start. */
export function judgeMeal(
  meal: Meal,
  index: ReadingIndex,
  ctx: { now: Date; meals: Meal[]; corrections: { t: number; units: number }[] },
): Omit<MealSample, 'mealId' | 'doseId' | 'timestamp' | 'slot' | 'carbs' | 'carbsWeighed' | 'units' | 'gramsPerUnit'> {
  const r = SYSTEM_RULES;
  const t = new Date(meal.timestamp).getTime();
  const before = index.near(new Date(t), 20)?.value;
  const window = index.between(new Date(t + r.outcomeFromMin * MIN), new Date(t + r.outcomeToMin * MIN));
  const afterReading = window.reduce<GlucoseReading | undefined>((best, x) => {
    const d = Math.abs(new Date(x.timestamp).getTime() - (t + r.outcomeAtMin * MIN));
    return !best || d < Math.abs(new Date(best.timestamp).getTime() - (t + r.outcomeAtMin * MIN)) ? x : best;
  }, undefined);
  const glucoseAfter = afterReading?.value;
  const afterMinutes = afterReading ? Math.round((new Date(afterReading.timestamp).getTime() - t) / MIN) : undefined;
  const following = index.between(new Date(t + 30 * MIN), new Date(t + r.lowWindowMin * MIN));
  const lowestAfter = following.length ? Math.min(...following.map((x) => x.value)) : undefined;
  const correctionAfter =
    ctx.corrections
      .filter((c) => c.t >= t + r.correctionFromMin * MIN && c.t <= t + r.correctionToMin * MIN)
      .reduce((s, c) => s + c.units, 0) || undefined;
  const base = { glucoseBefore: before, glucoseAfter, afterMinutes, lowestAfter, correctionAfter };

  const otherMeal = ctx.meals.some((m) => {
    if (m.id === meal.id || m.carbs < 5) return false;
    const mt = new Date(m.timestamp).getTime();
    return mt > t + 15 * MIN && mt < t + r.otherMealMin * MIN;
  });
  const elapsed = ctx.now.getTime() - t;

  if (lowestAfter != null && lowestAfter < r.low) return { ...base, outcome: 'too-much' };
  if (elapsed < r.outcomeFromMin * MIN) return { ...base, outcome: 'pending' };
  if (otherMeal) return { ...base, outcome: 'mixed' };
  if (before == null || before < r.startMin || before > r.startMax) {
    if (before == null && elapsed < r.waitForDataHours * HOUR) return { ...base, outcome: 'pending' };
    return { ...base, outcome: before == null ? 'no-data' : 'off-start' };
  }
  if (correctionAfter) return { ...base, outcome: 'too-little' };
  if (glucoseAfter == null) {
    return { ...base, outcome: elapsed < r.waitForDataHours * HOUR ? 'pending' : 'no-data' };
  }
  const change = glucoseAfter - before;
  if (change > r.tolerance) return { ...base, outcome: 'too-little' };
  if (change < -r.tolerance) return { ...base, outcome: 'too-much' };
  return { ...base, outcome: 'good' };
}

/**
 * The ratio estimate for one time of day. Good meals give it directly
 * (median of their ratios). Without enough good meals, the outcomes can still
 * show a direction: meals that ran high used too many grams per unit.
 */
export function estimateRatio(samples: MealSample[]): Pick<SlotSummary, 'estimate' | 'lean'> {
  const r = SYSTEM_RULES;
  const good = samples.filter((s) => s.outcome === 'good').map((s) => s.gramsPerUnit);
  const little = samples.filter((s) => s.outcome === 'too-little').length;
  const much = samples.filter((s) => s.outcome === 'too-much').length;
  if (good.length >= r.minGood) {
    const sorted = [...good].sort((a, b) => a - b);
    return {
      estimate: {
        gramsPerUnit: roundHalf(median(good)),
        from: roundHalf(sorted[0]),
        to: roundHalf(sorted[sorted.length - 1]),
        confidence: good.length >= r.confidentGood ? 'high' : 'medium',
      },
    };
  }
  const judged = good.length + little + much;
  if (judged >= 3 && little >= judged * 0.6) return { estimate: null, lean: 'more-insulin' };
  if (judged >= 3 && much >= judged * 0.6) return { estimate: null, lean: 'less-insulin' };
  return { estimate: null };
}

/** Night-time basal check: 1:00 → 6:00 on nights without food or rapid insulin from 21:00. */
export function checkBasal(
  index: ReadingIndex,
  meals: Meal[],
  rapid: InsulinDose[],
  now: Date,
  nights = 14,
): BasalCheck {
  const results: NightResult[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < nights; i++) {
    const day = new Date(today.getTime() - i * DAY);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 1);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 6);
    if (end.getTime() > now.getTime()) continue;
    const quietFrom = start.getTime() - 4 * HOUR;
    const busy =
      meals.some((m) => {
        const t = new Date(m.timestamp).getTime();
        return m.carbs >= 5 && t >= quietFrom && t <= end.getTime();
      }) ||
      rapid.some((d) => {
        const t = new Date(d.timestamp).getTime();
        return t >= quietFrom && t <= end.getTime();
      });
    if (busy) continue;
    const s = index.near(start, 20);
    const e = index.near(end, 20);
    const between = index.between(start, end);
    // Needs real overnight coverage (CGM), not two typed values.
    if (!s || !e || between.length < 12) continue;
    const lowest = Math.min(...between.map((x) => x.value));
    const change = e.value - s.value;
    const kind: NightResult['kind'] = lowest < SYSTEM_RULES.low ? 'low' : change > 30 ? 'rising' : change < -30 ? 'falling' : 'stable';
    results.push({ date: start.toISOString(), start: s.value, end: e.value, change, lowest, kind });
  }
  if (results.length < 3) return { nights: results, verdict: null };
  const count = (k: NightResult['kind']) => results.filter((n) => n.kind === k).length;
  const n = results.length;
  const verdict: BasalCheck['verdict'] =
    count('low') >= 2
      ? 'lows'
      : count('stable') >= n * 0.7 && count('low') === 0
        ? 'stable'
        : count('rising') >= n * 0.5
          ? 'rising'
          : count('falling') + count('low') >= n * 0.5
            ? 'falling'
            : 'mixed';
  return { nights: results, verdict, medianChange: Math.round(median(results.map((x) => x.change))) };
}

export function analyzeSystem(input: {
  meals: Meal[];
  doses: InsulinDose[];
  readings: GlucoseReading[];
  now: Date;
}): SystemAnalysis {
  const { meals, doses, readings, now } = input;
  const r = SYSTEM_RULES;
  const since = now.getTime() - r.lookbackDays * DAY;
  const index = createReadingIndex(readings);
  const rapid = doses.filter((d) => d.insulinType !== 'long');

  const mealDoses: InsulinDose[] = [];
  const corrections: { t: number; units: number }[] = [];
  for (const d of rapid) {
    const kind = classifyDose(d, meals);
    if (kind === 'meal') mealDoses.push(d);
    else if (kind === 'correction') corrections.push({ t: new Date(d.timestamp).getTime(), units: d.units });
  }

  const samples: MealSample[] = [];
  const usedDoses = new Set<string>();
  for (const meal of meals) {
    const t = new Date(meal.timestamp).getTime();
    if (t < since || meal.carbs < r.minCarbs) continue;
    let dose: InsulinDose | undefined;
    let best = Infinity;
    for (const d of mealDoses) {
      const delta = Math.abs(new Date(d.timestamp).getTime() - t);
      if (delta <= MEAL_DOSE_WINDOW_MIN * MIN && delta < best && !usedDoses.has(d.id)) {
        dose = d;
        best = delta;
      }
    }
    if (!dose || dose.units <= 0) continue;
    usedDoses.add(dose.id);
    samples.push({
      mealId: meal.id,
      doseId: dose.id,
      timestamp: meal.timestamp,
      slot: slotFor(new Date(meal.timestamp)),
      carbs: meal.carbs,
      carbsWeighed: meal.carbsWeighed,
      units: dose.units,
      gramsPerUnit: Math.round((meal.carbs / dose.units) * 10) / 10,
      ...judgeMeal(meal, index, { now, meals, corrections }),
    });
  }
  samples.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const slots: SlotSummary[] = SLOTS.map(({ slot, label }) => {
    const own = samples.filter((s) => s.slot === slot);
    const ratios = own.map((s) => s.gramsPerUnit);
    const count = (o: MealOutcome) => own.filter((s) => s.outcome === o).length;
    return {
      slot,
      label,
      samples: own,
      judged: own.filter((s) => JUDGED.includes(s.outcome)).length,
      good: count('good'),
      tooLittle: count('too-little'),
      tooMuch: count('too-much'),
      used: ratios.length ? { min: Math.min(...ratios), max: Math.max(...ratios), median: median(ratios) } : undefined,
      ...estimateRatio(own),
    };
  });

  const corr = analyzeCorrections(doses, meals, readings, r.low, { since });
  const sensorFrom = now.getTime() - DAY;
  return {
    slots,
    samples,
    correction: { dropPerUnit: corr.observedFactor, usable: corr.samples.length, needed: 4 },
    basal: checkBasal(index, meals, rapid, now),
    sensorReadings24h: readings.filter((x) => x.source !== 'manual' && new Date(x.timestamp).getTime() >= sensorFrom).length,
  };
}

/** KE-Faktor (units per 10 g) from grams per unit. */
export const keFactor = (gramsPerUnit: number) => Math.round((10 / gramsPerUnit) * 10) / 10;
