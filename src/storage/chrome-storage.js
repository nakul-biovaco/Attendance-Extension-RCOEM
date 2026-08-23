import { DEFAULT_PREFERENCES } from '../types/models.js';
import { nowISO, isOlderThan } from '../utils/date-utils.js';

const KEYS = {
  SUBJECTS: 'ai_subjects',
  SCHEDULE_TODAY: 'ai_schedule_today',
  WEEKLY_SCHEDULE: 'ai_weekly_schedule',
  OBSERVED_SCHEDULES: 'ai_observed_schedules',
  PREFERENCES: 'ai_preferences',
  MATCH_CACHE: 'ai_match_cache',
  ALIAS_MAP: 'ai_alias_map',
  EXTENSION_STATE: 'ai_extension_state',
  TODAY_PLAN: 'ai_today_plan',
  HOLIDAYS: 'ai_holidays',
  SYNC_LOG: 'ai_sync_log',
  STUDENT_INFO: 'ai_student_info',
};

async function get(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] ?? null);
    });
  });
}

async function set(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

async function remove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

function getAcronymForName(name) {
  if (!name) return '';
  const words = name.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => {
    const lw = w.toLowerCase();
    return lw.length > 0 && !['and', 'a', 'an', 'or', 'of', 'the', 'in', 'for', 'to', 'with', '&', 'at', 'on', 'by', 'from', 'ii', 'iii', 'iv', 'lab', 'practical', 'pr', 'p'].includes(lw);
  });
  return words.map(w => w[0]).join('').toLowerCase();
}

export async function saveFacultyMap(facultyMap) {
  const existing = await get('ai_faculty_map') || {};
  const updated = { ...existing, ...facultyMap };
  await set('ai_faculty_map', updated);

  const subjectsData = await get(KEYS.SUBJECTS);
  if (subjectsData && subjectsData.subjects) {
    let updatedSubjects = false;
    for (const subject of subjectsData.subjects) {
      const sName = (subject.name || '').toLowerCase().trim();
      const sNorm = subject.normalizedName || sName;
      const codeLower = subject.code ? subject.code.toLowerCase().trim() : '';
      const acronym = getAcronymForName(subject.name);

      const fName = updated[sName] || updated[sNorm] || (codeLower ? updated[codeLower] : null) || (acronym ? updated[acronym] : null);
      if (fName && subject.facultyName !== fName) {
        subject.facultyName = fName;
        updatedSubjects = true;
      }
    }
    if (updatedSubjects) {
      await set(KEYS.SUBJECTS, subjectsData);
    }
  }
}

export async function saveSubjects(subjects) {
  const facultyMap = await get('ai_faculty_map') || {};
  for (const subject of subjects) {
    if (!subject.facultyName) {
      const sName = (subject.name || '').toLowerCase().trim();
      const sNorm = subject.normalizedName || sName;
      const codeLower = subject.code ? subject.code.toLowerCase().trim() : '';
      const acronym = getAcronymForName(subject.name);

      const fName = facultyMap[sName] || facultyMap[sNorm] || (codeLower ? facultyMap[codeLower] : null) || (acronym ? facultyMap[acronym] : null);
      if (fName) {
        subject.facultyName = fName;
      }
    }
  }

  const data = {
    subjects,
    syncedAt: nowISO(),
    source: 'Juno Attendance Page',
    confidence: 1.0,
    count: subjects.length,
  };
  await set(KEYS.SUBJECTS, data);
  await logSync('attendance', subjects.length);
}

export async function getSubjects() {
  const data = await get(KEYS.SUBJECTS);
  if (!data) return null;

  const prefs = await getPreferences();
  const isStale = isOlderThan(data.syncedAt, prefs.staleDataThresholdHours);

  return {
    subjects: data.subjects,
    syncedAt: data.syncedAt,
    isStale,
    count: data.count,
  };
}

export async function saveTodaySchedule(classes, date) {
  const data = {
    classes,
    date,
    syncedAt: nowISO(),
    source: 'Juno Student Home',
    confidence: 1.0,
  };
  await set(KEYS.SCHEDULE_TODAY, data);
  await logSync('schedule', classes.length);

  await recordObservedSchedule(classes, date);
}

export async function getTodaySchedule() {
  const data = await get(KEYS.SCHEDULE_TODAY);
  if (!data) return null;
  return {
    classes: data.classes,
    date: data.date,
    syncedAt: data.syncedAt,
  };
}

export async function saveWeeklySchedule(schedule) {
  await set(KEYS.WEEKLY_SCHEDULE, {
    ...schedule,
    syncedAt: nowISO(),
  });
}

export async function getWeeklySchedule() {
  return await get(KEYS.WEEKLY_SCHEDULE);
}

async function recordObservedSchedule(classes, date) {
  const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  const observed = (await get(KEYS.OBSERVED_SCHEDULES)) || {};

  if (!observed[dayName]) {
    observed[dayName] = [];
  }

  observed[dayName].push({
    date,
    classes: classes.map(c => ({
      subjectName: c.subjectName,
      normalizedName: c.normalizedName,
      courseCode: c.courseCode,
      startTime: c.startTime,
      endTime: c.endTime,
    })),
    observedAt: nowISO(),
  });

  if (observed[dayName].length > 4) {
    observed[dayName] = observed[dayName].slice(-4);
  }

  await set(KEYS.OBSERVED_SCHEDULES, observed);

  await buildLearnedSchedule(observed);
}

async function buildLearnedSchedule(observed) {
  const existingSchedule = await get(KEYS.WEEKLY_SCHEDULE);

  if (existingSchedule && (existingSchedule.source === 'portal' || existingSchedule.source === 'manual')) {
    return;
  }

  const days = {};
  let totalObservations = 0;
  let daysWithEnoughData = 0;

  for (const [dayName, observations] of Object.entries(observed)) {
    if (observations.length >= 2) {

      const last = observations[observations.length - 1];
      const prev = observations[observations.length - 2];

      const lastSubjects = last.classes.map(c => c.normalizedName).sort().join('|');
      const prevSubjects = prev.classes.map(c => c.normalizedName).sort().join('|');

      if (lastSubjects === prevSubjects) {
        days[dayName] = last.classes;
        daysWithEnoughData++;
      }
    }
    totalObservations += observations.length;
  }

  if (daysWithEnoughData >= 2) {

    const learned = {
      days,
      source: 'observed',
      confidence: Math.min(0.9, 0.5 + (daysWithEnoughData * 0.1)),
      syncedAt: nowISO(),
      observedWeeks: Math.floor(totalObservations / Math.max(1, Object.keys(observed).length)),
    };
    await set(KEYS.WEEKLY_SCHEDULE, learned);
  }
}

export async function getObservedSchedules() {
  return await get(KEYS.OBSERVED_SCHEDULES);
}

export async function saveHolidays(holidays) {
  await set(KEYS.HOLIDAYS, {
    holidays: holidays || [],
    count: (holidays || []).length,
    syncedAt: nowISO(),
  });
}

export async function getHolidays() {
  return await get(KEYS.HOLIDAYS);
}

export async function getPreferences() {
  const stored = await get(KEYS.PREFERENCES);
  return { ...DEFAULT_PREFERENCES, ...(stored || {}) };
}

export async function savePreferences(prefs) {
  const current = await getPreferences();
  await set(KEYS.PREFERENCES, { ...current, ...prefs });
}

export async function saveMatchCache(matches) {
  const existing = (await get(KEYS.MATCH_CACHE)) || {};
  await set(KEYS.MATCH_CACHE, { ...existing, ...matches });
}

export async function getMatchCache() {
  return (await get(KEYS.MATCH_CACHE)) || {};
}

export async function saveAlias(scheduleName, attendanceName) {
  const prefs = await getPreferences();
  prefs.aliasMap = prefs.aliasMap || {};
  prefs.aliasMap[scheduleName.toLowerCase().trim()] = attendanceName.toLowerCase().trim();
  await savePreferences(prefs);
}

export async function saveExtensionState(state) {
  await set(KEYS.EXTENSION_STATE, { state, updatedAt: nowISO() });
}

export async function getExtensionState() {
  const data = await get(KEYS.EXTENSION_STATE);
  return data?.state || 'INITIALIZING';
}

export async function saveTodayPlan(plan) {
  await set(KEYS.TODAY_PLAN, plan);
}

export async function getTodayPlan() {
  return await get(KEYS.TODAY_PLAN);
}

async function logSync(type, recordCount) {
  const log = (await get(KEYS.SYNC_LOG)) || [];
  log.push({ type, recordCount, at: nowISO() });

  if (log.length > 50) log.splice(0, log.length - 50);
  await set(KEYS.SYNC_LOG, log);
}

export async function getSyncLog() {
  return (await get(KEYS.SYNC_LOG)) || [];
}

export async function exportAllData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (all) => {

      const filtered = {};
      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith('ai_')) {
          filtered[key] = value;
        }
      }
      resolve(filtered);
    });
  });
}

export async function clearAllData() {
  const allKeys = Object.values(KEYS);
  await remove(allKeys);
}

export async function clearStudentSessionData() {
  const sessionKeys = [
    KEYS.SUBJECTS,
    KEYS.SCHEDULE_TODAY,
    KEYS.WEEKLY_SCHEDULE,
    KEYS.OBSERVED_SCHEDULES,
    KEYS.MATCH_CACHE,
    KEYS.ALIAS_MAP,
    KEYS.TODAY_PLAN,
    KEYS.STUDENT_INFO,
    KEYS.SYNC_LOG,
    'ai_faculty_map',
    'ai_streak',
  ];
  await remove(sessionKeys);
  await set(KEYS.EXTENSION_STATE, 'INITIALIZING');
}

export async function getStorageInfo() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytesUsed) => {
      resolve({
        bytesUsed,
        quota: chrome.storage.local.QUOTA_BYTES || 10485760,
      });
    });
  });
}

export async function saveStreak(days, lastDate) {
  await set('ai_streak', { days, lastDate, updatedAt: nowISO() });
}

export async function getStreak() {
  return await get('ai_streak');
}

export async function saveStudentInfo(studentInfo) {
  if (!studentInfo) return;
  const existing = await get(KEYS.STUDENT_INFO) || {};
  const updated = {
    ...existing,
    ...studentInfo,
    updatedAt: nowISO(),
  };
  if (studentInfo.name) {
    updated.name = studentInfo.name.trim();
  }
  await set(KEYS.STUDENT_INFO, updated);
}

export async function getStudentInfo() {
  return await get(KEYS.STUDENT_INFO);
}
