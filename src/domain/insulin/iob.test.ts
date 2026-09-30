import type { InsulinDose } from '@/types/models';

import { activeInsulin, iobFraction } from './iob';

const model = { durationHours: 5, peakMinutes: 75 };
const now = new Date('2026-09-30T12:00:00Z');
const dose = (units: number, minutesAgo: number, insulinType: InsulinDose['insulinType'] = 'rapid'): InsulinDose => ({
  id: `${units}-${minutesAgo}`,
  userId: 'u',
  units,
  insulinType,
  source: 'manual',
  timestamp: new Date(now.getTime() - minutesAgo * 60000).toISOString(),
});

describe('iobFraction', () => {
  it('starts at 1 and ends at 0', () => {
    expect(iobFraction(0, model)).toBe(1);
    expect(iobFraction(300, model)).toBe(0);
    expect(iobFraction(299.9, model)).toBeLessThan(0.001);
  });

  it('decreases monotonically', () => {
    let prev = 1;
    for (let t = 5; t <= 300; t += 5) {
      const f = iobFraction(t, model);
      expect(f).toBeLessThanOrEqual(prev + 1e-12);
      prev = f;
    }
  });

  it('keeps most insulin active early and roughly half by ~2h', () => {
    expect(iobFraction(30, model)).toBeGreaterThan(0.9);
    const twoHours = iobFraction(120, model);
    expect(twoHours).toBeGreaterThan(0.4);
    expect(twoHours).toBeLessThan(0.65);
  });
});

describe('activeInsulin', () => {
  it('sums rapid doses and ignores long-acting, future and expired doses', () => {
    const doses = [dose(4, 0), dose(10, 400), dose(20, 60, 'long'), dose(3, -30)];
    expect(activeInsulin(doses, now, model)).toBe(4);
  });

  it('is 0 with no doses', () => {
    expect(activeInsulin([], now, model)).toBe(0);
  });
});
