import { DEFAULT_RANGE } from '@/domain/glucose/stats';
import type { ActivityEntry, BolusEvent, GlucoseReading, Meal } from '@/types/models';

import { buildBolusEvents } from './bolusEvents';
import { containsDoseInstruction, detectHighFatPatterns, detectMealPatterns, detectPatterns } from './patterns';
import { findSimilarMeals, mealSimilarity, summarizeOutcomes } from './similarMeals';

const now = new Date('2026-09-30T12:00:00');

function breakfast(day: number, g2h: number, overrides: Partial<BolusEvent> = {}): BolusEvent {
  const ts = new Date(2026, 8, day, 8, 0);
  return {
    id: `b${day}`,
    timestamp: ts.toISOString(),
    mealType: 'breakfast',
    carbs: 60,
    protein: 20,
    fat: 15,
    glucoseBefore: 115,
    insulinGiven: 12,
    glucose1h: 170,
    glucose2h: g2h,
    glucose3h: 140,
    ...overrides,
  };
}

describe('similar meals', () => {
  it('scores identical meals as 1 and different meal types as 0', () => {
    const sig = { mealType: 'breakfast' as const, carbs: 60, fat: 15, protein: 20, minuteOfDay: 480, glucoseBefore: 115 };
    expect(mealSimilarity(sig, sig)).toBe(1);
    expect(mealSimilarity(sig, { ...sig, mealType: 'dinner' })).toBe(0);
  });

  it('ranks closer meals higher', () => {
    const events = [breakfast(1, 190, { carbs: 62 }), breakfast(2, 190, { carbs: 110 }), breakfast(3, 190, { carbs: 58 })];
    const matches = findSimilarMeals(
      { mealType: 'breakfast', carbs: 60, fat: 15, protein: 20, minuteOfDay: 480 },
      events,
      { threshold: 0.8 },
    );
    expect(matches.map((m) => m.event.id)).toEqual(expect.arrayContaining(['b1', 'b3']));
    expect(matches.map((m) => m.event.id)).not.toContain('b2');
  });

  it('summarizes outcomes against the range', () => {
    const s = summarizeOutcomes([breakfast(1, 200), breakfast(2, 150), breakfast(3, 60)], DEFAULT_RANGE);
    expect(s).toMatchObject({ count: 3, aboveAt2h: 1, inRangeAt2h: 1, belowAt2h: 1, avgBefore: 115 });
  });
});

describe('pattern detection', () => {
  const base = { readings: [] as GlucoseReading[], activities: [] as ActivityEntry[], range: DEFAULT_RANGE, now };

  it('reports repeated post-breakfast highs as a suggestion to review, not a dose', () => {
    const events = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => breakfast(d, d <= 7 ? 200 : 150));
    const [insight] = detectMealPatterns({ ...base, events });
    expect(insight.body).toBe('Glucose was above target 2 hours after 7 of your last 10 breakfasts.');
    expect(insight.suggestion).toMatch(/may be worth reviewing/);
    expect(containsDoseInstruction(`${insight.body} ${insight.suggestion}`)).toBe(false);
  });

  it('needs enough samples before reporting', () => {
    const events = [1, 2, 3].map((d) => breakfast(d, 220));
    expect(detectMealPatterns({ ...base, events })).toHaveLength(0);
  });

  it('reports steady meals positively', () => {
    const events = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => breakfast(d, 140));
    expect(detectMealPatterns({ ...base, events })[0].tone).toBe('positive');
  });

  it('detects delayed rises after high-fat meals', () => {
    const hf = [1, 2, 3, 4, 5].map((d) => breakfast(d, 190, { id: `hf${d}`, fat: 40, glucose1h: 140, glucose3h: 200 }));
    const lf = [6, 7, 8, 9, 10].map((d) => breakfast(d, 150, { id: `lf${d}`, fat: 10, glucose1h: 170, glucose3h: 130 }));
    const [insight] = detectHighFatPatterns({ ...base, events: [...hf, ...lf] });
    expect(insight.type).toBe('high-fat');
  });

  it('never emits dose instructions', () => {
    const events = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => breakfast(d, 210));
    for (const i of detectPatterns({ ...base, events })) {
      expect(containsDoseInstruction(`${i.title} ${i.body} ${i.suggestion ?? ''}`)).toBe(false);
    }
  });
});

describe('containsDoseInstruction', () => {
  it.each(['Use 2 more units next time.', 'Take 1.5 U extra', 'Increase your bolus at breakfast', 'Give more insulin'])(
    'flags "%s"',
    (text) => expect(containsDoseInstruction(text)).toBe(true),
  );
  it.each([
    'Glucose was above target after 7 of 10 similar breakfasts.',
    'Your breakfast carb ratio may be worth reviewing.',
    'Glucose tends to rise between 08:00 and 10:00, by about 40 mg/dL on average.',
  ])('allows "%s"', (text) => expect(containsDoseInstruction(text)).toBe(false));
});

describe('buildBolusEvents', () => {
  it('joins meal, dose and surrounding glucose', () => {
    const mealAt = new Date('2026-09-30T08:00:00');
    const meal: Meal = {
      id: 'm1',
      userId: 'u',
      mealType: 'breakfast',
      items: [],
      calories: 540,
      carbs: 62,
      protein: 22,
      fat: 21,
      timestamp: mealAt.toISOString(),
    };
    const reading = (min: number, value: number): GlucoseReading => ({
      id: `r${min}`,
      userId: 'u',
      value,
      source: 'cgm',
      timestamp: new Date(mealAt.getTime() + min * 60000).toISOString(),
    });
    const [e] = buildBolusEvents(
      [meal],
      [{ id: 'd', userId: 'u', units: 12, insulinType: 'rapid', source: 'manual', timestamp: new Date(mealAt.getTime() - 10 * 60000).toISOString() }],
      [reading(-5, 118), reading(60, 170), reading(120, 190), reading(180, 150)],
    );
    expect(e).toMatchObject({ glucoseBefore: 118, insulinGiven: 12, glucose1h: 170, glucose2h: 190, glucose3h: 150 });
    expect(e.glucose4h).toBeUndefined();
  });
});
