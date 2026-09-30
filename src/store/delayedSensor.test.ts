import { matchManualReadings } from '@/domain/glucose/matching';

import { SENSOR_DELAY_MIN, useAppStore, type OnboardingResult } from './useAppStore';

const setup = (glucoseSource: OnboardingResult['glucoseSource']): OnboardingResult => ({
  name: 'Tien',
  glucoseUnit: 'mg/dL',
  glucoseSource,
  insulin: {
    targetGlucose: 110,
    correctionFactor: 40,
    insulinDurationHours: 4,
    maxBolus: 15,
    minGlucoseForBolus: 70,
    doseIncrement: 0.5,
    gramsPerUnit: { breakfast: 6, lunch: 8, dinner: 7, snack: 10 },
  },
  goals: { calories: 2200, protein: 130, carbs: 220, fat: 70, fiber: 30 },
  keepSampleData: true,
});

describe('simulated Dexcom delay', () => {
  beforeEach(() => useAppStore.getState().resetDemoData());

  it('holds back the last 3 h of sensor data for Dexcom users', () => {
    useAppStore.getState().completeOnboarding(setup('dexcom'));
    const { glucose, delayedGlucose } = useAppStore.getState();
    const cutoff = Date.now() - SENSOR_DELAY_MIN * 60000;
    expect(delayedGlucose.length).toBeGreaterThan(20);
    expect(glucose.every((r) => new Date(r.timestamp).getTime() <= cutoff + 1000)).toBe(true);
  });

  it('keeps data live for other sources', () => {
    useAppStore.getState().completeOnboarding(setup('libre'));
    expect(useAppStore.getState().delayedGlucose).toHaveLength(0);
  });

  it('matches a typed value once the delayed readings arrive', () => {
    useAppStore.getState().completeOnboarding(setup('dexcom'));
    const s = useAppStore.getState();
    const latestDelayed = s.delayedGlucose[s.delayedGlucose.length - 1];
    const typed = s.addGlucose({ value: latestDelayed.value + 4, timestamp: new Date().toISOString(), source: 'manual' });

    expect(matchManualReadings(useAppStore.getState().glucose).get(typed.id)).toEqual({ status: 'waiting' });

    useAppStore.getState().releaseDelayedSensor(new Date(), true);
    const after = useAppStore.getState();
    expect(after.delayedGlucose).toHaveLength(0);
    const m = matchManualReadings(after.glucose).get(typed.id);
    // Closest value within ±10 min wins, so it may be a neighbour of the latest reading.
    expect(m).toMatchObject({ status: 'matched', agrees: true });
    if (m?.status !== 'matched') throw new Error('not matched');
    expect(Math.abs(m.difference)).toBeLessThanOrEqual(4);
    expect(Math.abs(m.minutesApart)).toBeLessThanOrEqual(10);
  });
});
