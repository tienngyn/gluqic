/**
 * Dexcom Share connection state and sync. Readings are merged into the main
 * store's glucose list as sensor ('cgm') readings.
 */
import { create } from 'zustand';

import { USER_ID } from '@/data/mock';
import {
  clearCredentials,
  connect,
  loadCredentials,
  mergeSensorReadings,
  readRecent,
  saveCredentials,
  ShareError,
  type ShareCredentials,
  type ShareRegion,
} from '@/services/dexcomShare';
import type { GlucoseReading, GlucoseTrend } from '@/types/models';

import { useAppStore } from './useAppStore';

export const SHARE_POLL_MIN = 5;

type ShareState = {
  status: 'off' | 'connecting' | 'connected' | 'error' | 'demo';
  region: ShareRegion;
  username?: string;
  lastSyncAt?: string;
  error?: string;
  errorCode?: ShareError['code'];
};

type ShareActions = {
  connect: (c: ShareCredentials) => Promise<boolean>;
  /** Fetches readings since the last one (polling calls this every 5 min). */
  sync: (now?: Date) => Promise<void>;
  /** On app start: reconnect with credentials saved in the keychain. */
  restore: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Web preview only: behave as if Share were connected, with simulated values. */
  startDemo: () => void;
};

function addReadings(incoming: GlucoseReading[]) {
  useAppStore.setState((s) => ({ glucose: mergeSensorReadings(s.glucose, incoming) }));
}

function latestSensorTime(): number | undefined {
  const g = useAppStore.getState().glucose;
  for (let i = g.length - 1; i >= 0; i--) if (g[i].source !== 'manual') return new Date(g[i].timestamp).getTime();
  return undefined;
}

/** Demo: the next value continues the curve with a small random step. */
function simulatedReading(now: Date): GlucoseReading | undefined {
  const g = useAppStore.getState().glucose.filter((r) => r.source !== 'manual');
  const last = g[g.length - 1];
  if (!last) return undefined;
  const step = Math.round((Math.random() - 0.5) * 8);
  const value = Math.min(300, Math.max(60, last.value + step));
  const trend: GlucoseTrend = step > 4 ? 'rising' : step < -4 ? 'falling' : 'stable';
  return { id: `dxs_demo_${now.getTime()}`, userId: USER_ID, value, trend, timestamp: now.toISOString(), source: 'cgm' };
}

export const useDexcomShare = create<ShareState & ShareActions>()((set, get) => ({
  status: 'off',
  region: 'ous',

  connect: async (c) => {
    set({ status: 'connecting', region: c.region, username: c.username, error: undefined, errorCode: undefined });
    try {
      const readings = await connect(c, USER_ID);
      await saveCredentials(c);
      addReadings(readings);
      // Live data makes the simulated Apple Health delay irrelevant.
      useAppStore.getState().releaseDelayedSensor(new Date(), true);
      set({ status: 'connected', lastSyncAt: new Date().toISOString() });
      return true;
    } catch (e) {
      const err = e instanceof ShareError ? e : new ShareError('Something went wrong connecting to Dexcom.', 'unknown');
      set({ status: 'error', error: err.message, errorCode: err.code });
      return false;
    }
  },

  sync: async (now = new Date()) => {
    const { status } = get();
    if (status === 'demo') {
      const last = latestSensorTime();
      if (!last || now.getTime() - last >= SHARE_POLL_MIN * 60000) {
        const r = simulatedReading(now);
        if (r) addReadings([r]);
      }
      set({ lastSyncAt: now.toISOString() });
      return;
    }
    if (status !== 'connected') return;
    const last = latestSensorTime();
    const minutes = last ? (now.getTime() - last) / 60000 + 10 : 1440;
    try {
      addReadings(await readRecent(USER_ID, minutes));
      set({ lastSyncAt: now.toISOString(), error: undefined });
    } catch (e) {
      // Keep the connection; the next poll retries. Surface the reason.
      set({ error: e instanceof ShareError ? e.message : 'Dexcom sync failed.' });
    }
  },

  restore: async () => {
    if (get().status !== 'off') return;
    const c = await loadCredentials().catch(() => null);
    if (c) await get().connect(c);
  },

  disconnect: async () => {
    await clearCredentials().catch(() => undefined);
    set({ status: 'off', username: undefined, lastSyncAt: undefined, error: undefined, errorCode: undefined });
  },

  startDemo: () => {
    useAppStore.getState().releaseDelayedSensor(new Date(), true);
    set({ status: 'demo', username: 'Demo', error: undefined, errorCode: undefined, lastSyncAt: new Date().toISOString() });
  },
}));
