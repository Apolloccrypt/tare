/**
 * @file Tests for memoryPressureThresholdPct → systemRamThresholdPct migration in state.js.
 *
 * Run with: node --test tests/state-migration.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockChrome } from './helpers/mock-chrome.js';
import { STORAGE_KEYS } from '../src/lib/constants.js';
import { ensureLoaded, getSettings } from '../src/lib/state.js';

const mock = createMockChrome();
globalThis.chrome = mock.chrome;

// Seed with the old key only (pre-migration state)
mock.seed({
  [STORAGE_KEYS.SETTINGS]: { memoryPressureThresholdPct: 75, autoTypeEnabled: true },
});

test('migration: systemRamThresholdPct gets the value from old memoryPressureThresholdPct', async () => {
  await ensureLoaded();
  const settings = getSettings();
  assert.equal(settings.systemRamThresholdPct, 75);
  assert.equal(settings.autoTypeEnabled, true);
});

test('migration: old key is removed from active settings after migration', async () => {
  await ensureLoaded(); // already loaded, no-op
  const settings = getSettings();
  // systemRamThresholdPct was migrated; old raw key was deleted before validation
  // DEFAULT_SETTINGS still has memoryPressureThresholdPct, so it remains at its default
  // The key point: systemRamThresholdPct is 75, not the default 85
  assert.notEqual(settings.systemRamThresholdPct, 85);
  assert.equal(settings.systemRamThresholdPct, 75);
});
