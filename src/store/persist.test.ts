import { appStorage } from '@/services/persistence';

import { persistedSlice, STORAGE_KEY, useAppStore } from './useAppStore';

async function saved() {
  await appStorage.flush();
  const raw = await appStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

describe('saved app state', () => {
  it('saves logged data and settings', async () => {
    const reading = useAppStore.getState().addGlucose({ value: 77, source: 'manual', timestamp: new Date().toISOString() });
    const data = await saved();
    expect(data.version).toBe(1);
    expect(data.state.glucose.some((r: { id: string }) => r.id === reading.id)).toBe(true);
    expect(data.state.insulinProfile.carbRatios.length).toBeGreaterThan(0);
  });

  it('never saves an unfinished calculation', () => {
    const s = useAppStore.getState();
    const slice = persistedSlice({ ...s, bolusDraft: { carbs: 40, source: 'test' }, lastSavedBolusId: 'x' });
    expect(slice).not.toHaveProperty('bolusDraft');
    expect(slice).not.toHaveProperty('pendingBolus');
    expect(slice).not.toHaveProperty('lastSavedBolusId');
    expect(slice).toHaveProperty('setpoints');
  });

  it('restores saved data on start', async () => {
    const weight = { id: 'w-saved', userId: 'u', weightKg: 71.3, timestamp: '2026-09-01T08:00:00.000Z' };
    const state = { ...persistedSlice(useAppStore.getState()), weights: [weight], onboarded: true };
    await appStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }));
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().weights).toEqual([weight]);
    expect(useAppStore.getState().onboarded).toBe(true);
    // Actions survive a restore.
    expect(typeof useAppStore.getState().addGlucose).toBe('function');
  });

  it('delete all data clears the device and returns to setup', async () => {
    useAppStore.getState().exploreSampleData();
    await useAppStore.getState().eraseAllData();
    expect(await saved()).toBeNull();
    expect(useAppStore.getState().onboarded).toBe(false);
  });
});
