/**
 * Pattern detection. Insights describe what happened and may suggest that
 * the user *review* a setting. They never prescribe a dose and never change
 * settings — see `containsDoseInstruction`, which every insight must pass.
 */
import { computeStats, createReadingIndex, hourlyProfile } from '@/domain/glucose/stats';
import { summarizeOutcomes } from '@/domain/insights/similarMeals';
import type {
  ActivityEntry,
  BolusEvent,
  GlucoseRange,
  GlucoseReading,
  Insight,
  MealType,
} from '@/types/models';

const MEAL_LABEL: Record<MealType, { one: string; many: string }> = {
  breakfast: { one: 'Breakfast', many: 'breakfasts' },
  lunch: { one: 'Lunch', many: 'lunches' },
  dinner: { one: 'Dinner', many: 'dinners' },
  snack: { one: 'Snacks', many: 'snacks' },
};

const DOSE_PATTERNS = [
  /\b\d+(\.\d+)?\s*(u|units?|iu)\b/i,
  /\b(take|inject|use|give|add)\b[^.]*\b(more|less|fewer|extra)\b[^.]*\b(insulin|units?)\b/i,
  /\b(increase|decrease|raise|lower|change)\s+(your\s+)?(dose|bolus|insulin)\b/i,
];

/** Guardrail: true if text reads like a dosing instruction. */
export function containsDoseInstruction(text: string): boolean {
  return DOSE_PATTERNS.some((re) => re.test(text));
}

function hh(h: number): string {
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
}

export type PatternInput = {
  events: BolusEvent[];
  readings: GlucoseReading[];
  activities: ActivityEntry[];
  range: GlucoseRange;
  now: Date;
  /** Minimum samples before a meal pattern is reported. */
  minSamples?: number;
};

export function detectMealPatterns({ events, range, now, minSamples = 6 }: PatternInput): Insight[] {
  const out: Insight[] = [];
  (['breakfast', 'lunch', 'dinner'] as MealType[]).forEach((mealType) => {
    const recent = events
      .filter((e) => e.mealType === mealType && e.glucose2h != null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10);
    if (recent.length < minSamples) return;
    const s = summarizeOutcomes(recent, range);
    const label = MEAL_LABEL[mealType];
    const aboveShare = s.aboveAt2h / s.withOutcome;
    const inRangeShare = s.inRangeAt2h / s.withOutcome;

    if (aboveShare >= 0.6) {
      out.push({
        id: `pattern-${mealType}-high`,
        type: 'meal-pattern',
        title: `${label.one} pattern`,
        body: `Glucose was above target 2 hours after ${s.aboveAt2h} of your last ${s.withOutcome} ${label.many}.`,
        suggestion: `Your ${mealType} carb ratio may be worth reviewing with your care team.`,
        confidence: Math.min(1, s.withOutcome / 10) * aboveShare,
        tone: 'attention',
        createdAt: now.toISOString(),
      });
    } else if (s.belowAt2h / s.withOutcome >= 0.3) {
      out.push({
        id: `pattern-${mealType}-low`,
        type: 'meal-pattern',
        title: `${label.one} pattern`,
        body: `Glucose was below range 2 hours after ${s.belowAt2h} of your last ${s.withOutcome} ${label.many}.`,
        suggestion: `Your ${mealType} settings may be worth reviewing with your care team.`,
        confidence: Math.min(1, s.withOutcome / 10) * 0.8,
        tone: 'attention',
        createdAt: now.toISOString(),
      });
    } else if (inRangeShare >= 0.75) {
      out.push({
        id: `pattern-${mealType}-stable`,
        type: 'positive',
        title: `${label.one} is steady`,
        body: `Glucose stayed in range after ${s.inRangeAt2h} of your last ${s.withOutcome} ${label.many}.`,
        confidence: Math.min(1, s.withOutcome / 10) * inRangeShare,
        tone: 'positive',
        createdAt: now.toISOString(),
      });
    }
  });
  return out;
}

/** Lows in the 1–6 h after evening (≥17:00) workouts. */
export function detectExercisePatterns({ readings, activities, range, now }: PatternInput): Insight[] {
  const evening = activities.filter(
    (a) => a.durationMin >= 20 && new Date(a.timestamp).getHours() >= 17 && a.kind !== 'walk',
  );
  if (evening.length < 3) return [];

  const index = createReadingIndex(readings);
  let withLow = 0;
  let dropSum = 0;
  let dropCount = 0;
  for (const a of evening) {
    const start = new Date(a.timestamp).getTime();
    const window = index.between(new Date(start + 60 * 60000), new Date(start + 6 * 3600000));
    if (window.some((r) => r.value < range.low)) withLow += 1;
    const pre = index.between(new Date(start - 30 * 60000), new Date(start));
    if (pre.length && window.length) {
      const preAvg = pre.reduce((s, r) => s + r.value, 0) / pre.length;
      const minAfter = Math.min(...window.map((r) => r.value));
      dropSum += preAvg - minAfter;
      dropCount += 1;
    }
  }
  const avgDrop = dropCount ? Math.round(dropSum / dropCount) : 0;
  if (withLow / evening.length < 0.3 && avgDrop < 40) return [];

  return [
    {
      id: 'pattern-exercise-evening',
      type: 'exercise',
      title: 'Evening workouts',
      body:
        withLow > 0
          ? `Glucose went below range after ${withLow} of ${evening.length} evening workouts, typically dropping about ${avgDrop} mg/dL.`
          : `Glucose is typically about ${avgDrop} mg/dL lower after evening workouts.`,
      suggestion: 'Consider checking glucose more often after evening exercise.',
      confidence: Math.min(1, evening.length / 8),
      tone: 'attention',
      createdAt: now.toISOString(),
    },
  ];
}

/** High-fat meals: compare the late rise (1h → 3h) against lower-fat meals. */
export function detectHighFatPatterns({ events, now }: PatternInput): Insight[] {
  const complete = events.filter((e) => e.glucose1h != null && e.glucose3h != null && e.fat != null);
  const highFat = complete.filter((e) => (e.fat ?? 0) >= 30);
  const lowFat = complete.filter((e) => (e.fat ?? 0) < 20);
  if (highFat.length < 4 || lowFat.length < 4) return [];

  const lateRise = (xs: BolusEvent[]) =>
    xs.reduce((s, e) => s + ((e.glucose3h as number) - (e.glucose1h as number)), 0) / xs.length;
  const diff = Math.round(lateRise(highFat) - lateRise(lowFat));
  if (diff < 20) return [];

  return [
    {
      id: 'pattern-high-fat',
      type: 'high-fat',
      title: 'High-fat meals',
      body: `Meals with 30 g+ fat show a delayed rise — on average ${diff} mg/dL higher at 3 hours than lower-fat meals.`,
      suggestion: 'Worth discussing timing strategies for these meals with your care team.',
      confidence: Math.min(1, highFat.length / 10),
      tone: 'neutral',
      createdAt: now.toISOString(),
    },
  ];
}

/** Steepest consistent 2-hour rise across the average day. */
export function detectTimeOfDayPatterns({ readings, now }: PatternInput): Insight[] {
  const profile = hourlyProfile(readings);
  let bestStart = -1;
  let bestRise = 0;
  for (let h = 6; h < 22; h++) {
    const a = profile[h];
    const b = profile[h + 2];
    if (a == null || b == null) continue;
    if (b - a > bestRise) {
      bestRise = b - a;
      bestStart = h;
    }
  }
  const out: Insight[] = [];
  if (bestStart >= 0 && bestRise >= 30) {
    out.push({
      id: 'pattern-time-of-day',
      type: 'time-of-day',
      title: 'Time of day',
      body: `Glucose tends to rise between ${hh(bestStart)} and ${hh(bestStart + 2)}, by about ${Math.round(bestRise)} mg/dL on average.`,
      confidence: 0.7,
      tone: 'neutral',
      createdAt: now.toISOString(),
    });
  }

  const midnight = profile[0];
  const early = profile[6];
  if (midnight != null && early != null && Math.abs(early - midnight) >= 20) {
    const up = early > midnight;
    out.push({
      id: 'pattern-overnight',
      type: 'overnight',
      title: 'Overnight',
      body: `Glucose usually drifts ${up ? 'up' : 'down'} about ${Math.abs(Math.round(early - midnight))} mg/dL between midnight and 06:00.`,
      suggestion: up ? 'An early-morning rise can be worth mentioning at your next review.' : undefined,
      confidence: 0.6,
      tone: up ? 'neutral' : 'attention',
      createdAt: now.toISOString(),
    });
  }
  return out;
}

/** Time in range this week vs the week before. */
export function detectWeeklyTrend({ readings, range, now }: PatternInput): Insight[] {
  const index = createReadingIndex(readings);
  const day = 86400000;
  const thisWeek = computeStats(index.between(new Date(now.getTime() - 7 * day), now), range);
  const lastWeek = computeStats(
    index.between(new Date(now.getTime() - 14 * day), new Date(now.getTime() - 7 * day)),
    range,
  );
  if (thisWeek.count < 50 || lastWeek.count < 50) return [];
  const diff = thisWeek.timeInRange - lastWeek.timeInRange;
  if (Math.abs(diff) < 3) {
    return [
      {
        id: 'trend-weekly',
        type: 'trend',
        title: 'This week',
        body: `Time in range is holding steady at ${thisWeek.timeInRange}%, in line with last week.`,
        confidence: 0.8,
        tone: 'neutral',
        createdAt: now.toISOString(),
      },
    ];
  }
  const up = diff > 0;
  return [
    {
      id: 'trend-weekly',
      type: 'trend',
      title: 'This week',
      body: up
        ? `Time in range is up ${diff} points to ${thisWeek.timeInRange}% compared with last week.`
        : `Time in range is down ${-diff} points to ${thisWeek.timeInRange}% compared with last week.`,
      confidence: 0.8,
      tone: up ? 'positive' : 'attention',
      createdAt: now.toISOString(),
    },
  ];
}

export function detectPatterns(input: PatternInput): Insight[] {
  const all = [
    ...detectWeeklyTrend(input),
    ...detectMealPatterns(input),
    ...detectTimeOfDayPatterns(input),
    ...detectExercisePatterns(input),
    ...detectHighFatPatterns(input),
  ];
  // Guardrail: drop anything that could read as a dosing instruction.
  return all.filter((i) => !containsDoseInstruction(`${i.title} ${i.body} ${i.suggestion ?? ''}`));
}
