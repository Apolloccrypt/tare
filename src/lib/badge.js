/**
 * @file Badge service.
 *
 * Updates the extension action badge per tab to show its type.
 * Handles Chrome API errors gracefully (tabs may close between
 * the read and the set).
 */

import { TYPE_META } from './constants.js';
import * as State from './state.js';
import { log } from './logger.js';

/**
 * Set the badge for a single tab.
 * @param {number} tabId
 */
export async function updateTabBadge(tabId) {
  const entry = State.getTabType(tabId);
  const text = entry?.type || '';
  const color = entry ? TYPE_META[entry.type]?.color || '#888' : '#888';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
    }
  } catch (err) {
    // Tab closed or not yet available; silent
    log.debug(`badge update failed for tab ${tabId}:`, err?.message);
  }
}

/**
 * Clear badge for a tab.
 * @param {number} tabId
 */
export async function clearTabBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
  } catch {
    // ignored
  }
}

/**
 * Refresh all currently open tab badges.
 * Parallel for speed.
 */
export async function refreshAllBadges() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(t => updateTabBadge(t.id)));
  } catch (err) {
    log.warn('refreshAllBadges failed:', err?.message);
  }
}
