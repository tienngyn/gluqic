import type { InsulinDose, Meal } from '@/types/models';

export type DoseKind = 'meal' | 'correction' | 'basal';

/** A rapid dose this close to a meal counts as its meal dose when untagged. */
export const MEAL_DOSE_WINDOW_MIN = 45;

/**
 * What a dose was for. Explicit tags win; untagged rapid doses near a meal
 * count as meal doses, all other rapid doses as corrections.
 */
export function classifyDose(dose: InsulinDose, meals: Meal[]): DoseKind {
  if (dose.insulinType === 'long') return 'basal';
  if (dose.purpose) return dose.purpose;
  const t = new Date(dose.timestamp).getTime();
  const nearMeal = meals.some((m) => Math.abs(new Date(m.timestamp).getTime() - t) <= MEAL_DOSE_WINDOW_MIN * 60000);
  return nearMeal ? 'meal' : 'correction';
}
