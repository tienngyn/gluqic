import type { RatioSetpoint } from '@/types/models';

import { calculateBolus } from './engine';
import { activeSetpoint, proposeCorrectionSetpoint, proposeSetpoint } from './setpoint';

const base = { carbs: 72, correctionBolus: 0.4, activeInsulin: 0, currentGramsPerUnit: 5 };

describe('proposeSetpoint', () => {
  it('derives the ratio from the dose actually taken (worked example)', () => {
    const p = proposeSetpoint({ ...base, unitsTaken: 16 });
    if (!p.ok) throw new Error(p.reason);
    expect(p.mealUnits).toBe(15.6);
    expect(p.gramsPerUnit).toBe(4.6);
    expect(p.insulinChange).toBeCloseTo(5 / 4.6 - 1, 3);
    expect(p.caution).toBeUndefined();
    expect(p.steps.map((s) => s.value)).toEqual(['15.6 U', '1 U : 4.6 g']);
  });

  it('adds back active insulin and removes the correction', () => {
    const p = proposeSetpoint({ ...base, unitsTaken: 12, activeInsulin: 2, correctionBolus: -0.5 });
    if (!p.ok) throw new Error(p.reason);
    expect(p.mealUnits).toBe(14.5);
    expect(p.gramsPerUnit).toBe(5);
  });

  it('makes the next suggestion use the new ratio', () => {
    const p = proposeSetpoint({ ...base, unitsTaken: 16 });
    if (!p.ok) throw new Error(p.reason);
    const next = calculateBolus(
      { currentGlucose: 110, targetGlucose: 110, carbsGrams: 60, carbRatio: p.gramsPerUnit, correctionFactor: 35, activeInsulin: 0 },
      { maxBolus: 15, minGlucoseForBolus: 70, doseIncrement: 0.5 },
    );
    if (!next.ok) throw new Error('calc failed');
    expect(next.breakdown.mealBolus).toBe(13.04);
    expect(next.breakdown.suggestedBolus).toBe(13);
  });

  it('cautions on large changes and refuses extreme ones', () => {
    const big = proposeSetpoint({ ...base, unitsTaken: 20 });
    expect(big.ok && big.caution).toMatch(/more insulin per gram/);
    expect(proposeSetpoint({ ...base, unitsTaken: 40 }).ok).toBe(false);
    expect(proposeSetpoint({ ...base, unitsTaken: 5 }).ok).toBe(false);
  });

  it('refuses meals without carbs or doses that leave nothing for the meal', () => {
    expect(proposeSetpoint({ ...base, carbs: 0, unitsTaken: 3 }).ok).toBe(false);
    expect(proposeSetpoint({ ...base, unitsTaken: 0 }).ok).toBe(false);
    expect(proposeSetpoint({ ...base, unitsTaken: 1, correctionBolus: 2 }).ok).toBe(false);
  });
});

describe('activeSetpoint', () => {
  const sp = (id: string, createdAt: string, endedAt?: string): RatioSetpoint => ({
    id,
    mealType: 'breakfast',
    windowId: 'w',
    gramsPerUnit: 4.6,
    previousGramsPerUnit: 5,
    createdAt,
    endedAt,
    origin: { unitsTaken: 16, suggestedBolus: 14.5, carbs: 72, correctionBolus: 0.4, activeInsulin: 0 },
  });

  it('returns the latest one that has not ended', () => {
    const list = [sp('a', '2026-09-01'), sp('b', '2026-09-10', '2026-09-20'), sp('c', '2026-09-05')];
    expect(activeSetpoint(list, 'breakfast')?.id).toBe('c');
    expect(activeSetpoint(list, 'lunch')).toBeUndefined();
  });
});

describe('proposeCorrectionSetpoint', () => {
  const c = { currentGlucose: 215, targetGlucose: 110, activeInsulin: 0, currentFactor: 35 };

  it('derives the factor from the correction actually taken', () => {
    // Suggested (215 − 110) ÷ 35 = 3 U; took 2 U → 105 ÷ 2 = 52.5 → 53
    const p = proposeCorrectionSetpoint({ ...c, unitsTaken: 2 });
    if (!p.ok) throw new Error(p.reason);
    expect(p.factor).toBe(53);
    expect(p.steps.map((s) => s.value)).toEqual(['2 U', '1 U : 53 mg/dL']);
    expect(p.caution).toMatch(/less correction insulin/);
  });

  it('adds active insulin back in', () => {
    const p = proposeCorrectionSetpoint({ ...c, unitsTaken: 2, activeInsulin: 1 });
    expect(p.ok && p.factor).toBe(35);
  });

  it('makes the next correction use the new factor', () => {
    const next = calculateBolus(
      { currentGlucose: 216, targetGlucose: 110, carbsGrams: 0, carbRatio: 5, correctionFactor: 53, activeInsulin: 0 },
      { maxBolus: 20, minGlucoseForBolus: 70, doseIncrement: 0.5 },
    );
    expect(next.ok && next.breakdown.suggestedBolus).toBe(2);
  });

  it('refuses when glucose is near target, the dose is 0, or the change is extreme', () => {
    expect(proposeCorrectionSetpoint({ ...c, currentGlucose: 120, unitsTaken: 1 }).ok).toBe(false);
    expect(proposeCorrectionSetpoint({ ...c, unitsTaken: 0 }).ok).toBe(false);
    expect(proposeCorrectionSetpoint({ ...c, unitsTaken: 1 }).ok).toBe(false);
    expect(proposeCorrectionSetpoint({ ...c, unitsTaken: 8 }).ok).toBe(false);
  });
});
