/**
 * @file Central state manager.
 *
 * Single mutation surface for all persistent state. Handles:
 * - Load from storage on cold start
 * - Debounced persistence to avoid thrashing
 * - Locking for serialized mutations
 * - Defensive merging with defaults
 */

import { STORAGE_KEYS, DEFAULT_RULES, DEFAULT_SETTINGS, LIMITS } from './constants.js';
import { validateRules, validateSettingsPatch } from './validators.js';
import { get, set } from './storage.js';
import { log } from './logger.js';

const PERSIST_DEBOUNCE_MS = 250;

/**
 * @typedef {Object} TabTypeEntry
 * @property {string} type - One of TYPES values
 * @property {'auto'|'manual'|'default'} source
 * @property {?string} reason
 * @property {number} timestamp
 * @property {?string} url
 * @property {?string} title
 */

/**
 * @typedef {Object} UndoEntry
 * @property {'evict-affine'|'discharge-linear'} kind
 * @property {Array<{tabId: number, url: string, title: string}>} tabs
 * @property {string} source
 * @property {number} at
 */

/**
 * @typedef {Object} Stats
 * @property {number} totalDischarged
 * @property {number} totalAffineEvicted
 * @property {number} totalLinearDischarged
 * @property {number} estimatedMemoryFreedMB
 * @property {number} installedAt
 * @property {?number} lastMemoryPressureAt
 */

const freshStats = () => ({
  totalDischarged: 0,
  totalAffineEvicted: 0,
  totalLinearDischarged: 0,
  estimatedMemoryFreedMB: 0,
  installedAt: Date.now(),
  lastMemoryPressureAt: null,
});

/** @type {Object.<number, TabTypeEntry>} */
let tabTypes = {};
/** @type {Array} */
let rules = [];
/** @type {Object} */
let settings = { ...DEFAULT_SETTINGS };
/** @type {Stats} */
let stats = freshStats();
/** @type {UndoEntry[]} */
let undoStack = [];

let loaded = false;
let loadPromise = null;
let persistTimer = null;
let mutationLock = Promise.resolve();

/**
 * Ensure state is loaded from storage before use.
 * Safe to call multiple times; deduplicates.
 */
export async function ensureLoaded() {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const stored = await get([
        STORAGE_KEYS.TAB_TYPES,
        STORAGE_KEYS.RULES,
        STORAGE_KEYS.SETTINGS,
        STORAGE_KEYS.STATS,
        STORAGE_KEYS.UNDO_STACK,
      ]);

      tabTypes = (stored[STORAGE_KEYS.TAB_TYPES] && typeof stored[STORAGE_KEYS.TAB_TYPES] === 'object')
        ? stored[STORAGE_KEYS.TAB_TYPES] : {};

      const rawRules = stored[STORAGE_KEYS.RULES];
      if (Array.isArray(rawRules) && rawRules.length > 0) {
        const res = validateRules(rawRules);
        rules = res.ok ? res.rules : [...DEFAULT_RULES];
        if (!res.ok) log.warn('stored rules invalid, reverting to defaults:', res.error);
      } else {
        rules = [...DEFAULT_RULES];
      }

      const rawSettings = stored[STORAGE_KEYS.SETTINGS] || {};
      let needsMigration = false;
      if ('memoryPressureThresholdPct' in rawSettings && !('systemRamThresholdPct' in rawSettings)) {
        rawSettings.systemRamThresholdPct = rawSettings.memoryPressureThresholdPct;
        delete rawSettings.memoryPressureThresholdPct;
        needsMigration = true;
      }
      const sRes = validateSettingsPatch(rawSettings);
      settings = { ...DEFAULT_SETTINGS, ...(sRes.ok ? sRes.settings : {}) };

      const rawStats = stored[STORAGE_KEYS.STATS] || {};
      stats = { ...freshStats(), ...rawStats };
      if (!stats.installedAt) stats.installedAt = Date.now();

      const rawUndo = stored[STORAGE_KEYS.UNDO_STACK];
      undoStack = Array.isArray(rawUndo) ? rawUndo.slice(0, LIMITS.UNDO_MAX) : [];

      // Migrate default rule sets for users upgrading from previous versions.
      // Check raw stored value — not merged settings — so the default from
      // DEFAULT_SETTINGS doesn't mask the absence of the key.
      const rawDefaultsVersion = rawSettings.defaultsVersion ?? 1;
      if (rawDefaultsVersion < 2) {
        const newRules = DEFAULT_RULES.filter(r =>
          !rules.some(e => e.pattern === r.pattern && e.match === r.match)
        );
        if (newRules.length > 0) {
          rules = [...rules, ...newRules];
          log.info(`migrated ${newRules.length} new default rules (v1→v2)`);
        }
        needsMigration = true;
      }

      loaded = true;
      if (needsMigration) {
        persistInner().catch(err => log.error('migration persist failed:', err));
      }
      log.debug('state loaded:', {
        tabs: Object.keys(tabTypes).length,
        rules: rules.length,
        undo: undoStack.length,
      });
    } catch (err) {
      log.error('state load failed, starting fresh:', err);
      tabTypes = {};
      rules = [...DEFAULT_RULES];
      settings = { ...DEFAULT_SETTINGS };
      stats = freshStats();
      undoStack = [];
      loaded = true;
    }
  })();
  return loadPromise;
}

/**
 * Force persist immediately (bypasses debounce).
 */
export async function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  return persistInner();
}

async function persistInner() {
  return set({
    [STORAGE_KEYS.TAB_TYPES]: tabTypes,
    [STORAGE_KEYS.RULES]: rules,
    [STORAGE_KEYS.SETTINGS]: settings,
    [STORAGE_KEYS.STATS]: stats,
    [STORAGE_KEYS.UNDO_STACK]: undoStack,
  });
}

/**
 * Debounced persist.
 */
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistInner().catch(err => log.error('persist failed:', err));
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Run a mutation serially (no concurrent mutations).
 * @template T
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function withLock(fn) {
  const prev = mutationLock;
  let release;
  mutationLock = new Promise(r => { release = r; });
  try {
    await prev;
    const result = await fn();
    return result;
  } finally {
    release();
  }
}

// ─── Getters ──────────────────────────────────────────────────

export function getTabType(tabId) {
  return tabTypes[tabId];
}

export function getAllTabTypes() {
  return tabTypes;
}

export function getRules() {
  return rules;
}

export function getSettings() {
  return settings;
}

export function getStats() {
  return { ...stats };
}

export function getUndoStack() {
  return undoStack;
}

export function peekUndo() {
  return undoStack[0] || null;
}

// ─── Mutators (all schedule persist) ──────────────────────────

export function setTabType(tabId, entry) {
  tabTypes[tabId] = entry;
  schedulePersist();
}

export function deleteTabType(tabId) {
  if (tabId in tabTypes) {
    delete tabTypes[tabId];
    schedulePersist();
  }
}

/**
 * Prune tab entries for tabs that no longer exist.
 * @param {Set<number>} liveTabIds
 * @returns {number} count pruned
 */
export function pruneStaleTabTypes(liveTabIds) {
  let pruned = 0;
  for (const key of Object.keys(tabTypes)) {
    const id = Number(key);
    if (!liveTabIds.has(id)) {
      delete tabTypes[key];
      pruned++;
    }
  }
  if (pruned > 0) schedulePersist();
  return pruned;
}

export function setRules(newRules) {
  rules = newRules;
  schedulePersist();
}

export function addRule(rule) {
  rules = [rule, ...rules];
  if (rules.length > LIMITS.MAX_RULES) rules = rules.slice(0, LIMITS.MAX_RULES);
  schedulePersist();
}

export function removeRuleAt(index) {
  if (index < 0 || index >= rules.length) return false;
  rules = rules.filter((_, i) => i !== index);
  schedulePersist();
  return true;
}

export function removeRuleByKey(pattern, match) {
  const before = rules.length;
  rules = rules.filter(r => !(r.pattern === pattern && r.match === match));
  if (rules.length !== before) {
    schedulePersist();
    return true;
  }
  return false;
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  schedulePersist();
}

export function resetRules() {
  rules = [...DEFAULT_RULES];
  schedulePersist();
}

export function resetStats() {
  const installedAt = stats.installedAt;
  stats = { ...freshStats(), installedAt };
  schedulePersist();
}

/**
 * Increment stat counters atomically.
 */
export function incrementStats(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (k in stats && typeof stats[k] === 'number' && typeof v === 'number') {
      stats[k] = Math.max(0, stats[k] + v);
    } else if (k in stats) {
      stats[k] = v;
    }
  }
  schedulePersist();
}

export function pushUndo(entry) {
  undoStack.unshift({ ...entry, at: Date.now() });
  if (undoStack.length > LIMITS.UNDO_MAX) {
    undoStack = undoStack.slice(0, LIMITS.UNDO_MAX);
  }
  schedulePersist();
}

/**
 * Remove undo entries older than N seconds.
 * @param {number} maxAgeSec
 * @returns {number} pruned count
 */
export function pruneUndo(maxAgeSec) {
  const cutoff = Date.now() - maxAgeSec * 1000;
  const before = undoStack.length;
  undoStack = undoStack.filter(u => u.at > cutoff);
  const pruned = before - undoStack.length;
  if (pruned > 0) schedulePersist();
  return pruned;
}

export function popUndo() {
  const entry = undoStack.shift();
  if (entry) schedulePersist();
  return entry || null;
}

/**
 * Increment matchCount and set lastMatchedAt for a rule.
 * Called by type-engine.js when a rule fires during classification.
 * @param {number} index - position in the rules array
 */
export function incrementRuleMatch(index) {
  if (index < 0 || index >= rules.length) return;
  const rule = rules[index];
  rules[index] = {
    ...rule,
    matchCount: (rule.matchCount ?? 0) + 1,
    lastMatchedAt: Date.now(),
  };
  schedulePersist();
}

/**
 * Clear matchCount and lastMatchedAt for a rule.
 * @param {number} index
 * @returns {boolean} true if index was valid
 */
export function resetRuleStats(index) {
  if (index < 0 || index >= rules.length) return false;
  rules[index] = { ...rules[index], matchCount: 0, lastMatchedAt: null };
  schedulePersist();
  return true;
}

/**
 * Replace entire state (used by import).
 */
export function replaceState({ rules: newRules, settings: newSettings }) {
  if (newRules) rules = newRules;
  if (newSettings) settings = { ...DEFAULT_SETTINGS, ...newSettings };
  schedulePersist();
}
