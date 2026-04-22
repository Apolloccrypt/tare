/**
 * @file Tare popup UI logic.
 *
 * Rendering is idempotent — re-render from state after each action.
 * All DOM is built programmatically; no innerHTML with user data.
 */

import { TYPE_META, TYPE_ORDER, MSG } from '../lib/constants.js';

const IS_MAC = /Mac/i.test(navigator.platform);
const REFRESH_INTERVAL_MS = 5000;

const SHORTCUTS = {
  dropAffine: IS_MAC ? '⇧⌘A' : 'Ctrl+Shift+A',
  discharge:  IS_MAC ? '⇧⌘L' : 'Ctrl+Shift+L',
  cycle:      IS_MAC ? '⇧⌘Y' : 'Ctrl+Shift+Y',
  undo:       IS_MAC ? '⇧⌘Z' : 'Ctrl+Shift+Z',
};

let refreshTimer = null;

// ─── Utilities ────────────────────────────────────────────────

/**
 * Send a message to the service worker with a timeout.
 * @param {Object} msg
 * @param {number} [timeoutMs]
 * @returns {Promise<Object>}
 */
function sendMessage(msg, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message timeout')), timeoutMs);
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(resp);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

function createEl(tag, className, textContent) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent != null) el.textContent = textContent;
  return el;
}

function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = createEl('div', 'toast', message);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// ─── View switching ──────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.hidden = true;
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const view = document.getElementById(`view-${btn.dataset.view}`);
      if (view) {
        view.classList.add('active');
        view.hidden = false;
      }
    });
  });
}

// ─── Keyboard hint labels ────────────────────────────────────

function applyKeyboardHints() {
  document.getElementById('kbA').textContent = SHORTCUTS.dropAffine;
  document.getElementById('kbL').textContent = SHORTCUTS.discharge;
  document.getElementById('kbDropAffine').textContent = SHORTCUTS.dropAffine;
  document.getElementById('kbDischarge').textContent = SHORTCUTS.discharge;
  document.getElementById('kbCycle').textContent = SHORTCUTS.cycle;
  document.getElementById('kbUndo').textContent = SHORTCUTS.undo;
}

// ─── Rendering ───────────────────────────────────────────────

function renderMemory(state) {
  const bar = document.getElementById('memoryBar');
  const fill = document.getElementById('memFill');
  const val = document.getElementById('memVal');
  const progress = document.getElementById('memProgress');
  if (state.memoryPct == null) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  fill.style.width = `${state.memoryPct}%`;
  val.textContent = `${state.memoryPct}%`;
  progress.setAttribute('aria-valuenow', String(state.memoryPct));
  fill.classList.remove('warn', 'critical');
  if (state.memoryPct >= 85) fill.classList.add('critical');
  else if (state.memoryPct >= 70) fill.classList.add('warn');
}

function renderStats(state) {
  const stats = state.stats || {};
  const mb = Math.round(stats.estimatedMemoryFreedMB || 0);
  const bar = document.getElementById('savingsBar');
  bar.textContent = '';
  bar.append(
    '≈ ',
    createEl('strong', null, `${mb.toLocaleString()} MB`),
    ` freed lifetime · ${stats.totalDischarged || 0} tabs discharged`
  );
  document.getElementById('lifetimeMB').textContent = mb.toLocaleString();
  document.getElementById('lifetimeDischarged').textContent = String(stats.totalDischarged || 0);
  document.getElementById('lifetimeAffine').textContent = String(stats.totalAffineEvicted || 0);
  document.getElementById('lifetimeLinear').textContent = String(stats.totalLinearDischarged || 0);
}

function renderUndo(state) {
  const strip = document.getElementById('undoStrip');
  if (!state.undoAvailable || !state.undoPreview) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  const count = state.undoPreview.tabs?.length || 0;
  const kind = state.undoPreview.kind === 'evict-affine' ? 'affine' : 'linear';
  document.getElementById('undoMessage').textContent =
    `${count} ${kind} tab${count > 1 ? 's' : ''} discharged`;
}

function renderTabs(state) {
  const counts = { '!': 0, '1': 0, 'A': 0, '·': 0 };
  const groups = { '!': [], '1': [], 'A': [], '·': [] };

  for (const tab of state.tabs || []) {
    const t = tab.tare?.type || '·';
    counts[t] = (counts[t] || 0) + 1;
    groups[t].push(tab);
  }

  document.getElementById('statReusable').textContent = String(counts['!']);
  document.getElementById('statLinear').textContent = String(counts['1']);
  document.getElementById('statAffine').textContent = String(counts['A']);
  document.getElementById('statNeutral').textContent = String(counts['·']);

  const list = document.getElementById('tabList');
  list.textContent = '';

  let hasAny = false;
  for (const type of TYPE_ORDER) {
    const group = groups[type];
    if (!group || group.length === 0) continue;
    hasAny = true;
    const meta = TYPE_META[type];
    const header = createEl('div', `group-header ${meta.cls}`,
      `${type}  ${meta.label || 'uncategorized'}  ·  ${group.length}`);
    list.appendChild(header);
    for (const tab of group) list.appendChild(renderTabRow(tab));
  }

  if (!hasAny) {
    list.appendChild(createEl('div', 'empty-state', 'No tabs open.'));
  }
}

function renderTabRow(tab) {
  const row = createEl('div', 'tab' + (tab.discarded ? ' discarded' : ''));

  const favicon = document.createElement('img');
  favicon.className = 'tab-favicon';
  favicon.alt = '';
  if (tab.favIconUrl) {
    favicon.src = tab.favIconUrl;
    favicon.addEventListener('error', () => {
      favicon.dataset.empty = '1';
    });
  } else {
    favicon.dataset.empty = '1';
  }
  row.appendChild(favicon);

  const main = createEl('div', 'tab-main');
  const title = createEl('div', 'tab-title');
  title.textContent = (tab.discarded ? '💤 ' : '') + (tab.title || '(untitled)');
  main.appendChild(title);

  const host = createEl('div', 'tab-host');
  try {
    const u = new URL(tab.url || '');
    host.textContent = u.hostname.replace(/^www\./, '');
    if (tab.tare?.reason) host.append(` · ${tab.tare.reason}`);
  } catch {
    host.textContent = tab.url || '';
  }
  if (tab.tare?.source === 'manual') {
    host.appendChild(createEl('span', 'manual-badge', 'set'));
  }
  main.appendChild(host);
  row.appendChild(main);

  const selector = createEl('div', 'type-selector');
  for (const type of TYPE_ORDER) {
    const btn = createEl('button', 'type-btn', type);
    btn.type = 'button';
    btn.title = `Set to ${TYPE_META[type].full}`;
    btn.setAttribute('aria-label', `Set tab to ${TYPE_META[type].full}`);
    if (tab.tare?.type === type) {
      btn.classList.add('active', TYPE_META[type].cls);
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.setAttribute('aria-pressed', 'false');
    }
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const r = await sendMessage({ type: MSG.SET_TYPE, tabId: tab.id, typeValue: type });
        if (!r?.ok) toast(r?.error || 'failed to set type');
      } catch (err) {
        toast(err.message);
      }
      await load();
    });
    selector.appendChild(btn);
  }
  row.appendChild(selector);

  row.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.classList.contains('type-btn')) return;
    chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  });

  return row;
}

// ─── Data fetch & action buttons ────────────────────────────

async function load() {
  try {
    const state = await sendMessage({ type: MSG.GET_STATE });
    if (!state || !state.ok) {
      toast('Could not load state');
      return;
    }
    renderMemory(state);
    renderStats(state);
    renderUndo(state);
    renderTabs(state);
  } catch (err) {
    toast(`Error: ${err.message}`);
  }
}

function bindActions() {
  document.getElementById('btnEvictAffine').addEventListener('click', async () => {
    try {
      const r = await sendMessage({ type: MSG.DISCHARGE_AFFINE });
      if (!r?.ok) {
        toast(r?.error || 'failed');
        return;
      }
      if (r.count === 0) toast('No affine tabs to drop');
      else toast(`Dropped ${r.count} affine · ≈ ${r.mbFreed} MB`);
    } catch (err) {
      toast(err.message);
    }
    setTimeout(load, 300);
  });

  document.getElementById('btnDischargeLinear').addEventListener('click', async () => {
    try {
      const r = await sendMessage({ type: MSG.DISCHARGE_OLD_LINEAR });
      if (!r?.ok) {
        toast(r?.error || 'failed');
        return;
      }
      if (r.count === 0) toast('No idle linear tabs');
      else toast(`Discharged ${r.count} linear · ≈ ${r.mbFreed} MB`);
    } catch (err) {
      toast(err.message);
    }
    setTimeout(load, 300);
  });

  document.getElementById('btnUndo').addEventListener('click', async () => {
    try {
      const r = await sendMessage({ type: MSG.UNDO });
      if (r?.ok) toast(`Restored ${r.restored} tab${r.restored > 1 ? 's' : ''}`);
      else toast(r?.reason || 'nothing to undo');
    } catch (err) {
      toast(err.message);
    }
    setTimeout(load, 300);
  });

  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('openOptionsFooter').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

// ─── Lifecycle ──────────────────────────────────────────────

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(load, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAutoRefresh();
  else {
    load();
    startAutoRefresh();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  applyKeyboardHints();
  bindActions();
  load();
  startAutoRefresh();
});
