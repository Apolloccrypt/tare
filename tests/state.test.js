/**
 * @file Tests for lib/state.js
 *
 * Run with: node --test tests/state.test.js
 *
 * Each test file runs in its own child process (node --test behaviour),
 * so this file gets a fresh module cache and a single cold-start opportunity.
 * The mock is installed at module-eval time — before any test code runs —
 * because neither state.js nor storage.js touch chrome.* at import time.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockChrome } from './helpers/mock-chrome.js';
import { STORAGE_KEYS, DEFAULT_RULES, DEFAULT_SETTINGS, LIMITS } from '../src/lib/constants.js';
import {
  ensureLoaded,
  persistNow,
  withLock,
  getTabType, getRules, getSettings, getStats, getUndoStack, peekUndo,
  setTabType, deleteTabType, pruneStaleTabTypes,
  setRules, addRule, removeRuleAt, removeRuleByKey, resetRules,
  updateSettings, resetStats,
  incrementStats,
  pushUndo, popUndo, pruneUndo,
  replaceState,
  incrementRuleMatch, resetRuleStats,
} from '../src/lib/state.js';

// ─── Mock setup (module-level, runs before any test) ──────────
const mock = createMockChrome();
globalThis.chrome = mock.chrome;

const SEED_RULE = { pattern: 'custom.test', type: 'A', match: 'host', reason: 'seed' };
const SEED_TAB  = { type: '!', source: 'auto', reason: 'email', timestamp: 1000, url: 'https://t.test', title: 'T' };
const SEED_UNDO = { kind: 'evict-affine', tabs: [], source: 'cold-start', at: 1000 };

mock.seed({
  [STORAGE_KEYS.RULES]:      [SEED_RULE],
  [STORAGE_KEYS.SETTINGS]:   { idleMinutesBeforeDischarge: 99, defaultsVersion: 2 },
  [STORAGE_KEYS.STATS]:      { totalDischarged: 42, totalAffineEvicted: 7 },
  [STORAGE_KEYS.UNDO_STACK]: [SEED_UNDO],
  [STORAGE_KEYS.TAB_TYPES]:  { 101: SEED_TAB },
});

// ─── Helpers ──────────────────────────────────────────────────
function drainUndo() { while (peekUndo()) popUndo(); }
function drainTabs()  { pruneStaleTabTypes(new Set()); }

// ─── ensureLoaded() ───────────────────────────────────────────

describe('ensureLoaded()', () => {
  test('cold start: concurrent callers share exactly one storage.get and load seeded data', async () => {
    mock.resetCounts();
    await Promise.all([ensureLoaded(), ensureLoaded(), ensureLoaded()]);
    assert.equal(mock.getCallCount(), 1);
    assert.deepEqual(getRules(), [SEED_RULE]);
    assert.equal(getSettings().idleMinutesBeforeDischarge, 99);
    assert.equal(getStats().totalDischarged, 42);
    assert.equal(getStats().totalAffineEvicted, 7);
    assert.deepEqual(getTabType(101), SEED_TAB);
    assert.equal(getUndoStack().length, 1);
  });

  test('already-loaded: subsequent calls are no-ops (zero additional storage.get)', async () => {
    mock.resetCounts();
    await ensureLoaded();
    await ensureLoaded();
    assert.equal(mock.getCallCount(), 0);
  });
});

// ─── withLock() ───────────────────────────────────────────────

describe('withLock()', () => {
  test('serializes concurrent mutations in registration order', async () => {
    const order = [];
    const p1 = withLock(async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push(1);
    });
    const p2 = withLock(async () => { order.push(2); });
    const p3 = withLock(async () => { order.push(3); });
    await Promise.all([p1, p2, p3]);
    assert.deepEqual(order, [1, 2, 3]);
  });

  test('propagates return value', async () => {
    assert.equal(await withLock(() => 42), 42);
  });

  test('releases lock after a thrown error so next call is not blocked', async () => {
    await assert.rejects(withLock(() => { throw new Error('boom'); }), /boom/);
    assert.equal(await withLock(() => 'ok'), 'ok');
  });
});

// ─── Rule mutations ───────────────────────────────────────────

describe('rule mutations', () => {
  beforeEach(async () => {
    setRules([...DEFAULT_RULES]);
    await persistNow();
    mock.resetCounts();
  });

  test('setRules replaces the rule list', () => {
    const r = { pattern: 'a.test', type: '!', match: 'host' };
    setRules([r]);
    assert.deepEqual(getRules(), [r]);
  });

  test('setRules schedules a persist that writes to storage', async () => {
    setRules([]);
    await persistNow();
    assert.equal(mock.setCallCount(), 1);
    assert.deepEqual(mock.dump()[STORAGE_KEYS.RULES], []);
  });

  test('addRule prepends to the rule list', () => {
    const r = { pattern: 'new.test', type: '1', match: 'host' };
    addRule(r);
    assert.equal(getRules()[0].pattern, 'new.test');
    assert.equal(getRules().length, DEFAULT_RULES.length + 1);
  });

  test('addRule enforces LIMITS.MAX_RULES — oldest entry evicted on overflow', () => {
    setRules(Array.from({ length: LIMITS.MAX_RULES }, (_, i) => ({
      pattern: `h${i}.test`, type: '·', match: 'host',
    })));
    addRule({ pattern: 'overflow.test', type: '!', match: 'host' });
    assert.equal(getRules().length, LIMITS.MAX_RULES);
    assert.equal(getRules()[0].pattern, 'overflow.test');
  });

  test('removeRuleAt removes rule at given index', () => {
    const r1 = { pattern: 'r1.test', type: '!', match: 'host' };
    const r2 = { pattern: 'r2.test', type: 'A', match: 'host' };
    setRules([r1, r2]);
    assert.equal(removeRuleAt(0), true);
    assert.deepEqual(getRules(), [r2]);
  });

  test('removeRuleAt returns false for out-of-range index', () => {
    setRules([{ pattern: 'x.test', type: '!', match: 'host' }]);
    assert.equal(removeRuleAt(5), false);
    assert.equal(getRules().length, 1);
  });

  test('removeRuleByKey removes rule matching pattern and match strategy', () => {
    setRules([{ pattern: 'rem.test', type: '!', match: 'host' }]);
    assert.equal(removeRuleByKey('rem.test', 'host'), true);
    assert.equal(getRules().length, 0);
  });

  test('removeRuleByKey returns false when no rule matches', () => {
    setRules([{ pattern: 'a.test', type: '!', match: 'host' }]);
    assert.equal(removeRuleByKey('none.test', 'host'), false);
    assert.equal(getRules().length, 1);
  });

  test('resetRules restores DEFAULT_RULES', () => {
    setRules([]);
    resetRules();
    assert.deepEqual(getRules(), [...DEFAULT_RULES]);
  });
});

// ─── Debounced persist ────────────────────────────────────────
// PERSIST_DEBOUNCE_MS = 250 (internal). Tests wait 300ms for headroom.

describe('debounced persist', () => {
  beforeEach(async () => {
    await persistNow();
    mock.resetCounts();
  });

  test('coalesces rapid mutations into a single storage.set call', async () => {
    for (let i = 0; i < 5; i++) setRules([]);
    assert.equal(mock.setCallCount(), 0); // timer not yet fired
    await new Promise(r => setTimeout(r, 300));
    assert.equal(mock.setCallCount(), 1);
  });

  test('persistNow() cancels the pending debounce timer and persists immediately', async () => {
    setRules([]);
    setRules([]);
    setRules([]); // 3 rapid calls → 1 pending timer
    await persistNow(); // cancels that timer, does 1 immediate persist
    assert.equal(mock.setCallCount(), 1);
  });
});

// ─── Undo stack ───────────────────────────────────────────────

describe('undo stack', () => {
  beforeEach(async () => {
    drainUndo();
    await persistNow();
    mock.resetCounts();
  });

  test('pushUndo prepends entry with current timestamp', () => {
    const before = Date.now();
    pushUndo({ kind: 'evict-affine', tabs: [], source: 'test' });
    const entry = peekUndo();
    assert.ok(entry !== null);
    assert.ok(entry.at >= before);
    assert.equal(entry.kind, 'evict-affine');
  });

  test('pushUndo respects LIMITS.UNDO_MAX — oldest entries are evicted', () => {
    for (let i = 0; i < LIMITS.UNDO_MAX + 3; i++) {
      pushUndo({ kind: 'evict-affine', tabs: [], source: String(i) });
    }
    assert.equal(getUndoStack().length, LIMITS.UNDO_MAX);
    // Most recently pushed is at [0]
    assert.equal(getUndoStack()[0].source, String(LIMITS.UNDO_MAX + 2));
  });

  test('popUndo returns and removes the head entry', () => {
    pushUndo({ kind: 'evict-affine', tabs: [], source: 'pop-me' });
    const entry = popUndo();
    assert.equal(entry?.source, 'pop-me');
    assert.equal(peekUndo(), null);
  });

  test('popUndo returns null on empty stack', () => {
    assert.equal(popUndo(), null);
  });

  test('peekUndo returns head without removing it', () => {
    pushUndo({ kind: 'evict-affine', tabs: [], source: 'peek' });
    peekUndo();
    assert.equal(getUndoStack().length, 1);
  });

  test('pruneUndo removes entries older than maxAgeSec', () => {
    pushUndo({ kind: 'evict-affine', tabs: [], source: 'prune-me' });
    // maxAgeSec=0 → cutoff=now → entry.at <= now → filtered out
    const pruned = pruneUndo(0);
    assert.ok(pruned >= 1);
    assert.equal(peekUndo(), null);
  });

  test('pruneUndo returns 0 when all entries are within the window', () => {
    pushUndo({ kind: 'evict-affine', tabs: [], source: 'keep' });
    const pruned = pruneUndo(3600); // 1-hour window — entry is fresh
    assert.equal(pruned, 0);
    assert.equal(getUndoStack().length, 1);
  });
});

// ─── Tab type management ──────────────────────────────────────

describe('tab type management', () => {
  beforeEach(async () => {
    drainTabs();
    await persistNow();
    mock.resetCounts();
  });

  test('setTabType and getTabType round-trip', () => {
    const entry = { type: '!', source: 'auto', reason: 'email', timestamp: Date.now(), url: 'https://u.test', title: 'U' };
    setTabType(42, entry);
    assert.deepEqual(getTabType(42), entry);
  });

  test('deleteTabType removes the entry', () => {
    setTabType(7, { type: 'A', source: 'auto', timestamp: Date.now() });
    deleteTabType(7);
    assert.equal(getTabType(7), undefined);
  });

  test('pruneStaleTabTypes removes tabs absent from liveTabIds', () => {
    setTabType(1, { type: '!', source: 'auto', timestamp: Date.now() });
    setTabType(2, { type: 'A', source: 'auto', timestamp: Date.now() });
    setTabType(3, { type: '1', source: 'auto', timestamp: Date.now() });
    const pruned = pruneStaleTabTypes(new Set([2]));
    assert.equal(pruned, 2);
    assert.equal(getTabType(1), undefined);
    assert.ok(getTabType(2) !== undefined);
    assert.equal(getTabType(3), undefined);
  });

  test('pruneStaleTabTypes returns 0 when all tabs are live', () => {
    setTabType(5, { type: '·', source: 'default', timestamp: Date.now() });
    assert.equal(pruneStaleTabTypes(new Set([5])), 0);
    assert.ok(getTabType(5) !== undefined);
  });

  test('pruneStaleTabTypes on empty tabTypes returns 0', () => {
    assert.equal(pruneStaleTabTypes(new Set()), 0);
  });
});

// ─── Stats ────────────────────────────────────────────────────

describe('incrementStats()', () => {
  beforeEach(async () => {
    resetStats();
    await persistNow();
    mock.resetCounts();
  });

  test('increments numeric fields by positive deltas', () => {
    incrementStats({ totalDischarged: 3, estimatedMemoryFreedMB: 10 });
    assert.equal(getStats().totalDischarged, 3);
    assert.equal(getStats().estimatedMemoryFreedMB, 10);
  });

  test('clamps to 0 when negative delta underflows below zero', () => {
    incrementStats({ totalDischarged: 2 });
    incrementStats({ totalDischarged: -10 }); // 2 + (-10) = -8, clamped to 0
    assert.equal(getStats().totalDischarged, 0);
  });

  test('negative delta that leaves result positive is not clamped', () => {
    incrementStats({ totalDischarged: 5 });
    incrementStats({ totalDischarged: -3 }); // 5 - 3 = 2
    assert.equal(getStats().totalDischarged, 2);
  });

  test('resetStats zeros all counters and preserves installedAt', () => {
    const installedAt = getStats().installedAt;
    incrementStats({ totalDischarged: 99 });
    resetStats();
    assert.equal(getStats().totalDischarged, 0);
    assert.equal(getStats().installedAt, installedAt);
  });
});

// ─── Settings ─────────────────────────────────────────────────

describe('updateSettings()', () => {
  beforeEach(() => {
    replaceState({ settings: { ...DEFAULT_SETTINGS } });
  });

  test('merges patch into current settings without clobbering other keys', () => {
    updateSettings({ idleMinutesBeforeDischarge: 60 });
    assert.equal(getSettings().idleMinutesBeforeDischarge, 60);
    assert.equal(getSettings().autoTypeEnabled, DEFAULT_SETTINGS.autoTypeEnabled);
  });
});

// ─── replaceState() ───────────────────────────────────────────

describe('replaceState()', () => {
  test('replaces rules entirely', () => {
    const newRules = [{ pattern: 'replace.test', type: '1', match: 'host' }];
    replaceState({ rules: newRules });
    assert.deepEqual(getRules(), newRules);
  });

  test('replaces settings merged with DEFAULT_SETTINGS', () => {
    replaceState({ settings: { idleMinutesBeforeDischarge: 77 } });
    assert.equal(getSettings().idleMinutesBeforeDischarge, 77);
    assert.equal(getSettings().autoTypeEnabled, DEFAULT_SETTINGS.autoTypeEnabled);
  });
});

// ─── Storage failures ─────────────────────────────────────────

describe('storage failures', () => {
  beforeEach(async () => {
    mock.setSetThrow(false);
    setRules([...DEFAULT_RULES]);
    await persistNow();
    mock.resetCounts();
  });

  test('persistNow() with failing storage returns false and does not throw', async () => {
    mock.setSetThrow(true);
    const result = await persistNow();
    assert.equal(result, false);
    mock.setSetThrow(false);
    // Module continues to work
    addRule({ pattern: 'post-fail.test', type: '!', match: 'host' });
    assert.equal(getRules()[0].pattern, 'post-fail.test');
  });

  test('schedulePersist() swallows storage errors — module remains functional', async () => {
    mock.setSetThrow(true);
    setRules([]); // queues a debounced persist that will throw internally
    await new Promise(r => setTimeout(r, 300)); // let the 250ms debounce timer fire
    mock.setSetThrow(false);
    // No uncaught exception; module still works
    addRule({ pattern: 'after-silent-fail.test', type: 'A', match: 'host' });
    assert.equal(getRules()[0].pattern, 'after-silent-fail.test');
  });
});

// ─── incrementRuleMatch() ─────────────────────────────────────

describe('incrementRuleMatch()', () => {
  beforeEach(async () => {
    setRules([
      { pattern: 'a.test', type: '!', match: 'host', reason: 'r1' },
      { pattern: 'b.test', type: '1', match: 'host', reason: 'r2' },
    ]);
    await persistNow();
    mock.resetCounts();
  });

  test('sets matchCount=1 and lastMatchedAt on first call (no prior matchCount)', () => {
    const before = Date.now();
    incrementRuleMatch(0);
    const r = getRules()[0];
    assert.equal(r.matchCount, 1);
    assert.ok(r.lastMatchedAt >= before);
  });

  test('accumulates correctly across multiple calls', () => {
    incrementRuleMatch(0);
    incrementRuleMatch(0);
    incrementRuleMatch(0);
    assert.equal(getRules()[0].matchCount, 3);
  });

  test('is a no-op for out-of-range index', () => {
    const snapshot = getRules().map(r => ({ ...r }));
    incrementRuleMatch(99);
    assert.deepEqual(getRules(), snapshot);
  });

  test('does not mutate DEFAULT_RULES objects when rules array was reset to defaults', () => {
    resetRules(); // rules = [...DEFAULT_RULES], rules[0] === DEFAULT_RULES[0]
    incrementRuleMatch(0);
    assert.equal(DEFAULT_RULES[0].matchCount, undefined);
    assert.equal(getRules()[0].matchCount, 1);
  });
});

// ─── resetRuleStats() ────────────────────────────────────────

describe('resetRuleStats()', () => {
  beforeEach(async () => {
    setRules([{ pattern: 'a.test', type: '!', match: 'host' }]);
    incrementRuleMatch(0);
    incrementRuleMatch(0);
    await persistNow();
    mock.resetCounts();
  });

  test('clears matchCount to 0 and lastMatchedAt to null, returns true', () => {
    assert.equal(getRules()[0].matchCount, 2);
    const ok = resetRuleStats(0);
    assert.equal(ok, true);
    assert.equal(getRules()[0].matchCount, 0);
    assert.equal(getRules()[0].lastMatchedAt, null);
  });

  test('returns false for out-of-range index without touching state', () => {
    assert.equal(resetRuleStats(99), false);
    assert.equal(getRules()[0].matchCount, 2); // unchanged
  });
});
