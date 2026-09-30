import type { CarbRatioWindow, MealType } from '@/types/models';

/** Minutes since local midnight. */
export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** True if `minute` falls in [start, end), handling windows that wrap midnight. */
export function isInWindow(minute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
  return minute >= startMinute || minute < endMinute;
}

export function findWindowAt(windows: CarbRatioWindow[], date: Date): CarbRatioWindow | undefined {
  const m = minuteOfDay(date);
  return windows.find((w) => isInWindow(m, w.startMinute, w.endMinute));
}

/**
 * The carb ratio for a meal. An explicit meal type wins; otherwise the
 * window covering `at` is used. Returns undefined if nothing matches so the
 * caller must ask the user rather than guess.
 */
export function resolveCarbRatio(
  windows: CarbRatioWindow[],
  opts: { mealType?: MealType; at?: Date },
): CarbRatioWindow | undefined {
  if (opts.mealType) {
    const byMeal = windows.filter((w) => w.mealType === opts.mealType);
    if (byMeal.length === 1) return byMeal[0];
    if (byMeal.length > 1 && opts.at) {
      const m = minuteOfDay(opts.at);
      return byMeal.find((w) => isInWindow(m, w.startMinute, w.endMinute)) ?? byMeal[0];
    }
    if (byMeal.length > 1) return byMeal[0];
  }
  if (opts.at) return findWindowAt(windows, opts.at);
  return undefined;
}

export function suggestMealType(windows: CarbRatioWindow[], at: Date): MealType {
  return findWindowAt(windows, at)?.mealType ?? 'snack';
}
