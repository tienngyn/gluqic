import type { BolusEvent, CarbRatioWindow } from '@/types/models';

import type { CorrectionAnalysis } from './corrections';
import { suggestCorrectionFactor, suggestRatio } from './suggestions';

const range = { low: 70, high: 180 };
const now = new Date(2026, 8, 30, 12);
const lunch: CarbRatioWindow = { id: 'cr_lunch', label: 'Lunch', mealType: 'lunch', startMinute: 660, endMinute: 960, gramsPerUnit: 8 };

const meal = (d: number, g2h: number, extra: Partial<BolusEvent> = {}): BolusEvent => ({
  id: `l${d}`,
  timestamp: new Date(2026, 8, d, 12, 30).toISOString(),
  mealType: 'lunch',
  carbs: 60,
  glucoseBefore: 120,
  insulinGiven: 8,
  glucose1h: 170,
  glucose2h: g2h,
  glucose3h: 160,
  ...extra,
});

describe('suggestRatio', () => {
  it('suggests a small step toward more insulin when lunches often run high', () => {
    const events = [20, 21, 22, 23, 24, 25, 26, 27].map((d, i) => meal(d, i < 5 ? 205 : 150, i < 2 ? { correctionAfter: 2 } : {}));
    const s = suggestRatio(lunch, events, range, { now });
    expect(s).toMatchObject({ key: 'ratio:lunch', direction: 'more', current: 8, proposed: 7.6 });
    expect(s?.insulinChange).toBeCloseTo(0.053, 3);
    expect(s?.reasons[0]).toBe('Glucose ran high after 5 of 8 lunches (2 needed a correction).');
  });

  it('uses the full 10 % step when most lunches run high', () => {
    const events = [20, 21, 22, 23, 24, 25, 26, 27].map((d) => meal(d, 210));
    expect(suggestRatio(lunch, events, range, { now })?.proposed).toBe(7.3);
  });

  it('never suggests more insulin with too little data or any low', () => {
    const few = [20, 21, 22, 23, 24].map((d) => meal(d, 220));
    expect(suggestRatio(lunch, few, range, { now })).toBeNull();
    const oneLow = [20, 21, 22, 23, 24, 25, 26, 27].map((d, i) => meal(d, 220, i === 0 ? { glucose4h: 62 } : {}));
    expect(suggestRatio(lunch, oneLow, range, { now })).toBeNull();
  });

  it('suggests less insulin after 2 lows, even with few meals', () => {
    const events = [meal(25, 150, { glucose3h: 64 }), meal(26, 66), meal(27, 140)];
    const s = suggestRatio(lunch, events, range, { now });
    expect(s).toMatchObject({ direction: 'less', proposed: 8.8 });
    expect(s?.reasons[0]).toBe('Glucose went below range within 4 hours after 2 of 3 lunches.');
  });

  it('only learns from meals since the ratio last changed', () => {
    const events = [10, 11, 12, 13, 14, 15, 16, 17].map((d) => meal(d, 210));
    const changed = { ...lunch, changedAt: new Date(2026, 8, 20).toISOString() };
    expect(suggestRatio(changed, events, range, { now })).toBeNull();
  });

  it('waits 7 days after a change or "Not now"', () => {
    const events = [20, 21, 22, 23, 24, 25, 26, 27].map((d) => meal(d, 210));
    const justChanged = { ...lunch, changedAt: new Date(2026, 8, 19).toISOString() };
    expect(suggestRatio(justChanged, events.map((e) => ({ ...e })), range, { now: new Date(2026, 8, 25) })).toBeNull();
    const dismissed = { 'ratio:lunch': new Date(2026, 8, 28).toISOString() };
    expect(suggestRatio(lunch, events, range, { now, dismissed })).toBeNull();
    expect(suggestRatio(lunch, events, range, { now: new Date(2026, 9, 6), dismissed })).not.toBeNull();
  });
});

describe('suggestCorrectionFactor', () => {
  const analysis = (over: Partial<CorrectionAnalysis>): CorrectionAnalysis => ({
    total: 6,
    totalUnits: 12,
    samples: Array.from({ length: 5 }, (_, i) => ({
      doseId: `${i}`,
      timestamp: '',
      units: 2,
      otherInsulinUnits: 0,
      kind: 'clean' as const,
      glucoseAtDose: 200,
      lowestAfter: 100,
      dropPerUnit: 50,
    })),
    observedFactor: 50,
    lowsAfter: 0,
    ...over,
  });

  it('moves one 10 % step toward the observed effect', () => {
    expect(suggestCorrectionFactor(analysis({}), 35, undefined, { now })).toMatchObject({ direction: 'less', proposed: 39 });
    expect(suggestCorrectionFactor(analysis({ observedFactor: 25 }), 35, undefined, { now })).toMatchObject({
      direction: 'more',
      proposed: 32,
    });
  });

  it('never steps past what was observed', () => {
    expect(suggestCorrectionFactor(analysis({ observedFactor: 43 }), 35, undefined, { now })?.proposed).toBe(39);
    expect(suggestCorrectionFactor(analysis({ observedFactor: 44 }), 42, undefined, { now })).toBeNull();
  });

  it('suggests less insulin after 2 lows, and nothing toward more with any low', () => {
    expect(suggestCorrectionFactor(analysis({ lowsAfter: 2, observedFactor: 25 }), 35, undefined, { now })).toMatchObject({
      direction: 'less',
      proposed: 39,
    });
    expect(suggestCorrectionFactor(analysis({ lowsAfter: 1, observedFactor: 25 }), 35, undefined, { now })).toBeNull();
  });
});
