/**
 * @file Type engine.
 *
 * Higher-level operations on tab types:
 * - Classify a tab (apply auto-type rules or respect manual)
 * - Set/update types with proper source tagging
 * - Cycle types
 *
 * Wraps state.js mutations with validation and business rules.
 */

import { TYPES, TYPE_ORDER } from './constants.js';
import { findMatchingRule, isInternalUrl } from './matcher.js';
import { isValidType } from './validators.js';
import * as State from './state.js';

/**
 * Classify a tab based on current rules.
 * Preserves manual tags unless force is true.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {{force?: boolean}} opts
 * @returns {?string} the assigned type, or null if skipped
 */
export function classifyTab(tab, { force = false } = {}) {
  if (!tab || typeof tab.id !== 'number') return null;
  const url = tab.url || tab.pendingUrl || '';
  if (!url || isInternalUrl(url)) {
    State.deleteTabType(tab.id);
    return null;
  }

  const existing = State.getTabType(tab.id);
  const settings = State.getSettings();

  // Preserve manual types
  if (existing && existing.source === 'manual' && !force) {
    // But keep URL/title fresh for display
    if (existing.url !== url || existing.title !== tab.title) {
      State.setTabType(tab.id, {
        ...existing,
        url,
        title: tab.title || existing.title,
      });
    }
    return existing.type;
  }

  if (!settings.autoTypeEnabled) {
    if (!existing) {
      State.setTabType(tab.id, {
        type: TYPES.NEUTRAL,
        source: 'default',
        reason: null,
        timestamp: Date.now(),
        url,
        title: tab.title || null,
      });
    }
    return existing?.type || TYPES.NEUTRAL;
  }

  const rule = findMatchingRule(url, State.getRules());
  if (rule) {
    State.setTabType(tab.id, {
      type: rule.type,
      source: 'auto',
      reason: rule.reason,
      timestamp: Date.now(),
      url,
      title: tab.title || null,
    });
    return rule.type;
  }

  State.setTabType(tab.id, {
    type: TYPES.NEUTRAL,
    source: 'default',
    reason: null,
    timestamp: Date.now(),
    url,
    title: tab.title || null,
  });
  return TYPES.NEUTRAL;
}

/**
 * Manually assign a type to a tab.
 *
 * @param {number} tabId
 * @param {string} type
 * @param {chrome.tabs.Tab} [tab] - optional tab object to stamp URL/title
 * @returns {boolean}
 */
export function setManualType(tabId, type, tab) {
  if (!isValidType(type)) return false;
  const existing = State.getTabType(tabId) || {};
  State.setTabType(tabId, {
    type,
    source: 'manual',
    reason: 'user-tagged',
    timestamp: Date.now(),
    url: tab?.url || existing.url || null,
    title: tab?.title || existing.title || null,
  });
  return true;
}

/**
 * Cycle a tab's type through the type order.
 *
 * @param {number} tabId
 * @param {chrome.tabs.Tab} [tab]
 * @returns {?string} new type, or null if failed
 */
export function cycleType(tabId, tab) {
  const existing = State.getTabType(tabId);
  const currentIdx = existing ? TYPE_ORDER.indexOf(existing.type) : -1;
  const nextIdx = (currentIdx + 1) % TYPE_ORDER.length;
  const next = TYPE_ORDER[nextIdx];
  if (setManualType(tabId, next, tab)) return next;
  return null;
}

/**
 * Touch (update) timestamp for a tab. Used when tab is activated
 * to reset the linear-idle clock.
 *
 * @param {number} tabId
 */
export function touchTab(tabId) {
  const entry = State.getTabType(tabId);
  if (entry && entry.type === TYPES.LINEAR) {
    State.setTabType(tabId, { ...entry, timestamp: Date.now() });
  }
}
