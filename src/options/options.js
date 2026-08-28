// (c) 2026 Nakul Mundhada. All rights reserved.


import { MessageType } from '../types/models.js';

let currentPrefs = null;
let saveTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
  startLiveClock();
  await loadPreferences();
  setupListeners();
});

function startLiveClock() {
  const clockEl = document.getElementById('portal-live-clock');
  if (!clockEl) return;

  const update = () => {
    const d = new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[d.getMonth()];
    const date = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${month} ${date}, ${year} ${hours}:${minutes}:${seconds}`;
  };

  update();
  setInterval(update, 1000);
}

async function loadPreferences() {
  currentPrefs = await sendMessage({ type: MessageType.GET_PREFERENCES });

  if (!currentPrefs) {
    console.error('[Options] Failed to load preferences');
    return;
  }

  document.getElementById('subject-target').value = currentPrefs.subjectTarget || 60;
  document.getElementById('overall-target').value = currentPrefs.overallTarget || 75;
  document.getElementById('safety-buffer').value = currentPrefs.safetyBuffer || 2;
  document.getElementById('semester-end').value = currentPrefs.semesterEndDate || '';
  document.getElementById('portal-domain').value = currentPrefs.portalDomain || '';
  document.getElementById('stale-threshold').value = currentPrefs.staleDataThresholdHours || 48;
  document.getElementById('debug-mode').checked = currentPrefs.debugMode || false;

  const days = currentPrefs.preferredBunkDays || [];
  document.querySelectorAll('.day-chip input').forEach(cb => {
    cb.checked = days.includes(parseInt(cb.value));
  });

  renderAliases(currentPrefs.aliasMap || {});

  try {
    const studentInfo = await sendMessage({ type: MessageType.GET_STUDENT_INFO });
    const nameEl = document.getElementById('student-name-display');
    const roleEl = document.getElementById('student-role-display');

    if (studentInfo && studentInfo.name) {
      if (nameEl) nameEl.textContent = studentInfo.name;
      if (roleEl) {
        const details = ['Student'];
        if (studentInfo.semester) details.push(`Sem ${studentInfo.semester}`);
        if (studentInfo.branch) details.push(studentInfo.branch);
        roleEl.textContent = details.join(' • ');
        roleEl.style.display = 'block';
      }
    } else {
      if (nameEl) nameEl.textContent = 'Student Configuration';
      if (roleEl) roleEl.style.display = 'none';
    }
  } catch (err) {
    console.warn('[Options] Failed to load student info:', err);
  }
}

async function savePreferences() {
  const saveBtn = document.getElementById('btn-save-settings');
  if (saveBtn) {
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
  }

  const prefs = collectFormData();
  prefs.aliasMap = currentPrefs?.aliasMap || {};

  await sendMessage({ type: MessageType.SAVE_PREFERENCES, data: prefs });

  if (saveBtn) {
    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveBtn.textContent = 'Save Settings';
      saveBtn.disabled = false;
    }, 1500);
  }

  showSaveIndicator();
}

function collectFormData() {
  const preferredBunkDays = [];
  document.querySelectorAll('.day-chip input:checked').forEach(cb => {
    preferredBunkDays.push(parseInt(cb.value));
  });

  return {
    subjectTarget: parseFloat(document.getElementById('subject-target').value) || 60,
    overallTarget: parseFloat(document.getElementById('overall-target').value) || 75,
    safetyBuffer: parseFloat(document.getElementById('safety-buffer').value) || 2,
    semesterEndDate: document.getElementById('semester-end').value || null,
    portalDomain: document.getElementById('portal-domain').value.trim() || '',
    staleDataThresholdHours: parseInt(document.getElementById('stale-threshold').value) || 48,
    debugMode: document.getElementById('debug-mode').checked,
    preferredBunkDays,
    firstRunComplete: true,
  };
}

function showSaveIndicator() {
  const indicator = document.getElementById('save-indicator');
  indicator.style.display = 'inline-block';
  indicator.style.animation = 'none';

  indicator.offsetHeight;
  indicator.style.animation = 'fadeInOut 2s ease forwards';
}

function renderAliases(aliasMap) {
  const container = document.getElementById('alias-list');
  container.innerHTML = '';

  const entries = Object.entries(aliasMap);

  if (entries.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:8px 0">No aliases configured. Aliases help match schedule names to attendance names when automatic matching fails.</p>';
    return;
  }

  for (const [from, to] of entries) {
    const row = document.createElement('div');
    row.className = 'alias-row';
    row.innerHTML = `
      <span class="alias-from">${escapeHtml(from)}</span>
      <span class="alias-arrow">→</span>
      <span class="alias-to">${escapeHtml(to)}</span>
      <button class="alias-remove" data-from="${escapeHtml(from)}" title="Remove">✕</button>
    `;
    container.appendChild(row);
  }

  container.querySelectorAll('.alias-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const from = btn.dataset.from;
      delete currentPrefs.aliasMap[from];
      renderAliases(currentPrefs.aliasMap);
      savePreferences();
    });
  });
}

function setupListeners() {

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.ai_student_info || changes.ai_preferences || changes.ai_subjects)) {
      loadPreferences();
    }
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', savePreferences);

  document.getElementById('btn-add-alias')?.addEventListener('click', () => {
    const fromInput = document.getElementById('alias-schedule');
    const toInput = document.getElementById('alias-attendance');

    const from = fromInput.value.trim();
    const to = toInput.value.trim();

    if (!from || !to) return;

    if (!currentPrefs.aliasMap) currentPrefs.aliasMap = {};
    currentPrefs.aliasMap[from.toLowerCase()] = to.toLowerCase();

    renderAliases(currentPrefs.aliasMap);
    savePreferences();

    fromInput.value = '';
    toInput.value = '';
  });

  document.getElementById('btn-export-data')?.addEventListener('click', async () => {
    const data = await sendMessage({ type: MessageType.EXPORT_DATA });
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-insights-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });

  document.getElementById('btn-clear-data')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all stored data? This includes attendance, schedule, and settings. This cannot be undone.')) {
      await sendMessage({ type: MessageType.CLEAR_DATA });
      alert('All data cleared. Please reload the extension.');
      window.location.reload();
    }
  });
}

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Options] Message error:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      console.warn('[Options] Failed to send message:', err);
      resolve(null);
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
