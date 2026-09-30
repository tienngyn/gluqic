/**
 * Web key-value storage (browser localStorage). Every call is guarded: in
 * private windows or sandboxed previews storage can be missing or throw, and
 * the app must still work (just without saving).
 */
import type { KeyValueStorage } from './types';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const kv: KeyValueStorage = {
  getItem: async (key) => {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      store()?.setItem(key, value);
    } catch {
      // Quota exceeded or blocked: keep running without saving.
    }
  },
  removeItem: async (key) => {
    try {
      store()?.removeItem(key);
    } catch {
      // ignore
    }
  },
};
