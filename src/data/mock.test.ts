import { computeStats, DEFAULT_RANGE } from '@/domain/glucose/stats';
import { buildBolusEvents } from '@/domain/insights/bolusEvents';
import { containsDoseInstruction, detectPatterns } from '@/domain/insights/patterns';
import { activeInsulin } from '@/domain/insulin/iob';

import { generateSeedData } from './mock';

const now = new Date('2026-09-30T09:40:00');

describe('seed data', () => {
  const seed = generateSeedData(now);

  it('is deterministic for the same clock', () => {
    const again = generateSeedData(now);
    expect(again.glucose.length).toBe(seed.glucose.length);
    expect(again.glucose.slice(-20)).toEqual(seed.glucose.slice(-20));
    expect(again.meals.map((m) => m.id)).toEqual(seed.meals.map((m) => m.id));
  });

  it('never produces data in the future', () => {
    const t = now.getTime();
    for (const list of [seed.glucose, seed.meals, seed.insulin, seed.activities, seed.weights]) {
      expect(list.every((x) => new Date(x.timestamp).getTime() <= t)).toBe(true);
    }
  });

  it('looks like a plausible, mostly-in-range person', () => {
    const stats = computeStats(seed.glucose, DEFAULT_RANGE);
    if (process.env.SEED_DEBUG) console.log(stats);
    expect(stats.timeInRange).toBeGreaterThanOrEqual(65);
    expect(stats.timeInRange).toBeLessThanOrEqual(92);
    expect(stats.average).toBeGreaterThan(110);
    expect(stats.average).toBeLessThan(160);
    const iob = activeInsulin(seed.insulin, now, { durationHours: 4.5, peakMinutes: 75 });
    expect(iob).toBeGreaterThanOrEqual(0);
  });

  it('contains patterns the insight engine can find, phrased safely', () => {
    const events = buildBolusEvents(seed.meals, seed.insulin, seed.glucose, seed.activities);
    const insights = detectPatterns({
      events,
      readings: seed.glucose,
      activities: seed.activities,
      range: DEFAULT_RANGE,
      now,
    });
    if (process.env.SEED_DEBUG) console.log(insights.map((i) => `${i.title}: ${i.body}`));
    const types = insights.map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(['meal-pattern', 'exercise']));
    for (const i of insights) expect(containsDoseInstruction(`${i.body} ${i.suggestion ?? ''}`)).toBe(false);
  });
});
