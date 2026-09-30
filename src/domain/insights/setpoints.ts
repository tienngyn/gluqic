/**
 * Outcome tracking relative to a setpoint: compares meals before the
 * setpoint with meals since. Reports only; never adjusts anything.
 */
import type { BolusEvent, Insight, MealType, RatioSetpoint } from '@/types/models';

import { correctionNote, summarizeOutcomes, type OutcomeSummary } from './similarMeals';

const PLURAL: Record<MealType, string> = { breakfast: 'breakfasts', lunch: 'lunches', dinner: 'dinners', snack: 'snacks' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const MIN_SETPOINT_SAMPLES = 3;

export type SetpointComparison = {
  setpoint: RatioSetpoint;
  before: OutcomeSummary;
  since: OutcomeSummary;
};

export function compareSetpoint(
  setpoint: RatioSetpoint,
  events: BolusEvent[],
  range: { low: number; high: number },
  beforeWindow = 12,
): SetpointComparison {
  const start = setpoint.createdAt;
  const end = setpoint.endedAt ?? '9999';
  const ofType = events.filter((e) => e.mealType === setpoint.mealType);
  const before = ofType
    .filter((e) => e.timestamp < start)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, beforeWindow);
  const since = ofType.filter((e) => e.timestamp >= start && e.timestamp < end);
  return { setpoint, before: summarizeOutcomes(before, range), since: summarizeOutcomes(since, range) };
}

export function setpointInsight(c: SetpointComparison, unit: 'mg/dL' = 'mg/dL', now = new Date()): Insight {
  const { setpoint, before, since } = c;
  const meal = setpoint.mealType;
  const title = `${meal.charAt(0).toUpperCase()}${meal.slice(1)} setpoint`;
  const base = { id: `setpoint-${setpoint.id}`, type: 'setpoint' as const, title, createdAt: now.toISOString() };
  const when = day(setpoint.createdAt);

  if (since.withOutcome < MIN_SETPOINT_SAMPLES) {
    return {
      ...base,
      body: `Set on ${when}. ${since.withOutcome} of ${MIN_SETPOINT_SAMPLES} ${PLURAL[meal]} tracked so far — results appear after ${MIN_SETPOINT_SAMPLES}.`,
      tone: 'neutral',
      confidence: 0.2,
    };
  }

  const n = since.withOutcome;
  const beforeText = before.withOutcome ? ` (before: ${before.inRangeAt2h} of ${before.withOutcome})` : '';
  const avgText =
    since.avg2h != null && before.avg2h != null
      ? ` Average 2 h glucose: ${since.avg2h} vs ${before.avg2h} ${unit}.`
      : '';
  const confidence = Math.min(1, n / 10);

  if (since.belowAt2h / n >= 0.3) {
    return {
      ...base,
      body: `Since your setpoint on ${when}, glucose was below range 2 hours after ${since.belowAt2h} of ${n} ${PLURAL[meal]}.${avgText}`,
      suggestion: `Your ${meal} setpoint may be worth reviewing with your care team.`,
      tone: 'attention',
      confidence,
    };
  }
  if (since.aboveAt2h / n >= 0.6) {
    return {
      ...base,
      body: since.corrected
        ? `Since your setpoint on ${when}, glucose still ran high after ${since.aboveAt2h} of ${n} ${PLURAL[meal]}${correctionNote(since)}.${avgText}`
        : `Since your setpoint on ${when}, glucose was still above target 2 hours after ${since.aboveAt2h} of ${n} ${PLURAL[meal]}.${avgText}`,
      suggestion: `Your ${meal} setpoint may be worth reviewing with your care team.`,
      tone: 'attention',
      confidence,
    };
  }
  const improved = !before.withOutcome || since.inRangeAt2h / n > before.inRangeAt2h / before.withOutcome;
  return {
    ...base,
    body: `Since your setpoint on ${when}, glucose was in range 2 hours after ${since.inRangeAt2h} of ${n} ${PLURAL[meal]}${beforeText}.${
      since.corrected ? ` ${since.corrected} needed a correction.` : ''
    }${avgText}`,
    tone: improved ? 'positive' : 'neutral',
    confidence,
  };
}
