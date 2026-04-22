/**
 * @file Tests that explicit triggerMode is preserved when defaultsVersion >= 3.
 *
 * Run with: node --test tests/state-migration-v3-preserved.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockChrome } from './helpers/mock-chrome.js';
import { STORAGE_KEYS } from '../src/lib/constants.js';
import { ensureLoaded, getSettings } from '../src/lib/state.js';

const mock = createMockChrome();
globalThis.chrome = mock.chrome;

// Simulate a user who explicitly set system-ram after upgrading to v3
mock.seed({
  [STORAGE_KEYS.SETTINGS]: { defaultsVersion: 3, triggerMode: 'system-ram' },
});

test('migration v3: explicit system-ram is preserved when defaultsVersion is already 3', async () => {
  await ensureLoaded();
  assert.equal(getSettings().triggerMode, 'system-ram');
  assert.equal(getSettings().defaultsVersion, 3);
});
