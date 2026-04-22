/**
 * @file Options page logic.
 *
 * Settings controls, rule editor, and import/export.
 * All user input is sent to the background for validation before persistence.
 */

import { TYPE_META, MSG, VERSION } from '../lib/constants.js';

/** @type {Array} */
let currentRules = [];
/** @type {Object} */
let currentSettings = {};
let liveTimer = null;

// ─── Utilities ──────────────────────────────────────────────

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

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function setFormError(msg) {
  const el = document.getElementById('formError');
  el.textContent = msg || '';
}

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

// ─── Load state ──────────────────────────────────────────────

async function load() {
  try {
    const state = await sendMessage({ type: MSG.GET_STATE });
    const rulesResp = await sendMessage({ type: MSG.GET_RULES });
    if (!state?.ok) {
      toast('Could not load state');
      return;
    }
    currentSettings = state.settings || {};
    currentRules = rulesResp?.rules || [];
    renderSettings();
    renderRules();
    updateRuleBadge();
    initTriggerMode(currentSettings);
  } catch (err) {
    toast(`Load failed: ${err.message}`);
  }
}

// ─── Settings rendering ──────────────────────────────────────

function renderSettings() {
  document.querySelectorAll('.toggle').forEach(el => {
    const key = el.dataset.setting;
    const on = Boolean(currentSettings[key]);
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  });

  setNum('idleMinutes', currentSettings.idleMinutesBeforeDischarge ?? 30);
  setNum('avgTabMB', currentSettings.averageTabMB ?? 85);
  setNum('tickInterval', currentSettings.tickIntervalMinutes ?? 2);
  setNum('undoWindow', currentSettings.undoWindowSeconds ?? 30);
}

function setNum(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = String(value);
}

// ─── Rule count badge ────────────────────────────────────────

function updateRuleBadge() {
  const badge = document.getElementById('ruleBadge');
  if (!badge) return;
  const n = currentRules.length;
  badge.textContent = `${n} rule${n === 1 ? '' : 's'} active`;
}

// ─── Trigger mode ────────────────────────────────────────────

function initTriggerMode(settings) {
  const mode = settings.triggerMode || 'system-ram';
  const ramVal = settings.systemRamThresholdPct ?? 85;
  const estVal = settings.chromeEstimateThresholdMB ?? 4096;

  document.querySelectorAll('input[name=triggerMode]').forEach(radio => {
    radio.checked = radio.value === mode;
  });

  const ramSlider = document.getElementById('systemRamSlider');
  const estSlider = document.getElementById('chromeEstSlider');
  if (ramSlider) { ramSlider.value = String(ramVal); }
  if (estSlider) { estSlider.value = String(estVal); }

  document.getElementById('systemRamValue').textContent = `${ramVal}%`;
  document.getElementById('chromeEstValue').textContent = `${estVal} MB`;

  updateTriggerModeBlocks(mode);
}

function updateTriggerModeBlocks(mode) {
  document.querySelectorAll('.trigger-mode').forEach(block => {
    const isActive = block.dataset.mode === mode;
    block.classList.toggle('active-mode', isActive);
    block.classList.toggle('inactive', !isActive);
  });
}

function bindTriggerMode() {
  document.querySelectorAll('input[name=triggerMode]').forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      const mode = radio.value;
      updateTriggerModeBlocks(mode);
      try {
        const r = await sendMessage({
          type: MSG.UPDATE_SETTINGS,
          settings: { triggerMode: mode },
        });
        if (!r?.ok) toast(`Failed: ${r?.error || 'unknown'}`);
        else currentSettings.triggerMode = mode;
      } catch (err) {
        toast(err.message);
      }
    });
  });

  const ramSlider = document.getElementById('systemRamSlider');
  const ramOutput = document.getElementById('systemRamValue');
  if (ramSlider) {
    let ramTimer;
    ramSlider.addEventListener('input', () => {
      ramOutput.textContent = `${ramSlider.value}%`;
      if (ramTimer) clearTimeout(ramTimer);
      ramTimer = setTimeout(async () => {
        const val = parseInt(ramSlider.value, 10);
        try {
          const r = await sendMessage({
            type: MSG.UPDATE_SETTINGS,
            settings: { systemRamThresholdPct: val },
          });
          if (r?.ok) currentSettings.systemRamThresholdPct = val;
          else toast(`Failed: ${r?.error}`);
        } catch (err) {
          toast(err.message);
        }
      }, 400);
    });
  }

  const estSlider = document.getElementById('chromeEstSlider');
  const estOutput = document.getElementById('chromeEstValue');
  if (estSlider) {
    let estTimer;
    estSlider.addEventListener('input', () => {
      estOutput.textContent = `${estSlider.value} MB`;
      if (estTimer) clearTimeout(estTimer);
      estTimer = setTimeout(async () => {
        const val = parseInt(estSlider.value, 10);
        try {
          const r = await sendMessage({
            type: MSG.UPDATE_SETTINGS,
            settings: { chromeEstimateThresholdMB: val },
          });
          if (r?.ok) currentSettings.chromeEstimateThresholdMB = val;
          else toast(`Failed: ${r?.error}`);
        } catch (err) {
          toast(err.message);
        }
      }, 400);
    });
  }
}

// ─── Live polling for trigger mode ───────────────────────────

async function pollTriggerLive() {
  const ramLive = document.getElementById('systemRamLive');
  const estLive = document.getElementById('chromeEstLive');

  try {
    const pctResp = await sendMessage({ type: MSG.GET_MEMORY_PCT });
    if (pctResp?.ok && ramLive) {
      const pct = pctResp.pct;
      const threshold = currentSettings.systemRamThresholdPct ?? 85;
      if (pct == null) {
        ramLive.textContent = 'System RAM unavailable';
        ramLive.classList.remove('would-trigger');
      } else {
        const wouldTrigger = pct >= threshold;
        ramLive.textContent = `System currently at ${pct}% · ${wouldTrigger ? 'would trigger' : 'would not trigger'}`;
        ramLive.classList.toggle('would-trigger', wouldTrigger);
      }
    }
  } catch { /* ignore */ }

  try {
    const estResp = await sendMessage({ type: MSG.GET_CHROME_ESTIMATE });
    if (estResp?.ok && estLive) {
      const { estimateMB, liveTabs } = estResp;
      const threshold = currentSettings.chromeEstimateThresholdMB ?? 4096;
      const wouldTrigger = estimateMB >= threshold;
      estLive.textContent = `Currently estimated at ${estimateMB} MB · ${liveTabs} live tabs`;
      estLive.classList.toggle('would-trigger', wouldTrigger);
    }
  } catch { /* ignore */ }
}

function startLivePoll() {
  stopLivePoll();
  pollTriggerLive();
  liveTimer = setInterval(pollTriggerLive, 5000);
}

function stopLivePoll() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}

// ─── Settings event handlers ─────────────────────────────────

function bindToggles() {
  document.querySelectorAll('.toggle').forEach(el => {
    el.addEventListener('click', async () => {
      const key = el.dataset.setting;
      const newVal = !currentSettings[key];
      const prevVal = currentSettings[key];
      currentSettings[key] = newVal;
      el.classList.toggle('on', newVal);
      el.setAttribute('aria-checked', newVal ? 'true' : 'false');
      try {
        const r = await sendMessage({
          type: MSG.UPDATE_SETTINGS,
          settings: { [key]: newVal },
        });
        if (!r?.ok) {
          currentSettings[key] = prevVal;
          el.classList.toggle('on', prevVal);
          el.setAttribute('aria-checked', prevVal ? 'true' : 'false');
          toast(`Failed: ${r?.error || 'unknown'}`);
        }
      } catch (err) {
        currentSettings[key] = prevVal;
        el.classList.toggle('on', prevVal);
        toast(err.message);
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        el.click();
      }
    });
  });
}

function bindNumberInputs() {
  const map = {
    idleMinutes: 'idleMinutesBeforeDischarge',
    avgTabMB: 'averageTabMB',
    tickInterval: 'tickIntervalMinutes',
    undoWindow: 'undoWindowSeconds',
  };
  for (const [inputId, settingKey] of Object.entries(map)) {
    const el = document.getElementById(inputId);
    if (!el) continue;
    let timer;
    el.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const val = parseInt(el.value, 10);
        if (!Number.isFinite(val)) return;
        try {
          const r = await sendMessage({
            type: MSG.UPDATE_SETTINGS,
            settings: { [settingKey]: val },
          });
          if (!r?.ok) {
            toast(`Invalid: ${r?.error || 'out of range'}`);
            el.value = String(currentSettings[settingKey]);
          } else {
            currentSettings[settingKey] = val;
          }
        } catch (err) {
          toast(err.message);
        }
      }, 400);
    });
  }
}

// ─── Rules rendering ─────────────────────────────────────────

function renderRules() {
  const body = document.getElementById('rulesBody');
  body.textContent = '';

  if (currentRules.length === 0) {
    const tr = createEl('tr');
    const td = createEl('td');
    td.setAttribute('colspan', '7');
    td.style.textAlign = 'center';
    td.style.color = 'var(--ink-faint)';
    td.style.padding = '20px';
    td.textContent = 'No rules — add one below, or reset to defaults';
    tr.appendChild(td);
    body.appendChild(tr);
  } else {
    for (const rule of currentRules) {
      body.appendChild(renderRuleRow(rule));
    }
  }

  document.getElementById('ruleCount').textContent =
    `${currentRules.length} rule${currentRules.length === 1 ? '' : 's'}`;
}

function renderRuleRow(rule) {
  const tr = createEl('tr');

  tr.appendChild(createEl('td', 'pattern-cell', rule.pattern));

  const matchTd = createEl('td');
  matchTd.appendChild(createEl('span', 'match-label', rule.match || 'host-ends'));
  tr.appendChild(matchTd);

  const typeTd = createEl('td');
  const meta = TYPE_META[rule.type] || TYPE_META['·'];
  const badge = createEl('span', `type-badge ${meta.cls}`, meta.display);
  badge.title = meta.human;
  typeTd.appendChild(badge);
  tr.appendChild(typeTd);

  const reasonTd = createEl('td');
  reasonTd.style.color = 'var(--ink-dim)';
  reasonTd.style.fontSize = '12px';
  reasonTd.textContent = rule.reason || '—';
  tr.appendChild(reasonTd);

  const matchCountTd = createEl('td');
  matchCountTd.style.textAlign = 'right';
  matchCountTd.style.fontFamily = "'Courier New', monospace";
  matchCountTd.style.fontSize = '12px';
  matchCountTd.style.color = rule.matchCount ? 'var(--ink-dim)' : 'var(--ink-faint)';
  matchCountTd.textContent = rule.matchCount ? String(rule.matchCount) : '—';
  tr.appendChild(matchCountTd);

  const lastSeenTd = createEl('td');
  lastSeenTd.style.fontSize = '12px';
  lastSeenTd.style.color = 'var(--ink-faint)';
  lastSeenTd.textContent = relativeTime(rule.lastMatchedAt ?? null);
  tr.appendChild(lastSeenTd);

  const actionTd = createEl('td');
  actionTd.style.textAlign = 'right';
  actionTd.style.whiteSpace = 'nowrap';

  const resetStatsBtn = createEl('button', 'btn-icon', '↺');
  resetStatsBtn.type = 'button';
  resetStatsBtn.title = 'Reset match stats';
  resetStatsBtn.setAttribute('aria-label', `Reset stats for ${rule.pattern}`);
  resetStatsBtn.addEventListener('click', () => resetRuleStats(rule));
  actionTd.appendChild(resetStatsBtn);

  const deleteBtn = createEl('button', 'btn-delete', 'Delete');
  deleteBtn.type = 'button';
  deleteBtn.setAttribute('aria-label', `Delete rule for ${rule.pattern}`);
  deleteBtn.addEventListener('click', () => deleteRule(rule));
  actionTd.appendChild(deleteBtn);

  tr.appendChild(actionTd);

  return tr;
}

async function resetRuleStats(rule) {
  try {
    const r = await sendMessage({
      type: MSG.RESET_RULE_STATS,
      pattern: rule.pattern,
      match: rule.match,
    });
    if (r?.ok) {
      toast(`Stats reset: ${rule.pattern}`);
      await load();
    } else {
      toast(`Failed: ${r?.error}`);
    }
  } catch (err) {
    toast(err.message);
  }
}

async function deleteRule(rule) {
  try {
    const r = await sendMessage({
      type: MSG.REMOVE_RULE,
      pattern: rule.pattern,
      match: rule.match,
    });
    if (r?.ok) {
      toast(`Removed: ${rule.pattern}`);
      await load();
    } else {
      toast(`Failed: ${r?.error}`);
    }
  } catch (err) {
    toast(err.message);
  }
}

// ─── Add-rule form ───────────────────────────────────────────

function bindAddRuleForm() {
  const form = document.getElementById('addRuleForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('');

    const pattern = document.getElementById('newPattern').value.trim();
    const match = document.getElementById('newMatch').value;
    const typeValue = document.getElementById('newType').value;
    const reason = document.getElementById('newReason').value.trim() || null;

    if (!pattern) {
      setFormError('Pattern is required');
      return;
    }

    try {
      const r = await sendMessage({
        type: MSG.ADD_RULE,
        pattern, match, typeValue, reason,
      });
      if (r?.ok) {
        toast(`Added: ${pattern} → ${typeValue}`);
        document.getElementById('newPattern').value = '';
        document.getElementById('newReason').value = '';
        await load();
      } else {
        setFormError(r?.error || 'Failed to add rule');
      }
    } catch (err) {
      setFormError(err.message);
    }
  });
}

// ─── Reset and admin actions ────────────────────────────────

function bindAdminButtons() {
  document.getElementById('btnResetRules').addEventListener('click', async () => {
    if (!confirm('Reset all rules to defaults? Your custom rules will be lost.')) return;
    try {
      const r = await sendMessage({ type: MSG.RESET_RULES });
      if (r?.ok) {
        toast('Rules reset to defaults');
        await load();
      } else {
        toast(`Failed: ${r?.error}`);
      }
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById('btnResetStats').addEventListener('click', async () => {
    if (!confirm('Reset lifetime stats? This clears your saved MB and tab counters.')) return;
    try {
      const r = await sendMessage({ type: MSG.RESET_STATS });
      if (r?.ok) toast('Lifetime stats reset');
      else toast(`Failed: ${r?.error}`);
    } catch (err) {
      toast(err.message);
    }
  });
}

// ─── Import / Export ─────────────────────────────────────────

function bindImportExport() {
  document.getElementById('btnExport').addEventListener('click', async () => {
    try {
      const r = await sendMessage({ type: MSG.EXPORT_CONFIG });
      if (!r?.ok) {
        toast('Export failed');
        return;
      }
      const blob = new Blob([JSON.stringify(r.config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = createEl('a');
      a.href = url;
      a.download = `tare-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Config exported');
    } catch (err) {
      toast(err.message);
    }
  });

  const fileInput = document.getElementById('importFile');
  document.getElementById('btnImport').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let config;
      try {
        config = JSON.parse(text);
      } catch (parseErr) {
        toast('Invalid JSON file');
        return;
      }
      const ruleCount = Array.isArray(config?.rules) ? config.rules.length : 0;
      if (!confirm(`Import config with ${ruleCount} rules? Current rules will be replaced.`)) {
        return;
      }
      const r = await sendMessage({ type: MSG.IMPORT_CONFIG, config });
      if (r?.ok) {
        toast('Config imported');
        await load();
      } else {
        toast(`Import failed: ${r?.error}`);
      }
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    } finally {
      fileInput.value = '';
    }
  });
}

// ─── Entry ───────────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLivePoll();
  else startLivePoll();
});

document.addEventListener('DOMContentLoaded', () => {
  bindToggles();
  bindNumberInputs();
  bindTriggerMode();
  bindAddRuleForm();
  bindAdminButtons();
  bindImportExport();
  load();
  startLivePoll();
});
