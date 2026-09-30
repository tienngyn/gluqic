/**
 * How well corrections work. Looks only at "clean" corrections — no meal
 * shortly before or after and no other rapid insulin around — and measures
 * the drop per unit. Reports and may suggest a review; never changes the
 * correction factor.
 */
import { createReadingIndex } from '@/domain/glucose/stats';
import { classifyDose } from '@/domain/insulin/purpose';
import type { CorrectionSetpoint, GlucoseReading, Insight, InsulinDose, Meal } from '@/types/models';

const MIN = 60000;

export const CORRECTION_RULES = {
  /** No meal this long before the correction (carbs still absorbing). */
  mealBeforeMin: 150,
  /** No meal this long after it (would mask the drop). */
  mealAfterMin: 180,
  /** No other rapid insulin within ± this window. */
  otherInsulinMin: 180,
  /** Drop is measured to the lowest reading in this window after the dose. */
  measureFromMin: 120,
  measureToMin: 240,
  minSamples: 4,
  /** Relative difference from the setting that triggers a review suggestion. */
  reviewThreshold: 0.2,
};

export type CorrectionSample = {
  doseId: string;
  timestamp: string;
  units: number;
  glucoseAtDose: number;
  lowestAfter: number;
  /** mg/dL per unit */
  dropPerUnit: number;
};

export type CorrectionAnalysis = {
  total: number;
  totalUnits: number;
  samples: CorrectionSample[];
  /** Median mg/dL drop per unit across clean samples, or null if too few. */
  observedFactor: number | null;
  lowsAfter: number;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function analyzeCorrections(
  doses: InsulinDose[],
  meals: Meal[],
  readings: GlucoseReading[],
  low = 70,
): CorrectionAnalysis {
  const r = CORRECTION_RULES;
  const index = createReadingIndex(readings);
  const rapid = doses.filter((d) => d.insulinType !== 'long');
  const corrections = rapid.filter((d) => classifyDose(d, meals) === 'correction');
  const mealTimes = meals.map((m) => new Date(m.timestamp).getTime());

  const samples: CorrectionSample[] = [];
  let lowsAfter = 0;
  for (const d of corrections) {
    const t = new Date(d.timestamp).getTime();
    const after = index.between(new Date(t + r.measureFromMin * MIN), new Date(t + r.measureToMin * MIN));
    if (after.some((x) => x.value < low)) lowsAfter += 1;

    const mealNearby = mealTimes.some((m) => m >= t - r.mealBeforeMin * MIN && m <= t + r.mealAfterMin * MIN);
    const otherInsulin = rapid.some(
      (o) => o.id !== d.id && Math.abs(new Date(o.timestamp).getTime() - t) <= r.otherInsulinMin * MIN,
    );
    const at = index.near(new Date(t), 15);
    if (mealNearby || otherInsulin || !at || after.length < 3 || d.units <= 0) continue;

    const lowest = Math.min(...after.map((x) => x.value));
    samples.push({
      doseId: d.id,
      timestamp: d.timestamp,
      units: d.units,
      glucoseAtDose: at.value,
      lowestAfter: lowest,
      dropPerUnit: Math.round((at.value - lowest) / d.units),
    });
  }

  return {
    total: corrections.length,
    totalUnits: Math.round(corrections.reduce((s, d) => s + d.units, 0) * 10) / 10,
    samples,
    observedFactor: samples.length >= r.minSamples ? Math.round(median(samples.map((s) => s.dropPerUnit))) : null,
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
        ? `Set on ${day(setpoint.createdAt)} (was ${setpoint.previousFactor} mg/dL per unit). ${a.samples.length} of ${CORRECTION_RULES.minSamples} clean corrections tracked so far — results appear after ${CORRECTION_RULES.minSamples}.`
        : `${a.total} corrections logged. ${a.samples.length} of ${CORRECTION_RULES.minSamples} clean ones (no meal or other insulin nearby) needed before gluciq can compare them with your correction factor.`,
      tone: 'neutral',
      confidence: 0.2,
    };
  }
  const diff = (a.observedFactor - settingFactor) / settingFactor;
  const lowsText = a.lowsAfter ? ` Glucose went below range after ${a.lowsAfter} of ${a.total} corrections.` : '';
  const lead = since ? `${since}across` : 'Across';
  const body = `${lead} ${a.samples.length} corrections without food or other insulin nearby, each unit lowered glucose by about ${a.observedFactor} mg/dL (your ${setpoint ? 'setpoint' : 'setting'}: ${settingFactor}).${lowsText}`;
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
