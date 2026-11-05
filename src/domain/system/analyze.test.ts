import type { GlucoseReading, InsulinDose, Meal } from '@/types/models';

import { analyzeSystem, checkBasal, estimateRatio, keFactor, slotFor, type MealSample } from './analyze';
import { createReadingIndex } from '@/domain/glucose/stats';

const MIN = 60000;
const DAY = 86400000;
const NOW = new Date(2026, 10, 5, 20, 0);

let n = 0;
const id = (p: string) => `${p}${++n}`;

function meal(at: Date, carbs: number, extra: Partial<Meal> = {}): Meal {
  return {
    id: id('m'),
    userId: 'u',
    mealType: 'lunch',
    items: [],
    calories: 0,
    carbs,
    protein: 0,
    fat: 0,
    timestamp: at.toISOString(),
    ...extra,
  };
}

function dose(at: Date, units: number, purpose: InsulinDose['purpose'] = 'meal'): InsulinDose {
  return { id: id('d'), userId: 'u', units, insulinType: 'rapid', purpose, timestamp: at.toISOString(), source: 'manual' };
}

/** CGM every 5 min from `from` for `minutes`, value from `f(minutesSinceStart)`. */
function cgm(from: Date, minutes: number, f: (m: number) => number): GlucoseReading[] {
  const out: GlucoseReading[] = [];
  for (let m = 0; m <= minutes; m += 5) {
    out.push({ id: id('g'), userId: 'u', value: Math.round(f(m)), timestamp: new Date(from.getTime() + m * MIN).toISOString(), source: 'cgm' });
  }
  return out;
}

/** A lunch at 12:00 `daysAgo`, glucose starts at `start` and is `end` 3 h later. */
function lunch(daysAgo: number, carbs: number, units: number, start: number, end: number) {
  const at = new Date(2026, 10, 5 - daysAgo, 12, 0);
  const m = meal(at, carbs);
  const d = dose(new Date(at.getTime() - 5 * MIN), units);
  const readings = cgm(new Date(at.getTime() - 10 * MIN), 250, (x) => {
    if (x <= 10) return start;
    const p = Math.min(1, (x - 10) / 180);
    return start + (end - start) * p + Math.sin(p * Math.PI) * 40;
  });
  return { m, d, readings };
}

function run(parts: { m: Meal; d: InsulinDose; readings: GlucoseReading[] }[], extra: { doses?: InsulinDose[]; meals?: Meal[] } = {}) {
  return analyzeSystem({
    meals: [...parts.map((p) => p.m), ...(extra.meals ?? [])],
    doses: [...parts.map((p) => p.d), ...(extra.doses ?? [])],
    readings: parts.flatMap((p) => p.readings),
    now: NOW,
  });
}

describe('slotFor', () => {
  it('maps hours to time of day', () => {
    expect(slotFor(new Date(2026, 0, 1, 7))).toBe('morning');
    expect(slotFor(new Date(2026, 0, 1, 12))).toBe('midday');
    expect(slotFor(new Date(2026, 0, 1, 19))).toBe('evening');
    expect(slotFor(new Date(2026, 0, 1, 23))).toBe('late');
    expect(slotFor(new Date(2026, 0, 1, 3))).toBe('late');
  });
});

describe('judging a meal', () => {
  it('back near the start after 3 h is good', () => {
    const a = run([lunch(1, 60, 6, 120, 135)]);
    expect(a.samples[0]).toMatchObject({ outcome: 'good', gramsPerUnit: 10, glucoseBefore: 120 });
  });

  it('more than 40 above the start is too little insulin', () => {
    expect(run([lunch(1, 60, 4, 120, 210)]).samples[0].outcome).toBe('too-little');
  });

  it('more than 40 below the start is too much insulin', () => {
    expect(run([lunch(1, 60, 8, 160, 100)]).samples[0].outcome).toBe('too-much');
  });

  it('a low within 4 h is too much, whatever the 3 h value', () => {
    const p = lunch(1, 60, 8, 120, 120);
    p.readings = p.readings.map((r, i) => (i === 30 ? { ...r, value: 62 } : r));
    expect(run([p]).samples[0].outcome).toBe('too-much');
  });

  it('a correction after the meal means the meal dose was too small', () => {
    const p = lunch(1, 60, 6, 120, 130);
    const corr = dose(new Date(new Date(p.m.timestamp).getTime() + 90 * MIN), 2, 'correction');
    const a = run([p], { doses: [corr] });
    expect(a.samples[0]).toMatchObject({ outcome: 'too-little', correctionAfter: 2 });
  });

  it('a start above 180 is not used for the ratio', () => {
    expect(run([lunch(1, 60, 8, 230, 140)]).samples[0].outcome).toBe('off-start');
  });

  it('another meal within 3 h mixes the meals', () => {
    const p = lunch(1, 60, 6, 120, 130);
    const snack = meal(new Date(new Date(p.m.timestamp).getTime() + 60 * MIN), 20);
    expect(run([p], { meals: [snack] }).samples.find((s) => s.mealId === p.m.id)?.outcome).toBe('mixed');
  });

  it('waits for delayed sensor data, then gives up', () => {
    const at = new Date(NOW.getTime() - 4 * 3600000);
    const m = meal(at, 60);
    const d = dose(at, 6);
    const typed: GlucoseReading = { id: 'typed', userId: 'u', value: 120, timestamp: at.toISOString(), source: 'manual' };
    const recent = analyzeSystem({ meals: [m], doses: [d], readings: [typed], now: NOW });
    expect(recent.samples[0].outcome).toBe('pending');
    const later = analyzeSystem({ meals: [m], doses: [d], readings: [typed], now: new Date(at.getTime() + 9 * 3600000) });
    expect(later.samples[0].outcome).toBe('no-data');
  });

  it('a value typed about 3 h later is enough without CGM', () => {
    const at = new Date(2026, 10, 4, 12, 0);
    const m = meal(at, 50);
    const d = dose(at, 5);
    const readings: GlucoseReading[] = [
      { id: 'a', userId: 'u', value: 110, timestamp: at.toISOString(), source: 'manual' },
      { id: 'b', userId: 'u', value: 125, timestamp: new Date(at.getTime() + 170 * MIN).toISOString(), source: 'manual' },
    ];
    const a = analyzeSystem({ meals: [m], doses: [d], readings, now: NOW });
    expect(a.samples[0]).toMatchObject({ outcome: 'good', glucoseAfter: 125, afterMinutes: 170 });
  });

  it('ignores meals without a meal dose and tiny snacks', () => {
    const at = new Date(2026, 10, 4, 12, 0);
    const a = analyzeSystem({ meals: [meal(at, 60), meal(new Date(at.getTime() + DAY / 4), 5)], doses: [], readings: [], now: NOW });
    expect(a.samples).toHaveLength(0);
  });
});

describe('ratio per time of day', () => {
  it('uses the median ratio of the meals that worked', () => {
    const a = run([
      lunch(1, 60, 6, 120, 130), // 10 g/U good
      lunch(2, 45, 5, 110, 120), // 9 g/U good
      lunch(3, 80, 7, 115, 140), // 11.4 g/U good
      lunch(4, 60, 4, 120, 220), // 15 g/U too little
      lunch(5, 30, 5, 140, 80), // 6 g/U too much
    ]);
    const midday = a.slots.find((s) => s.slot === 'midday')!;
    expect(midday).toMatchObject({ good: 3, tooLittle: 1, tooMuch: 1, judged: 5 });
    expect(midday.estimate).toEqual({ gramsPerUnit: 10, from: 9, to: 11.5, confidence: 'medium' });
    expect(midday.used).toEqual({ min: 6, max: 15, median: 10 });
  });

  it('without enough good meals, shows a direction', () => {
    const s = (outcome: MealSample['outcome']): MealSample => ({
      mealId: id('m'),
      timestamp: '',
      slot: 'morning',
      carbs: 60,
      units: 5,
      gramsPerUnit: 12,
      outcome,
    });
    expect(estimateRatio([s('too-little'), s('too-little'), s('too-little'), s('good')])).toEqual({ estimate: null, lean: 'more-insulin' });
    expect(estimateRatio([s('too-much'), s('too-much'), s('too-much')])).toEqual({ estimate: null, lean: 'less-insulin' });
    expect(estimateRatio([s('too-much'), s('too-little')])).toEqual({ estimate: null });
  });

  it('six good meals is a confident estimate', () => {
    const parts = [1, 2, 3, 4, 5, 6].map((d) => lunch(d, 60, 6, 120, 125));
    expect(run(parts).slots.find((s) => s.slot === 'midday')!.estimate?.confidence).toBe('high');
  });

  it('only looks at the last 4 weeks', () => {
    expect(run([lunch(40, 60, 6, 120, 130)]).samples).toHaveLength(0);
  });
});

describe('basal check', () => {
  const night = (daysAgo: number, f: (m: number) => number) =>
    cgm(new Date(2026, 10, 5 - daysAgo, 0, 30), 360, f);

  it('stable nights', () => {
    const readings = [1, 2, 3, 4].flatMap((d) => night(d, () => 120));
    const c = checkBasal(createReadingIndex(readings), [], [], NOW);
    expect(c).toMatchObject({ verdict: 'stable', medianChange: 0 });
    expect(c.nights).toHaveLength(4);
  });

  it('rising nights', () => {
    const readings = [1, 2, 3].flatMap((d) => night(d, (m) => 110 + m / 4));
    expect(checkBasal(createReadingIndex(readings), [], [], NOW).verdict).toBe('rising');
  });

  it('two lows', () => {
    const readings = [1, 2, 3].flatMap((d) => night(d, (m) => (d < 3 && m > 200 ? 60 : 110)));
    expect(checkBasal(createReadingIndex(readings), [], [], NOW).verdict).toBe('lows');
  });

  it('skips nights with a late meal or NovoRapid', () => {
    const readings = [1, 2, 3].flatMap((d) => night(d, () => 120));
    const late = meal(new Date(2026, 10, 3, 23, 0), 40);
    const c = checkBasal(createReadingIndex(readings), [late], [], NOW);
    expect(c.nights).toHaveLength(2);
    expect(c.verdict).toBeNull();
  });
});

it('KE-Faktor is units per 10 g', () => {
  expect(keFactor(10)).toBe(1);
  expect(keFactor(8)).toBe(1.3);
});
