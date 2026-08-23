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

import { relativeTime, getDynamicSemesterEndDate } from '../utils/date-utils.js';

const INJECTOR_ATTR = 'data-ai-injected';
const CONTAINER_ID = 'ai-schedule-insights';

export function injectScheduleRecommendations(recommendations, classes, lastSyncTime, isStale) {

  removeInjectedContent();

  const scheduleContainer = findScheduleContainer();
  if (!scheduleContainer) return;

  const scheduleItems = findScheduleItems(scheduleContainer);

  if (scheduleItems.length === 0) {

    injectSummaryCard(scheduleContainer, recommendations, lastSyncTime, isStale);
    return;
  }

  for (const item of scheduleItems) {
    const matchingRec = findMatchingRecommendation(item, recommendations, classes);
    if (matchingRec) {
      injectRecommendationCard(item.element, matchingRec, lastSyncTime);
    }
  }

  injectSyncStatus(scheduleContainer, lastSyncTime, isStale);
}

export function removeInjectedContent() {
  const existing = document.querySelectorAll(`[${INJECTOR_ATTR}]`);
  existing.forEach(el => el.remove());
}

function findScheduleContainer() {

  const allElements = document.querySelectorAll('*');

  for (const el of allElements) {
    const directText = getDirectText(el).toLowerCase();
    if (directText.includes("today's schedule") || directText.includes("todays schedule")) {

      return el.parentElement || el;
    }
  }

  return null;
}

function findScheduleItems(container) {
  const items = [];

  const selectors = [
    'tr:not(:first-child)',
    'li',
    '.schedule-item',
    '.class-item',
    '[class*="schedule-row"]',
    '[class*="class-row"]',
    '[class*="period"]',
    '.row',
    '.card',
  ];

  for (const selector of selectors) {
    const elements = container.querySelectorAll(selector);
    if (elements.length >= 1) {
      for (const el of elements) {
        const text = el.innerText || '';
        if (text.trim().length > 3 && !text.toLowerCase().includes("today's schedule")) {
          items.push({ element: el, text: text.trim() });
        }
      }
      if (items.length > 0) return items;
    }
  }

  for (const child of container.children) {
    const text = child.innerText || '';
    if (text.trim().length > 3 && !text.toLowerCase().includes("today's schedule")) {
      items.push({ element: child, text: text.trim() });
    }
  }

  return items;
}

function findMatchingRecommendation(item, recommendations, classes) {
  const itemTextLower = item.text.toLowerCase();

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    const cls = classes[i];

    if (!cls) continue;

    const subjectLower = (cls.subjectName || '').toLowerCase();
    const normalizedLower = (cls.normalizedName || '').toLowerCase();

    if (subjectLower && (itemTextLower.includes(subjectLower) || subjectLower.includes(itemTextLower.substring(0, 20)))) {
      return rec;
    }
    if (normalizedLower && itemTextLower.includes(normalizedLower)) {
      return rec;
    }

    if (cls.courseCode && itemTextLower.includes(cls.courseCode.toLowerCase())) {
      return rec;
    }
  }

  return null;
}

function injectRecommendationCard(afterElement, rec, lastSyncTime) {
  const card = document.createElement('div');
  card.setAttribute(INJECTOR_ATTR, 'true');
  card.style.cssText = `
    margin: 8px 0;
    padding: 12px 16px;
    border-radius: 10px;
    border-left: 4px solid ${rec.borderColor};
    background: ${rec.bgColor};
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.5;
    backdrop-filter: blur(10px);
    transition: all 0.2s ease;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  `;

  const badge = document.createElement('span');
  badge.style.cssText = `
    font-weight: 700;
    font-size: 13px;
    color: ${rec.color};
    letter-spacing: 0.3px;
  `;
  badge.textContent = rec.label;
  header.appendChild(badge);

  const percentage = document.createElement('span');
  percentage.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    color: ${rec.color};
  `;
  percentage.textContent = rec.currentPercentage > 0 ? `${rec.currentPercentage.toFixed(1)}%` : '';
  header.appendChild(percentage);

  card.appendChild(header);

  if (rec.ifAttendPercentage > 0) {
    const whatIf = document.createElement('div');
    whatIf.style.cssText = `
      display: flex;
      gap: 16px;
      margin: 6px 0;
      font-size: 12px;
      color: #666;
    `;
    whatIf.innerHTML = `
      <span>If attend: <strong style="color:#22c55e">${rec.ifAttendPercentage.toFixed(2)}%</strong></span>
      <span>If bunk: <strong style="color:#ef4444">${rec.ifBunkPercentage.toFixed(2)}%</strong></span>
    `;
    card.appendChild(whatIf);
  }

  const reason = document.createElement('div');
  reason.style.cssText = `
    font-size: 11.5px;
    color: #888;
    margin-top: 4px;
    line-height: 1.4;
  `;
  reason.textContent = rec.reason;
  card.appendChild(reason);

  if (rec.mathBreakdown) {
    const whyBtn = document.createElement('button');
    whyBtn.textContent = 'WHY?';
    whyBtn.style.cssText = `
      margin-top: 8px;
      padding: 4px 12px;
      border: 1px solid ${rec.borderColor};
      border-radius: 6px;
      background: transparent;
      color: ${rec.color};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.5px;
      transition: all 0.15s ease;
    `;

    whyBtn.addEventListener('mouseenter', () => {
      whyBtn.style.background = rec.bgColor;
    });
    whyBtn.addEventListener('mouseleave', () => {
      whyBtn.style.background = 'transparent';
    });

    const breakdown = document.createElement('pre');
    breakdown.style.cssText = `
      display: none;
      margin-top: 8px;
      padding: 10px;
      background: rgba(0,0,0,0.05);
      border-radius: 6px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      line-height: 1.6;
      color: #555;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    breakdown.textContent = rec.mathBreakdown;

    whyBtn.addEventListener('click', () => {
      breakdown.style.display = breakdown.style.display === 'none' ? 'block' : 'none';
      whyBtn.textContent = breakdown.style.display === 'none' ? 'WHY?' : 'HIDE';
    });

    card.appendChild(whyBtn);
    card.appendChild(breakdown);
  }

  afterElement.parentNode.insertBefore(card, afterElement.nextSibling);
}

function injectSummaryCard(container, recommendations, lastSyncTime, isStale) {
  const card = document.createElement('div');
  card.setAttribute(INJECTOR_ATTR, 'true');
  card.style.cssText = `
    margin: 12px 0;
    padding: 14px 16px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 10px;
    letter-spacing: 0.3px;
  `;
  title.textContent = 'RCOEM ATTENDANCE SE BACHO YOJNA';
  card.appendChild(title);

  if (isStale) {
    const staleWarning = document.createElement('div');
    staleWarning.style.cssText = `
      padding: 8px 12px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      font-size: 12px;
      color: #b45309;
      margin-bottom: 10px;
    `;
    staleWarning.textContent = `Attendance cache may be outdated. Last synced ${relativeTime(lastSyncTime)}. Open Attendance page to refresh.`;
    card.appendChild(staleWarning);
  }

  for (const rec of recommendations) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12.5px;
    `;

    const left = document.createElement('span');
    left.innerHTML = `<strong>${rec.subjectName || 'Unknown'}</strong>`;
    row.appendChild(left);

    const right = document.createElement('span');
    right.style.cssText = `font-size: 11px; color: ${rec.color}; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${rec.bgColor}; border: 1px solid ${rec.borderColor};`;
    right.textContent = rec.label;
    row.appendChild(right);

    card.appendChild(row);
  }

  if (lastSyncTime) {
    const sync = document.createElement('div');
    sync.style.cssText = `
      margin-top: 8px;
      font-size: 11px;
      color: #64748b;
      text-align: right;
    `;
    sync.textContent = `Attendance synced ${relativeTime(lastSyncTime)}`;
    card.appendChild(sync);
  }

  container.appendChild(card);
}

function injectSyncStatus(container, lastSyncTime, isStale) {
  const status = document.createElement('div');
  status.setAttribute(INJECTOR_ATTR, 'true');
  status.style.cssText = `
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 11px;
    text-align: right;
    color: ${isStale ? '#b45309' : '#64748b'};
    background: ${isStale ? '#fffbeb' : 'transparent'};
  `;

  if (lastSyncTime) {
    status.textContent = `Attendance synced ${relativeTime(lastSyncTime)}`;
  } else {
    status.textContent = 'No attendance data. Open Attendance page to sync.';
  }

  container.appendChild(status);
}

function getDirectText(el) {
  return Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent)
    .join('')
    .trim();
}

export function injectDashboardCounterCard(plan, studentInfo, lastSync, isStale) {

  const floatingRoot = document.getElementById('ai-floating-widget-root');
  if (floatingRoot) floatingRoot.remove();

  const existingCard = document.getElementById('ai-operation75-dashboard-card');
  if (existingCard) existingCard.remove();

  let cardRow = null;
  let placementCard = null;

  const allContainers = Array.from(document.querySelectorAll('div, tr, tbody, table, section, ul'));
  for (const container of allContainers) {
    const text = (container.innerText || '').toLowerCase();

    if (
      text.includes('announcements') &&
      text.includes('attendance') &&
      text.includes('assessment') &&
      text.includes('task') &&
      text.includes('placement')
    ) {

      const statChildren = Array.from(container.children).filter(child => {
        const ct = (child.innerText || '').toLowerCase();
        return (
          ct.includes('announcements') ||
          ct.includes('attendance') ||
          ct.includes('assessment') ||
          ct.includes('task') ||
          ct.includes('placement')
        );
      });

      if (statChildren.length >= 4) {
        cardRow = container;

        placementCard = statChildren.find(c => (c.innerText || '').toLowerCase().includes('placement')) || statChildren[statChildren.length - 1];
        break;
      }
    }
  }

  if (!cardRow || !placementCard) {
    console.log('[Attendance Insights] Top 5-card dashboard row not found yet');
    return;
  }

  const realCard = placementCard;

  const overallPct = plan?.overallPercentage || 0;
  const target = plan?.overallTarget || 75;
  const isBelow = overallPct < target;
  const overallColor = isBelow ? '#dc2626' : '#16a34a';

  const overallConducted = plan?.overallConducted || 0;
  const overallAttended = plan?.overallAttended || 0;

  let metricTop = '75%';
  let metricSub = 'Operation 75';
  if (isBelow && target < 100 && overallConducted > 0) {
    const needed = Math.max(1, Math.ceil((target * overallConducted - 100 * overallAttended) / (100 - target)));
    metricTop = `Need ${needed}`;
    metricSub = 'To 75% Target';
  } else if (!isBelow && overallConducted > 0) {
    const safeBunks = Math.max(0, Math.floor((100 * overallAttended - target * overallConducted) / target));
    metricTop = `${safeBunks}`;
    metricSub = 'Safe Bunks';
  } else if (overallPct > 0) {
    metricTop = `${overallPct.toFixed(1)}%`;
    metricSub = 'Overall Attendance';
  }

  const newCardWrapper = realCard.cloneNode(true);
  newCardWrapper.id = 'ai-operation75-dashboard-card';
  newCardWrapper.setAttribute(INJECTOR_ATTR, 'true');
  newCardWrapper.style.cursor = 'pointer';
  newCardWrapper.style.position = 'relative';

  const innerElements = Array.from(newCardWrapper.querySelectorAll('*'));

  const footerEl = innerElements.find(el => {
    const t = (el.innerText || '').trim().toLowerCase();
    return t === 'placement' || t === 'task' || t === 'assessment' || t === 'attendance' || t === 'announcements';
  });

  if (footerEl) {
    footerEl.innerText = 'Operation 75';
    footerEl.style.backgroundColor = '#02529c';
    footerEl.style.color = '#ffffff';
  }

  const valueEl = innerElements.find(el => {
    const t = (el.innerText || '').trim();
    return /^\d+(\.\d+)?%?$/.test(t) && el !== footerEl;
  });

  if (valueEl) {
    valueEl.innerText = metricTop;
  }

  let detailsModal = document.getElementById('ai-operation75-details-modal');
  if (detailsModal) detailsModal.remove();

  detailsModal = document.createElement('div');
  detailsModal.id = 'ai-operation75-details-modal';
  detailsModal.setAttribute(INJECTOR_ATTR, 'true');
  detailsModal.style.cssText = `
    display: block;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-6px) scale(0.98);
    position: fixed;
    width: 320px;
    background: #ffffff;
    border: 1px solid #c8d6e5;
    border-radius: 6px;
    box-shadow: 0 14px 35px rgba(0, 0, 0, 0.22);
    z-index: 99999999;
    padding: 12px;
    text-align: left;
    color: #333333;
    font-family: Arial, sans-serif;
    box-sizing: border-box;
    transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  const dateWisePlanner = plan?.dateWiseBunkPlanner || [];
  const weeklyPlanner = plan?.weeklyBunkPlanner || null;
  const daysList = weeklyPlanner ? Object.keys(weeklyPlanner) : [];
  const hasDateWise = dateWisePlanner.length > 0;

  detailsModal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eef2f6;padding-bottom:8px;margin-bottom:8px;">
      <div>
        <div style="font-size:12px;font-weight:800;color:#02529c;">RCOEM/RBU OPERATION 75</div>
        ${studentInfo?.name ? `<div style="font-size:10.5px;color:#555555;font-weight:600;">${studentInfo.name}</div>` : ''}
      </div>
      <button id="ai-btn-close-modal" style="background:none;border:none;cursor:pointer;font-size:18px;color:#888888;font-weight:bold;line-height:1;padding:0 4px;transition:color 0.15s ease;">×</button>
    </div>

    <!-- Navigation Tabs -->
    <div style="display:flex;gap:4px;background:#f1f5f9;padding:3px;border-radius:5px;margin-bottom:10px;">
      <button id="ai-tab-today" style="flex:1;background:#ffffff;border:none;border-radius:4px;padding:4px 6px;font-size:10.5px;font-weight:700;color:#02529c;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.08);">
        Today's Plan
      </button>
      <button id="ai-tab-bunkdates" style="flex:1;background:transparent;border:none;border-radius:4px;padding:4px 6px;font-size:10.5px;font-weight:700;color:#64748b;cursor:pointer;">
        Bunk Dates & Planner
      </button>
    </div>

    <!-- Overall Attendance Card -->
    <div style="background:#f4f7fb;padding:8px 10px;border-radius:4px;border:1px solid #d8ebf9;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:18px;font-weight:800;color:${overallColor};">${overallPct > 0 ? overallPct.toFixed(2) + '%' : '—'}</div>
        <div style="font-size:10px;color:#666666;font-weight:600;">Overall Attendance</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10.5px;color:#333333;">Target: <strong>${target}%</strong></div>
        <div style="font-size:10.5px;font-weight:700;color:${overallColor};">${isBelow ? `Need ${metricTop.replace('Need ', '')} classes` : `Safe to bunk: ${metricTop}`}</div>
      </div>
    </div>

    <!-- View 1: Today's Plan -->
    <div id="ai-view-today">
      <div style="font-size:10.5px;font-weight:700;color:#02529c;text-transform:uppercase;margin-bottom:6px;">Today's Lectures</div>
      ${(plan?.recommendations && plan.recommendations.length > 0) ? `
        <div style="display:flex;flex-direction:column;gap:5px;max-height:160px;overflow-y:auto;">
          ${plan.recommendations.map(r => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;transition:background 0.12s ease;">
              <div style="min-width:0;flex:1;margin-right:6px;">
                <div style="font-size:10.5px;font-weight:700;color:#222222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.subjectName}</div>
                <div style="font-size:9.5px;color:#666666;">Bunk: <strong>${r.immediateSafeBunks ?? 0}</strong> &bull; Term: <strong>${r.safeBunksRemaining ?? 0}</strong></div>
              </div>
              <span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;background:${r.type === 'BUNK_SAFE' ? '#f0fdf4' : '#fef2f2'};color:${r.type === 'BUNK_SAFE' ? '#16a34a' : '#dc2626'};">${r.label || 'Lecture'}</span>
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="font-size:10.5px;color:#777777;text-align:center;padding:8px;background:#f8fafc;border-radius:3px;border:1px dashed #d2d2d2;">
          No classes scheduled for today
        </div>
      `}
    </div>

    <!-- View 2: Bunk Dates & Calendar -->
    <div id="ai-view-bunkdates" style="display:none;">
      <div style="font-size:10.5px;font-weight:700;color:#02529c;text-transform:uppercase;margin-bottom:6px;">Date-Wise Bunk Planner</div>
      ${hasDateWise ? `
        <div style="display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;padding-right:2px;">
          ${dateWisePlanner.map(item => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <strong style="font-size:10.5px;color:#1e293b;">${item.dateStr}</strong>
                <span style="font-size:9px;font-weight:700;color:${item.verdictColor};padding:1px 6px;border-radius:3px;background:${item.verdict === 'FULL_DAY_SAFE' ? '#f0fdf4' : item.verdict === 'PARTIAL_SAFE' ? '#fffbeb' : '#fef2f2'};">
                  ${item.verdictText}
                </span>
              </div>
              <div style="font-size:9.5px;color:#64748b;display:flex;flex-direction:column;gap:3px;">
                ${item.classes.map(c => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:#ffffff;border:1px solid #e2e8f0;border-radius:3px;padding:3px 6px;">
                    <span style="font-weight:600;color:#334155;">${c.subjectName} ${c.startTime ? `(${c.startTime})` : ''}</span>
                    <span style="font-weight:700;color:${c.color};">${c.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : (daysList.length > 0) ? `
        <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;padding-right:2px;">
          ${daysList.map(dName => {
            const d = weeklyPlanner[dName];
            return `
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                  <strong style="font-size:11px;color:#1e293b;">${d.day}</strong>
                  <span style="font-size:9.5px;font-weight:700;color:${d.verdictColor};padding:1px 6px;border-radius:3px;background:${d.verdict === 'BUNK_DAY_SAFE' ? '#f0fdf4' : d.verdict === 'PARTIAL_SAFE' ? '#fffbeb' : '#fef2f2'};">
                    ${d.verdictText}
                  </span>
                </div>
                <div style="font-size:9.5px;color:#64748b;display:flex;flex-wrap:wrap;gap:4px;">
                  ${d.classes.map(c => `<span style="background:#ffffff;border:1px solid #e2e8f0;border-radius:2px;padding:1px 4px;color:${c.color};font-weight:600;">${c.subjectName}: ${c.label}</span>`).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="font-size:10.5px;color:#777777;text-align:center;padding:10px;background:#f8fafc;border-radius:3px;border:1px dashed #d2d2d2;">
          Open <strong>stu_StudentTimeTable.htm</strong> to sync full schedule
        </div>
      `}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid #eef2f6;">
      <button id="ai-btn-open-settings" style="background:#02529c;color:#ffffff;border:none;border-radius:3px;padding:5px 10px;font-size:10.5px;font-weight:700;cursor:pointer;transition:opacity 0.15s ease;">Settings & Target</button>
      <span style="font-size:9px;color:#888888;">${lastSync ? `Synced ${relativeTime(lastSync)}` : ''}</span>
    </div>
  `;

  // Tab switching logic
  const tabToday = detailsModal.querySelector('#ai-tab-today');
  const tabBunkDates = detailsModal.querySelector('#ai-tab-bunkdates');
  const viewToday = detailsModal.querySelector('#ai-view-today');
  const viewBunkDates = detailsModal.querySelector('#ai-view-bunkdates');

  tabToday?.addEventListener('click', (e) => {
    e.stopPropagation();
    tabToday.style.background = '#ffffff';
    tabToday.style.color = '#02529c';
    tabToday.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
    tabBunkDates.style.background = 'transparent';
    tabBunkDates.style.color = '#64748b';
    tabBunkDates.style.boxShadow = 'none';
    viewToday.style.display = 'block';
    viewBunkDates.style.display = 'none';
  });

  tabBunkDates?.addEventListener('click', (e) => {
    e.stopPropagation();
    tabBunkDates.style.background = '#ffffff';
    tabBunkDates.style.color = '#02529c';
    tabBunkDates.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
    tabToday.style.background = 'transparent';
    tabToday.style.color = '#64748b';
    tabToday.style.boxShadow = 'none';
    viewToday.style.display = 'none';
    viewBunkDates.style.display = 'block';
  });

  document.body.appendChild(detailsModal);

  if (realCard.nextSibling) {
    cardRow.insertBefore(newCardWrapper, realCard.nextSibling);
  } else {
    cardRow.appendChild(newCardWrapper);
  }

  console.log('[Attendance Insights] Operation 75 Counter Card successfully mounted');

  const hideModal = () => {
    detailsModal.style.opacity = '0';
    detailsModal.style.transform = 'translateY(-6px) scale(0.98)';
    detailsModal.style.pointerEvents = 'none';
  };

  const showModal = () => {
    const rect = newCardWrapper.getBoundingClientRect();
    detailsModal.style.top = `${rect.bottom + 6}px`;
    detailsModal.style.left = `${Math.max(10, rect.right - 320)}px`;
    detailsModal.style.opacity = '1';
    detailsModal.style.transform = 'translateY(0) scale(1)';
    detailsModal.style.pointerEvents = 'auto';
  };

  newCardWrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = detailsModal.style.opacity === '1';
    if (isVisible) {
      hideModal();
    } else {
      showModal();
    }
  });

  detailsModal.querySelector('#ai-btn-close-modal')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideModal();
  });

  detailsModal.querySelector('#ai-btn-open-settings')?.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    } catch (err) {}
  });

  document.addEventListener('click', (e) => {
    if (!newCardWrapper.contains(e.target) && !detailsModal.contains(e.target)) {
      hideModal();
    }
  });
}

export function injectFloatingDashboard(plan, studentInfo, lastSync, isStale) {
  injectDashboardCounterCard(plan, studentInfo, lastSync, isStale);
}

export function injectTimetableEnhancements(timetable, subjects = [], preferences = {}, projections = []) {
  const existingToolbar = document.getElementById('ai-timetable-toolbar');
  if (existingToolbar) existingToolbar.remove();
  const existingQuickBtn = document.getElementById('ai-quick-sem-btn');
  if (existingQuickBtn) existingQuickBtn.remove();

  const allTables = Array.from(document.querySelectorAll('table'));
  const timetableTable = allTables.find(t => {
    const text = t.innerText.toLowerCase();
    return text.includes('course name') && (text.includes('date & day') || text.includes('start time') || text.includes('faculty name'));
  });

  const dateInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="date"], input:not([type="hidden"]):not([type="submit"]):not([type="button"])'));
  const toInput = dateInputs.find(i => (i.id || i.name || '').toLowerCase().includes('to') || (i.placeholder || '').toLowerCase().includes('to')) || (dateInputs.length >= 2 ? dateInputs[1] : null);
  const submitBtn = document.querySelector('input[type="submit"], button[type="submit"], input[value*="Submit"], button') || Array.from(document.querySelectorAll('input, button')).find(b => (b.value || b.innerText || '').toLowerCase().includes('submit'));

  const semesterEnd = preferences.semesterEndDate || getDynamicSemesterEndDate();

  // 1. Injected Quick Button right next to Juno Submit button
  if (submitBtn && submitBtn.parentElement) {
    const quickSemBtn = document.createElement('button');
    quickSemBtn.id = 'ai-quick-sem-btn';
    quickSemBtn.type = 'button';
    quickSemBtn.setAttribute(INJECTOR_ATTR, 'true');
    quickSemBtn.style.cssText = `
      background: #02529c;
      color: #ffffff;
      border: 1px solid #003d75;
      border-radius: 4px;
      padding: 4px 12px;
      margin-left: 8px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      vertical-align: middle;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      transition: background 0.15s ease;
    `;
    quickSemBtn.innerHTML = 'Auto-Fetch to Sem End';
    quickSemBtn.title = `Auto-fill To Date to ${semesterEnd} and fetch semester schedule`;

    quickSemBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerSemesterFetch();
    });

    submitBtn.parentElement.appendChild(quickSemBtn);
  }

  // 2. Injected Top Toolbar
  const toolbar = document.createElement('div');
  toolbar.id = 'ai-timetable-toolbar';
  toolbar.setAttribute(INJECTOR_ATTR, 'true');
  toolbar.style.cssText = `
    background: #f4f7fb;
    border: 1px solid #c8d6e5;
    border-radius: 6px;
    padding: 10px 16px;
    margin: 12px 0 16px 0;
    font-family: Arial, sans-serif;
    color: #222222;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  `;

  toolbar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="background:#02529c;color:#ffffff;font-size:11.5px;font-weight:800;padding:4px 8px;border-radius:4px;letter-spacing:0.3px;">
        OPERATION 75
      </div>
      <div style="font-size:12.5px;font-weight:700;color:#02529c;">
        Date-Wise Timetable & Bunk Planner
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <button id="ai-btn-autofill-semend" style="background:#02529c;color:#ffffff;border:none;border-radius:4px;padding:6px 14px;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;">
        Auto-Fetch Full Semester Schedule (To: ${semesterEnd})
      </button>
    </div>
  `;

  function triggerSemesterFetch() {
    if (toInput) {
      const d = new Date(semesterEnd);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const formattedDate = `${months[d.getMonth()]} ${d.getDate()},${d.getFullYear()}`;
      toInput.value = formattedDate;
      toInput.dispatchEvent(new Event('change', { bubbles: true }));
      toInput.dispatchEvent(new Event('input', { bubbles: true }));

      if (submitBtn) {
        submitBtn.click();
      }
    }
  }

  toolbar.querySelector('#ai-btn-autofill-semend')?.addEventListener('click', (e) => {
    e.preventDefault();
    triggerSemesterFetch();
  });

  // Mount toolbar on top of timetable or form
  if (timetableTable) {
    let mountTarget = timetableTable;
    while (mountTarget.parentElement && mountTarget.parentElement !== document.body && !mountTarget.parentElement.matches('form, .container, #content, body')) {
      mountTarget = mountTarget.parentElement;
    }
    mountTarget.parentElement.insertBefore(toolbar, mountTarget);
  } else {
    const form = document.querySelector('form') || document.body;
    form.prepend(toolbar);
  }

  if (!timetableTable) return;

  // 3. Row Enhancements
  const rows = timetableTable.querySelectorAll('tr');
  const target = preferences.overallTarget || 75;
  const dayNamesList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Real-time Dynamic Attendance Trajectory Simulation state
  const simState = {};
  for (const s of (subjects || [])) {
    const key = s.id || s.name;
    simState[key] = {
      attended: s.attended || 0,
      conducted: s.conducted || 0,
      basePercentage: s.percentage || 0,
    };
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.hasAttribute('data-ai-enhanced')) continue;
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;

    const fullRowText = (row.innerText || '').toLowerCase();
    if (fullRowText.includes('data not found') || fullRowText.includes('no records')) continue;

    let courseCell = null;
    const firstCellText = (cells[0]?.innerText || '').trim();
    const isDateRow = dayNamesList.some(d => firstCellText.toLowerCase().includes(d.toLowerCase()));

    if (isDateRow && cells.length >= 5) {
      courseCell = cells[4];
    } else if (!isDateRow && cells.length >= 4) {
      courseCell = cells[3];
    }

    if (!courseCell || (courseCell.innerText || '').trim() === '-' || /^\d{1,2}:\d{2}/.test((courseCell.innerText || '').trim())) {
      for (let c = 0; c < cells.length; c++) {
        const txt = (cells[c].innerText || '').trim();
        if (txt && txt !== '-' && txt.length >= 2 && !/^\d{1,2}:\d{2}/.test(txt) && !dayNamesList.some(d => txt.toLowerCase().includes(d.toLowerCase())) && !/^\d+$/.test(txt) && !txt.includes('Shared Documents')) {
          courseCell = cells[c];
          break;
        }
      }
    }

    if (!courseCell) continue;
    const courseText = row.getAttribute('data-original-course') || (courseCell.innerText || '').trim();
    if (!courseText || courseText === '-' || courseText.length < 2) continue;
    row.setAttribute('data-original-course', courseText);

    const rawNorm = courseText.toLowerCase().trim();
    const cleanNorm = courseText.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
    const isPracticalClass = rawNorm.includes('(p)') || rawNorm.includes('lab') || rawNorm.includes('practical');

    let rowFacultyName = null;
    for (let c = 0; c < cells.length; c++) {
      const txt = (cells[c]?.innerText || '').trim();
      if (/^(dr\.|prof\.|mr\.|mrs\.|ms\.|er\.|dr\s|prof\s)/i.test(txt)) {
        rowFacultyName = txt;
        break;
      }
    }

    const matchedSubject = (subjects || []).find(s => {
      const sName = (s.name || '').toLowerCase();
      const sFaculty = (s.facultyName || '').toLowerCase().trim();
      const isSubPractical = sName.includes('lab') || sName.includes('practical') || sName.includes('(p)') || sName.includes('pr');

      if (isPracticalClass !== isSubPractical) return false;

      // 1. Exact match
      if (sName === rawNorm) return true;

      // 2. Full Name Substring Match (ONLY when rawNorm is a long string, >= 6 chars)
      if (rawNorm.length >= 6 && (sName.includes(rawNorm) || rawNorm.includes(sName))) return true;

      // 3. Exact Acronym Match (e.g. SA -> Smart Antenna, OSC -> Optical and Satellite Communication)
      const words = sName.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => {
        const lw = w.toLowerCase();
        return lw.length > 0 && !['and', 'a', 'an', 'or', 'of', 'the', 'in', 'for', 'to', 'with', '&', 'at', 'on', 'by', 'from', 'ii', 'iii', 'iv', 'lab', 'practical', 'pr', 'p'].includes(lw);
      });
      const acronym = words.map(w => w[0]).join('').toLowerCase();
      const allWordsAcronym = sName.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0).map(w => w[0]).join('').toLowerCase();

      if (cleanNorm.length >= 2 && cleanNorm.length <= 8) {
        return acronym === cleanNorm || allWordsAcronym === cleanNorm || sName.toLowerCase().includes(`(${cleanNorm})`);
      }

      return false;
    });

    const fullSubjectName = matchedSubject ? matchedSubject.name : courseText;

    let badgeHtml = '';

    if (matchedSubject) {
      const subKey = matchedSubject.id || matchedSubject.name;
      if (!simState[subKey]) {
        simState[subKey] = {
          attended: matchedSubject.attended || 0,
          conducted: matchedSubject.conducted || 0,
          basePercentage: matchedSubject.percentage || 0,
        };
      }
      const sim = simState[subKey];
      const prevPct = sim.conducted > 0 ? (sim.attended / sim.conducted) * 100 : 0;

      // Simulate real-time attendance trajectory as student attends upcoming lectures
      sim.attended += 1;
      sim.conducted += 1;
      const newPct = sim.conducted > 0 ? (sim.attended / sim.conducted) * 100 : 0;
      const isBelow = newPct < target;
      const safeBunks = Math.max(0, Math.floor((100 * sim.attended - target * sim.conducted) / target));

      if (matchedSubject.conducted === 0) {
        badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:600;background:#f8fafc;color:#02529c;border:1px solid #d8ebf9;border-radius:3px;">TARGET ${target}%</span>`;
      } else if (isBelow) {
        badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:700;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:3px;">MUST ATTEND (${newPct.toFixed(1)}%)</span>`;
      } else if (prevPct < target && newPct >= target) {
        badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:700;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:3px;">TARGET ACHIEVED (${newPct.toFixed(1)}%)</span>`;
      } else {
        badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:700;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:3px;">SAFE TO BUNK (${safeBunks} safe &bull; ${newPct.toFixed(1)}%)</span>`;
      }

      courseCell.innerHTML = `<span style="font-weight:700;color:#02529c;">${fullSubjectName}</span> ${badgeHtml}`;
    } else {
      const badgeText = isPracticalClass ? 'LAB (P)' : 'LECTURE';
      const badgeColor = isPracticalClass ? '#7c3aed' : '#02529c';
      const badgeBg = isPracticalClass ? '#f5f3ff' : '#f8fafc';
      const badgeBorder = isPracticalClass ? '#ddd6fe' : '#d8ebf9';
      badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:600;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};border-radius:3px;">${badgeText}</span>`;
      courseCell.innerHTML = `<span style="font-weight:700;color:#02529c;">${fullSubjectName}</span> ${badgeHtml}`;
    }

    row.setAttribute('data-ai-enhanced', 'true');
  }
}
