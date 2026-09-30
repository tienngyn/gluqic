/**
 * Local persistence. Writes are debounced (state can change several times
 * in a row, e.g. a bolus saves a calculation, a dose and a reading) and
 * flushed immediately when the app goes to the background, so nothing is
 * lost when iOS suspends it.
 */
import { AppState } from 'react-native';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

import { kv } from './kv';
import type { KeyValueStorage } from './types';

export type { KeyValueStorage } from './types';

export type DebouncedStorage = KeyValueStorage & {
  /** Like setItem, but the value is only produced when it is written (serializing is skipped for superseded values). */
  setLazy(key: string, value: () => string): void;
  /** Writes any pending values now. */
  flush(): Promise<void>;
};

export function createDebouncedStorage(base: KeyValueStorage, delayMs = 800): DebouncedStorage {
  const pending = new Map<string, () => string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const entries = [...pending.entries()];
    pending.clear();
    await Promise.all(entries.map(([k, v]) => base.setItem(k, v())));
  };

  const setLazy = (key: string, value: () => string) => {
    pending.set(key, value);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  };

  return {
    // A pending (not yet written) value is the newest one.
    getItem: async (key) => (pending.has(key) ? pending.get(key)!() : base.getItem(key)),
    setItem: async (key, value) => setLazy(key, () => value),
    setLazy,
    removeItem: async (key) => {
      pending.delete(key);
      await base.removeItem(key);
    },
    flush,
  };
}

export const appStorage = createDebouncedStorage(kv);

/** JSON storage for zustand `persist`: the state is serialized once per save, not on every change. */
export function jsonStorage<S>(storage: DebouncedStorage = appStorage): PersistStorage<S> {
  return {
    getItem: async (name) => {
      const raw = await storage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        // Unreadable save: start fresh rather than crash on launch.
        return null;
      }
    },
    setItem: (name, value) => storage.setLazy(name, () => JSON.stringify(value)),
    removeItem: (name) => storage.removeItem(name),
  };
}

AppState.addEventListener?.('change', (state) => {
  if (state !== 'active') void appStorage.flush();
});
