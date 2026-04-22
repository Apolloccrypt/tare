/**
 * @file Tests for lib/validators.js
 *
 * Run with: node --test tests/validators.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidString,
  validateRule,
  validateRules,
  validateSettingsPatch,
  validateImportConfig,
  isValidType,
} from '../src/lib/validators.js';

// ─── isValidString ───────────────────────────────────────────
test('isValidString: accepts normal string', () => {
  assert.equal(isValidString('hello', 10), true);
});
test('isValidString: rejects empty', () => {
  assert.equal(isValidString('', 10), false);
});
test('isValidString: rejects oversize', () => {
  assert.equal(isValidString('abcdef', 5), false);
});
test('isValidString: rejects non-string', () => {
  assert.equal(isValidString(123, 10), false);
  assert.equal(isValidString(null, 10), false);
});

// ─── isValidType ─────────────────────────────────────────────
test('isValidType accepts all four types', () => {
  assert.equal(isValidType('!'), true);
  assert.equal(isValidType('1'), true);
  assert.equal(isValidType('A'), true);
  assert.equal(isValidType('·'), true);
});
test('isValidType rejects others', () => {
  assert.equal(isValidType('X'), false);
  assert.equal(isValidType(''), false);
  assert.equal(isValidType(null), false);
  assert.equal(isValidType(1), false);
});

// ─── validateRule ────────────────────────────────────────────
test('validateRule: accepts valid rule', () => {
  const r = validateRule({
    pattern: 'example.com',
    type: '!',
    match: 'host',
    reason: 'test',
  });
  assert.equal(r.ok, true);
  assert.equal(r.rule.pattern, 'example.com');
  assert.equal(r.rule.type, '!');
});

test('validateRule: lowercases pattern', () => {
  const r = validateRule({ pattern: 'Example.COM', type: '!', match: 'host' });
  assert.equal(r.ok, true);
  assert.equal(r.rule.pattern, 'example.com');
});

test('validateRule: trims pattern', () => {
  const r = validateRule({ pattern: '  example.com  ', type: '!', match: 'host' });
  assert.equal(r.ok, true);
  assert.equal(r.rule.pattern, 'example.com');
});

test('validateRule: rejects missing pattern', () => {
  const r = validateRule({ type: '!', match: 'host' });
  assert.equal(r.ok, false);
});

test('validateRule: rejects pattern with protocol', () => {
  const r = validateRule({
    pattern: 'https://example.com',
    type: '!',
    match: 'host',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /protocol/);
});

test('validateRule: rejects pattern with whitespace', () => {
  const r = validateRule({
    pattern: 'example .com',
    type: '!',
    match: 'host',
  });
  assert.equal(r.ok, false);
});

test('validateRule: rejects invalid type', () => {
  const r = validateRule({
    pattern: 'example.com',
    type: 'X',
    match: 'host',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /type/);
});

test('validateRule: rejects invalid match strategy', () => {
  const r = validateRule({
    pattern: 'example.com',
    type: '!',
    match: 'invalid-strategy',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /match/);
});

test('validateRule: defaults match to host-ends', () => {
  const r = validateRule({ pattern: 'example.com', type: '!' });
  assert.equal(r.ok, true);
  assert.equal(r.rule.match, 'host-ends');
});

test('validateRule: truncates oversized reason', () => {
  const r = validateRule({
    pattern: 'example.com',
    type: '!',
    match: 'host',
    reason: 'x'.repeat(100),
  });
  assert.equal(r.ok, true);
  assert.ok(r.rule.reason.length <= 64);
});

test('validateRule: rejects oversized pattern', () => {
  const r = validateRule({
    pattern: 'a'.repeat(300),
    type: '!',
    match: 'host',
  });
  assert.equal(r.ok, false);
});

test('validateRule: rejects non-object input', () => {
  assert.equal(validateRule(null).ok, false);
  assert.equal(validateRule('string').ok, false);
  assert.equal(validateRule(42).ok, false);
});

// ─── validateRules ───────────────────────────────────────────
test('validateRules: accepts valid list', () => {
  const r = validateRules([
    { pattern: 'a.com', type: '!', match: 'host' },
    { pattern: 'b.com', type: '1', match: 'host' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.rules.length, 2);
});

test('validateRules: rejects non-array', () => {
  assert.equal(validateRules({ a: 1 }).ok, false);
  assert.equal(validateRules(null).ok, false);
});

test('validateRules: rejects if any rule invalid', () => {
  const r = validateRules([
    { pattern: 'a.com', type: '!', match: 'host' },
    { pattern: 'b.com', type: 'BAD', match: 'host' },
  ]);
  assert.equal(r.ok, false);
  assert.match(r.error, /rule\[1\]/);
});

// ─── validateSettingsPatch ───────────────────────────────────
test('validateSettingsPatch: accepts valid patch', () => {
  const r = validateSettingsPatch({
    idleMinutesBeforeDischarge: 60,
    autoTypeEnabled: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.settings.idleMinutesBeforeDischarge, 60);
  assert.equal(r.settings.autoTypeEnabled, false);
});

test('validateSettingsPatch: rounds to int for int fields', () => {
  const r = validateSettingsPatch({ idleMinutesBeforeDischarge: 60.7 });
  assert.equal(r.ok, true);
  assert.equal(r.settings.idleMinutesBeforeDischarge, 61);
});

test('validateSettingsPatch: rejects out-of-range', () => {
  const r = validateSettingsPatch({ idleMinutesBeforeDischarge: 99999 });
  assert.equal(r.ok, false);
});

test('validateSettingsPatch: rejects non-number for number field', () => {
  const r = validateSettingsPatch({ idleMinutesBeforeDischarge: 'abc' });
  assert.equal(r.ok, false);
});

test('validateSettingsPatch: rejects non-boolean for boolean field', () => {
  const r = validateSettingsPatch({ autoTypeEnabled: 'yes' });
  assert.equal(r.ok, false);
});

test('validateSettingsPatch: silently drops unknown keys', () => {
  const r = validateSettingsPatch({
    autoTypeEnabled: true,
    __proto__: { evil: true },
    randomKey: 'anything',
  });
  assert.equal(r.ok, true);
  assert.equal('randomKey' in r.settings, false);
});

test('validateSettingsPatch: rejects non-object', () => {
  assert.equal(validateSettingsPatch(null).ok, false);
  assert.equal(validateSettingsPatch('x').ok, false);
});

// ─── validateImportConfig ────────────────────────────────────
test('validateImportConfig: accepts partial config', () => {
  const r = validateImportConfig({
    rules: [{ pattern: 'x.com', type: '!', match: 'host' }],
  });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.config.rules));
  assert.equal(r.config.settings, undefined);
});

test('validateImportConfig: accepts empty object', () => {
  const r = validateImportConfig({});
  assert.equal(r.ok, true);
});

test('validateImportConfig: rejects invalid rules', () => {
  const r = validateImportConfig({
    rules: [{ pattern: 'x.com', type: 'BAD', match: 'host' }],
  });
  assert.equal(r.ok, false);
});

test('validateImportConfig: rejects invalid settings', () => {
  const r = validateImportConfig({
    settings: { idleMinutesBeforeDischarge: -10 },
  });
  assert.equal(r.ok, false);
});

test('validateImportConfig: rejects non-object', () => {
  assert.equal(validateImportConfig(null).ok, false);
  assert.equal(validateImportConfig('x').ok, false);
  assert.equal(validateImportConfig([]).ok, true); // arrays are objects
});
