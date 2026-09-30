import { createDebouncedStorage, jsonStorage, type KeyValueStorage } from './index';

function memory() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  const base: KeyValueStorage = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      writes.push(v);
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
  return { base, data, writes };
}

describe('createDebouncedStorage', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('collapses rapid writes into one', async () => {
    const m = memory();
    const s = createDebouncedStorage(m.base, 500);
    await s.setItem('k', '1');
    await s.setItem('k', '2');
    await s.setItem('k', '3');
    expect(m.writes).toEqual([]);
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    expect(m.writes).toEqual(['3']);
  });

  it('returns the newest value even before it is written', async () => {
    const m = memory();
    const s = createDebouncedStorage(m.base, 500);
    await s.setItem('k', 'new');
    expect(await s.getItem('k')).toBe('new');
  });

  it('flushes immediately on demand (app going to background)', async () => {
    const m = memory();
    const s = createDebouncedStorage(m.base, 5000);
    await s.setItem('k', 'v');
    await s.flush();
    expect(m.data.get('k')).toBe('v');
  });

  it('only serializes the value that is actually written', async () => {
    const m = memory();
    const s = createDebouncedStorage(m.base, 500);
    const made: string[] = [];
    s.setLazy('k', () => (made.push('a'), 'a'));
    s.setLazy('k', () => (made.push('b'), 'b'));
    await s.flush();
    expect(made).toEqual(['b']);
    expect(m.data.get('k')).toBe('b');
  });

  it('starts fresh instead of crashing on an unreadable save', async () => {
    const m = memory();
    m.data.set('k', '{broken');
    const storage = jsonStorage<{ a: number }>(createDebouncedStorage(m.base));
    expect(await storage.getItem('k')).toBeNull();
  });

  it('drops a pending write when the key is removed', async () => {
    const m = memory();
    const s = createDebouncedStorage(m.base, 500);
    await s.setItem('k', 'v');
    await s.removeItem('k');
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    expect(m.data.has('k')).toBe(false);
  });
});
