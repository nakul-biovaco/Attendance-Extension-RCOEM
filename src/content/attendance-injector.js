import { formatPercentage } from '../engine/attendance-calculator.js';
import { relativeTime } from '../utils/date-utils.js';

const INJECTOR_ATTR = 'data-ai-attendance-injected';

export function injectAttendanceEnhancements(projections, subjects, overallPercentage, overallTarget, syncTime) {

  removeAttendanceInjections();

  injectOverviewCard(subjects, overallPercentage, overallTarget, syncTime);

  enhanceAttendanceTable(projections, subjects, overallPercentage, overallTarget);

  if (!document.querySelector(`table [${INJECTOR_ATTR}]`)) {
    injectProjectionCards(projections);
  }
}

export function removeAttendanceInjections() {
  document.querySelectorAll(`[${INJECTOR_ATTR}]`).forEach(el => el.remove());
}

function injectOverviewCard(subjects, overallPct, target, syncTime) {
  const container = document.querySelector('table')?.parentElement ||
                    document.querySelector('[class*="attendance"]') ||
                    document.body;

  const card = document.createElement('div');
  card.setAttribute(INJECTOR_ATTR, 'true');
  card.style.cssText = `
    margin: 16px 0;
    background: #ffffff;
    border: 1px solid #d2d2d2;
    border-radius: 4px;
    color: #333333;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    background: #02529c;
    color: #ffffff;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = `
    <span>ATTENDANCE ADVISOR — BACHO YOJNA</span>
    <span style="font-size:10px;opacity:0.85;font-weight:400">Synced ${relativeTime(syncTime)}</span>
  `;
  card.appendChild(header);

  const stats = document.createElement('div');
  stats.style.cssText = `
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px;
  `;

  const overallColor = overallPct >= target ? '#16a34a' : overallPct >= target - 5 ? '#d97706' : '#dc2626';

  stats.innerHTML = `
    <div style="flex:1;min-width:120px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${overallColor}">${formatPercentage(overallPct)}%</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Overall Attendance</div>
    </div>
    <div style="flex:1;min-width:120px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#333">${target}%</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Target Threshold</div>
    </div>
    <div style="flex:1;min-width:120px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#333">${subjects.filter(s => s.conducted > 0).length}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Active Subjects</div>
    </div>
  `;
  card.appendChild(stats);

  const firstTable = container.querySelector('table');
  if (firstTable) {
    firstTable.parentNode.insertBefore(card, firstTable);
  } else {
    container.insertBefore(card, container.firstChild);
  }
}

function enhanceAttendanceTable(projections, subjects = [], overallPercentage = 0, overallTarget = 75) {
  const tables = document.querySelectorAll('table');

  for (const table of tables) {
    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (!headerRow) continue;

    const text = headerRow.innerText.toLowerCase();

    const hasCode = text.includes('code');
    const hasCourse = text.includes('course') || text.includes('subject') || text.includes('name');
    const hasCount = text.includes('count') || text.includes('attendance') || text.includes('percentage') || text.includes('%');

    if (!(hasCode && hasCourse && hasCount)) continue;

    const headers = ['Target', 'Safe Bunks', 'Risk', 'Forecast', 'Classes to Maintain'];
    const siblingTh = headerRow.querySelector('th, td');
    const headerComputed = siblingTh ? window.getComputedStyle(siblingTh) : null;

    for (const headerText of headers) {
      const th = document.createElement('th');
      th.setAttribute(INJECTOR_ATTR, 'true');

      if (siblingTh) {

        th.className = siblingTh.className;

        if (siblingTh.style.cssText) {
          th.style.cssText = siblingTh.style.cssText;
        }

        if (headerComputed) {
          th.style.fontFamily = headerComputed.fontFamily;
          th.style.fontSize = headerComputed.fontSize;
          th.style.fontWeight = headerComputed.fontWeight;
          th.style.lineHeight = headerComputed.lineHeight;
          th.style.letterSpacing = headerComputed.letterSpacing;
          th.style.padding = headerComputed.padding;
          th.style.margin = headerComputed.margin;
          th.style.border = headerComputed.border;

          if (headerComputed.backgroundColor && headerComputed.backgroundColor !== 'rgba(0, 0, 0, 0)' && headerComputed.backgroundColor !== 'transparent') {
            th.style.backgroundColor = headerComputed.backgroundColor;
          }
        }
      }

      th.style.textAlign = 'center';
      th.style.whiteSpace = 'nowrap';
      th.style.color = '#02529c';

      th.textContent = headerText;
      headerRow.appendChild(th);
    }

    const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');

    let totalProjectedAttended = 0;
    let totalProjectedConducted = 0;
    let totalClassesToMaintain = 0;
    let totalImmediateBunks = 0;
    let totalTermBunks = 0;
    let hasHighRiskSubject = false;
    let baseTargetPct = projections[0]?.targetPct || 62;

    for (const proj of projections) {
      const subject = subjects.find(s => s.id === proj.subjectId);
      if (subject) {
        const remaining = proj.remainingClasses || 0;
        const maxBunks = proj.maximumSafeBunks || 0;
        totalProjectedConducted += (subject.conducted + remaining);
        totalProjectedAttended += (subject.attended + remaining - maxBunks);
      }
      totalClassesToMaintain += (proj.minimumRequired || 0);
      totalImmediateBunks += (proj.immediateSafeBunks || 0);
      totalTermBunks += (proj.maximumSafeBunks || 0);
      if (proj.riskLevel === 'HIGH') {
        hasHighRiskSubject = true;
      }
    }

    const overallForecastVal = totalProjectedConducted > 0
      ? (totalProjectedAttended / totalProjectedConducted) * 100
      : overallPercentage;

    const overallRiskVal = (overallPercentage < overallTarget || hasHighRiskSubject) ? 'HIGH' : 'SAFE';

    for (const row of rows) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 2) continue;

      const rowText = row.innerText.toLowerCase();

      let projection = null;

      for (const proj of projections) {
        if (proj.subjectCode && rowText.includes(proj.subjectCode.toLowerCase())) {
          projection = proj;
          break;
        }
      }

      if (!projection) {
        const sortedProjections = [...projections].sort((a, b) => b.subjectName.length - a.subjectName.length);
        for (const proj of sortedProjections) {
          if (proj.subjectName && rowText.includes(proj.subjectName.toLowerCase())) {
            projection = proj;
            break;
          }
        }
      }

      if (projection) {

        appendCell(row, `${projection.targetPct}%`, '#333333', false);

        const bunkText = `${projection.immediateSafeBunks} (Term: ${projection.maximumSafeBunks})`;
        const bunkColor = projection.immediateSafeBunks <= 0 ? '#dc2626' :
                          projection.immediateSafeBunks <= 2 ? '#d97706' : '#16a34a';
        appendCell(row, bunkText, bunkColor, false);

        const riskColors = { HIGH: '#dc2626', MEDIUM: '#d97706', LOW: '#ca8a04', SAFE: '#16a34a' };
        appendCell(row, projection.riskLevel, riskColors[projection.riskLevel] || '#64748b', false);

        appendCell(row, projection.projectedFinal > 0 ? `${formatPercentage(projection.projectedFinal)}%` : '—', '#02529c', false);

        const maintainColor = projection.minimumRequired > 0 ? '#dc2626' : '#16a34a';
        appendCell(row, String(projection.minimumRequired), maintainColor, false);
      } else {

        const isLastRow = (row === rows[rows.length - 1]);
        if (isLastRow) {

          appendCell(row, `${overallTarget}%`, '#02529c', true);

          const totalBunkColor = totalImmediateBunks <= 0 ? '#dc2626' : '#16a34a';
          appendCell(row, `${totalImmediateBunks} (Term: ${totalTermBunks})`, totalBunkColor, true);

          const totalRiskColor = overallRiskVal === 'HIGH' ? '#dc2626' : '#16a34a';
          appendCell(row, overallRiskVal, totalRiskColor, true);

          appendCell(row, `${overallForecastVal.toFixed(2)}%`, '#02529c', true);

          const totalMaintainColor = totalClassesToMaintain > 0 ? '#dc2626' : '#16a34a';
          appendCell(row, String(totalClassesToMaintain), totalMaintainColor, true);
        } else {

          for (let i = 0; i < 5; i++) {
            appendCell(row, '—', '#64748b', false);
          }
        }
      }
    }

    break;
  }
}

function appendCell(row, text, color, isLastRow = false) {
  const nativeCells = row.querySelectorAll('td:not([data-ai-injected]), th:not([data-ai-injected])');
  const siblingTd = nativeCells.length > 0 ? nativeCells[nativeCells.length - 1] : null;
  const tagName = (siblingTd && siblingTd.tagName.toLowerCase() === 'th') ? 'th' : 'td';

  const td = document.createElement(tagName);
  td.setAttribute(INJECTOR_ATTR, 'true');

  if (siblingTd) {

    td.className = siblingTd.className;

    if (siblingTd.style.cssText) {
      td.style.cssText = siblingTd.style.cssText;
    }

    const computed = window.getComputedStyle(siblingTd);
    if (computed) {

      td.style.fontFamily = computed.fontFamily;
      td.style.fontSize = computed.fontSize;
      td.style.fontWeight = computed.fontWeight;
      td.style.lineHeight = computed.lineHeight;
      td.style.letterSpacing = computed.letterSpacing;

      td.style.padding = computed.padding;
      td.style.margin = computed.margin;

      td.style.border = computed.border;

      if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)' && computed.backgroundColor !== 'transparent') {
        td.style.backgroundColor = computed.backgroundColor;
      }
    }
  }

  if (isLastRow) {
    const rowComp = window.getComputedStyle(row);
    let totalBg = '#e8f2fc';
    if (siblingTd) {
      const sibComp = window.getComputedStyle(siblingTd);
      if (sibComp.backgroundColor && sibComp.backgroundColor !== 'rgba(0, 0, 0, 0)' && sibComp.backgroundColor !== 'transparent') {
        totalBg = sibComp.backgroundColor;
      }
    }
    if (rowComp && rowComp.backgroundColor && rowComp.backgroundColor !== 'rgba(0, 0, 0, 0)' && rowComp.backgroundColor !== 'transparent') {
      totalBg = rowComp.backgroundColor;
    }
    td.style.backgroundColor = totalBg;
  }

  td.style.textAlign = 'center';
  td.style.whiteSpace = 'nowrap';
  td.style.color = color;

  td.textContent = text;
  row.appendChild(td);
  return td;
}

function injectProjectionCards(projections) {
  const container = document.querySelector('[class*="attendance"]') || document.body;

  const grid = document.createElement('div');
  grid.setAttribute(INJECTOR_ATTR, 'true');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
    margin: 14px 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  for (const proj of projections) {
    const riskColors = { HIGH: '#dc2626', MEDIUM: '#d97706', LOW: '#ca8a04', SAFE: '#16a34a' };
    const riskBg = { HIGH: '#fef2f2', MEDIUM: '#fffbeb', LOW: '#fefce8', SAFE: '#f0fdf4' };
    const riskBorder = { HIGH: '#fecaca', MEDIUM: '#fde68a', LOW: '#fef08a', SAFE: '#bbf7d0' };

    const card = document.createElement('div');
    card.style.cssText = `
      padding: 12px 14px;
      border-radius: 8px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
    `;

    card.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px">${proj.subjectName}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11.5px;color:#64748b">Current</span>
        <span style="font-size:12px;font-weight:700;color:${riskColors[proj.riskLevel]}">${formatPercentage(proj.currentPercentage)}%</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11.5px;color:#64748b">Target</span>
        <span style="font-size:12px;font-weight:600;color:#0f172a">${proj.targetPct}%</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11.5px;color:#64748b">Safe Bunks</span>
        <span style="font-size:12px;font-weight:700;color:${proj.maximumSafeBunks > 3 ? '#16a34a' : '#dc2626'}">${proj.maximumSafeBunks >= 0 ? proj.maximumSafeBunks : '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11.5px;color:#64748b">Risk Status</span>
        <span style="font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:4px;background:${riskBg[proj.riskLevel]};border:1px solid ${riskBorder[proj.riskLevel]};color:${riskColors[proj.riskLevel]}">${proj.riskLevel}</span>
      </div>
    `;

    grid.appendChild(card);
  }

  container.appendChild(grid);
}
