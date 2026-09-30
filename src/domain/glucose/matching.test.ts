import type { GlucoseReading } from '@/types/models';

import { effectiveReadings, matchManualReadings, withinAgreement } from './matching';

const t0 = new Date('2026-09-30T08:00:00');
const at = (min: number) => new Date(t0.getTime() + min * 60000).toISOString();
const sensor = (min: number, value: number): GlucoseReading => ({ id: `s${min}`, userId: 'u', value, timestamp: at(min), source: 'healthkit' });
const typed = (min: number, value: number, id = `m${min}`): GlucoseReading => ({ id, userId: 'u', value, timestamp: at(min), source: 'manual' });

// Dexcom every 5 minutes, glucose rising 2 mg/dL per minute.
const dexcom = Array.from({ length: 13 }, (_, i) => sensor(i * 5 - 30, 150 + (i * 5 - 30) * 2));

describe('matchManualReadings', () => {
  it('links a typed value to the closest sensor value within ±10 min', () => {
    // Read 140 in the Dexcom app at 07:55, typed it in at 08:00.
    const m = matchManualReadings([...dexcom, typed(0, 140)]).get('m0');
    expect(m).toMatchObject({ status: 'matched', sensorId: 's-5', sensorValue: 140, difference: 0, minutesApart: -5, agrees: true });
  });

  it('prefers the nearer time when values tie', () => {
    const flat = [sensor(-5, 120), sensor(0, 120), sensor(5, 120)];
    expect(matchManualReadings([...flat, typed(1, 120)]).get('m1')).toMatchObject({ sensorId: 's0' });
  });

  it('flags values that do not agree with the sensor', () => {
    const m = matchManualReadings([...dexcom, typed(0, 210)]).get('m0');
    expect(m).toMatchObject({ status: 'matched', agrees: false });
  });

  it('waits while delayed sensor data has not arrived yet', () => {
    const early = dexcom.filter((r) => r.timestamp < at(-15));
    expect(matchManualReadings([...early, typed(0, 150)]).get('m0')).toEqual({ status: 'waiting' });
  });

  it('reports a sensor gap when data exists after but not around the time', () => {
    const gap = dexcom.filter((r) => Math.abs(new Date(r.timestamp).getTime() - t0.getTime()) > 12 * 60000);
    expect(matchManualReadings([...gap, typed(0, 150)]).get('m0')).toEqual({ status: 'no-sensor-data' });
  });

  it('removes matched typed values from the readings used for stats', () => {
    const readings = [...dexcom, typed(0, 150), typed(200, 180, 'late')];
    const eff = effectiveReadings(readings, matchManualReadings(readings));
    expect(eff.some((r) => r.id === 'm0')).toBe(false);
    expect(eff.some((r) => r.id === 'late')).toBe(true);
    expect(eff).toHaveLength(dexcom.length + 1);
  });
});

describe('withinAgreement (ISO 15197)', () => {
  it('uses ±15 mg/dL below 100 and ±15 % above', () => {
    expect(withinAgreement(80, 95)).toBe(true);
    expect(withinAgreement(79, 95)).toBe(false);
    expect(withinAgreement(230, 200)).toBe(true);
    expect(withinAgreement(231, 200)).toBe(false);
  });
});
