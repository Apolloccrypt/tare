/**
 * @file Tests for lib/matcher.js
 *
 * Run with: node --test tests/matcher.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternalUrl,
  safeParseUrl,
  matchesRule,
  findMatchingRule,
} from '../src/lib/matcher.js';

test('isInternalUrl: chrome:// is internal', () => {
  assert.equal(isInternalUrl('chrome://extensions'), true);
});
test('isInternalUrl: chrome-extension:// is internal', () => {
  assert.equal(isInternalUrl('chrome-extension://abc/foo.html'), true);
});
test('isInternalUrl: about:blank is internal', () => {
  assert.equal(isInternalUrl('about:blank'), true);
});
test('isInternalUrl: edge:// is internal', () => {
  assert.equal(isInternalUrl('edge://newtab'), true);
});
test('isInternalUrl: devtools:// is internal', () => {
  assert.equal(isInternalUrl('devtools://devtools/inspector.html'), true);
});
test('isInternalUrl: https URL is not internal', () => {
  assert.equal(isInternalUrl('https://example.com'), false);
});
test('isInternalUrl: empty string is internal', () => {
  assert.equal(isInternalUrl(''), true);
});
test('isInternalUrl: non-string is internal', () => {
  assert.equal(isInternalUrl(null), true);
  assert.equal(isInternalUrl(undefined), true);
  assert.equal(isInternalUrl(42), true);
});

test('safeParseUrl: valid URL returns URL object', () => {
  const u = safeParseUrl('https://example.com/path?q=1');
  assert.ok(u instanceof URL);
  assert.equal(u.hostname, 'example.com');
});
test('safeParseUrl: invalid URL returns null', () => {
  assert.equal(safeParseUrl('not a url'), null);
  assert.equal(safeParseUrl(''), null);
});

test('matchesRule: host exact match', () => {
  const rule = { pattern: 'example.com', match: 'host' };
  assert.equal(matchesRule('https://example.com/foo', rule), true);
  assert.equal(matchesRule('https://sub.example.com/foo', rule), false);
  assert.equal(matchesRule('https://example.org/foo', rule), false);
});

test('matchesRule: host-ends includes subdomains', () => {
  const rule = { pattern: 'example.com', match: 'host-ends' };
  assert.equal(matchesRule('https://example.com', rule), true);
  assert.equal(matchesRule('https://mail.example.com', rule), true);
  assert.equal(matchesRule('https://a.b.example.com', rule), true);
  assert.equal(matchesRule('https://example.org', rule), false);
  assert.equal(matchesRule('https://notexample.com', rule), false);
});

test('matchesRule: host-starts matches prefix', () => {
  const rule = { pattern: 'admin.', match: 'host-starts' };
  assert.equal(matchesRule('https://admin.example.com', rule), true);
  assert.equal(matchesRule('https://foo.admin.example.com', rule), false);
});

test('matchesRule: url-starts matches path', () => {
  const rule = { pattern: 'google.com/search', match: 'url-starts' };
  assert.equal(matchesRule('https://google.com/search?q=x', rule), true);
  assert.equal(matchesRule('https://google.com/', rule), false);
  assert.equal(matchesRule('https://google.com/maps', rule), false);
});

test('matchesRule: url-contains matches substring', () => {
  const rule = { pattern: 'utm_source', match: 'url-contains' };
  assert.equal(matchesRule('https://example.com/?utm_source=twitter', rule), true);
  assert.equal(matchesRule('https://example.com/', rule), false);
});

test('matchesRule: is case-insensitive', () => {
  const rule = { pattern: 'Example.COM', match: 'host' };
  assert.equal(matchesRule('https://example.com/', rule), true);
});

test('matchesRule: invalid URL returns false', () => {
  const rule = { pattern: 'example.com', match: 'host' };
  assert.equal(matchesRule('not-a-url', rule), false);
});

test('matchesRule: missing rule returns false', () => {
  assert.equal(matchesRule('https://example.com', null), false);
  assert.equal(matchesRule('https://example.com', {}), false);
});

test('findMatchingRule: first match wins', () => {
  const rules = [
    { pattern: 'mail.google.com', type: '!', match: 'host', reason: 'email' },
    { pattern: 'google.com', type: 'A', match: 'host-ends', reason: 'search' },
  ];
  const match = findMatchingRule('https://mail.google.com/', rules);
  assert.equal(match.type, '!');
  assert.equal(match.reason, 'email');
});

test('findMatchingRule: returns null for no match', () => {
  const rules = [{ pattern: 'example.com', type: '!', match: 'host' }];
  assert.equal(findMatchingRule('https://other.com/', rules), null);
});

test('findMatchingRule: internal URLs return null', () => {
  const rules = [{ pattern: 'chrome', type: '!', match: 'host' }];
  assert.equal(findMatchingRule('chrome://extensions', rules), null);
});

test('findMatchingRule: non-array rules returns null', () => {
  assert.equal(findMatchingRule('https://example.com', null), null);
  assert.equal(findMatchingRule('https://example.com', 'oops'), null);
});
