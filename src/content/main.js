// (c) 2026 Nakul Mundhada. All rights reserved.

import { JunoAdapter } from '../adapters/juno-adapter.js';
import { injectScheduleRecommendations, removeInjectedContent, injectFloatingDashboard, injectTimetableEnhancements } from './schedule-injector.js';
import { injectAttendanceEnhancements, removeAttendanceInjections } from './attendance-injector.js';
import { MessageType } from '../types/models.js';

let adapter = null;
let currentPage = 'unknown';
let hasSetupObserver = false;
let cachedPlanData = null;
let cachedStudentInfo = null;
let cachedLastSync = null;
let cachedIsStale = false;
let lastProcessedTime = 0;

function init() {
  adapter = new JunoAdapter();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}

function onReady() {
  setupLogoutInterceptor();
  detectAndProcess();
  setupObserver();

  [250, 1000].forEach(delay => {
    setTimeout(() => detectAndProcess(true), delay);
  });

  setInterval(() => {
    const page = adapter?.detectPage();
    if (page === 'student-home' && !document.getElementById('ai-operation75-dashboard-card')) {
      injectFloatingDashboard(
        cachedPlanData || {},
        cachedStudentInfo,
        cachedLastSync,
        cachedIsStale
      );
    } else if (page === 'timetable' && (!document.getElementById('ai-timetable-toolbar') || !document.getElementById('ai-quick-sem-btn'))) {
      processTimetablePage();
    }
  }, 1500);

  chrome.runtime.onMessage.addListener(handleMessage);
}

function setupLogoutInterceptor() {
  document.addEventListener('click', (e) => {
    const link = e.target?.closest?.('a, button, input[type="submit"], input[type="button"]');
    if (!link) return;

    const href = link.getAttribute('href')?.toLowerCase() || '';
    const text = (link.innerText || link.getAttribute('value') || link.getAttribute('title') || '').toLowerCase();
    const onclick = link.getAttribute('onclick')?.toLowerCase() || '';

    if (href.includes('logout') || href.includes('signout') || text.includes('logout') || text.includes('sign out') || onclick.includes('logout')) {
      sendMessage({ type: MessageType.USER_LOGGED_OUT });
      cleanupInjectedContent();
    }
  }, true);
}

function cleanupInjectedContent() {
  document.querySelectorAll('[data-ai-injected], [data-ai-attendance-injected], #ai-floating-widget-root').forEach(el => el.remove());
}

function detectAndProcess(force = false) {
  try {
    const page = adapter.detectPage();

    if (page === 'auth') {
      sendMessage({ type: MessageType.USER_LOGGED_OUT });
      cleanupInjectedContent();
      return;
    }

    const studentInfo = adapter.extractStudentInfo();
    if (studentInfo && studentInfo.name) {
      sendMessage({
        type: MessageType.STUDENT_INFO_PARSED,
        data: { studentInfo },
      });
    }

    if (page === 'unknown') return;

    const now = Date.now();
    if (!force && page === currentPage && (now - lastProcessedTime < 800)) {
      return;
    }

    lastProcessedTime = now;
    currentPage = page;

    processPage(page);

    sendMessage({
      type: MessageType.PAGE_DETECTED,
      data: { page },
    });
  } catch (err) {
    console.error('[Attendance Insights] Detection error:', err);
  }
}

function processPage(page) {
  switch (page) {
    case 'student-home':
      processStudentHome();
      break;
    case 'attendance':
      processAttendancePage();
      break;
    case 'timetable':
      processTimetablePage();
      break;
    case 'calendar':
      processCalendarPage();
      break;
    case 'auth':
      sendMessage({ type: MessageType.USER_LOGGED_OUT });
      cleanupInjectedContent();
      break;
    default:
      break;
  }
}

async function processStudentHome() {
  const classes = adapter.parseSchedule();
  const studentInfo = adapter.extractStudentInfo();

  const response = await sendMessage({
    type: MessageType.SCHEDULE_PARSED,
    data: { classes },
  });

  if (response && response.recommendations && response.recommendations.length > 0) {
    injectScheduleRecommendations(
      response.recommendations,
      classes,
      response.lastSync,
      response.isStale
    );
  } else if (response && response.needsAttendance) {
    injectAttendancePrompt();
  }

  const planResponse = await sendMessage({ type: MessageType.GET_TODAY_PLAN });
  const planData = planResponse?.plan || {};

  cachedPlanData = planData;
  cachedStudentInfo = studentInfo;
  cachedLastSync = response?.lastSync || planData.generatedAt;
  cachedIsStale = response?.isStale || planData.isStale;

  injectFloatingDashboard(
    cachedPlanData,
    cachedStudentInfo,
    cachedLastSync,
    cachedIsStale
  );

  setTimeout(() => {
    injectFloatingDashboard(cachedPlanData, cachedStudentInfo, cachedLastSync, cachedIsStale);
  }, 400);
}

async function processAttendancePage() {
  const facultyMap = adapter.parseSyllabusFaculty();
  if (Object.keys(facultyMap).length > 0) {
    await sendMessage({
      type: MessageType.FACULTY_PARSED,
      data: { facultyMap },
    });
  }

  const subjects = adapter.parseAttendance();
  if (subjects.length === 0) return;

  const response = await sendMessage({
    type: MessageType.ATTENDANCE_PARSED,
    data: { subjects },
  });

  if (response && response.projections) {
    injectAttendanceEnhancements(
      response.projections,
      subjects,
      response.overallPercentage,
      response.overallTarget,
      response.syncTime
    );
  }
}

async function processTimetablePage() {
  const timetable = adapter.parseTimetable();

  const [subResponse, prefsResponse, projResponse] = await Promise.all([
    sendMessage({ type: MessageType.GET_SUBJECTS }),
    sendMessage({ type: MessageType.GET_PREFERENCES }),
    sendMessage({ type: MessageType.GET_PROJECTIONS }),
  ]);

  const subjects = subResponse?.subjects || [];
  const preferences = prefsResponse?.preferences || {};
  const projections = projResponse?.projections || [];

  if (timetable) {
    if (timetable.facultyMap && Object.keys(timetable.facultyMap).length > 0) {
      await sendMessage({
        type: MessageType.FACULTY_PARSED,
        data: { facultyMap: timetable.facultyMap },
      });
    }

    await sendMessage({
      type: MessageType.TIMETABLE_PARSED,
      data: { timetable },
    });
  }

  injectTimetableEnhancements(timetable, subjects, preferences, projections);
}

async function processCalendarPage() {
  const { holidays, semesterEndDate } = adapter.parseHolidays();

  await sendMessage({
    type: MessageType.CALENDAR_PARSED,
    data: { holidays, semesterEndDate },
  });

  injectCalendarSyncBanner(holidays.length, semesterEndDate);
}

function injectCalendarSyncBanner(holidayCount, semesterEndDate) {
  document.querySelectorAll('[data-ai-calendar-banner]').forEach(el => el.remove());

  const banner = document.createElement('div');
  banner.setAttribute('data-ai-calendar-banner', 'true');
  banner.style.cssText = `
    margin: 14px 0;
    padding: 12px 16px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    color: #166534;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12.5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  banner.innerHTML = `
    <div>
      <strong style="color:#14532d;display:block;margin-bottom:2px">RCOEM Attendance Se Bacho Yojna</strong>
      <span>Synced <strong>${holidayCount}</strong> holidays${semesterEndDate ? ` & Term End (${semesterEndDate})` : ''} into attendance forecast engine.</span>
    </div>
    <span style="font-size:11px;font-weight:700;padding:3px 8px;background:#dcfce7;border-radius:4px;color:#15803d">SYNCED</span>
  `;

  const container = document.querySelector('table') || document.body;
  if (container.parentElement) {
    container.parentElement.insertBefore(banner, container);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }
}

function injectAttendancePrompt() {
  removeInjectedContent();

  const container = document.querySelector('table') || document.body;
  if (!container) return;

  const prompt = document.createElement('div');
  prompt.setAttribute('data-ai-injected', 'true');
  prompt.style.cssText = `
    margin: 12px 0;
    padding: 14px 16px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.06), rgba(139, 92, 246, 0.06));
    border: 1px solid rgba(99, 102, 241, 0.12);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #4f46e5;
    line-height: 1.6;
  `;
  prompt.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">📊 Attendance Insights</div>
    <div style="color:#6b7280">
      ⚠️ Attendance data unavailable.
      <strong>Open your Attendance page</strong> once to enable intelligent recommendations.
    </div>
  `;

  container.appendChild(prompt);
}

function setupObserver() {
  if (hasSetupObserver) return;
  hasSetupObserver = true;

  adapter.observeContentChanges(() => {
    setTimeout(detectAndProcess, 50);
  });
}

function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case MessageType.INJECT_RECOMMENDATIONS:
      if (currentPage === 'student-home' && message.data) {
        injectScheduleRecommendations(
          message.data.recommendations,
          message.data.classes || [],
          message.data.lastSync,
          message.data.isStale
        );
      }
      sendResponse({ ok: true });
      break;

    case MessageType.INJECT_ATTENDANCE_ENHANCEMENTS:
      if (currentPage === 'attendance' && message.data) {
        injectAttendanceEnhancements(
          message.data.projections,
          message.data.subjects || [],
          message.data.overallPercentage,
          message.data.overallTarget,
          message.data.syncTime
        );
      }
      sendResponse({ ok: true });
      break;

    case MessageType.FORCE_RESYNC:
      currentPage = 'unknown';
      detectAndProcess();
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
  }

  return true;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    if (!chrome.runtime?.id) {
      resolve(null);
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          if (!errMsg.includes('Extension context invalidated')) {
            console.warn('[Attendance Insights] Message error:', errMsg);
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      if (!err.message?.includes('Extension context invalidated')) {
        console.warn('[Attendance Insights] Failed to send message:', err);
      }
      resolve(null);
    }
  });
}

init();
