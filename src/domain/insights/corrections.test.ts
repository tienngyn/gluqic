import type { GlucoseReading, InsulinDose, Meal } from '@/types/models';

import { classifyDose } from '@/domain/insulin/purpose';

import { buildBolusEvents } from './bolusEvents';
import { analyzeCorrections, correctionInsight } from './corrections';
import { containsDoseInstruction, detectMealPatterns } from './patterns';
import { summarizeOutcomes } from './similarMeals';

const MIN = 60000;
const day = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);
const iso = (d: Date) => d.toISOString();
const range = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };

const meal = (at: Date, id = `m${at.getTime()}`): Meal => ({
  id,
  userId: 'u',
  mealType: 'breakfast',
  items: [],
  calories: 500,
  carbs: 60,
  protein: 20,
  fat: 15,
  timestamp: iso(at),
});
const dose = (at: Date, units: number, purpose?: InsulinDose['purpose']): InsulinDose => ({
  id: `d${at.getTime()}-${units}`,
  userId: 'u',
  units,
  insulinType: 'rapid',
  purpose,
  source: 'manual',
  timestamp: iso(at),
});
/** Readings every 15 min following `f(minutesSinceStart)`. */
const series = (start: Date, minutes: number, f: (m: number) => number): GlucoseReading[] =>
  Array.from({ length: minutes / 15 + 1 }, (_, i) => ({
    id: `${start.getTime()}-${i}`,
    userId: 'u',
    value: Math.round(f(i * 15)),
    source: 'cgm' as const,
    timestamp: iso(new Date(start.getTime() + i * 15 * MIN)),
  }));

describe('classifyDose', () => {
  const meals = [meal(day(1, 8))];
  it('uses the explicit purpose', () => {
    expect(classifyDose(dose(day(1, 8), 10, 'correction'), meals)).toBe('correction');
  });
  it('infers meal vs correction from timing when untagged', () => {
    expect(classifyDose(dose(day(1, 7, 50), 10), meals)).toBe('meal');
    expect(classifyDose(dose(day(1, 10, 30), 2), meals)).toBe('correction');
    expect(classifyDose({ ...dose(day(1, 22), 18), insulinType: 'long' }, meals)).toBe('basal');
  });
});

describe('corrections in meal outcomes', () => {
  it('attaches a later correction to the meal and does not treat it as the meal dose', () => {
    const m = meal(day(1, 8));
    const readings = series(day(1, 7, 45), 300, (t) => (t < 150 ? 120 + t : 150));
    const [e] = buildBolusEvents([m], [dose(day(1, 7, 55), 12, 'meal'), dose(day(1, 10, 15), 2, 'correction')], readings);
    expect(e.insulinGiven).toBe(12);
    expect(e.correctionAfter).toBe(2);
  });

  it('counts a corrected meal as running high even if 2 h looks fine', () => {
    const events = [
      { id: 'a', timestamp: iso(day(1, 8)), mealType: 'breakfast' as const, carbs: 60, glucoseBefore: 110, insulinGiven: 12, glucose2h: 150, correctionAfter: 2 },
      { id: 'b', timestamp: iso(day(2, 8)), mealType: 'breakfast' as const, carbs: 60, glucoseBefore: 110, insulinGiven: 12, glucose2h: 150 },
    ];
    expect(summarizeOutcomes(events, range)).toMatchObject({ withOutcome: 2, aboveAt2h: 1, corrected: 1, inRangeAt2h: 1 });
  });

  it('mentions corrections in meal patterns', () => {
    const events = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => ({
      id: `e${d}`,
      timestamp: iso(day(d, 8)),
      mealType: 'breakfast' as const,
      carbs: 60,
      glucoseBefore: 110,
      insulinGiven: 12,
      glucose2h: d <= 3 ? 210 : 160,
      correctionAfter: d <= 6 ? 2 : undefined,
    }));
    const [i] = detectMealPatterns({ events, readings: [], activities: [], range, now: day(9, 12) });
    expect(i.body).toBe('Glucose ran high after 6 of your last 8 breakfasts (all needed a correction).');
    expect(containsDoseInstruction(i.body)).toBe(false);
  });
});

describe('analyzeCorrections', () => {
  // Four clean afternoon corrections: 2 U taken at 200, lowest after is 110 → 45 mg/dL per unit.
  const days = [1, 2, 3, 4];
  const doses = days.map((d) => dose(day(d, 15), 2, 'correction'));
  const readings = days.flatMap((d) => series(day(d, 14, 30), 300, (t) => (t <= 30 ? 200 : Math.max(110, 200 - (t - 30) * 0.6))));

  it('measures drop per unit on clean corrections', () => {
    const a = analyzeCorrections(doses, [], readings);
    expect(a.samples).toHaveLength(4);
    expect(a.observedFactor).toBe(45);
    expect(a.totalUnits).toBe(8);
  });

  it('skips corrections with a meal or other insulin nearby', () => {
    const meals = [meal(day(1, 16))];
    const a = analyzeCorrections([...doses, dose(day(2, 16), 1, 'correction')], meals, readings);
    expect(a.samples.map((s) => s.timestamp)).toEqual([iso(day(3, 15)), iso(day(4, 15))]);
    expect(a.observedFactor).toBeNull();
  });

  it('suggests a review when corrections work differently from the setting — never a dose', () => {
    const i = correctionInsight(analyzeCorrections(doses, [], readings), 35, day(5, 9));
    expect(i?.tone).toBe('attention');
    expect(i?.body).toBe(
      'Across 4 corrections without food or other insulin nearby, each unit lowered glucose by about 45 mg/dL (your setting: 35).',
    );
    expect(i?.suggestion).toMatch(/correction factor may be worth reviewing/);
    expect(containsDoseInstruction(`${i?.body} ${i?.suggestion}`)).toBe(false);
  });

  it('confirms the setting when it matches', () => {
    expect(correctionInsight(analyzeCorrections(doses, [], readings), 44, day(5, 9))?.tone).toBe('positive');
  });
});
