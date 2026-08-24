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

import { MessageType, ExtensionState, DEFAULT_PREFERENCES } from '../types/models.js';
import * as storage from '../storage/chrome-storage.js';
import { matchSubjects } from '../content/subject-matcher.js';
import { calculateOverall } from '../engine/attendance-calculator.js';
import { projectAllSubjects } from '../engine/projection-engine.js';
import { generateTodayPlan, generateBunkSummary, generateRecommendations, generateWeeklyBunkPlanner, generateDateWiseBunkPlanner } from '../engine/recommendation-engine.js';
import { findHighestRisk, riskSummary } from '../engine/risk-engine.js';
import { getTodayDate, getTodayDayName, nowISO, getDynamicSemesterEndDate } from '../utils/date-utils.js';
import { deterministicId, normalizeSubjectName } from '../utils/normalizer.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[AI Background] Extension installed:', details.reason);

  if (details.reason === 'install') {
    await storage.saveExtensionState(ExtensionState.INITIALIZING);
    await storage.savePreferences(DEFAULT_PREFERENCES);
  }

  chrome.alarms.create('periodic-attendance-sync', { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic-attendance-sync') {
    console.log('[AI Background] Periodic sync alarm fired');
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AI Background] Received:', message.type);

  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[AI Background] Error handling message:', err);
      sendResponse({ error: err.message });
    });

  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case MessageType.SCHEDULE_PARSED:
      return handleScheduleParsed(message.data);

    case MessageType.ATTENDANCE_PARSED:
      return handleAttendanceParsed(message.data);

    case MessageType.TIMETABLE_PARSED:
      return handleTimetableParsed(message.data);

    case MessageType.CALENDAR_PARSED:
      return handleCalendarParsed(message.data);

    case MessageType.PAGE_DETECTED:
      return handlePageDetected(message.data);

    case MessageType.FACULTY_PARSED:
      return handleFacultyParsed(message.data);

    case MessageType.STUDENT_INFO_PARSED:
      return handleStudentInfoParsed(message.data);

    case MessageType.GET_STUDENT_INFO:
      return handleGetStudentInfo();

    case MessageType.GET_TODAY_PLAN:
      return handleGetTodayPlan();

    case MessageType.GET_STATE:
      return handleGetState();

    case MessageType.GET_SUBJECTS:
      return handleGetSubjects();

    case MessageType.GET_HOLIDAYS:
      return handleGetHolidays();

    case MessageType.GET_DEBUG_INFO:
      return handleGetDebugInfo();

    case MessageType.GET_PREFERENCES:
      return handleGetPreferences();

    case MessageType.SAVE_PREFERENCES:
      return handleSavePreferences(message.data);

    case MessageType.EXPORT_DATA:
      return handleExportData();

    case MessageType.CLEAR_DATA:
      return handleClearData();

    case MessageType.SAVE_ALIAS:
      return handleSaveAlias(message.data);

    case MessageType.GET_WHAT_IF:
      return handleGetWhatIf(message.data);

    case MessageType.GET_PROJECTIONS:
      return handleGetProjections();

    case MessageType.FORCE_RESYNC:
      return handleForceResync();

    case MessageType.OPEN_OPTIONS:
      chrome.runtime.openOptionsPage();
      return { ok: true };

    case MessageType.USER_LOGGED_OUT:
    case MessageType.RESET_SESSION:
      await storage.clearStudentSessionData();
      console.log('[AI Background] High-Security Session Reset executed.');
      return { ok: true, sessionCleared: true };

    default:
      return { error: 'Unknown message type' };
  }
}

async function handleScheduleParsed(data) {
  let { classes } = data || {};
  const today = getTodayDate();
  const dayName = getTodayDayName();

  const weeklySchedule = await storage.getWeeklySchedule();

  if ((!classes || classes.length === 0) && weeklySchedule) {
    if (weeklySchedule.dateWiseSchedule && weeklySchedule.dateWiseSchedule[today]) {
      classes = weeklySchedule.dateWiseSchedule[today].map(c => ({
        id: deterministicId(today + c.subjectName + (c.startTime || '')),
        subjectName: c.subjectName,
        normalizedName: normalizeSubjectName(c.subjectName),
        courseCode: c.courseCode || null,
        date: today,
        dayOfWeek: dayName,
        startTime: c.startTime,
        endTime: c.endTime,
        faculty: c.facultyName,
        matchConfidence: 0,
        sync: { source: 'Synced Timetable Fallback', syncedAt: nowISO(), confidence: 0.95 }
      }));
    } else if (weeklySchedule.days && weeklySchedule.days[dayName]) {
      classes = weeklySchedule.days[dayName].map(c => ({
        id: deterministicId(today + c.subjectName + (c.startTime || '')),
        subjectName: c.subjectName,
        normalizedName: normalizeSubjectName(c.subjectName),
        courseCode: c.courseCode || null,
        date: today,
        dayOfWeek: dayName,
        startTime: c.startTime,
        endTime: c.endTime,
        faculty: c.facultyName,
        matchConfidence: 0,
        sync: { source: 'Synced Timetable Fallback', syncedAt: nowISO(), confidence: 0.95 }
      }));
    }
  }

  await storage.saveTodaySchedule(classes || [], today);
  await storage.saveExtensionState(ExtensionState.SCHEDULE_DETECTED);

  const subjectsData = await storage.getSubjects();

  if (!subjectsData || subjectsData.subjects.length === 0) {
    return { needsAttendance: true };
  }

  const prefs = await storage.getPreferences();
  const matchCache = await storage.getMatchCache();
  const matches = matchSubjects(classes || [], subjectsData.subjects, prefs.aliasMap, matchCache);

  const newCache = {};
  for (const match of matches) {
    if (match.confidence >= 0.70 && match.attendanceSubject) {
      newCache[match.scheduleClass.normalizedName] = match.attendanceSubject.id;
    }
  }
  if (Object.keys(newCache).length > 0) {
    await storage.saveMatchCache(newCache);
  }

  const matchedClasses = matches.map(m => ({
    classInstance: m.scheduleClass,
    subject: m.attendanceSubject,
  }));

  const holidaysData = await storage.getHolidays();
  const holidays = holidaysData?.holidays || [];

  const recommendations = generateRecommendations(
    matchedClasses, subjectsData.subjects, prefs, weeklySchedule, holidays
  );

  const plan = generateTodayPlan(matchedClasses, subjectsData.subjects, prefs, weeklySchedule, holidays);
  await storage.saveTodayPlan(plan);
  await storage.saveExtensionState(ExtensionState.READY);

  return {
    recommendations,
    lastSync: subjectsData.syncedAt,
    isStale: subjectsData.isStale,
  };
}

async function handleAttendanceParsed(data) {
  const { subjects } = data;

  await storage.saveSubjects(subjects);
  await storage.saveExtensionState(ExtensionState.ATTENDANCE_DETECTED);

  const prefs = await storage.getPreferences();
  const weeklySchedule = await storage.getWeeklySchedule();
  const holidaysData = await storage.getHolidays();
  const holidays = holidaysData?.holidays || [];

  const projections = projectAllSubjects(
    subjects, weeklySchedule, prefs.semesterEndDate,
    prefs.subjectTarget, prefs.safetyBuffer, holidays
  );

  const overall = calculateOverall(subjects);

  const scheduleData = await storage.getTodaySchedule();
  const scheduleClasses = scheduleData?.classes || [];
  const matchCache = await storage.getMatchCache();
  const matches = matchSubjects(scheduleClasses, subjects, prefs.aliasMap, matchCache);

  const matchedClasses = matches.map(m => ({
    classInstance: m.scheduleClass,
    subject: m.attendanceSubject,
  }));

  const plan = generateTodayPlan(matchedClasses, subjects, prefs, weeklySchedule, holidays);
  await storage.saveTodayPlan(plan);
  await storage.saveExtensionState(ExtensionState.READY);

  return {
    projections,
    overallPercentage: overall.percentage,
    overallTarget: prefs.overallTarget,
    syncTime: nowISO(),
  };
}

async function handleTimetableParsed(data) {
  const { timetable } = data;
  if (!timetable) return { ok: false };

  await storage.saveWeeklySchedule(timetable);

  const subjectsData = await storage.getSubjects();
  const subjects = subjectsData?.subjects || [];
  const prefs = await storage.getPreferences();
  const holidaysData = await storage.getHolidays();
  const holidays = holidaysData?.holidays || [];

  const semesterEnd = prefs.semesterEndDate || getDynamicSemesterEndDate();
  const projections = projectAllSubjects(
    subjects,
    timetable,
    semesterEnd,
    prefs.subjectTarget,
    prefs.safetyBuffer,
    holidays
  );

  const weeklyBunkPlanner = generateWeeklyBunkPlanner(timetable, subjects, prefs, projections);
  const dateWiseBunkPlanner = generateDateWiseBunkPlanner(timetable, subjects, prefs);

  const existingPlan = await storage.getTodayPlan();
  const updatedPlan = {
    ...(existingPlan || {}),
    weeklyBunkPlanner,
    dateWiseBunkPlanner,
    timetableSyncedAt: nowISO(),
  };

  await storage.saveTodayPlan(updatedPlan);

  return {
    ok: true,
    weeklyBunkPlanner,
    dateWiseBunkPlanner,
    projections,
  };
}

async function handleCalendarParsed(data) {
  const { holidays, semesterEndDate } = data;

  if (holidays && holidays.length > 0) {
    await storage.saveHolidays(holidays);
  }

  if (semesterEndDate) {
    const prefs = await storage.getPreferences();
    if (!prefs.semesterEndDate) {
      await storage.savePreferences({ semesterEndDate });
    }
  }

  const subjectsData = await storage.getSubjects();
  if (subjectsData && subjectsData.subjects) {
    const prefs = await storage.getPreferences();
    const weeklySchedule = await storage.getWeeklySchedule();
    const projections = projectAllSubjects(
      subjectsData.subjects, weeklySchedule, prefs.semesterEndDate,
      prefs.subjectTarget, prefs.safetyBuffer, holidays || []
    );
  }

  return { ok: true, count: (holidays || []).length, semesterEndDate };
}

async function handleGetHolidays() {
  return await storage.getHolidays();
}

async function handlePageDetected(data) {
  return { ok: true };
}

async function handleStudentInfoParsed(data) {
  if (data && data.studentInfo && data.studentInfo.name) {
    const newName = data.studentInfo.name.trim().toLowerCase();
    const existing = await storage.getStudentInfo();

    if (existing && existing.name) {
      const oldName = existing.name.trim().toLowerCase();

      if (oldName !== newName) {
        console.log(`[AI Background] High Security: User switch detected from "${existing.name}" to "${data.studentInfo.name}". Purging all old session data.`);
        await storage.clearStudentSessionData();
      }
    }

    await storage.saveStudentInfo(data.studentInfo);
  }
  return { ok: true };
}

async function handleGetStudentInfo() {
  return await storage.getStudentInfo();
}

async function handleGetTodayPlan() {
  let plan = await storage.getTodayPlan();
  const state = await storage.getExtensionState();
  const prefs = await storage.getPreferences();
  const weeklySchedule = await storage.getWeeklySchedule();

  if (plan && (!plan.weeklyBunkPlanner || !plan.dateWiseBunkPlanner || plan.dateWiseBunkPlanner.length === 0) && weeklySchedule) {
    const subjectsData = await storage.getSubjects();
    const subjects = subjectsData?.subjects || [];
    const scheduleData = await storage.getTodaySchedule();
    const scheduleClasses = scheduleData?.classes || [];
    const matchCache = await storage.getMatchCache();
    const holidaysData = await storage.getHolidays();
    const holidays = holidaysData?.holidays || [];
    const matches = matchSubjects(scheduleClasses, subjects, prefs.aliasMap, matchCache);

    const matchedClasses = matches.map(m => ({
      classInstance: m.scheduleClass,
      subject: m.attendanceSubject,
    }));

    plan = generateTodayPlan(matchedClasses, subjects, prefs, weeklySchedule, holidays);
    await storage.saveTodayPlan(plan);
  }

  if (plan) {
    return { plan, state, firstRunComplete: prefs.firstRunComplete };
  }

  const subjectsData = await storage.getSubjects();
  const scheduleData = await storage.getTodaySchedule();

  if (subjectsData && scheduleData) {
    const matchCache = await storage.getMatchCache();
    const holidaysData = await storage.getHolidays();
    const holidays = holidaysData?.holidays || [];
    const matches = matchSubjects(scheduleData.classes, subjectsData.subjects, prefs.aliasMap, matchCache);

    const matchedClasses = matches.map(m => ({
      classInstance: m.scheduleClass,
      subject: m.attendanceSubject,
    }));

    const newPlan = generateTodayPlan(matchedClasses, subjectsData.subjects, prefs, weeklySchedule, holidays);
    await storage.saveTodayPlan(newPlan);

    return { plan: newPlan, state: ExtensionState.READY, firstRunComplete: prefs.firstRunComplete };
  }

  return { plan: null, state, firstRunComplete: prefs.firstRunComplete };
}

async function handleGetState() {
  const state = await storage.getExtensionState();
  const prefs = await storage.getPreferences();
  return { state, firstRunComplete: prefs.firstRunComplete };
}

async function handleGetSubjects() {
  const data = await storage.getSubjects();
  if (!data) return { subjects: [], syncedAt: null, isStale: true };
  return data;
}

async function handleGetDebugInfo() {
  const state = await storage.getExtensionState();
  const subjects = await storage.getSubjects();
  const schedule = await storage.getTodaySchedule();
  const weekly = await storage.getWeeklySchedule();
  const observed = await storage.getObservedSchedules();
  const syncLog = await storage.getSyncLog();
  const storageInfo = await storage.getStorageInfo();
  const plan = await storage.getTodayPlan();

  return {
    extensionState: state,
    detectedPage: 'N/A (background)',
    scheduleRecords: schedule?.classes?.length || 0,
    scheduleDate: schedule?.date || 'N/A',
    attendanceRecords: subjects?.subjects?.length || 0,
    lastAttendanceSync: subjects?.syncedAt || 'Never',
    lastScheduleSync: schedule?.syncedAt || 'Never',
    isStale: subjects?.isStale || true,
    weeklyScheduleSource: weekly?.source || 'None',
    weeklyScheduleDays: weekly ? Object.keys(weekly.days || {}).length : 0,
    observedDays: observed ? Object.keys(observed).length : 0,
    matchedCount: plan?.recommendations?.filter(r => r.matchConfidence >= 0.7).length || 0,
    unmatchedCount: plan?.recommendations?.filter(r => r.matchConfidence < 0.7).length || 0,
    syncLog: syncLog.slice(-10),
    storageUsed: `${(storageInfo.bytesUsed / 1024).toFixed(1)} KB`,
    storageQuota: `${(storageInfo.quota / 1024 / 1024).toFixed(1)} MB`,
    extensionVersion: chrome.runtime.getManifest().version,
  };
}

async function handleGetPreferences() {
  return await storage.getPreferences();
}

async function handleSavePreferences(data) {
  await storage.savePreferences(data);

  await handleForceResync();

  const prefs = await storage.getPreferences();
  const domain = prefs.portalDomain || 'rcoem.in';

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && tab.url.includes(domain)) {
        try {
          chrome.tabs.sendMessage(tab.id, { type: MessageType.FORCE_RESYNC }, (response) => {

            if (chrome.runtime.lastError) {

            }
          });
        } catch (e) {

        }
      }
    }
  });

  return { ok: true };
}

async function handleExportData() {
  return await storage.exportAllData();
}

async function handleClearData() {
  await storage.clearAllData();
  await storage.saveExtensionState(ExtensionState.INITIALIZING);
  return { ok: true };
}

async function handleSaveAlias(data) {
  const { scheduleName, attendanceName } = data;
  await storage.saveAlias(scheduleName, attendanceName);
  return { ok: true };
}

async function handleGetWhatIf(data) {
  const { subjectId, action } = data;
  const subjectsData = await storage.getSubjects();
  if (!subjectsData) return { error: 'No subjects data' };

  const prefs = await storage.getPreferences();
  const subject = subjectsData.subjects.find(s => s.id === subjectId);
  if (!subject) return { error: 'Subject not found' };

  const { whatIfAttend, whatIfBunk, calculateOverall: calcOverall } = await import('../engine/attendance-calculator.js');

  return {
    current: subject.percentage,
    ifAttend: whatIfAttend(subject.attended, subject.conducted),
    ifBunk: whatIfBunk(subject.attended, subject.conducted),
    subject: subject.name,
  };
}

async function handleForceResync() {
  const subjectsData = await storage.getSubjects();
  const scheduleData = await storage.getTodaySchedule();
  const prefs = await storage.getPreferences();
  const weeklySchedule = await storage.getWeeklySchedule();
  const holidaysData = await storage.getHolidays();
  const holidays = holidaysData?.holidays || [];

  if (subjectsData && scheduleData) {
    const matchCache = await storage.getMatchCache();
    const matches = matchSubjects(scheduleData.classes, subjectsData.subjects, prefs.aliasMap, matchCache);

    const matchedClasses = matches.map(m => ({
      classInstance: m.scheduleClass,
      subject: m.attendanceSubject,
    }));

    const plan = generateTodayPlan(matchedClasses, subjectsData.subjects, prefs, weeklySchedule, holidays);
    await storage.saveTodayPlan(plan);
  }
  return { ok: true };
}

async function handleGetProjections() {
  const subjectsData = await storage.getSubjects();
  if (!subjectsData) return { projections: [] };

  const prefs = await storage.getPreferences();
  const weeklySchedule = await storage.getWeeklySchedule();
  const holidaysData = await storage.getHolidays();
  const holidays = holidaysData?.holidays || [];

  const projections = projectAllSubjects(
    subjectsData.subjects, weeklySchedule, prefs.semesterEndDate,
    prefs.subjectTarget, prefs.safetyBuffer, holidays
  );

  return { projections };
}

async function handleFacultyParsed(data) {
  const { facultyMap } = data;
  await storage.saveFacultyMap(facultyMap);
  return { ok: true };
}

chrome.alarms.create('checkStaleData', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkStaleData') {
    const subjects = await storage.getSubjects();
    if (subjects && subjects.isStale) {
      chrome.notifications.create('staleData', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Attendance Insights',
        message: 'Your attendance data may be outdated. Open your Attendance page to refresh.',
      });
    }
  }
});
