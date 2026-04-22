/**
 * @file In-memory chrome.storage.local mock for unit tests.
 *
 * Usage:
 *   const mock = createMockChrome();
 *   globalThis.chrome = mock.chrome;
 *   mock.seed({ tabTypes: {}, rules: [] });
 *
 * Importable by any test file that needs chrome.storage.
 */

export function createMockChrome() {
  const db = new Map();
  let getCallCount = 0;
  let setCallCount = 0;
  let throwOnGet = false;
  let throwOnSet = false;

  const local = {
    async get(keys) {
      getCallCount++;
      if (throwOnGet) throw new Error('mock storage get error');
      const ks = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : [];
      const result = {};
      for (const k of ks) {
        if (db.has(k)) result[k] = db.get(k);
      }
      return result;
    },
    async set(items) {
      setCallCount++;
      if (throwOnSet) throw new Error('mock storage set error');
      for (const [k, v] of Object.entries(items)) db.set(k, structuredClone(v));
    },
  };

  return {
    chrome: { storage: { local } },

    /** Pre-populate storage. Values are deep-cloned. */
    seed(data) {
      db.clear();
      for (const [k, v] of Object.entries(data)) db.set(k, structuredClone(v));
    },

    /** Dump current storage as a plain object. */
    dump() {
      const out = {};
      for (const [k, v] of db) out[k] = v;
      return out;
    },

    setGetThrow(v) { throwOnGet = v; },
    setSetThrow(v) { throwOnSet = v; },
    getCallCount() { return getCallCount; },
    setCallCount() { return setCallCount; },
    resetCounts() { getCallCount = 0; setCallCount = 0; },
  };
}
