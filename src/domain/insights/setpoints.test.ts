import { DEFAULT_RANGE } from '@/domain/glucose/stats';
import type { BolusEvent, RatioSetpoint } from '@/types/models';

import { containsDoseInstruction, detectMealPatterns, detectPatterns } from './patterns';
import { compareSetpoint, setpointInsight } from './setpoints';

const setpoint: RatioSetpoint = {
  id: 'sp1',
  mealType: 'breakfast',
  windowId: 'cr_breakfast',
  gramsPerUnit: 4.6,
  previousGramsPerUnit: 5,
  createdAt: new Date(2026, 8, 15, 7, 0).toISOString(),
  origin: { unitsTaken: 16, suggestedBolus: 14.5, carbs: 72, correctionBolus: 0.4, activeInsulin: 0 },
};

const breakfast = (day: number, g2h: number): BolusEvent => ({
  id: `b${day}`,
  timestamp: new Date(2026, 8, day, 8, 0).toISOString(),
  mealType: 'breakfast',
  carbs: 60,
  glucoseBefore: 115,
  insulinGiven: 12,
  glucose2h: g2h,
});

// 12 high breakfasts before the setpoint, then mostly in range.
const before = Array.from({ length: 12 }, (_, i) => breakfast(i + 1, 220));
const after = [16, 17, 18, 19, 20, 21, 22, 23].map((d, i) => breakfast(d, i < 6 ? 150 : 200));
const events = [...before, ...after];
const now = new Date(2026, 8, 24);

describe('setpoint outcomes', () => {
  it('splits meals into before and since the setpoint', () => {
    const c = compareSetpoint(setpoint, events, DEFAULT_RANGE);
    expect(c.before).toMatchObject({ withOutcome: 12, inRangeAt2h: 0, avg2h: 220 });
    expect(c.since).toMatchObject({ withOutcome: 8, inRangeAt2h: 6, aboveAt2h: 2 });
  });

  it('reports improvement since the setpoint', () => {
    const i = setpointInsight(compareSetpoint(setpoint, events, DEFAULT_RANGE), 'mg/dL', now);
    expect(i.tone).toBe('positive');
    expect(i.body).toBe(
      'Since your setpoint on 15 Sep, glucose was in range 2 hours after 6 of 8 breakfasts (before: 0 of 12). Average 2 h glucose: 163 vs 220 mg/dL.',
    );
    expect(containsDoseInstruction(i.body)).toBe(false);
  });

  it('says it is still collecting with too few meals', () => {
    const i = setpointInsight(compareSetpoint(setpoint, [...before, ...after.slice(0, 2)], DEFAULT_RANGE), 'mg/dL', now);
    expect(i.body).toMatch(/2 of 3 breakfasts tracked so far/);
    expect(i.tone).toBe('neutral');
  });

  it('flags lows after the setpoint for review', () => {
    const lows = [16, 17, 18].map((d) => breakfast(d, 62));
    const i = setpointInsight(compareSetpoint(setpoint, [...before, ...lows], DEFAULT_RANGE), 'mg/dL', now);
    expect(i.tone).toBe('attention');
    expect(i.suggestion).toMatch(/may be worth reviewing/);
  });

  it('reports a meal with an active setpoint only through the setpoint card', () => {
    const range = { ...DEFAULT_RANGE };
    const base = { readings: [], activities: [], range, now };
    // Mixing old and new meals blurs the signal: no pattern at all.
    expect(detectMealPatterns({ ...base, events })).toHaveLength(0);
    // With a setpoint, the setpoint card reports this meal instead, counting only meals since.
    expect(detectMealPatterns({ ...base, events, setpoints: [setpoint] })).toHaveLength(0);
    const all = detectPatterns({ ...base, events, setpoints: [setpoint] });
    expect(all[0]).toMatchObject({ type: 'setpoint', tone: 'positive' });
  });
});
