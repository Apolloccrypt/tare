/**
 * @file Eviction engine.
 *
 * Handles discharge operations:
 * - evictAffine: drop all affine-typed tabs
 * - dischargeOldLinear: drop linear tabs past idle threshold
 * - undoLast: restore last discharged batch
 *
 * All operations push to the undo stack and update stats.
 */

import { TYPES } from './constants.js';
import * as State from './state.js';
import { log } from './logger.js';

/**
 * @typedef {Object} DischargeResult
 * @property {number} count
 * @property {number} mbFreed
 * @property {Array} tabs
 */

/**
 * Safely attempt to discard a tab.
 * Returns true if discarded, false otherwise.
 *
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function safeDiscardTab(tabId) {
  try {
    await chrome.tabs.discard(tabId);
    return true;
  } catch (err) {
    log.debug(`discard tab ${tabId} failed:`, err?.message || err);
    return false;
  }
}

/**
 * Evict all affine-typed tabs that are eligible.
 *
 * @param {string} [source] - 'user' | 'shortcut' | 'memory-pressure'
 * @returns {Promise<DischargeResult>}
 */
export async function evictAffine(source = 'user') {
  await State.ensureLoaded();
  const tabs = await chrome.tabs.query({});
  const settings = State.getSettings();
  const discharged = [];

  for (const tab of tabs) {
    const t = State.getTabType(tab.id);
    if (!t || t.type !== TYPES.AFFINE) continue;
    if (tab.active || tab.pinned || tab.discarded) continue;

    const ok = await safeDiscardTab(tab.id);
    if (ok) {
      discharged.push({
        tabId: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        windowId: tab.windowId,
      });
    }
  }

  if (discharged.length > 0) {
    const mb = discharged.length * settings.averageTabMB;
    State.incrementStats({
      totalAffineEvicted: discharged.length,
      totalDischarged: discharged.length,
      estimatedMemoryFreedMB: mb,
    });
    State.pushUndo({
      kind: 'evict-affine',
      tabs: discharged,
      source,
    });
    await State.persistNow();
  }

  return {
    count: discharged.length,
    mbFreed: discharged.length * settings.averageTabMB,
    tabs: discharged,
  };
}

/**
 * Discharge linear tabs past their idle threshold.
 *
 * @param {string} [source]
 * @returns {Promise<DischargeResult>}
 */
export async function dischargeOldLinear(source = 'auto') {
  await State.ensureLoaded();
  const settings = State.getSettings();
  const maxAge = settings.idleMinutesBeforeDischarge * 60 * 1000;
  const now = Date.now();
  const tabs = await chrome.tabs.query({});
  const discharged = [];

  for (const tab of tabs) {
    const t = State.getTabType(tab.id);
    if (!t || t.type !== TYPES.LINEAR) continue;
    if (tab.active || tab.pinned || tab.discarded) continue;
    if (now - t.timestamp <= maxAge) continue;

    const ok = await safeDiscardTab(tab.id);
    if (ok) {
      discharged.push({
        tabId: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        windowId: tab.windowId,
      });
    }
  }

  if (discharged.length > 0) {
    const mb = discharged.length * settings.averageTabMB;
    State.incrementStats({
      totalLinearDischarged: discharged.length,
      totalDischarged: discharged.length,
      estimatedMemoryFreedMB: mb,
    });
    State.pushUndo({
      kind: 'discharge-linear',
      tabs: discharged,
      source,
    });
    await State.persistNow();
  }

  return {
    count: discharged.length,
    mbFreed: discharged.length * settings.averageTabMB,
    tabs: discharged,
  };
}

/**
 * Undo the most recent discharge.
 *
 * @returns {Promise<{ok: boolean, restored?: number, kind?: string, reason?: string}>}
 */
export async function undoLast() {
  await State.ensureLoaded();
  const settings = State.getSettings();
  State.pruneUndo(settings.undoWindowSeconds);

  const entry = State.popUndo();
  if (!entry) return { ok: false, reason: 'nothing-to-undo' };

  let restored = 0;
  for (const info of entry.tabs) {
    const ok = await reloadDischargedTab(info);
    if (ok) restored++;
  }

  // Reverse stats
  State.incrementStats({
    totalDischarged: -entry.tabs.length,
    estimatedMemoryFreedMB: -entry.tabs.length * settings.averageTabMB,
  });
  if (entry.kind === 'evict-affine') {
    State.incrementStats({ totalAffineEvicted: -entry.tabs.length });
  } else if (entry.kind === 'discharge-linear') {
    State.incrementStats({ totalLinearDischarged: -entry.tabs.length });
  }

  await State.persistNow();
  return { ok: true, restored, kind: entry.kind };
}

/**
 * Try to reload a tab; fall back to opening a new one if it was closed.
 *
 * @param {{tabId: number, url: string, windowId?: number}} info
 * @returns {Promise<boolean>}
 */
async function reloadDischargedTab(info) {
  try {
    await chrome.tabs.reload(info.tabId);
    return true;
  } catch {
    // Tab was closed; open a new one at the URL
    if (info.url) {
      try {
        await chrome.tabs.create({ url: info.url, active: false });
        return true;
      } catch (err) {
        log.warn('could not restore discharged tab:', err?.message);
      }
    }
    return false;
  }
}

/**
 * Read system memory usage.
 *
 * @returns {Promise<number | null>} Percentage 0-100, or null on failure.
 */
export async function getMemoryPressurePct() {
  try {
    if (!chrome.system?.memory?.getInfo) return null;
    const info = await chrome.system.memory.getInfo();
    if (!info?.capacity) return null;
    const pct = ((info.capacity - info.availableCapacity) / info.capacity) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  } catch (err) {
    log.debug('memory info unavailable:', err?.message);
    return null;
  }
}
