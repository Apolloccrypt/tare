/**
 * @file Tests for v2→v3 migration: triggerMode defaults to chrome-estimate.
 *
 * Run with: node --test tests/state-migration-v3.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockChrome } from './helpers/mock-chrome.js';
import { STORAGE_KEYS } from '../src/lib/constants.js';
import { ensureLoaded, getSettings } from '../src/lib/state.js';

const mock = createMockChrome();
globalThis.chrome = mock.chrome;

// Seed with defaultsVersion: 2 (pre-v3 state, no triggerMode stored)
mock.seed({
  [STORAGE_KEYS.SETTINGS]: { defaultsVersion: 2, autoTypeEnabled: true },
});

test('migration v2→v3: triggerMode becomes chrome-estimate', async () => {
  await ensureLoaded();
  assert.equal(getSettings().triggerMode, 'chrome-estimate');
});

test('migration v2→v3: defaultsVersion becomes 3', async () => {
  await ensureLoaded();
  assert.equal(getSettings().defaultsVersion, 3);
});
