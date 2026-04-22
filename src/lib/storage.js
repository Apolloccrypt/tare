/**
 * @file Storage abstraction.
 *
 * Wraps chrome.storage.local with error handling, quota awareness,
 * and retries. All persistent state goes through this module.
 */

import { log } from './logger.js';

/**
 * Get one or more keys from storage.
 * @param {string|string[]} keys
 * @returns {Promise<Object>}
 */
export async function get(keys) {
  try {
    return await chrome.storage.local.get(keys);
  } catch (err) {
    log.error('storage.get failed:', err);
    return {};
  }
}

/**
 * Set one or more keys.
 * @param {Object} items
 * @returns {Promise<boolean>} true on success
 */
export async function set(items) {
  try {
    await chrome.storage.local.set(items);
    return true;
  } catch (err) {
    // QUOTA_BYTES exceeded → try to prune and retry once
    if (err?.message?.toLowerCase().includes('quota')) {
      log.warn('storage quota exceeded, attempting prune-and-retry');
      await pruneStale();
      try {
        await chrome.storage.local.set(items);
        return true;
      } catch (retryErr) {
        log.error('storage.set retry failed:', retryErr);
        return false;
      }
    }
    log.error('storage.set failed:', err);
    return false;
  }
}

/**
 * Remove keys.
 * @param {string|string[]} keys
 */
export async function remove(keys) {
  try {
    await chrome.storage.local.remove(keys);
    return true;
  } catch (err) {
    log.error('storage.remove failed:', err);
    return false;
  }
}

/**
 * Get approximate bytes in use.
 * @returns {Promise<number>}
 */
export async function getBytesInUse() {
  try {
    return await chrome.storage.local.getBytesInUse(null);
  } catch {
    return 0;
  }
}

/**
 * Pruning strategy on quota exceeded: remove stale tabTypes
 * entries for tabs that no longer exist.
 *
 * Caller handles reinstating normal state after prune.
 */
async function pruneStale() {
  try {
    const { tabTypes = {} } = await chrome.storage.local.get('tabTypes');
    const liveTabs = await chrome.tabs.query({});
    const liveIds = new Set(liveTabs.map(t => String(t.id)));
    const pruned = {};
    for (const [tabId, info] of Object.entries(tabTypes)) {
      if (liveIds.has(tabId)) pruned[tabId] = info;
    }
    await chrome.storage.local.set({ tabTypes: pruned });
    log.info(`pruned ${Object.keys(tabTypes).length - Object.keys(pruned).length} stale tab entries`);
  } catch (err) {
    log.error('prune failed:', err);
  }
}
