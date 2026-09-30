/**
 * How well corrections work: the glucose drop per unit of insulin.
 *
 * "Clean" corrections have no other rapid insulin acting. Corrections given
 * while earlier insulin (e.g. the meal bolus) is still active are "adjusted":
 * the part of that earlier insulin that acts during the measurement is taken
 * from the insulin action curve and added to the units, so the drop is not
 * wrongly credited to the correction alone. Corrections with carbs still
 * absorbing, food soon after, or exercise are left out — their drop can't
 * be attributed. Reports only; never changes the correction factor.
 */
import { createReadingIndex } from '@/domain/glucose/stats';
import { iobFraction, type IobModel } from '@/domain/insulin/iob';
import { classifyDose } from '@/domain/insulin/purpose';
import type { ActivityEntry, CorrectionSetpoint, GlucoseReading, Insight, InsulinDose, Meal } from '@/types/models';

const MIN = 60000;

export const CORRECTION_RULES = {
  /** No meal this long before the correction (carbs still absorbing). */
  mealBeforeMin: 180,
  /** High-fat meals (≥ 30 g fat) absorb longer. */
  highFatMealBeforeMin: 300,
  /** No meal this long after it (would mask the drop). */
  mealAfterMin: 180,
  /** No exercise from this long before until the end of the measurement. */
  activityBeforeMin: 60,
  /** Drop is measured to the lowest reading in this window after the dose. */
  measureFromMin: 120,
  measureToMin: 240,
  minSamples: 4,
  /** Adjusted samples count half as much as clean ones. */
  adjustedWeight: 0.5,
  /** Other insulin acting less than this (U) keeps a sample "clean". */
  cleanThresholdUnits: 0.05,
  /** Relative difference from the setting that triggers a review suggestion. */
  reviewThreshold: 0.2,
};

export type CorrectionSample = {
  doseId: string;
  timestamp: string;
  units: number;
  /** Units of earlier/later rapid insulin acting during the measurement. */
  otherInsulinUnits: number;
  kind: 'clean' | 'adjusted';
  glucoseAtDose: number;
  lowestAfter: number;
  /** mg/dL per unit of all insulin acting */
  dropPerUnit: number;
};

export type CorrectionAnalysis = {
  total: number;
  totalUnits: number;
  samples: CorrectionSample[];
  /** Weighted median mg/dL drop per unit, or null if too few samples. */
  observedFactor: number | null;
  lowsAfter: number;
};

/** Median where each value carries a weight. */
export function weightedMedian(values: { v: number; w: number }[]): number {
  const s = [...values].sort((a, b) => a.v - b.v);
  const total = s.reduce((sum, x) => sum + x.w, 0);
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc >= total / 2) return x.v;
  }
  return s[s.length - 1]?.v ?? NaN;
}

const DEFAULT_MODEL: IobModel = { durationHours: 4.5, peakMinutes: 75 };

export function analyzeCorrections(
  doses: InsulinDose[],
  meals: Meal[],
  readings: GlucoseReading[],
  low = 70,
  /**
   * `since` (ms) limits which corrections are analysed; all doses are still
   * used to account for insulin that was already active.
   */
  opts: { model?: IobModel; activities?: ActivityEntry[]; since?: number } = {},
): CorrectionAnalysis {
  const r = CORRECTION_RULES;
  const model = opts.model ?? DEFAULT_MODEL;
  const index = createReadingIndex(readings);
  const rapid = doses.filter((d) => d.insulinType !== 'long');
  const corrections = rapid.filter(
    (d) => classifyDose(d, meals) === 'correction' && new Date(d.timestamp).getTime() >= (opts.since ?? -Infinity),
  );
  const mealInfo = meals.map((m) => ({ t: new Date(m.timestamp).getTime(), highFat: m.fat >= 30 }));
  const activityTimes = (opts.activities ?? []).map((a) => new Date(a.timestamp).getTime());

  const samples: CorrectionSample[] = [];
  let lowsAfter = 0;
  for (const d of corrections) {
    const t = new Date(d.timestamp).getTime();
    const after = index.between(new Date(t + r.measureFromMin * MIN), new Date(t + r.measureToMin * MIN));
    if (after.some((x) => x.value < low)) lowsAfter += 1;

    const carbsActive = mealInfo.some(
      (m) => m.t <= t && t - m.t < (m.highFat ? r.highFatMealBeforeMin : r.mealBeforeMin) * MIN,
    );
    const foodAfter = mealInfo.some((m) => m.t > t && m.t <= t + r.mealAfterMin * MIN);
    const exercise = activityTimes.some((a) => a >= t - r.activityBeforeMin * MIN && a <= t + r.measureToMin * MIN);
    const at = index.near(new Date(t), 15);
    if (carbsActive || foodAfter || exercise || !at || after.length < 3 || d.units <= 0) continue;

    const lowestReading = after.reduce((a, b) => (b.value < a.value ? b : a));
    const tLow = new Date(lowestReading.timestamp).getTime();
    // Insulin from other doses that acts between the correction and the lowest reading.
    const otherInsulinUnits = rapid
      .filter((o) => o.id !== d.id)
      .reduce((sum, o) => {
        const to = new Date(o.timestamp).getTime();
        if (to > tLow) return sum;
        const acting = iobFraction((t - to) / MIN, model) - iobFraction((tLow - to) / MIN, model);
        return sum + o.units * Math.max(0, acting);
      }, 0);
    const insulin = d.units + otherInsulinUnits;

    samples.push({
      doseId: d.id,
      timestamp: d.timestamp,
      units: d.units,
      otherInsulinUnits: Math.round(otherInsulinUnits * 100) / 100,
      kind: otherInsulinUnits < r.cleanThresholdUnits ? 'clean' : 'adjusted',
      glucoseAtDose: at.value,
      lowestAfter: lowestReading.value,
      dropPerUnit: Math.round((at.value - lowestReading.value) / insulin),
    });
  }

  return {
    total: corrections.length,
    totalUnits: Math.round(corrections.reduce((s, d) => s + d.units, 0) * 10) / 10,
    samples,
    observedFactor:
      samples.length >= r.minSamples
        ? Math.round(
            weightedMedian(samples.map((s) => ({ v: s.dropPerUnit, w: s.kind === 'clean' ? 1 : r.adjustedWeight }))),
          )
        : null,
    lowsAfter,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/**
 * Insight comparing observed correction effect with the setting. With an
 * active correction setpoint, pass only corrections since it. Wording
 * avoids dose instructions.
 */
export function correctionInsight(
  a: CorrectionAnalysis,
  settingFactor: number,
  now = new Date(),
  setpoint?: CorrectionSetpoint,
): Insight | null {
  const base = {
    id: 'corrections',
    type: 'correction' as const,
    title: setpoint ? 'Correction setpoint' : 'Corrections',
    createdAt: now.toISOString(),
  };
  const since = setpoint ? `Since your setpoint on ${day(setpoint.createdAt)}, ` : '';
  if (a.total === 0 && !setpoint) return null;
  if (a.observedFactor == null) {
    return {
      ...base,
      body: setpoint
        ? `Set on ${day(setpoint.createdAt)} (was ${setpoint.previousFactor} mg/dL per unit). ${a.samples.length} of ${CORRECTION_RULES.minSamples} usable corrections tracked so far — results appear after ${CORRECTION_RULES.minSamples}.`
        : `${a.total} corrections logged. ${a.samples.length} of ${CORRECTION_RULES.minSamples} usable ones (no food or exercise nearby) needed before gluciq can compare them with your correction factor.`,
      tone: 'neutral',
      confidence: 0.2,
    };
  }
  const diff = (a.observedFactor - settingFactor) / settingFactor;
  const lowsText = a.lowsAfter ? ` Glucose went below range after ${a.lowsAfter} of ${a.total} corrections.` : '';
  const lead = since ? `${since}across` : 'Across';
  const adjusted = a.samples.filter((s) => s.kind === 'adjusted').length;
  const adjustedText = adjusted ? `, ${adjusted} adjusted for meal insulin still active` : '';
  const body = `${lead} ${a.samples.length} corrections without food nearby${adjustedText}, each unit lowered glucose by about ${a.observedFactor} mg/dL (your ${setpoint ? 'setpoint' : 'setting'}: ${settingFactor}).${lowsText}`;
  if (Math.abs(diff) > CORRECTION_RULES.reviewThreshold || a.lowsAfter >= 2) {
    return {
      ...base,
      body,
      suggestion: `Your correction ${setpoint ? 'setpoint' : 'factor'} may be worth reviewing with your care team.`,
      tone: 'attention',
      confidence: Math.min(1, a.samples.length / 10),
    };
  }
  return {
    ...base,
    body: `${body} That matches your ${setpoint ? 'setpoint' : 'setting'} well.`,
    tone: 'positive',
    confidence: Math.min(1, a.samples.length / 10),
  };
}
