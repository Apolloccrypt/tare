/**
 * @file Constants and type definitions for Tare.
 *
 * Single source of truth for type symbols, metadata, default rules,
 * default settings, storage keys, and message types.
 *
 * All other modules import from here.
 */

/**
 * Lifecycle type symbols.
 *
 * Based on Jean-Yves Girard's linear logic (1987):
 * - REUSABLE (!): exponential modality, can be duplicated freely
 * - LINEAR (1):   exactly-once resource
 * - AFFINE (A):   at-most-once resource (may be discarded without use)
 * - NEUTRAL (·):  no discipline applied
 *
 * @readonly
 * @enum {string}
 */
export const TYPES = Object.freeze({
  REUSABLE: '!',
  LINEAR: '1',
  AFFINE: 'A',
  NEUTRAL: '·',
});

/** All valid type values, for validation. */
export const VALID_TYPES = Object.freeze(Object.values(TYPES));

/**
 * Display metadata per type.
 * @type {Object.<string, {cls: string, label: string, full: string, color: string}>}
 */
export const TYPE_META = Object.freeze({
  '!': { cls: 'gold', label: 'keep', full: 'reusable', color: '#a67c00' },
  '1': { cls: 'blue', label: 'use', full: 'linear', color: '#3a6ea5' },
  'A': { cls: 'coral', label: 'drop', full: 'affine', color: '#b8472e' },
  '·': { cls: 'neutral', label: '', full: 'neutral', color: '#9b8b6e' },
});

/** Display order (reusable first, neutral last). */
export const TYPE_ORDER = Object.freeze(['!', '1', 'A', '·']);

/**
 * URL matching strategies for auto-type rules.
 * @readonly
 * @enum {string}
 */
export const MATCH_STRATEGIES = Object.freeze({
  HOST: 'host',
  HOST_ENDS: 'host-ends',
  HOST_STARTS: 'host-starts',
  URL_STARTS: 'url-starts',
  URL_CONTAINS: 'url-contains',
});

export const VALID_MATCH_STRATEGIES = Object.freeze(Object.values(MATCH_STRATEGIES));

/**
 * Default auto-type rules. First match wins.
 * User rules are prepended to this list.
 */
export const DEFAULT_RULES = Object.freeze([
  // === Reusable (!) — critical sessions ===
  { pattern: 'mail.google.com', type: '!', reason: 'email', match: 'host' },
  { pattern: 'outlook.live.com', type: '!', reason: 'email', match: 'host' },
  { pattern: 'outlook.office.com', type: '!', reason: 'email', match: 'host' },
  { pattern: 'mail.proton.me', type: '!', reason: 'email', match: 'host' },
  { pattern: 'mail.yahoo.com', type: '!', reason: 'email', match: 'host' },
  { pattern: 'calendar.google.com', type: '!', reason: 'calendar', match: 'host' },
  { pattern: 'outlook.office.com/calendar', type: '!', reason: 'calendar', match: 'url-starts' },
  { pattern: 'claude.ai', type: '!', reason: 'ai-session', match: 'host-ends' },
  { pattern: 'chatgpt.com', type: '!', reason: 'ai-session', match: 'host-ends' },
  { pattern: 'chat.openai.com', type: '!', reason: 'ai-session', match: 'host' },
  { pattern: 'gemini.google.com', type: '!', reason: 'ai-session', match: 'host' },
  { pattern: 'perplexity.ai', type: '!', reason: 'ai-session', match: 'host-ends' },
  { pattern: 'notion.so', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'linear.app', type: '!', reason: 'work-tool', match: 'host' },
  { pattern: 'figma.com', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'slack.com', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'airtable.com', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'asana.com', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'monday.com', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'trello.com', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'clickup.com', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'atlassian.net', type: '!', reason: 'work-tool', match: 'host-ends' },
  { pattern: 'paypal.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'stripe.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'revolut.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'wise.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'coinbase.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'chase.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'wellsfargo.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'bankofamerica.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'hsbc.com', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'barclays.co.uk', type: '!', reason: 'banking', match: 'host-ends' },
  { pattern: 'console.cloud.google.com', type: '!', reason: 'cloud', match: 'host' },
  { pattern: 'portal.azure.com', type: '!', reason: 'cloud', match: 'host' },
  { pattern: 'aws.amazon.com', type: '!', reason: 'cloud', match: 'host' },

  // === Linear (1) — use once, then done ===
  { pattern: 'google.com/search', type: '1', reason: 'search', match: 'url-starts' },
  { pattern: 'duckduckgo.com', type: '1', reason: 'search', match: 'host' },
  { pattern: 'bing.com/search', type: '1', reason: 'search', match: 'url-starts' },
  { pattern: 'kagi.com', type: '1', reason: 'search', match: 'host-ends' },
  { pattern: 'wikipedia.org', type: '1', reason: 'reference', match: 'host-ends' },
  { pattern: 'stackoverflow.com', type: '1', reason: 'reference', match: 'host-ends' },
  { pattern: 'stackexchange.com', type: '1', reason: 'reference', match: 'host-ends' },
  { pattern: 'developer.mozilla.org', type: '1', reason: 'docs', match: 'host' },
  { pattern: 'docs.anthropic.com', type: '1', reason: 'docs', match: 'host' },
  { pattern: 'docs.python.org', type: '1', reason: 'docs', match: 'host' },
  { pattern: 'reactjs.org', type: '1', reason: 'docs', match: 'host' },
  { pattern: 'react.dev', type: '1', reason: 'docs', match: 'host' },
  { pattern: 'nodejs.org', type: '1', reason: 'docs', match: 'host-ends' },
  { pattern: 'arxiv.org', type: '1', reason: 'paper', match: 'host-ends' },
  { pattern: 'medium.com', type: '1', reason: 'article', match: 'host-ends' },
  { pattern: 'substack.com', type: '1', reason: 'article', match: 'host-ends' },

  // === Affine (A) — consumable content ===
  { pattern: 'twitter.com', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'x.com', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'reddit.com', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'facebook.com', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'instagram.com', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'tiktok.com', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'threads.net', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'bsky.app', type: 'A', reason: 'social-feed', match: 'host-ends' },
  { pattern: 'news.ycombinator.com', type: 'A', reason: 'news', match: 'host' },
  { pattern: 'cnn.com', type: 'A', reason: 'news', match: 'host-ends' },
  { pattern: 'bbc.com', type: 'A', reason: 'news', match: 'host-ends' },
  { pattern: 'bbc.co.uk', type: 'A', reason: 'news', match: 'host-ends' },
  { pattern: 'nytimes.com', type: 'A', reason: 'news', match: 'host-ends' },
  { pattern: 'theguardian.com', type: 'A', reason: 'news', match: 'host-ends' },
  { pattern: 'reuters.com', type: 'A', reason: 'news', match: 'host-ends' },
]);

/**
 * @typedef {Object} Settings
 * @property {boolean} autoTypeEnabled
 * @property {boolean} protectReusable
 * @property {boolean} evictAffineFirst
 * @property {number}  idleMinutesBeforeDischarge
 * @property {number}  memoryPressureThresholdPct
 * @property {boolean} enableMemoryPressureCheck
 * @property {boolean} showNotifications
 * @property {number}  averageTabMB
 * @property {number}  undoWindowSeconds
 * @property {number}  tickIntervalMinutes
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  autoTypeEnabled: true,
  protectReusable: true,
  evictAffineFirst: true,
  idleMinutesBeforeDischarge: 30,
  memoryPressureThresholdPct: 85,
  enableMemoryPressureCheck: true,
  showNotifications: true,
  averageTabMB: 85,
  undoWindowSeconds: 30,
  tickIntervalMinutes: 2,
});

/**
 * Valid ranges for numeric settings. Used by validator.
 */
export const SETTINGS_BOUNDS = Object.freeze({
  idleMinutesBeforeDischarge: { min: 1, max: 1440, int: true },
  memoryPressureThresholdPct: { min: 50, max: 99, int: true },
  averageTabMB: { min: 10, max: 500, int: true },
  undoWindowSeconds: { min: 5, max: 300, int: true },
  tickIntervalMinutes: { min: 1, max: 60, int: true },
});

/** Storage keys for chrome.storage.local. */
export const STORAGE_KEYS = Object.freeze({
  TAB_TYPES: 'tabTypes',
  RULES: 'rules',
  SETTINGS: 'settings',
  STATS: 'stats',
  UNDO_STACK: 'undoStack',
});

/** Message types between background and UI pages. */
export const MSG = Object.freeze({
  GET_STATE: 'GET_STATE',
  SET_TYPE: 'SET_TYPE',
  ADD_RULE: 'ADD_RULE',
  REMOVE_RULE: 'REMOVE_RULE',
  UPDATE_RULE: 'UPDATE_RULE',
  REORDER_RULES: 'REORDER_RULES',
  GET_RULES: 'GET_RULES',
  RESET_RULES: 'RESET_RULES',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  DISCHARGE_AFFINE: 'DISCHARGE_AFFINE',
  DISCHARGE_OLD_LINEAR: 'DISCHARGE_OLD_LINEAR',
  UNDO: 'UNDO',
  RESET_STATS: 'RESET_STATS',
  EXPORT_CONFIG: 'EXPORT_CONFIG',
  IMPORT_CONFIG: 'IMPORT_CONFIG',
  PING: 'PING',
});

/** Alarm names. */
export const ALARMS = Object.freeze({
  TICK: 'tare-tick',
  UNDO_EXPIRE: 'tare-undo-expire',
  CLEANUP: 'tare-cleanup',
});

/** Command names (must match manifest.json commands). */
export const COMMANDS = Object.freeze({
  DROP_AFFINE: 'drop-affine',
  DISCHARGE_LINEAR: 'discharge-linear',
  CYCLE_CURRENT: 'cycle-current',
  UNDO_LAST: 'undo-last',
});

/** Context menu IDs. */
export const MENU_IDS = Object.freeze({
  ROOT: 'tare-root',
  TYPE_PREFIX: 'tare-type-',
  OPEN_OPTIONS: 'tare-open-options',
  SEPARATOR: 'tare-sep',
});

/** Internal limits. */
export const LIMITS = Object.freeze({
  UNDO_MAX: 10,
  MAX_RULES: 500,
  MAX_PATTERN_LENGTH: 256,
  MAX_REASON_LENGTH: 64,
  MAX_TAB_TYPES_STALE_DAYS: 7,
  MESSAGE_TIMEOUT_MS: 5000,
});

export const VERSION = '1.0.0';
