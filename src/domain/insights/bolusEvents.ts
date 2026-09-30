import { createReadingIndex } from '@/domain/glucose/stats';
import { classifyDose, MEAL_DOSE_WINDOW_MIN } from '@/domain/insulin/purpose';
import type { ActivityEntry, BolusEvent, GlucoseReading, InsulinDose, Meal } from '@/types/models';

const MIN = 60000;

/**
 * Joins meals with their meal dose, any correction taken afterwards, and
 * the glucose values around them. The result is the dataset the pattern
 * engine learns from.
 */
export function buildBolusEvents(
  meals: Meal[],
  doses: InsulinDose[],
  readings: GlucoseReading[],
  activities: ActivityEntry[] = [],
  /**
   * A correction up to this long after a meal counts as needed for that meal.
   * Use the insulin duration: a high while meal insulin still acts is the meal's.
   */
  correctionWindowMin = 180,
): BolusEvent[] {
  const mealDoses: InsulinDose[] = [];
  const corrections: { t: number; units: number }[] = [];
  for (const d of doses) {
    const kind = classifyDose(d, meals);
    if (kind === 'meal') mealDoses.push(d);
    else if (kind === 'correction') corrections.push({ t: new Date(d.timestamp).getTime(), units: d.units });
  }
  const index = createReadingIndex(readings);

  return meals.map((meal) => {
    const t = new Date(meal.timestamp).getTime();
    const dose = nearest(mealDoses, t, MEAL_DOSE_WINDOW_MIN);
    const correctionAfter = corrections
      .filter((c) => c.t >= t + 20 * MIN && c.t <= t + correctionWindowMin * MIN)
      .reduce((sum, c) => sum + c.units, 0);
    const before = index.near(new Date(t - 5 * MIN), 20);
    const at = (h: number) => index.near(new Date(t + h * 60 * MIN), 20)?.value;

    const activityMinutes = (from: number, to: number) =>
      activities
        .filter((a) => {
          const ms = new Date(a.timestamp).getTime();
          return ms >= from && ms < to;
        })
        .reduce((s, a) => s + a.durationMin, 0);

    return {
      id: `evt-${meal.id}`,
      timestamp: meal.timestamp,
      mealId: meal.id,
      mealName: meal.name,
      mealType: meal.mealType,
      carbs: meal.carbs,
      protein: meal.protein,
      fat: meal.fat,
      glucoseBefore: before?.value ?? NaN,
      glucoseTrend: before?.trend,
      insulinGiven: dose?.units ?? 0,
      correctionAfter: correctionAfter || undefined,
      activityBefore: activityMinutes(t - 3 * 60 * MIN, t),
      activityAfter: activityMinutes(t, t + 3 * 60 * MIN),
      glucose1h: at(1),
      glucose2h: at(2),
      glucose3h: at(3),
      glucose4h: at(4),
    };
  });
}

function nearest(doses: InsulinDose[], t: number, toleranceMin: number): InsulinDose | undefined {
  let best: InsulinDose | undefined;
  let bestDelta = Infinity;
  for (const d of doses) {
    const delta = Math.abs(new Date(d.timestamp).getTime() - t);
    if (delta < bestDelta) {
      best = d;
      bestDelta = delta;
    }
  }
  return bestDelta <= toleranceMin * MIN ? best : undefined;
}
