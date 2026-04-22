/**
 * @file Tests for estimateChromeFootprint() in lib/eviction.js.
 *
 * Run with: node --test tests/eviction.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockChrome } from './helpers/mock-chrome.js';
import { STORAGE_KEYS } from '../src/lib/constants.js';
import { ensureLoaded } from '../src/lib/state.js';
import { estimateChromeFootprint } from '../src/lib/eviction.js';

let mockTabs = [];
const mock = createMockChrome();
mock.chrome.tabs = { query: async () => mockTabs };
globalThis.chrome = mock.chrome;

// Seed with averageTabMB = 85 (default)
mock.seed({
  [STORAGE_KEYS.SETTINGS]: { averageTabMB: 85 },
});

await ensureLoaded();

test('estimateChromeFootprint: 0 tabs → estimateMB=500, liveTabs=0', async () => {
  mockTabs = [];
  const result = await estimateChromeFootprint();
  assert.equal(result.estimateMB, 500);
  assert.equal(result.liveTabs, 0);
});

test('estimateChromeFootprint: 10 live tabs at 85 MB → estimateMB=1350', async () => {
  mockTabs = Array.from({ length: 10 }, (_, i) => ({ id: i, discarded: false }));
  const result = await estimateChromeFootprint();
  assert.equal(result.estimateMB, 500 + 10 * 85);
  assert.equal(result.liveTabs, 10);
});

test('estimateChromeFootprint: 2 live + 1 discarded → liveTabs=2, estimateMB=670', async () => {
  mockTabs = [
    { id: 1, discarded: false },
    { id: 2, discarded: false },
    { id: 3, discarded: true },
  ];
  const result = await estimateChromeFootprint();
  assert.equal(result.liveTabs, 2);
  assert.equal(result.estimateMB, 500 + 2 * 85);
});
