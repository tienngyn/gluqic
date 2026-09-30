import type { GlucoseReading } from '@/types/models';

import { classify, computeStats, computeTrend, countEpisodes, hourlyProfile, readingNear } from './stats';

const t0 = new Date('2026-09-30T08:00:00');
const r = (value: number, minutes: number): GlucoseReading => ({
  id: `${minutes}`,
  userId: 'u',
  value,
  source: 'manual',
  timestamp: new Date(t0.getTime() + minutes * 60000).toISOString(),
});

describe('computeStats', () => {
  it('computes range percentages, average and GMI', () => {
    const s = computeStats([r(100, 0), r(150, 5), r(200, 10), r(60, 15)]);
    expect(s.count).toBe(4);
    expect(s.average).toBe(128);
    expect(s.timeInRange).toBe(50);
    expect(s.timeAbove).toBe(25);
    expect(s.timeBelow).toBe(25);
    expect(s.gmi).toBeCloseTo(3.31 + 0.02392 * 127.5, 1);
  });

  it('counts episodes, not readings', () => {
    const s = computeStats([r(200, 0), r(210, 5), r(220, 10), r(120, 15), r(190, 20), r(60, 25), r(55, 30)]);
    expect(s.highEvents).toBe(2);
    expect(s.lowEvents).toBe(1);
  });

  it('handles empty input', () => {
    expect(computeStats([]).count).toBe(0);
  });
});

describe('countEpisodes', () => {
  it('groups consecutive matches', () => {
    expect(countEpisodes([1, 1, 0, 1, 0, 0, 1, 1], (v) => v === 1)).toBe(3);
  });
});

describe('computeTrend', () => {
  const now = new Date(t0.getTime() + 20 * 60000);
  it('detects rising, stable and falling', () => {
    expect(computeTrend([r(100, 0), r(130, 20)], now)?.trend).toBe('rising');
    expect(computeTrend([r(100, 0), r(145, 20)], now)?.trend).toBe('rising-fast');
    expect(computeTrend([r(120, 0), r(124, 20)], now)?.trend).toBe('stable');
    expect(computeTrend([r(150, 0), r(125, 20)], now)?.trend).toBe('falling');
  });
  it('needs at least two readings', () => {
    expect(computeTrend([r(100, 20)], now)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('finds the nearest reading within tolerance', () => {
    const rs = [r(100, 0), r(140, 60)];
    expect(readingNear(rs, new Date(t0.getTime() + 55 * 60000))?.value).toBe(140);
    expect(readingNear(rs, new Date(t0.getTime() + 30 * 60000), 10)).toBeUndefined();
  });

  it('builds an hourly profile', () => {
    const p = hourlyProfile([r(100, 0), r(120, 10)]);
    expect(p[8]).toBe(110);
    expect(p[9]).toBeNull();
  });

  it('classifies values', () => {
    expect(classify(65)).toBe('low');
    expect(classify(110)).toBe('in-range');
    expect(classify(181)).toBe('high');
  });
});
