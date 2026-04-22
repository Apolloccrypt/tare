/**
 * @file Tests for lib/constants.js
 *
 * Run with: node --test tests/constants.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPES,
  VALID_TYPES,
  TYPE_META,
  TYPE_ORDER,
  MATCH_STRATEGIES,
  VALID_MATCH_STRATEGIES,
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  STORAGE_KEYS,
  MSG,
  COMMANDS,
  MENU_IDS,
  LIMITS,
  VERSION,
} from '../src/lib/constants.js';

test('TYPES is frozen', () => {
  assert.throws(() => { TYPES.REUSABLE = 'x'; });
});

test('TYPES has all four types', () => {
  assert.equal(TYPES.REUSABLE, '!');
  assert.equal(TYPES.LINEAR, '1');
  assert.equal(TYPES.AFFINE, 'A');
  assert.equal(TYPES.NEUTRAL, '·');
});

test('VALID_TYPES contains all type symbols', () => {
  assert.deepEqual([...VALID_TYPES].sort(), ['!', '1', '·', 'A'].sort());
});

test('TYPE_META has entry for each type', () => {
  for (const t of VALID_TYPES) {
    assert.ok(TYPE_META[t], `missing meta for ${t}`);
    assert.ok(TYPE_META[t].cls);
    assert.ok(TYPE_META[t].full);
    assert.match(TYPE_META[t].color, /^#[0-9a-f]{6}$/i);
  }
});

test('TYPE_ORDER lists all types exactly once', () => {
  assert.equal(TYPE_ORDER.length, VALID_TYPES.length);
  for (const t of VALID_TYPES) {
    assert.ok(TYPE_ORDER.includes(t));
  }
});

test('VALID_MATCH_STRATEGIES has expected values', () => {
  const expected = ['host', 'host-ends', 'host-starts', 'url-starts', 'url-contains'];
  assert.deepEqual([...VALID_MATCH_STRATEGIES].sort(), expected.sort());
});

test('DEFAULT_RULES are well-formed', () => {
  assert.ok(DEFAULT_RULES.length > 0);
  for (const rule of DEFAULT_RULES) {
    assert.ok(VALID_TYPES.includes(rule.type), `invalid type in rule: ${JSON.stringify(rule)}`);
    assert.ok(VALID_MATCH_STRATEGIES.includes(rule.match), `invalid match in rule: ${JSON.stringify(rule)}`);
    assert.ok(typeof rule.pattern === 'string' && rule.pattern.length > 0);
    assert.ok(!rule.pattern.includes(' '), `pattern has whitespace: ${rule.pattern}`);
    assert.ok(!rule.pattern.includes('://'), `pattern has protocol: ${rule.pattern}`);
  }
});

test('DEFAULT_SETTINGS matches expected shape', () => {
  assert.equal(typeof DEFAULT_SETTINGS.autoTypeEnabled, 'boolean');
  assert.equal(typeof DEFAULT_SETTINGS.idleMinutesBeforeDischarge, 'number');
  assert.equal(typeof DEFAULT_SETTINGS.memoryPressureThresholdPct, 'number');
  assert.equal(typeof DEFAULT_SETTINGS.showNotifications, 'boolean');
});

test('SETTINGS_BOUNDS only has number keys', () => {
  for (const key of Object.keys(SETTINGS_BOUNDS)) {
    assert.ok(key in DEFAULT_SETTINGS, `bound for unknown key: ${key}`);
    assert.equal(typeof DEFAULT_SETTINGS[key], 'number');
    const b = SETTINGS_BOUNDS[key];
    assert.ok(b.max > b.min);
    assert.ok(DEFAULT_SETTINGS[key] >= b.min && DEFAULT_SETTINGS[key] <= b.max,
      `default ${key}=${DEFAULT_SETTINGS[key]} out of bounds ${b.min}..${b.max}`);
  }
});

test('STORAGE_KEYS are unique', () => {
  const values = Object.values(STORAGE_KEYS);
  assert.equal(new Set(values).size, values.length);
});

test('MSG keys are unique', () => {
  const values = Object.values(MSG);
  assert.equal(new Set(values).size, values.length);
});

test('COMMANDS keys are valid identifiers', () => {
  for (const cmd of Object.values(COMMANDS)) {
    assert.match(cmd, /^[a-z][a-z0-9-]*$/);
  }
});

test('LIMITS values are positive', () => {
  for (const [key, val] of Object.entries(LIMITS)) {
    assert.ok(val > 0, `${key} must be positive`);
  }
});

test('VERSION follows semver', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test("TYPE_META['!'].display is ●", () => {
  assert.equal(TYPE_META['!'].display, '●');
});

test("TYPE_META['1'].display is ◐", () => {
  assert.equal(TYPE_META['1'].display, '◐');
});

test("TYPE_META['A'].display is ○", () => {
  assert.equal(TYPE_META['A'].display, '○');
});

test("TYPE_META['·'].display is ·", () => {
  assert.equal(TYPE_META['·'].display, '·');
});

test("TYPE_META['!'].human is Session", () => {
  assert.equal(TYPE_META['!'].human, 'Session');
});

test("TYPE_META['1'].human is Reference", () => {
  assert.equal(TYPE_META['1'].human, 'Reference');
});

test("TYPE_META['A'].human is Feed", () => {
  assert.equal(TYPE_META['A'].human, 'Feed');
});

test("TYPE_META['·'].human is Other", () => {
  assert.equal(TYPE_META['·'].human, 'Other');
});

test('TYPE_META legacy and new fields all present', () => {
  for (const t of VALID_TYPES) {
    const m = TYPE_META[t];
    assert.ok(m.label !== undefined, `${t}: missing label`);
    assert.ok(m.full, `${t}: missing full`);
    assert.ok(m.cls, `${t}: missing cls`);
    assert.match(m.color, /^#[0-9a-f]{6}$/i, `${t}: bad color`);
    assert.ok(m.display, `${t}: missing display`);
    assert.ok(m.human, `${t}: missing human`);
    assert.ok(typeof m.sentence === 'string' && m.sentence.length > 0, `${t}: missing sentence`);
  }
});
