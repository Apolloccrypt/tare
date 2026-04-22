/**
 * @file Tare background service worker.
 *
 * Orchestrates Chrome extension events and delegates to lib modules.
 * All business logic lives in lib/ — this file only wires events.
 */

import {
  TYPES, TYPE_ORDER, MSG, ALARMS, COMMANDS, MENU_IDS, LIMITS, VERSION,
} from './lib/constants.js';
import * as State from './lib/state.js';
import * as TypeEngine from './lib/type-engine.js';
import * as Eviction from './lib/eviction.js';
import * as Badge from './lib/badge.js';
import { notify } from './lib/notifier.js';
import {
  validateRule, validateImportConfig, validateSettingsPatch, isValidType,
} from './lib/validators.js';
import { log, setLogLevel } from './lib/logger.js';

// ─── Initialization ──────────────────────────────────────────

/**
 * Install / update handler.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  log.info(`Tare v${VERSION} — ${details.reason}`);
  await State.ensureLoaded();
  await setupContextMenus();
  await resetTickAlarm();
  await Badge.refreshAllBadges();

  // Open onboarding on fresh install only
  if (details.reason === 'install') {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
    } catch (err) {
      log.warn('could not open onboarding:', err?.message);
    }
  }
});

/**
 * Startup handler (browser restart).
 */
chrome.runtime.onStartup.addListener(async () => {
  log.info('startup');
  await State.ensureLoaded();
  await resetTickAlarm();
  await Badge.refreshAllBadges();
});

/**
 * (Re)register context menus from current state.
 */
async function setupContextMenus() {
  try {
    await new Promise(r => chrome.contextMenus.removeAll(r));
    chrome.contextMenus.create({
      id: MENU_IDS.ROOT,
      title: 'Tare · set tab type',
      contexts: ['page', 'action'],
    });
    const labels = {
      REUSABLE: '●  Session — always keep',
      LINEAR:   '◐  Reference — close after idle',
      AFFINE:   '○  Feed — drop first',
      NEUTRAL:  '·  Other — default behavior',
    };
    for (const [key, label] of Object.entries(labels)) {
      chrome.contextMenus.create({
        id: `${MENU_IDS.TYPE_PREFIX}${key}`,
        parentId: MENU_IDS.ROOT,
        title: label,
        contexts: ['page', 'action'],
      });
    }
    chrome.contextMenus.create({
      id: MENU_IDS.SEPARATOR,
      parentId: MENU_IDS.ROOT,
      type: 'separator',
      contexts: ['page', 'action'],
    });
    chrome.contextMenus.create({
      id: MENU_IDS.OPEN_OPTIONS,
      parentId: MENU_IDS.ROOT,
      title: 'Open settings…',
      contexts: ['page', 'action'],
    });
  } catch (err) {
    log.warn('context menu setup failed:', err?.message);
  }
}

async function resetTickAlarm() {
  const settings = State.getSettings();
  try {
    await chrome.alarms.clear(ALARMS.TICK);
    await chrome.alarms.create(ALARMS.TICK, {
      periodInMinutes: Math.max(1, settings.tickIntervalMinutes),
    });
    // Cleanup alarm every hour
    await chrome.alarms.clear(ALARMS.CLEANUP);
    await chrome.alarms.create(ALARMS.CLEANUP, { periodInMinutes: 60 });
  } catch (err) {
    log.warn('alarm setup failed:', err?.message);
  }
}

// ─── Tab lifecycle ───────────────────────────────────────────

chrome.tabs.onCreated.addListener(async (tab) => {
  await State.ensureLoaded();
  TypeEngine.classifyTab(tab);
  Badge.updateTabBadge(tab.id);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.title && !changeInfo.status) return;
  await State.ensureLoaded();
  if (changeInfo.url || changeInfo.title) {
    TypeEngine.classifyTab(tab);
  }
  Badge.updateTabBadge(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await State.ensureLoaded();
  TypeEngine.touchTab(tabId);
  Badge.updateTabBadge(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await State.ensureLoaded();
  State.deleteTabType(tabId);
  try {
    const tabs = await chrome.tabs.query({});
    const liveIds = new Set(tabs.map(t => t.id));
    State.pruneStaleTabTypes(liveIds);
  } catch { /* ignore — tab already gone is fine */ }
});

// ─── Context menu ────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  await State.ensureLoaded();
  if (!tab) return;
  const id = info.menuItemId;

  if (typeof id === 'string' && id.startsWith(MENU_IDS.TYPE_PREFIX)) {
    const key = id.slice(MENU_IDS.TYPE_PREFIX.length);
    const type = TYPES[key];
    if (!type) return;
    if (TypeEngine.setManualType(tab.id, type, tab)) {
      await Badge.updateTabBadge(tab.id);
    }
  } else if (id === MENU_IDS.OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage();
  }
});

// ─── Keyboard commands ───────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  await State.ensureLoaded();
  switch (command) {
    case COMMANDS.DROP_AFFINE: {
      const r = await Eviction.evictAffine('shortcut');
      notify('cmd-drop-affine', {
        title: 'Tare',
        message: r.count === 0
          ? 'No Feed tabs to drop'
          : `Dropped ${r.count} Feed tab${r.count > 1 ? 's' : ''} · ≈ ${r.mbFreed} MB`,
      });
      break;
    }
    case COMMANDS.DISCHARGE_LINEAR: {
      const r = await Eviction.dischargeOldLinear('shortcut');
      notify('cmd-discharge', {
        title: 'Tare',
        message: r.count === 0
          ? 'No idle Reference tabs'
          : `Closed ${r.count} Reference tab${r.count > 1 ? 's' : ''} · ≈ ${r.mbFreed} MB`,
      });
      break;
    }
    case COMMANDS.CYCLE_CURRENT: {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const next = TypeEngine.cycleType(tab.id, tab);
        if (next) {
          await Badge.updateTabBadge(tab.id);
          notify('cmd-cycle', { title: 'Tare', message: `Tab type → ${next}` });
        }
      }
      break;
    }
    case COMMANDS.UNDO_LAST: {
      const r = await Eviction.undoLast();
      if (r.ok) {
        notify('cmd-undo', {
          title: 'Tare',
          message: `Restored ${r.restored} tab${r.restored > 1 ? 's' : ''}`,
        });
      }
      break;
    }
  }
});

// ─── Periodic tick ───────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  await State.ensureLoaded();

  if (alarm.name === ALARMS.TICK) {
    await runTick();
  } else if (alarm.name === ALARMS.CLEANUP) {
    await runCleanup();
  }
});

async function runTick() {
  const settings = State.getSettings();

  // Discharge old linear tabs
  const lin = await Eviction.dischargeOldLinear('auto-idle');
  if (lin.count > 0) {
    log.debug(`auto-idle discharged ${lin.count}`);
  }

  // Check memory pressure per selected trigger mode
  const mode = settings.triggerMode || 'system-ram';
  if (mode === 'system-ram' && settings.enableMemoryPressureCheck) {
    const pct = await Eviction.getMemoryPressurePct();
    if (pct !== null && pct >= (settings.systemRamThresholdPct ?? 85)) {
      State.incrementStats({ lastMemoryPressureAt: Date.now() });
      const r = await Eviction.evictAffine('memory-pressure');
      if (r.count > 0) {
        notify('pressure', {
          title: 'Tare · memory pressure',
          message: `System at ${pct}% RAM. Dropped ${r.count} Feed tab${r.count > 1 ? 's' : ''}.`,
        });
      }
    }
  } else if (mode === 'chrome-estimate') {
    const { estimateMB, liveTabs } = await Eviction.estimateChromeFootprint();
    if (estimateMB >= (settings.chromeEstimateThresholdMB ?? 4096)) {
      State.incrementStats({ lastMemoryPressureAt: Date.now() });
      const r = await Eviction.evictAffine('memory-pressure');
      if (r.count > 0) {
        notify('pressure', {
          title: 'Tare · memory pressure',
          message: `Chrome ~${estimateMB} MB (${liveTabs} tabs). Dropped ${r.count} Feed tab${r.count > 1 ? 's' : ''}.`,
        });
      }
    }
  }

  // Prune stale undo entries
  State.pruneUndo(settings.undoWindowSeconds);
}

async function runCleanup() {
  try {
    const tabs = await chrome.tabs.query({});
    const liveIds = new Set(tabs.map(t => t.id));
    const pruned = State.pruneStaleTabTypes(liveIds);
    if (pruned > 0) log.info(`cleanup pruned ${pruned} stale tab entries`);
  } catch (err) {
    log.warn('cleanup failed:', err?.message);
  }
}

// ─── Message handler ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(err => {
      log.error('message handler failed:', err);
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
  return true; // keep channel open
});

/**
 * Dispatch messages to handler functions.
 * Each handler must return a plain object (will be JSON-serialized).
 *
 * @param {{type: string, [key: string]: any}} msg
 * @returns {Promise<Object>}
 */
async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    return { ok: false, error: 'invalid-message' };
  }
  await State.ensureLoaded();

  switch (msg.type) {
    case MSG.PING:
      return { ok: true, version: VERSION };

    case MSG.GET_STATE:
      return getStateSnapshot();

    case MSG.SET_TYPE:
      return State.withLock(() => handleSetType(msg));

    case MSG.ADD_RULE:
      return State.withLock(() => handleAddRule(msg));

    case MSG.REMOVE_RULE:
      return State.withLock(() => handleRemoveRule(msg));

    case MSG.GET_RULES:
      return { ok: true, rules: State.getRules() };

    case MSG.RESET_RULES:
      return State.withLock(async () => {
        State.resetRules();
        await State.persistNow();
        await Badge.refreshAllBadges();
        return { ok: true };
      });

    case MSG.RESET_RULE_STATS:
      return State.withLock(async () => {
        if (typeof msg.pattern !== 'string' || typeof msg.match !== 'string') {
          return { ok: false, error: 'invalid-args' };
        }
        const allRules = State.getRules();
        const idx = allRules.findIndex(
          r => r.pattern === msg.pattern && r.match === msg.match
        );
        if (idx < 0) return { ok: false, error: 'not-found' };
        State.resetRuleStats(idx);
        await State.persistNow();
        return { ok: true };
      });

    case MSG.UPDATE_SETTINGS:
      return State.withLock(() => handleUpdateSettings(msg));

    case MSG.DISCHARGE_AFFINE: {
      const r = await Eviction.evictAffine('user');
      return { ok: true, count: r.count, mbFreed: r.mbFreed };
    }

    case MSG.DISCHARGE_OLD_LINEAR: {
      const r = await Eviction.dischargeOldLinear('user');
      return { ok: true, count: r.count, mbFreed: r.mbFreed };
    }

    case MSG.UNDO:
      return Eviction.undoLast();

    case MSG.RESET_STATS:
      return State.withLock(async () => {
        State.resetStats();
        await State.persistNow();
        return { ok: true };
      });

    case MSG.EXPORT_CONFIG:
      return {
        ok: true,
        config: {
          version: VERSION,
          exportedAt: new Date().toISOString(),
          rules: State.getRules(),
          settings: State.getSettings(),
          stats: State.getStats(),
        },
      };

    case MSG.IMPORT_CONFIG:
      return State.withLock(() => handleImportConfig(msg));

    case MSG.GET_MEMORY_PCT: {
      const pct = await Eviction.getMemoryPressurePct();
      return { ok: true, pct };
    }

    case MSG.GET_CHROME_ESTIMATE: {
      const result = await Eviction.estimateChromeFootprint();
      return { ok: true, ...result };
    }

    default:
      return { ok: false, error: 'unknown-message-type' };
  }
}

async function getStateSnapshot() {
  const tabs = await chrome.tabs.query({});
  const liveIds = new Set(tabs.map(t => t.id));
  const pruned = State.pruneStaleTabTypes(liveIds);
  if (pruned > 0) log.debug(`GET_STATE pruned ${pruned} orphan entries`);

  const seen = new Set();
  const dedupedTabs = tabs.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const settings = State.getSettings();
  const enriched = dedupedTabs.map(t => ({
    id: t.id,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    active: t.active,
    pinned: t.pinned,
    discarded: t.discarded,
    windowId: t.windowId,
    tare: State.getTabType(t.id) || {
      type: TYPES.NEUTRAL,
      source: 'default',
      reason: null,
      timestamp: Date.now(),
    },
  }));
  const memPct = settings.enableMemoryPressureCheck
    ? await Eviction.getMemoryPressurePct() : null;

  State.pruneUndo(settings.undoWindowSeconds);
  const undoPreview = State.peekUndo();

  return {
    ok: true,
    tabs: enriched,
    settings,
    stats: State.getStats(),
    memoryPct: memPct,
    undoAvailable: Boolean(undoPreview),
    undoPreview,
    version: VERSION,
  };
}

async function handleSetType(msg) {
  if (typeof msg.tabId !== 'number' || !isValidType(msg.typeValue)) {
    return { ok: false, error: 'invalid-args' };
  }
  let tab = null;
  try { tab = await chrome.tabs.get(msg.tabId); } catch { /* may be closed */ }
  if (!TypeEngine.setManualType(msg.tabId, msg.typeValue, tab)) {
    return { ok: false, error: 'set-type-failed' };
  }
  await Badge.updateTabBadge(msg.tabId);
  return { ok: true };
}

async function handleAddRule(msg) {
  const validation = validateRule({
    pattern: msg.pattern,
    type: msg.typeValue,
    match: msg.match,
    reason: msg.reason,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  // Check duplicates
  const existing = State.getRules();
  if (existing.some(r => r.pattern === validation.rule.pattern && r.match === validation.rule.match)) {
    return { ok: false, error: 'duplicate-rule' };
  }
  if (existing.length >= LIMITS.MAX_RULES) {
    return { ok: false, error: `max ${LIMITS.MAX_RULES} rules` };
  }

  State.addRule(validation.rule);
  await State.persistNow();
  await Badge.refreshAllBadges();
  return { ok: true, rule: validation.rule };
}

async function handleRemoveRule(msg) {
  if (typeof msg.pattern !== 'string' || typeof msg.match !== 'string') {
    return { ok: false, error: 'invalid-args' };
  }
  const removed = State.removeRuleByKey(msg.pattern, msg.match);
  if (!removed) return { ok: false, error: 'not-found' };
  await State.persistNow();
  await Badge.refreshAllBadges();
  return { ok: true };
}

async function handleUpdateSettings(msg) {
  const validation = validateSettingsPatch(msg.settings);
  if (!validation.ok) return { ok: false, error: validation.error };
  State.updateSettings(validation.settings);
  await State.persistNow();

  // Reset alarm if tick interval changed
  if ('tickIntervalMinutes' in validation.settings) {
    await resetTickAlarm();
  }
  return { ok: true };
}

async function handleImportConfig(msg) {
  const validation = validateImportConfig(msg.config);
  if (!validation.ok) return { ok: false, error: validation.error };
  State.replaceState(validation.config);
  await State.persistNow();
  await Badge.refreshAllBadges();
  return { ok: true };
}

// ─── Dev helpers ─────────────────────────────────────────────

// Expose for debugging in service-worker console.
// Usage (in DevTools for the SW): self.tareDebug.setLogLevel('debug')
self.tareDebug = Object.freeze({
  setLogLevel,
  getState: () => ({
    tabs: State.getAllTabTypes(),
    rules: State.getRules(),
    settings: State.getSettings(),
    stats: State.getStats(),
    undoStack: State.getUndoStack(),
  }),
});

log.info(`Tare v${VERSION} service worker loaded`);
