import type { CarbRatioWindow } from '@/types/models';

import { isInWindow, resolveCarbRatio, suggestMealType } from './carbRatio';

const windows: CarbRatioWindow[] = [
  { id: 'b', label: 'Breakfast', mealType: 'breakfast', startMinute: 5 * 60, endMinute: 11 * 60, gramsPerUnit: 5 },
  { id: 'l', label: 'Lunch', mealType: 'lunch', startMinute: 11 * 60, endMinute: 16 * 60, gramsPerUnit: 7 },
  { id: 'd', label: 'Dinner', mealType: 'dinner', startMinute: 16 * 60, endMinute: 22 * 60, gramsPerUnit: 6 },
  { id: 'n', label: 'Late', mealType: 'snack', startMinute: 22 * 60, endMinute: 5 * 60, gramsPerUnit: 8 },
];

const at = (h: number, m = 0) => new Date(2026, 8, 30, h, m);

describe('carb ratio windows', () => {
  it('handles windows that wrap midnight', () => {
    expect(isInWindow(23 * 60, 22 * 60, 5 * 60)).toBe(true);
    expect(isInWindow(2 * 60, 22 * 60, 5 * 60)).toBe(true);
    expect(isInWindow(12 * 60, 22 * 60, 5 * 60)).toBe(false);
  });

  it('prefers the selected meal type', () => {
    expect(resolveCarbRatio(windows, { mealType: 'lunch', at: at(8) })?.gramsPerUnit).toBe(7);
  });

  it('falls back to the window covering the time', () => {
    expect(resolveCarbRatio(windows, { at: at(18, 30) })?.gramsPerUnit).toBe(6);
    expect(resolveCarbRatio(windows, { at: at(1) })?.gramsPerUnit).toBe(8);
  });

  it('returns undefined rather than guessing', () => {
    expect(resolveCarbRatio([], { mealType: 'lunch' })).toBeUndefined();
  });

  it('suggests a meal type from the clock', () => {
    expect(suggestMealType(windows, at(7, 45))).toBe('breakfast');
    expect(suggestMealType(windows, at(13))).toBe('lunch');
  });
});
