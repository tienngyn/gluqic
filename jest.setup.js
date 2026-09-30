/* global jest */
// Native storage modules are not available in Jest: back them with memory.
jest.mock('expo-sqlite/kv-store', () => {
  const data = new Map();
  return {
    __esModule: true,
    default: {
      getItemAsync: async (k) => (data.has(k) ? data.get(k) : null),
      setItemAsync: async (k, v) => void data.set(k, v),
      removeItemAsync: async (k) => data.delete(k),
    },
  };
});

jest.mock('expo-secure-store', () => {
  const data = new Map();
  return {
    getItemAsync: async (k) => (data.has(k) ? data.get(k) : null),
    setItemAsync: async (k, v) => void data.set(k, v),
    deleteItemAsync: async (k) => void data.delete(k),
  };
});
