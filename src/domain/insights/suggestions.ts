/**
 * One-tap learning: concrete, small setting changes the user can accept.
 *
 * Deterministic rules, deliberately conservative and asymmetric:
 *  - at most ±10 % per step, never more
 *  - toward MORE insulin only with enough data (≥ 6 meals / ≥ 4 corrections)
 *    and no lows at all in that data
 *  - toward LESS insulin as soon as there are 2 lows
 *  - learning starts over whenever the setting changes, and nothing is
 *    suggested again for 7 days after a change or a "Not now"
 *
 * Nothing is applied automatically: a suggestion only takes effect when the
 * user accepts it, and it then becomes a resettable setpoint.
 */
import type { BolusEvent, CarbRatioWindow, GlucoseRange, MealType } from '@/types/models';

import type { CorrectionAnalysis } from './corrections';
import { outcomeOf } from './similarMeals';

export const SUGGESTION_RULES = {
  minMeals: 6,
  maxMeals: 10,
  minCorrections: 4,
  /** 2 lows are enough to suggest less insulin. */
  hyposForLess: 2,
  /** Share of meals that ran high before suggesting more insulin. */
  highShare: 0.5,
  strongHighShare: 0.75,
  step: 0.1,
  smallStep: 0.05,
  /** Observed correction effect must differ this much from the setting. */
  correctionDiff: 0.2,
  cooldownDays: 7,
};

const DAY = 86400000;
const r1 = (n: number) => Math.round(n * 10) / 10;

const PLURAL: Record<MealType, string> = { breakfast: 'breakfasts', lunch: 'lunches', dinner: 'dinners', snack: 'snacks' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export type SettingSuggestion = {
  key: string;
  kind: 'ratio' | 'correction';
  mealType?: MealType;
  windowId?: string;
  /** g per U (ratio) or mg/dL per U (correction) */
  current: number;
  proposed: number;
  direction: 'more' | 'less';
  /** Relative change in insulin, e.g. +0.06 = 6 % more insulin. */
  insulinChange: number;
  reasons: string[];
  /** One line on the evidence, kept with the setpoint if accepted. */
  basis: string;
};

export type SuggestionContext = {
  now: Date;
  /** key → ISO time the user tapped "Not now". */
  dismissed?: Record<string, string>;
};

function coolingDown(key: string, changedAt: string | undefined, ctx: SuggestionContext): boolean {
  const recent = (iso?: string) => !!iso && ctx.now.getTime() - new Date(iso).getTime() < SUGGESTION_RULES.cooldownDays * DAY;
  return recent(changedAt) || recent(ctx.dismissed?.[key]);
}

/** A low within 4 h of the meal. */
function hadLow(e: BolusEvent, low: number): boolean {
  return [e.glucose1h, e.glucose2h, e.glucose3h, e.glucose4h].some((v) => v != null && v < low);
}

export function suggestRatio(
  window: CarbRatioWindow,
  events: BolusEvent[],
  range: Pick<GlucoseRange, 'low' | 'high'>,
  ctx: SuggestionContext,
): SettingSuggestion | null {
  const R = SUGGESTION_RULES;
  const key = `ratio:${window.mealType}`;
  if (coolingDown(key, window.changedAt, ctx)) return null;

  const since = window.changedAt ?? '';
  const recent = events
    .filter((e) => e.mealType === window.mealType && e.timestamp >= since && outcomeOf(e, range) != null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, R.maxMeals);
  const n = recent.length;
  const meals = PLURAL[window.mealType];
  const hypos = recent.filter((e) => hadLow(e, range.low)).length;
  const basis = `Based on your last ${n} ${meals}${window.changedAt ? ` since ${day(window.changedAt)}` : ''}.`;
  const current = window.gramsPerUnit;

  if (hypos >= R.hyposForLess) {
    const proposed = Math.min(150, r1(current * (1 + R.step)));
    return {
      key,
      kind: 'ratio',
      mealType: window.mealType,
      windowId: window.id,
      current,
      proposed,
      direction: 'less',
      insulinChange: Math.round((current / proposed - 1) * 1000) / 1000,
      reasons: [`Glucose went below range within 4 hours after ${hypos} of ${n} ${meals}.`],
      basis,
    };
  }

  if (n < R.minMeals || hypos > 0) return null;
  const outcomes = recent.map((e) => outcomeOf(e, range));
  const high = outcomes.filter((o) => o === 'high' || o === 'corrected').length;
  const corrected = outcomes.filter((o) => o === 'corrected').length;
  const share = high / n;
  if (share < R.highShare) return null;

  const step = share >= R.strongHighShare ? R.step : R.smallStep;
  const proposed = Math.max(1, r1(current / (1 + step)));
  if (proposed >= current) return null;
  return {
    key,
    kind: 'ratio',
    mealType: window.mealType,
    windowId: window.id,
    current,
    proposed,
    direction: 'more',
    insulinChange: Math.round((current / proposed - 1) * 1000) / 1000,
    reasons: [
      `Glucose ran high after ${high} of ${n} ${meals}${corrected ? ` (${corrected} needed a correction)` : ''}.`,
      'No lows after these meals.',
    ],
    basis,
  };
}

export function suggestCorrectionFactor(
  analysis: CorrectionAnalysis,
  current: number,
  changedAt: string | undefined,
  ctx: SuggestionContext,
): SettingSuggestion | null {
  const R = SUGGESTION_RULES;
  const key = 'correction';
  if (coolingDown(key, changedAt, ctx)) return null;
  const basis = `Based on ${analysis.total} corrections${changedAt ? ` since ${day(changedAt)}` : ''}.`;
  const make = (proposed: number, reasons: string[]): SettingSuggestion => ({
    key,
    kind: 'correction',
    current,
    proposed,
    direction: proposed > current ? 'less' : 'more',
    insulinChange: Math.round((current / proposed - 1) * 1000) / 1000,
    reasons,
    basis,
  });

  if (analysis.lowsAfter >= R.hyposForLess) {
    return make(Math.min(400, Math.round(current * (1 + R.step))), [
      `Glucose went below range after ${analysis.lowsAfter} of ${analysis.total} corrections.`,
    ]);
  }
  if (analysis.observedFactor == null || analysis.samples.length < R.minCorrections || analysis.lowsAfter > 0) return null;
  const diff = (analysis.observedFactor - current) / current;
  if (Math.abs(diff) <= R.correctionDiff) return null;
  const reason = `Each unit lowered glucose by about ${analysis.observedFactor} mg/dL across ${analysis.samples.length} corrections (setting: ${current}).`;
  // Move one step toward what was observed, never past it.
  const proposed =
    diff > 0
      ? Math.min(Math.round(current * (1 + R.step)), analysis.observedFactor)
      : Math.max(Math.round(current / (1 + R.step)), analysis.observedFactor);
  return make(proposed, [reason]);
}
