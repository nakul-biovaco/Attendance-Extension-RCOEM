/**
 * Copyright (c) 2026 Nakul Mundhada. All Rights Reserved.
 * 
 * PROPRIETARY & CONFIDENTIAL SOURCE CODE.
 * This software is the intellectual property of Nakul Mundhada.
 * Unauthorized modification, redistribution, re-licensing, or commercial
 * exploitation is strictly prohibited without prior written consent.
 * 
 * Author: Nakul Mundhada (https://github.com/nakul-biovaco)
 */

import { MessageType, RecommendationType } from '../types/models.js';
import { relativeTime } from '../utils/date-utils.js';
import { formatPercentage } from '../engine/attendance-calculator.js';
import { computeBadges, getBadgeSummary } from '../engine/gamification-engine.js';

let currentView = 'dashboard';
let todayPlan = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupButtons();
  await loadData();

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local') {
      console.log('[Popup] Live storage change detected, refreshing dashboard...');
      loadData();
    }
  });
});

async function loadData() {
  try {
    const response = await sendMessage({ type: MessageType.GET_TODAY_PLAN });

    if (!response) {
      showView('firstrun');
      return;
    }

    const { plan, state, firstRunComplete } = response;
    todayPlan = plan;

    if (!firstRunComplete && !plan) {
      showView('firstrun');
      updateFirstRunStatus(state);
      return;
    }

    if (plan) {
      renderDashboard(plan);
      showView('dashboard');
    } else {
      showView('firstrun');
      updateFirstRunStatus(state);
    }

    updateSyncStatus(plan);

  } catch (err) {
    console.error('[Popup] Error loading data:', err);
    showView('firstrun');
  }
}

function renderDashboard(plan) {

  const overallPct = plan.overallPercentage || 0;
  document.getElementById('overall-pct').textContent = overallPct > 0 ? formatPercentage(overallPct) + '%' : '—';
  document.getElementById('overall-target').textContent = plan.overallTarget + '%';

  animateProgressRing(overallPct);

  const subjectsResponse = sendMessage({ type: MessageType.GET_SUBJECTS });
  subjectsResponse.then(data => {
    const subjectsList = data?.subjects || [];
    document.getElementById('total-subjects').textContent = subjectsList.length || '—';

    const active = subjectsList.filter(s => s.conducted > 0);
    const totalAttended = active.reduce((sum, s) => sum + s.attended, 0);
    const totalConducted = active.reduce((sum, s) => sum + s.conducted, 0);

    const target = plan.overallTarget || 75;
    const current = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0;
    const recoveryRow = document.getElementById('overall-status-row');
    const recoveryVal = document.getElementById('overall-recovery-needed');
    const recoveryLabel = document.getElementById('overall-recovery-label');

    if (recoveryRow && recoveryVal) {
      if (current < target && target < 100 && totalConducted > 0) {
        const needed = Math.ceil((target * totalConducted - 100 * totalAttended) / (100 - target));
        if (needed > 0) {
          recoveryRow.style.display = 'flex';
          recoveryLabel.textContent = 'Recovery Classes';
          recoveryLabel.style.color = 'var(--red)';
          recoveryVal.textContent = `${needed} more`;
          recoveryVal.style.color = 'var(--red)';
        } else {
          recoveryRow.style.display = 'none';
        }
      } else if (current >= target && totalConducted > 0) {
        const safeBunks = Math.floor((100 * totalAttended - target * totalConducted) / target);
        recoveryRow.style.display = 'flex';
        recoveryLabel.textContent = 'Safe Overall Bunks';
        recoveryLabel.style.color = 'var(--green)';
        recoveryVal.textContent = String(Math.max(0, safeBunks));
        recoveryVal.style.color = 'var(--green)';
      } else {
        recoveryRow.style.display = 'none';
      }
    }

    renderGamification(subjectsList, overallPct, plan.overallTarget || 75);
  });

  document.getElementById('today-total').textContent = plan.totalClasses || 0;
  document.getElementById('today-attend').textContent = plan.mustAttend || 0;
  document.getElementById('today-bunk').textContent = plan.safeToBunk || 0;
  document.getElementById('today-unverified').textContent = plan.unverified || 0;

  renderRecommendations(plan.recommendations || [], plan);

  if (plan.highestRiskSubject) {
    const riskCard = document.getElementById('risk-card');
    riskCard.style.display = 'block';
    document.getElementById('risk-subject').textContent = plan.highestRiskSubject.name;
    document.getElementById('risk-detail').textContent =
      `${formatPercentage(plan.highestRiskSubject.percentage)}% — ${plan.highestRiskSubject.attended}/${plan.highestRiskSubject.conducted} classes`;
  }
}

async function renderRecommendations(recommendations, plan) {
  const container = document.getElementById('recommendations-list');
  container.innerHTML = '';

  const holidaysData = await sendMessage({ type: MessageType.GET_HOLIDAYS });
  const todayStr = new Date().toISOString().split('T')[0];
  const todayHoliday = (holidaysData?.holidays || []).find(h => h.date === todayStr);

  if (todayHoliday) {
    container.innerHTML = `
      <div class="no-data" style="padding: 14px 12px; margin-bottom: 12px; background: #f0fdf4; border-radius: var(--radius); border: 1px solid #bbf7d0;">
        <div style="font-weight: 700; font-size: 13px; color: #15803d; margin-bottom: 4px;">
          Holiday: ${escapeHtml(todayHoliday.name)}
        </div>
        <div style="font-size: 11.5px; color: #166534; line-height: 1.4;">
          No classes scheduled today according to the Academic Calendar. Enjoy your holiday!
        </div>
      </div>
      <div id="quick-subjects-preview" class="quick-subjects-preview"></div>
    `;
    loadQuickSubjectsPreview();
    return;
  }

  if (recommendations.length === 0) {
    const dayName = plan?.day || new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const isSunday = dayName === 'Sunday';
    const isWeekend = dayName === 'Sunday' || dayName === 'Saturday';

    container.innerHTML = `
      <div class="no-data" style="padding: 14px 12px; margin-bottom: 12px; background: var(--bg-secondary); border-radius: var(--radius); border: 1px solid var(--border);">
        <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">
          ${isSunday ? 'Sunday (Weekly Holiday) — No Classes Today' : isWeekend ? `${dayName} (Weekend) — No Classes Today` : 'No Classes Scheduled for Today'}
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.4;">
          Overall attendance is <strong>${formatPercentage(plan.overallPercentage || 0)}%</strong> (Target: ${plan.overallTarget || 75}%). Subject breakdown:
        </div>
      </div>
      <div id="quick-subjects-preview" class="quick-subjects-preview"></div>
    `;

    loadQuickSubjectsPreview();
    return;
  }

  for (const rec of recommendations) {
    const card = document.createElement('div');
    card.className = 'rec-card';

    const badgeClass = getBadgeClass(rec.type);
    const badgeLabel = getShortLabel(rec.type);

    card.innerHTML = `
      <div class="rec-header">
        <div>
          <span class="rec-subject">${escapeHtml(rec.subjectName || 'Unknown')}</span>
          ${rec.facultyName ? `<span style="font-size:10.5px;color:var(--accent-primary);font-weight:600;display:block;margin-top:2.5px">${escapeHtml(rec.facultyName)}</span>` : ''}
        </div>
        <span class="rec-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      ${rec.currentPercentage > 0 ? `
        <div class="rec-stats" style="display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:6px;margin-bottom:6px">
          <span>Current: <strong>${formatPercentage(rec.currentPercentage)}%</strong></span>
          <span>Bunk Now: <strong style="color:${rec.immediateSafeBunks > 0 ? 'var(--green)' : 'var(--red)'}">${rec.immediateSafeBunks}</strong></span>
          <span>Term Bunks: <strong style="color:${rec.safeBunksRemaining > 0 ? 'var(--green)' : 'var(--red)'}">${rec.safeBunksRemaining}</strong></span>
        </div>
      ` : ''}
      <div class="rec-reason">${escapeHtml(rec.reason)}</div>
    `;

    container.appendChild(card);
  }
}

async function loadQuickSubjectsPreview() {
  const preview = document.getElementById('quick-subjects-preview');
  if (!preview) return;

  const subjectsData = await sendMessage({ type: MessageType.GET_SUBJECTS });
  if (!subjectsData || !subjectsData.subjects || subjectsData.subjects.length === 0) {
    preview.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Open <a href="https://rcoem.in/studentCourseFileNew.htm" target="_blank" style="color:var(--accent-primary)">Attendance Page</a> to sync subjects.</div>`;
    return;
  }

  const projData = await sendMessage({ type: MessageType.GET_PROJECTIONS });
  const projections = projData?.projections || [];
  const projMap = new Map(projections.map(p => [p.subjectId, p]));

  preview.innerHTML = '';
  for (const sub of subjectsData.subjects) {
    if (sub.conducted === 0) continue;
    const proj = projMap.get(sub.id);
    const pct = sub.percentage;
    const isBelow = pct < 60;
    const isLowBuffer = pct >= 60 && pct < 62;

    const statusColor = isBelow ? 'var(--red)' : isLowBuffer ? 'var(--orange)' : 'var(--green)';
    const statusBadge = isBelow ? 'Below 60%' : isLowBuffer ? 'Low Buffer (60%)' : 'Safe (≥62%)';

    const item = document.createElement('div');
    item.className = 'rec-card';
    item.style.padding = '10px 12px';
    item.innerHTML = `
      <div class="rec-header">
        <div>
          <span class="rec-subject" style="font-size:12.5px">${escapeHtml(sub.name)}</span>
          ${sub.facultyName ? `<span style="font-size:10.5px;color:var(--accent-primary);font-weight:600;display:block;margin-top:2.5px">${escapeHtml(sub.facultyName)}</span>` : ''}
        </div>
        <span style="font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:4px;background:${isBelow ? 'var(--red-bg)' : isLowBuffer ? 'var(--orange-bg)' : 'var(--green-bg)'};color:${statusColor}">${statusBadge}</span>
      </div>
      <div class="rec-stats" style="flex-direction:column;align-items:flex-start;gap:3px;margin-top:4px">
        <div>Attended: <strong>${sub.attended}/${sub.conducted}</strong> (${formatPercentage(pct)}%)</div>
        ${proj ? `
        <div style="display:flex;gap:12px;font-size:11px;margin-top:2px">
          <span>Bunk Now: <strong style="color:${proj.immediateSafeBunks > 0 ? 'var(--green)' : 'var(--red)'}">${proj.immediateSafeBunks}</strong></span>
          <span>Term Bunks: <strong style="color:${proj.maximumSafeBunks > 0 ? 'var(--green)' : 'var(--red)'}">${proj.maximumSafeBunks}</strong></span>
        </div>
        ` : ''}
      </div>
      ${isBelow && proj ? `<div style="font-size:11px;color:var(--red);margin-top:4px;padding:4px 6px;background:var(--red-bg);border:1px solid var(--red-border);border-radius:4px">Recovery: Must attend next ${proj.minimumRequired} classes</div>` : ''}
    `;
    preview.appendChild(item);
  }
}

function animateProgressRing(percentage) {
  const circle = document.getElementById('progress-circle');
  if (!circle) return;

  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (percentage / 100) * circumference;

  const color = percentage >= 75 ? '#4ade80' :
    percentage >= 60 ? '#818cf8' :
      percentage >= 50 ? '#fb923c' : '#f87171';

  circle.style.stroke = color;

  setTimeout(() => {
    circle.style.strokeDashoffset = offset;
  }, 100);
}

function renderBunkView() {
  if (!todayPlan || !todayPlan.recommendations) {
    document.getElementById('bunk-summary-text').textContent = 'No data available. Open your portal to sync.';
    return;
  }

  const recs = todayPlan.recommendations;
  const summary = todayPlan.bunkSummary || '';

  document.getElementById('bunk-summary-text').textContent = summary;

  const mustAttend = recs.filter(r =>
    r.type === RecommendationType.MUST_ATTEND ||
    r.type === RecommendationType.ATTEND_LOW_BUFFER ||
    r.type === RecommendationType.HIGH_RISK
  );

  const safeList = recs.filter(r =>
    r.type === RecommendationType.BUNK_SAFE ||
    r.type === RecommendationType.OPTIONAL
  );

  const unverified = recs.filter(r => r.type === RecommendationType.DATA_NOT_VERIFIED);

  renderBunkList('bunk-must-list', mustAttend, 'var(--red)');
  renderBunkList('bunk-safe-list', safeList, 'var(--green)');

  if (unverified.length > 0) {
    document.getElementById('bunk-unverified').style.display = 'block';
    renderBunkList('bunk-unverified-list', unverified, 'var(--yellow)');
  }

  document.getElementById('bunk-must-attend').style.display = mustAttend.length > 0 ? 'block' : 'none';
  document.getElementById('bunk-safe').style.display = safeList.length > 0 ? 'block' : 'none';
}

function renderBunkList(containerId, items, color) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  for (const rec of items) {
    const item = document.createElement('div');
    item.className = 'bunk-item';
    item.innerHTML = `
      <span class="bunk-item-name">${escapeHtml(rec.subjectName || 'Unknown')}</span>
      <span class="bunk-item-pct" style="color:${color}">${rec.currentPercentage > 0 ? formatPercentage(rec.currentPercentage) + '%' : '—'}</span>
    `;
    container.appendChild(item);
  }
}

async function renderSubjectsView() {
  const container = document.getElementById('all-subjects-list');
  const syncTag = document.getElementById('subjects-sync-tag');
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading subjects...</div>';

  const subjectsData = await sendMessage({ type: MessageType.GET_SUBJECTS });
  if (!subjectsData || !subjectsData.subjects || subjectsData.subjects.length === 0) {
    container.innerHTML = `
      <div class="no-data">
        <div class="no-data-text">No attendance records found yet.<br>Open your <a href="https://rcoem.in/studentCourseFileNew.htm" target="_blank" style="color:var(--accent-primary)">Attendance page</a> to sync.</div>
      </div>
    `;
    return;
  }

  const holidaysData = await sendMessage({ type: MessageType.GET_HOLIDAYS });
  const holidayCount = holidaysData?.count || 0;

  if (syncTag) {
    let tag = subjectsData.syncedAt ? `Synced ${relativeTime(subjectsData.syncedAt)}` : '';
    if (holidayCount > 0) {
      tag += ` • ${holidayCount} holidays factored`;
    }
    syncTag.textContent = tag;
  }

  const projData = await sendMessage({ type: MessageType.GET_PROJECTIONS });
  const projections = projData?.projections || [];
  const projMap = new Map(projections.map(p => [p.subjectId, p]));

  container.innerHTML = '';

  for (const subject of subjectsData.subjects) {
    if (subject.conducted === 0) continue;
    const proj = projMap.get(subject.id);
    const pct = subject.percentage;
    const isBelow = pct < 60;
    const isLowBuffer = pct >= 60 && pct < 62;

    const statusColor = isBelow ? 'var(--red)' : isLowBuffer ? 'var(--orange)' : 'var(--green)';
    const statusBadge = isBelow ? 'Below 60%' : isLowBuffer ? 'Low Buffer (60%)' : 'Safe (≥62%)';

    const ifAttend = ((subject.attended + 1) / (subject.conducted + 1)) * 100;
    const ifBunk = (subject.attended / (subject.conducted + 1)) * 100;

    const card = document.createElement('div');
    card.className = 'rec-card';
    card.style.marginBottom = '10px';
    card.innerHTML = `
      <div class="rec-header">
        <div>
          <span class="rec-subject" style="font-size:13.5px;font-weight:700">${escapeHtml(subject.name)}</span>
          <div style="display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:2.5px;align-items:center">
            ${subject.code ? `<span style="font-size:10.5px;color:var(--text-muted)">${escapeHtml(subject.code)}</span>` : ''}
            ${subject.code && subject.facultyName ? `<span style="font-size:10px;color:var(--border-light)">|</span>` : ''}
            ${subject.facultyName ? `<span style="font-size:10.5px;color:var(--accent-primary);font-weight:600">${escapeHtml(subject.facultyName)}</span>` : ''}
          </div>
        </div>
        <span style="font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:4px;background:${isBelow ? 'var(--red-bg)' : isLowBuffer ? 'var(--orange-bg)' : 'var(--green-bg)'};color:${statusColor}">${statusBadge}</span>
      </div>
      <div class="rec-stats" style="margin-top:6px;margin-bottom:6px;display:flex;flex-direction:column;gap:3px">
        <div>Attendance: <strong style="color:${statusColor}">${subject.attended}/${subject.conducted} (${formatPercentage(pct)}%)</strong></div>
        ${proj ? `
        <div style="display:flex;gap:12px;font-size:11.5px">
          <span>Bunk Now: <strong style="color:${proj.immediateSafeBunks > 0 ? 'var(--green)' : 'var(--red)'}">${proj.immediateSafeBunks}</strong></span>
          <span>Term Bunks: <strong style="color:${proj.maximumSafeBunks > 0 ? 'var(--green)' : 'var(--red)'}">${proj.maximumSafeBunks}</strong></span>
        </div>
        ` : ''}
      </div>
      <div style="display:flex;gap:12px;font-size:11.5px;color:var(--text-muted);margin-bottom:4px">
        <span>If +1 class: <strong style="color:var(--green)">${formatPercentage(ifAttend)}%</strong></span>
        <span>If missed: <strong style="color:var(--red)">${formatPercentage(ifBunk)}%</strong></span>
      </div>
      ${isBelow && proj ? `
        <div style="font-size:11px;color:var(--red);background:var(--red-bg);border:1px solid var(--red-border);padding:6px 8px;border-radius:4px;margin-top:6px;line-height:1.4">
          <strong>Recovery:</strong> Must attend next <strong>${proj.minimumRequired}</strong> consecutive classes to reach the 60% subject minimum.
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  }
}

async function renderDebugView() {
  const debugData = await sendMessage({ type: MessageType.GET_DEBUG_INFO });
  const pre = document.getElementById('debug-data');

  if (debugData) {
    pre.textContent = JSON.stringify(debugData, null, 2);
  } else {
    pre.textContent = 'Unable to fetch debug information.';
  }
}

function updateFirstRunStatus(state) {
  const states = {
    'INITIALIZING': { step1: 'Pending', step2: 'Pending', step3: 'Pending' },
    'WAITING_FOR_PORTAL': { step1: 'Pending', step2: 'Pending', step3: 'Pending' },
    'SCHEDULE_DETECTED': { step1: 'Done', step2: 'Pending', step3: 'Pending' },
    'ATTENDANCE_DETECTED': { step1: 'Pending', step2: 'Done', step3: 'Pending' },
    'READY': { step1: 'Done', step2: 'Done', step3: 'Done' },
  };

  const status = states[state] || states['INITIALIZING'];

  document.getElementById('step-1-status').textContent = status.step1;
  document.getElementById('step-2-status').textContent = status.step2;
  document.getElementById('step-3-status').textContent = status.step3;

  if (status.step1 === 'Done') document.getElementById('step-1').classList.add('completed');
  if (status.step2 === 'Done') document.getElementById('step-2').classList.add('completed');
  if (status.step3 === 'Done') document.getElementById('step-3').classList.add('completed');
}

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'settings') {
        chrome.runtime.openOptionsPage();
        return;
      }
      showView(view);

      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function setupButtons() {

  document.getElementById('btn-bunk-today')?.addEventListener('click', () => {
    showView('bunk');
  });

  document.getElementById('btn-back-bunk')?.addEventListener('click', () => {
    showView('dashboard');
  });
  document.getElementById('btn-back-subjects')?.addEventListener('click', () => {
    showView('dashboard');
  });
  document.getElementById('btn-back-debug')?.addEventListener('click', () => {
    showView('dashboard');
  });

  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.textContent = 'Recalculating...';
    await sendMessage({ type: MessageType.FORCE_RESYNC });
    await loadData();
  });
  document.getElementById('btn-debug')?.addEventListener('click', () => {
    showView('debug');
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('btn-export')?.addEventListener('click', async () => {
    const data = await sendMessage({ type: MessageType.EXPORT_DATA });
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rcoem-attendance-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  document.getElementById('btn-clear')?.addEventListener('click', async () => {
    if (confirm('Clear all stored attendance data? This cannot be undone.')) {
      await sendMessage({ type: MessageType.CLEAR_DATA });
      todayPlan = null;
      showView('firstrun');
      updateFirstRunStatus('INITIALIZING');
    }
  });

  document.getElementById('btn-reset-all-data')?.addEventListener('click', async () => {
    if (confirm('Reset all saved timetable and attendance data? This will clear stored records so you can start fresh.')) {
      await sendMessage({ type: MessageType.CLEAR_DATA });
      todayPlan = null;
      showView('firstrun');
      updateFirstRunStatus('INITIALIZING');
    }
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    exportPDF();
  });
}

function showView(viewName) {

  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

  const viewEl = document.getElementById(`view-${viewName}`);
  if (viewEl) {
    viewEl.style.display = 'block';
    currentView = viewName;
  }

  if (viewName === 'bunk') renderBunkView();
  if (viewName === 'bunk-dates') renderBunkDatesView();
  if (viewName === 'subjects') renderSubjectsView();
  if (viewName === 'debug') renderDebugView();
  if (viewName === 'analytics') renderAnalyticsView();
  if (viewName === 'strategy') renderStrategyView();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
}

function navigatePortalPage(targetUrl) {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.url && activeTab.url.includes('rcoem.in')) {
        chrome.tabs.update(activeTab.id, { url: targetUrl });
      } else {
        chrome.tabs.query({ url: '*://rcoem.in/*' }, (rcoemTabs) => {
          if (rcoemTabs && rcoemTabs.length > 0) {
            chrome.tabs.update(rcoemTabs[0].id, { url: targetUrl, active: true });
          } else {
            chrome.tabs.create({ url: targetUrl });
          }
        });
      }
    });
  } catch (e) {
    window.open(targetUrl, '_blank');
  }
}

async function renderBunkDatesView() {
  const container = document.getElementById('popup-bunk-dates-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:15px;color:var(--text-muted)">Calculating date-wise semester schedule...</div>';

  const planResponse = await sendMessage({ type: MessageType.GET_TODAY_PLAN });
  const dateWise = planResponse?.plan?.dateWiseBunkPlanner;
  const weekly = planResponse?.plan?.weeklyBunkPlanner;

  const hasDateWise = dateWise && dateWise.length > 0;
  const hasWeekly = weekly && Object.keys(weekly).length > 0;

  if (!hasDateWise && !hasWeekly) {
    container.innerHTML = `
      <div class="no-data" style="text-align:center;padding:16px;">
        <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:8px;">No semester schedule found yet.</div>
        <button id="btn-sync-timetable" class="primary-btn" style="padding:6px 12px;font-size:11.5px;background:#02529c;color:#fff;border:none;border-radius:4px;cursor:pointer;">
          Open Timetable Page in Portal
        </button>
      </div>
    `;
    container.querySelector('#btn-sync-timetable')?.addEventListener('click', () => {
      navigatePortalPage('https://rcoem.in/stu_StudentTimeTable.htm');
    });
    return;
  }

  container.innerHTML = '';

  if (hasDateWise) {
    for (const item of dateWise) {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--card-bg, #ffffff);border:1px solid var(--border, #e2e8f0);border-radius:6px;padding:10px;margin-bottom:6px;';
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <strong style="font-size:12.5px;color:var(--text-primary);">${escapeHtml(item.dateStr)}</strong>
          <span style="font-size:10px;font-weight:700;color:${item.verdictColor};padding:2px 8px;border-radius:4px;background:${item.verdict === 'FULL_DAY_SAFE' ? '#f0fdf4' : item.verdict === 'PARTIAL_SAFE' ? '#fffbeb' : '#fef2f2'};">
            ${item.verdictText}
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${item.classes.map(c => `
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-secondary, #f8fafc);padding:5px 8px;border-radius:4px;font-size:11px;">
              <div>
                <strong>${escapeHtml(c.subjectName)}</strong>
                ${c.startTime ? `<span style="font-size:9.5px;color:var(--text-muted);margin-left:4px;">${c.startTime}</span>` : ''}
              </div>
              <span style="font-size:9.5px;font-weight:700;color:${c.color};">${c.label} ${c.safeBunks > 0 ? `(${c.safeBunks} safe)` : ''}</span>
            </div>
          `).join('')}
        </div>
      `;
      container.appendChild(card);
    }
  } else {
    for (const day of Object.keys(weekly)) {
      const d = weekly[day];
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--card-bg, #ffffff);border:1px solid var(--border, #e2e8f0);border-radius:6px;padding:10px;margin-bottom:6px;';
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <strong style="font-size:13px;color:var(--text-primary);">${d.day}</strong>
          <span style="font-size:10px;font-weight:700;color:${d.verdictColor};padding:2px 8px;border-radius:4px;background:${d.verdict === 'BUNK_DAY_SAFE' ? '#f0fdf4' : d.verdict === 'PARTIAL_SAFE' ? '#fffbeb' : '#fef2f2'};">
            ${d.verdictText}
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${d.classes.map(c => `
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-secondary, #f8fafc);padding:4px 8px;border-radius:4px;font-size:11px;">
              <div>
                <strong>${escapeHtml(c.subjectName)}</strong>
                ${c.startTime ? `<span style="font-size:9.5px;color:var(--text-muted);margin-left:4px;">${c.startTime}</span>` : ''}
              </div>
              <span style="font-size:9.5px;font-weight:700;color:${c.color};">${c.label} ${c.safeBunks > 0 ? `(${c.safeBunks} safe)` : ''}</span>
            </div>
          `).join('')}
        </div>
      `;
      container.appendChild(card);
    }
  }
}

function updateSyncStatus(plan) {
  const statusEl = document.getElementById('sync-status');
  if (!statusEl) return;

  if (plan && plan.generatedAt) {
    const isStale = plan.isStale;
    statusEl.textContent = isStale
      ? `Data may be outdated`
      : `Updated ${relativeTime(plan.generatedAt)}`;
    statusEl.style.color = isStale ? 'var(--orange)' : 'var(--text-muted)';
  } else {
    statusEl.textContent = 'Not synced yet';
  }
}

function renderGamification(subjects, overallPct, targetPct) {
  const section = document.getElementById('badges-section');
  const grid = document.getElementById('badges-grid');
  const countEl = document.getElementById('badges-count');
  if (!section || !grid) return;

  const badges = computeBadges(subjects, overallPct, 0, targetPct);
  const summary = getBadgeSummary(badges);

  section.style.display = 'block';
  countEl.textContent = `${summary.earned}/${summary.total}`;

  grid.innerHTML = '';
  for (const badge of badges) {
    const pill = document.createElement('span');
    pill.className = `badge-pill ${badge.earned ? '' : 'locked'}`;
    pill.style.color = badge.earned ? badge.color : 'var(--text-muted)';
    pill.style.backgroundColor = badge.earned ? badge.bgColor : 'var(--bg-secondary)';
    pill.style.borderColor = badge.earned ? badge.color : 'var(--border)';
    pill.title = badge.description;
    pill.textContent = badge.name;
    grid.appendChild(pill);
  }
}

async function renderAnalyticsView() {
  const subjectsData = await sendMessage({ type: MessageType.GET_SUBJECTS });
  if (!subjectsData || !subjectsData.subjects || subjectsData.subjects.length === 0) return;

  const projData = await sendMessage({ type: MessageType.GET_PROJECTIONS });
  const projections = projData?.projections || [];
  const projMap = new Map(projections.map(p => [p.subjectId, p]));

  const subjects = subjectsData.subjects.filter(s => s.conducted > 0);
  const prefsData = await sendMessage({ type: MessageType.GET_PREFERENCES });
  const targetPct = prefsData?.overallTarget || 75;

  const sorted = [...subjects].sort((a, b) => a.percentage - b.percentage);

  const canvas = document.getElementById('analytics-chart');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = 380;
    const h = 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const barCount = sorted.length;
    const margin = { top: 20, right: 10, bottom: 50, left: 40 };
    const chartW = w - margin.left - margin.right;
    const chartH = h - margin.top - margin.bottom;
    const barWidth = Math.min(32, (chartW / barCount) * 0.7);
    const gap = (chartW - barWidth * barCount) / (barCount + 1);

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (chartH * (1 - i / 4));
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(w - margin.right, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`${i * 25}%`, margin.left - 4, y + 3);
    }

    const targetY = margin.top + chartH * (1 - targetPct / 100);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(margin.left, targetY);
    ctx.lineTo(w - margin.right, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Target ${targetPct}%`, margin.left + 2, targetY - 4);

    for (let i = 0; i < barCount; i++) {
      const sub = sorted[i];
      const pct = Math.min(sub.percentage, 100);
      const x = margin.left + gap + i * (barWidth + gap);
      const barH = (pct / 100) * chartH;
      const y = margin.top + chartH - barH;

      const color = pct < 60 ? '#dc2626' : pct < targetPct ? '#d97706' : '#16a34a';
      ctx.fillStyle = color;

      const r = Math.min(3, barWidth / 2);
      ctx.beginPath();
      ctx.moveTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.arcTo(x + barWidth, y, x + barWidth, y + r, r);
      ctx.lineTo(x + barWidth, y + barH);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = color;
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${pct.toFixed(0)}%`, x + barWidth / 2, y - 4);

      ctx.fillStyle = '#64748b';
      ctx.font = '7px Arial';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barWidth / 2, margin.top + chartH + 8);
      ctx.rotate(-Math.PI / 4);
      const label = (sub.code || sub.name).substring(0, 10);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  const container = document.getElementById('analytics-insights');
  container.innerHTML = '';

  const best = subjects.reduce((a, b) => a.percentage > b.percentage ? a : b, subjects[0]);
  const worst = subjects.reduce((a, b) => a.percentage < b.percentage ? a : b, subjects[0]);
  const critical = subjects.filter(s => s.percentage < 60);
  const aboveTarget = subjects.filter(s => s.percentage >= targetPct);
  const totalAttended = subjects.reduce((s, sub) => s + sub.attended, 0);
  const totalConducted = subjects.reduce((s, sub) => s + sub.conducted, 0);

  const insights = [
    {
      title: 'BEST PERFORMING SUBJECT',
      value: best.name,
      detail: `${formatPercentage(best.percentage)}% (${best.attended}/${best.conducted} classes)`,
      color: 'var(--green)',
    },
    {
      title: 'ATTENTION NEEDED',
      value: worst.name,
      detail: `${formatPercentage(worst.percentage)}% (${worst.attended}/${worst.conducted} classes)`,
      color: worst.percentage < 60 ? 'var(--red)' : 'var(--orange)',
    },
    {
      title: 'OVERALL SUMMARY',
      value: `${formatPercentage((totalAttended / totalConducted) * 100)}%`,
      detail: `${totalAttended}/${totalConducted} total classes attended • ${aboveTarget.length}/${subjects.length} subjects above ${targetPct}% target`,
      color: 'var(--accent-primary)',
    },
  ];

  if (critical.length > 0) {
    insights.push({
      title: 'CRITICAL SUBJECTS (<60%)',
      value: `${critical.length} Subject${critical.length > 1 ? 's' : ''} Below Minimum`,
      detail: critical.map(s => `${s.name} (${formatPercentage(s.percentage)}%)`).join(', '),
      color: 'var(--red)',
    });
  }

  for (const insight of insights) {
    const card = document.createElement('div');
    card.className = 'analytics-card';
    card.innerHTML = `
      <div class="analytics-card-header">
        <span class="analytics-card-title">${insight.title}</span>
      </div>
      <div class="analytics-card-value" style="color:${insight.color}">${escapeHtml(insight.value)}</div>
      <div class="analytics-card-detail">${escapeHtml(insight.detail)}</div>
    `;
    container.appendChild(card);
  }
}

let strategySubjects = [];
let strategyProjections = [];

async function renderStrategyView() {
  const subjectsData = await sendMessage({ type: MessageType.GET_SUBJECTS });
  if (!subjectsData || !subjectsData.subjects) return;

  strategySubjects = subjectsData.subjects.filter(s => s.conducted > 0);
  const projData = await sendMessage({ type: MessageType.GET_PROJECTIONS });
  strategyProjections = projData?.projections || [];

  const select = document.getElementById('strategy-subject');
  select.innerHTML = '';
  for (const sub of strategySubjects) {
    const opt = document.createElement('option');
    opt.value = sub.id;
    opt.textContent = `${sub.name} (${formatPercentage(sub.percentage)}%)`;
    select.appendChild(opt);
  }

  const slider = document.getElementById('strategy-bunks');
  slider.value = 0;
  document.getElementById('strategy-bunk-count').textContent = '0';

  select.onchange = () => updateStrategyResults();
  slider.oninput = () => {
    document.getElementById('strategy-bunk-count').textContent = slider.value;
    updateStrategyResults();
  };

  updateStrategyResults();
}

function updateStrategyResults() {
  const subjectId = document.getElementById('strategy-subject').value;
  const bunkCount = parseInt(document.getElementById('strategy-bunks').value) || 0;

  const subject = strategySubjects.find(s => s.id === subjectId);
  if (!subject) return;

  const proj = strategyProjections.find(p => p.subjectId === subjectId);
  const remaining = proj?.remainingClasses || 0;
  const targetPct = proj?.targetPct || 62;

  const currentPct = subject.percentage;

  const newAttended = subject.attended;
  const newConducted = subject.conducted + bunkCount;
  const afterPct = newConducted > 0 ? (newAttended / newConducted) * 100 : 0;

  let classesToRecover = 0;
  if (afterPct < targetPct && targetPct < 100) {
    classesToRecover = Math.ceil((targetPct * newConducted - 100 * newAttended) / (100 - targetPct));
  }

  const remainingAfterBunk = Math.max(0, remaining - bunkCount);
  const forecastAttended = newAttended + remainingAfterBunk;
  const forecastConducted = newConducted + remainingAfterBunk;
  const forecastPct = forecastConducted > 0 ? (forecastAttended / forecastConducted) * 100 : 0;

  document.getElementById('strategy-current').textContent = `${formatPercentage(currentPct)}%`;
  document.getElementById('strategy-current').style.color = currentPct >= targetPct ? 'var(--green)' : 'var(--red)';

  document.getElementById('strategy-after').textContent = `${formatPercentage(afterPct)}%`;
  document.getElementById('strategy-after').style.color = afterPct >= targetPct ? 'var(--green)' : afterPct >= 60 ? 'var(--orange)' : 'var(--red)';

  document.getElementById('strategy-recover').textContent = classesToRecover > 0 ? String(classesToRecover) : '0 (None Required)';
  document.getElementById('strategy-recover').style.color = classesToRecover > 0 ? 'var(--red)' : 'var(--green)';

  document.getElementById('strategy-forecast').textContent = `${formatPercentage(forecastPct)}%`;
  document.getElementById('strategy-forecast').style.color = forecastPct >= targetPct ? 'var(--green)' : 'var(--red)';

  const verdictEl = document.getElementById('strategy-verdict');
  if (bunkCount === 0) {
    verdictEl.className = 'strategy-verdict';
    verdictEl.innerHTML = '<strong>Simulation Mode:</strong> Adjust the slider to simulate absent classes and forecast impact.';
  } else if (afterPct >= targetPct) {
    verdictEl.className = 'strategy-verdict safe';
    verdictEl.innerHTML = `<strong>Safe:</strong> Missing ${bunkCount} class${bunkCount > 1 ? 'es' : ''} keeps attendance above the ${targetPct}% target.`;
  } else if (afterPct >= 60) {
    verdictEl.className = 'strategy-verdict warning';
    verdictEl.innerHTML = `<strong>Warning:</strong> Missing ${bunkCount} class${bunkCount > 1 ? 'es' : ''} drops attendance to ${formatPercentage(afterPct)}%. ${classesToRecover} recovery classes required to regain ${targetPct}%.`;
  } else {
    verdictEl.className = 'strategy-verdict danger';
    verdictEl.innerHTML = `<strong>Critical:</strong> Attendance drops below 60% minimum to ${formatPercentage(afterPct)}%. ${classesToRecover} mandatory recovery classes needed.`;
  }
}

async function exportPDF() {
  const subjectsData = await sendMessage({ type: MessageType.GET_SUBJECTS });
  if (!subjectsData || !subjectsData.subjects) return;

  const projData = await sendMessage({ type: MessageType.GET_PROJECTIONS });
  const projections = projData?.projections || [];
  const projMap = new Map(projections.map(p => [p.subjectId, p]));
  const prefsData = await sendMessage({ type: MessageType.GET_PREFERENCES });
  const targetPct = prefsData?.overallTarget || 75;

  const subjects = subjectsData.subjects.filter(s => s.conducted > 0);
  const totalAttended = subjects.reduce((s, sub) => s + sub.attended, 0);
  const totalConducted = subjects.reduce((s, sub) => s + sub.conducted, 0);
  const overallPct = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0;

  let rows = '';
  for (const sub of subjects) {
    const proj = projMap.get(sub.id);
    const risk = proj?.riskLevel || '—';
    const riskColor = risk === 'HIGH' ? '#dc2626' : risk === 'SAFE' ? '#16a34a' : '#d97706';
    const pctColor = sub.percentage < 60 ? '#dc2626' : sub.percentage < targetPct ? '#d97706' : '#16a34a';
    rows += `
      <tr>
        <td>${sub.code || '—'}</td>
        <td>${sub.name}</td>
        <td>${sub.facultyName || '—'}</td>
        <td>${sub.attended}/${sub.conducted}</td>
        <td style="color:${pctColor};font-weight:bold">${sub.percentage.toFixed(2)}%</td>
        <td style="color:${riskColor};font-weight:bold">${risk}</td>
        <td>${proj ? proj.immediateSafeBunks : '—'}</td>
        <td>${proj ? proj.minimumRequired : '—'}</td>
      </tr>
    `;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Attendance Report — RCOEM/RBU Operation 75</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #02529c; font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 12px; margin-bottom: 20px; }
    .overall { display: flex; gap: 20px; margin-bottom: 24px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
    .overall-item { text-align: center; }
    .overall-item .val { font-size: 24px; font-weight: 800; color: #02529c; }
    .overall-item .lbl { font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #d8ebf9; color: #02529c; padding: 8px 10px; text-align: left; font-weight: 700; border: 1px solid #bce1f7; }
    td { padding: 8px 10px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>Attendance Report — RCOEM/RBU Operation 75</h1>
  <div class="subtitle">Generated on ${dateStr} at ${timeStr} • Target: ${targetPct}%</div>
  <div class="overall">
    <div class="overall-item"><div class="val">${overallPct.toFixed(2)}%</div><div class="lbl">Overall Attendance</div></div>
    <div class="overall-item"><div class="val">${totalAttended}/${totalConducted}</div><div class="lbl">Total Classes</div></div>
    <div class="overall-item"><div class="val">${subjects.length}</div><div class="lbl">Active Subjects</div></div>
    <div class="overall-item"><div class="val">${targetPct}%</div><div class="lbl">Target</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Code</th><th>Course Name</th><th>Faculty</th><th>Attendance Count</th><th>Percentage</th><th>Risk</th><th>Safe Bunks</th><th>Classes to Maintain</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    Report generated by RCOEM/RBU Operation 75 Extension.<br>
    This document is an academic attendance summary for reference.
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Popup] Message error:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      console.warn('[Popup] Failed to send message:', err);
      resolve(null);
    }
  });
}

function getBadgeClass(type) {
  const map = {
    [RecommendationType.MUST_ATTEND]: 'must-attend',
    [RecommendationType.ATTEND_LOW_BUFFER]: 'low-buffer',
    [RecommendationType.BUNK_SAFE]: 'bunk-safe',
    [RecommendationType.OPTIONAL]: 'optional',
    [RecommendationType.DATA_NOT_VERIFIED]: 'unverified',
    [RecommendationType.HIGH_RISK]: 'high-risk',
  };
  return map[type] || 'unverified';
}

function getShortLabel(type) {
  const map = {
    [RecommendationType.MUST_ATTEND]: 'MUST ATTEND',
    [RecommendationType.ATTEND_LOW_BUFFER]: 'LOW BUFFER',
    [RecommendationType.BUNK_SAFE]: 'BUNK SAFE',
    [RecommendationType.OPTIONAL]: 'OPTIONAL',
    [RecommendationType.DATA_NOT_VERIFIED]: 'UNVERIFIED',
    [RecommendationType.HIGH_RISK]: 'HIGH RISK',
  };
  return map[type] || 'UNKNOWN';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
