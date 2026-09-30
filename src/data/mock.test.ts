import { computeStats, DEFAULT_RANGE } from '@/domain/glucose/stats';
import { buildBolusEvents } from '@/domain/insights/bolusEvents';
import { analyzeCorrections } from '@/domain/insights/corrections';
import { suggestCorrectionFactor, suggestRatio } from '@/domain/insights/suggestions';
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
    expect(stats.timeInRange).toBeGreaterThanOrEqual(70);
    expect(stats.timeBelow).toBeLessThanOrEqual(6);
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
      setpoints: seed.setpoints,
      corrections: analyzeCorrections(seed.insulin, seed.meals, seed.glucose),
      correctionFactor: seed.insulinProfile.correctionFactor,
    });
    if (process.env.SEED_DEBUG) console.log(insights.map((i) => `${i.title}: ${i.body}`));
    const types = insights.map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(['setpoint', 'correction', 'exercise']));
    const sp = insights.find((i) => i.type === 'setpoint');
    expect(sp?.tone).toBe('positive');
    for (const i of insights) expect(containsDoseInstruction(`${i.body} ${i.suggestion ?? ''}`)).toBe(false);
  });

  it('offers one-tap suggestions for lunch and the correction factor', () => {
    const events = buildBolusEvents(seed.meals, seed.insulin, seed.glucose, seed.activities, 270);
    const lunch = seed.insulinProfile.carbRatios.find((c) => c.mealType === 'lunch')!;
    const ratio = suggestRatio(lunch, events, DEFAULT_RANGE, { now });
    const corr = suggestCorrectionFactor(
      analyzeCorrections(seed.insulin, seed.meals, seed.glucose, 70, { activities: seed.activities }),
      seed.insulinProfile.correctionFactor,
      undefined,
      { now },
    );
    if (process.env.SEED_DEBUG) console.log(JSON.stringify({ ratio, corr }, null, 1));
    expect(ratio).toMatchObject({ direction: 'more' });
    expect(ratio!.insulinChange).toBeLessThanOrEqual(0.11);
    expect(corr).not.toBeNull();
    expect(Math.abs(corr!.insulinChange)).toBeLessThanOrEqual(0.11);
  });
});
