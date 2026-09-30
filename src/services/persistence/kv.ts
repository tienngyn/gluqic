/**
 * Native key-value storage backed by SQLite (expo-sqlite/kv-store): local,
 * offline, survives restarts. Web uses `kv.web.ts`.
 */
import Storage from 'expo-sqlite/kv-store';

import type { KeyValueStorage } from './types';

export const kv: KeyValueStorage = {
  getItem: (key) => Storage.getItemAsync(key),
  setItem: (key, value) => Storage.setItemAsync(key, value),
  removeItem: async (key) => {
    await Storage.removeItemAsync(key);
  },
};
