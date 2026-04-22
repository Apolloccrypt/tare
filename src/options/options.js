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

// ─── Utilities ──────────────────────────────────────────────

/**
 * Send a message with a timeout.
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
  setNum('memThreshold', currentSettings.memoryPressureThresholdPct ?? 85);
  setNum('avgTabMB', currentSettings.averageTabMB ?? 85);
  setNum('tickInterval', currentSettings.tickIntervalMinutes ?? 2);
  setNum('undoWindow', currentSettings.undoWindowSeconds ?? 30);
}

function setNum(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = String(value);
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
          // Rollback
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
    memThreshold: 'memoryPressureThresholdPct',
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
            // Revert to stored value
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
    td.setAttribute('colspan', '5');
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
  typeTd.appendChild(createEl('span', `type-badge ${meta.cls}`, rule.type));
  tr.appendChild(typeTd);

  const reasonTd = createEl('td');
  reasonTd.style.color = 'var(--ink-dim)';
  reasonTd.style.fontSize = '12px';
  reasonTd.textContent = rule.reason || '—';
  tr.appendChild(reasonTd);

  const actionTd = createEl('td');
  actionTd.style.textAlign = 'right';
  const deleteBtn = createEl('button', 'btn-delete', 'Delete');
  deleteBtn.type = 'button';
  deleteBtn.setAttribute('aria-label', `Delete rule for ${rule.pattern}`);
  deleteBtn.addEventListener('click', () => deleteRule(rule));
  actionTd.appendChild(deleteBtn);
  tr.appendChild(actionTd);

  return tr;
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

document.addEventListener('DOMContentLoaded', () => {
  bindToggles();
  bindNumberInputs();
  bindAddRuleForm();
  bindAdminButtons();
  bindImportExport();
  load();
});
