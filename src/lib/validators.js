/**
 * @file Input validators.
 *
 * Centralized validation for all user-provided or external data.
 * These are the trust boundary of the extension.
 */

import {
  VALID_TYPES,
  VALID_MATCH_STRATEGIES,
  SETTINGS_BOUNDS,
  LIMITS,
  DEFAULT_SETTINGS,
} from './constants.js';

/**
 * Check if value is a non-empty string within max length.
 * @param {*} v
 * @param {number} max
 * @returns {boolean}
 */
export function isValidString(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

/**
 * Validate and normalize a single rule.
 *
 * @param {*} rule - Raw input, possibly from user form or imported JSON.
 * @returns {{ok: true, rule: Object} | {ok: false, error: string}}
 */
export function validateRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return { ok: false, error: 'rule must be an object' };
  }

  const pattern = typeof rule.pattern === 'string' ? rule.pattern.trim().toLowerCase() : '';
  if (!isValidString(pattern, LIMITS.MAX_PATTERN_LENGTH)) {
    return { ok: false, error: `pattern must be 1-${LIMITS.MAX_PATTERN_LENGTH} chars` };
  }

  // Pattern must not contain protocol (we only match hosts/paths)
  if (pattern.includes('://')) {
    return { ok: false, error: 'pattern should not include protocol (e.g. use "example.com" not "https://example.com")' };
  }

  // Pattern cannot contain whitespace
  if (/\s/.test(pattern)) {
    return { ok: false, error: 'pattern cannot contain whitespace' };
  }

  const type = rule.type;
  if (!VALID_TYPES.includes(type)) {
    return { ok: false, error: `type must be one of ${VALID_TYPES.join(' ')}` };
  }

  const match = rule.match || 'host-ends';
  if (!VALID_MATCH_STRATEGIES.includes(match)) {
    return { ok: false, error: `match must be one of ${VALID_MATCH_STRATEGIES.join(', ')}` };
  }

  const reason = rule.reason != null
    ? (typeof rule.reason === 'string' ? rule.reason.trim().slice(0, LIMITS.MAX_REASON_LENGTH) : '')
    : null;

  return {
    ok: true,
    rule: {
      pattern,
      type,
      match,
      reason: reason || null,
    },
  };
}

/**
 * Validate and normalize an array of rules.
 *
 * @param {*} rules
 * @returns {{ok: true, rules: Array} | {ok: false, error: string}}
 */
export function validateRules(rules) {
  if (!Array.isArray(rules)) {
    return { ok: false, error: 'rules must be an array' };
  }
  if (rules.length > LIMITS.MAX_RULES) {
    return { ok: false, error: `max ${LIMITS.MAX_RULES} rules` };
  }
  const normalized = [];
  for (let i = 0; i < rules.length; i++) {
    const res = validateRule(rules[i]);
    if (!res.ok) return { ok: false, error: `rule[${i}]: ${res.error}` };
    normalized.push(res.rule);
  }
  return { ok: true, rules: normalized };
}

/**
 * Validate and normalize a settings patch.
 *
 * Only known keys are accepted. Numeric bounds are enforced.
 *
 * @param {*} patch
 * @returns {{ok: true, settings: Object} | {ok: false, error: string}}
 */
export function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object') {
    return { ok: false, error: 'settings patch must be an object' };
  }
  const normalized = {};
  for (const [key, val] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue; // silently drop unknown
    const bounds = SETTINGS_BOUNDS[key];
    if (bounds) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        return { ok: false, error: `${key} must be a finite number` };
      }
      const v = bounds.int ? Math.round(val) : val;
      if (v < bounds.min || v > bounds.max) {
        return { ok: false, error: `${key} must be between ${bounds.min} and ${bounds.max}` };
      }
      normalized[key] = v;
    } else {
      // Boolean setting
      if (typeof val !== 'boolean') {
        return { ok: false, error: `${key} must be a boolean` };
      }
      normalized[key] = val;
    }
  }
  return { ok: true, settings: normalized };
}

/**
 * Validate an imported config blob.
 *
 * @param {*} config
 * @returns {{ok: true, config: {rules?: Array, settings?: Object}} | {ok: false, error: string}}
 */
export function validateImportConfig(config) {
  if (!config || typeof config !== 'object') {
    return { ok: false, error: 'config must be an object' };
  }
  const out = {};
  if ('rules' in config) {
    const r = validateRules(config.rules);
    if (!r.ok) return { ok: false, error: `rules: ${r.error}` };
    out.rules = r.rules;
  }
  if ('settings' in config) {
    const s = validateSettingsPatch(config.settings);
    if (!s.ok) return { ok: false, error: `settings: ${s.error}` };
    out.settings = s.settings;
  }
  return { ok: true, config: out };
}

/**
 * Validate a type value.
 * @param {*} type
 * @returns {boolean}
 */
export function isValidType(type) {
  return VALID_TYPES.includes(type);
}
