import {
  BOLUS_CALCULATION_VERSION,
  calculateBolus,
  describeCalculation,
  roundDownToIncrement,
  type BolusSafetySettings,
} from './engine';

const safety: BolusSafetySettings = {
  maxBolus: 15,
  minGlucoseForBolus: 70,
  doseIncrement: 0.5,
};

const base = {
  currentGlucose: 124,
  targetGlucose: 110,
  carbsGrams: 72,
  carbRatio: 5,
  correctionFactor: 35,
  activeInsulin: 1.8,
};

function ok(result: ReturnType<typeof calculateBolus>) {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
}

describe('calculateBolus', () => {
  it('computes meal + correction − IOB (brief example)', () => {
    const r = ok(calculateBolus(base, safety));
    expect(r.breakdown.mealBolus).toBe(14.4);
    expect(r.breakdown.correctionBolus).toBe(0.4);
    expect(r.breakdown.activeInsulinAdjustment).toBe(-1.8);
    expect(r.breakdown.rawTotal).toBe(13);
    expect(r.breakdown.suggestedBolus).toBe(13);
    expect(r.blocked).toBe(false);
    expect(r.version).toBe(BOLUS_CALCULATION_VERSION);
  });

  it('is deterministic', () => {
    expect(calculateBolus(base, safety)).toEqual(calculateBolus(base, safety));
  });

  it('exposes every step of the derivation', () => {
    const r = ok(calculateBolus(base, safety));
    expect(r.steps.map((s) => s.label)).toEqual(['Meal insulin', 'Correction', 'Active insulin']);
    expect(r.steps[0].formula).toBe('72 g ÷ 5 g/U');
    expect(r.steps[1].formula).toBe('(124 − 110) ÷ 35');
    const sum = r.steps.reduce((s, x) => s + x.value, 0);
    expect(sum).toBeCloseTo(r.breakdown.rawTotal, 5);
    expect(describeCalculation(r)).toContain(BOLUS_CALCULATION_VERSION);
  });

  it('never returns a negative bolus', () => {
    const r = ok(calculateBolus({ ...base, carbsGrams: 0, currentGlucose: 100, activeInsulin: 3 }, safety));
    expect(r.breakdown.rawTotal).toBeLessThan(0);
    expect(r.breakdown.suggestedBolus).toBe(0);
    expect(r.warnings.map((w) => w.code)).toContain('floored-at-zero');
  });

  it('applies a negative correction when below target', () => {
    const r = ok(calculateBolus({ ...base, currentGlucose: 89, activeInsulin: 0 }, safety));
    expect(r.breakdown.correctionBolus).toBe(-0.6);
    expect(r.warnings.map((w) => w.code)).toContain('below-target');
  });

  it('blocks insulin at or below the minimum glucose threshold', () => {
    for (const g of [55, 70]) {
      const r = ok(calculateBolus({ ...base, currentGlucose: g }, safety));
      expect(r.blocked).toBe(true);
      expect(r.breakdown.suggestedBolus).toBe(0);
      expect(r.warnings[0]).toMatchObject({ code: 'low-glucose-blocked', severity: 'critical' });
    }
  });

  it('respects a configurable minimum glucose threshold', () => {
    const r = ok(calculateBolus({ ...base, currentGlucose: 75 }, { ...safety, minGlucoseForBolus: 80 }));
    expect(r.blocked).toBe(true);
  });

  it('caps at the configured max bolus and says so', () => {
    const r = ok(calculateBolus({ ...base, carbsGrams: 120, activeInsulin: 0 }, safety));
    expect(r.breakdown.rawTotal).toBeGreaterThan(15);
    expect(r.breakdown.suggestedBolus).toBe(15);
    const cap = r.warnings.find((w) => w.code === 'capped-at-max');
    expect(cap?.severity).toBe('caution');
    expect(cap?.message).toContain('24.4');
  });

  it('rounds down to the dose increment', () => {
    const r = ok(calculateBolus({ ...base, carbsGrams: 50, activeInsulin: 0 }, safety));
    // 10 + 0.4 = 10.4 → 10.0 with 0.5 U steps
    expect(r.breakdown.suggestedBolus).toBe(10);
    expect(r.warnings.map((w) => w.code)).toContain('rounded-down');

    const fine = ok(calculateBolus({ ...base, carbsGrams: 50, activeInsulin: 0 }, { ...safety, doseIncrement: 0.1 }));
    expect(fine.breakdown.suggestedBolus).toBe(10.4);
  });

  it('flags high glucose without changing the formula', () => {
    const r = ok(calculateBolus({ ...base, currentGlucose: 285, activeInsulin: 0 }, safety));
    expect(r.breakdown.correctionBolus).toBe(5);
    expect(r.warnings.map((w) => w.code)).toContain('high-glucose');
  });

  it('treats trend and activity as information only', () => {
    const plain = ok(calculateBolus(base, safety));
    const withCtx = ok(calculateBolus(base, safety, { trend: 'falling-fast', plannedActivity: 'hard' }));
    expect(withCtx.breakdown).toEqual(plain.breakdown);
    expect(withCtx.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['trend-falling', 'planned-activity']),
    );
  });

  it.each([
    ['currentGlucose', { currentGlucose: -5 }],
    ['currentGlucose', { currentGlucose: Number.NaN }],
    ['targetGlucose', { targetGlucose: 40 }],
    ['carbsGrams', { carbsGrams: -1 }],
    ['carbRatio', { carbRatio: 0 }],
    ['correctionFactor', { correctionFactor: 0 }],
    ['activeInsulin', { activeInsulin: -1 }],
  ])('rejects invalid %s', (field, patch) => {
    const r = calculateBolus({ ...base, ...patch }, safety);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.field)).toContain(field);
  });

  it('rejects missing input and invalid safety settings', () => {
    expect(calculateBolus({}, safety).ok).toBe(false);
    expect(calculateBolus(base, { ...safety, maxBolus: -1 }).ok).toBe(false);
    expect(calculateBolus(base, { ...safety, doseIncrement: 0 }).ok).toBe(false);
  });
});

describe('roundDownToIncrement', () => {
  it('handles float noise without dropping a whole step', () => {
    expect(roundDownToIncrement(13.000000000000002, 0.5)).toBe(13);
    expect(roundDownToIncrement(12.999999999999998, 0.5)).toBe(13);
    expect(roundDownToIncrement(0.3, 0.1)).toBe(0.3);
  });
  it('rounds down, never up', () => {
    expect(roundDownToIncrement(4.49, 0.5)).toBe(4);
    expect(roundDownToIncrement(4.99, 1)).toBe(4);
  });
  it('clamps non-positive values to 0', () => {
    expect(roundDownToIncrement(-2, 0.5)).toBe(0);
  });
});
