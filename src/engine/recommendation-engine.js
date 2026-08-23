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

import { RecommendationType } from '../types/models.js';
import {
  calculatePercentage, whatIfAttend, whatIfBunk,
  calculateOverall, maxSafeBunks, classesNeededToReach, formatPercentage
} from './attendance-calculator.js';
import { projectSubject, whatIfSemesterProjection } from './projection-engine.js';
import { assessSubjectRisk } from './risk-engine.js';
import { optimizeTodayBunks } from './optimizer.js';

const RECOMMENDATION_STYLES = {
  [RecommendationType.MUST_ATTEND]: {
    label: 'MUST ATTEND',
    emoji: '',
    color: '#dc2626',
    bgColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  [RecommendationType.ATTEND_LOW_BUFFER]: {
    label: 'ATTEND — LOW BUFFER',
    emoji: '',
    color: '#d97706',
    bgColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  [RecommendationType.BUNK_SAFE]: {
    label: 'BUNK SAFE',
    emoji: '',
    color: '#16a34a',
    bgColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  [RecommendationType.OPTIONAL]: {
    label: 'OPTIONAL',
    emoji: '',
    color: '#2563eb',
    bgColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  [RecommendationType.DATA_NOT_VERIFIED]: {
    label: 'DATA NOT VERIFIED',
    emoji: '',
    color: '#ca8a04',
    bgColor: '#fef9c3',
    borderColor: '#eab308',
  },
  [RecommendationType.HIGH_RISK]: {
    label: 'HIGH RISK',
    emoji: '',
    color: '#b91c1c',
    bgColor: '#fee2e2',
    borderColor: '#dc2626',
  },
};

const MATCH_CONFIDENCE_THRESHOLD = 0.70;

function isSubjectBlacklisted(subjectName) {
  if (!subjectName) return true;
  const lower = subjectName.toLowerCase().trim();
  const blacklistExact = new Set([
    'profile', 'my profile', 'syllabus', 'calendar', 'calender', 'academic calendar', 'academic calender',
    'timetable', 'time table', 'student timetable', 'student timetable', 'library', 'library (0 issued)',
    'fees details', 'fees', 'fees detail', 'leave details', 'leave detail', 'leave', 'hostel',
    'contact mentor', 'mentor', 'mentoring', 'blogs', 'blog', 'dashboard', 'logout',
    'change password', 'feedback', 'registration', 'exam registration', 'result', 'results',
    'admit card', 'hall ticket', 'curriculum', 'home', 'about', 'contact', 'gallery', 'news',
    'event', 'events', 'admission', 'admissions', 'placement', 'placements', 'grievance',
    'alumni', 'anti ragging', 'download', 'downloads', 'course file', 'student portfolio',
    'mentee', 'blogs details', 'academic schedule', 'syllabus plan', 'contact mentor', 'leave details'
  ]);

  if (blacklistExact.has(lower)) return true;

  const blacklistContains = [
    'library (', 'contact mentor', 'leave details', 'fees details', 'leave report', 'admit card',
    'change password', 'sign out', 'signout', 'my profile', 'feedback form'
  ];
  return blacklistContains.some(term => lower.includes(term));
}

export function generateRecommendations(matchedClasses, allSubjects, preferences, weeklySchedule, holidays = []) {
  const { subjectTarget, overallTarget, safetyBuffer, preferredBunkDays, semesterEndDate } = preferences;
  const safeSubjectTarget = subjectTarget + safetyBuffer;

  const filteredClasses = (matchedClasses || []).filter(mc => {
    if (!mc) return false;
    const name = mc.classInstance?.subjectName || mc.subject?.name || mc.subjectName || '';
    return !isSubjectBlacklisted(name);
  });

  const optimizerResults = optimizeTodayBunks(
    filteredClasses, allSubjects,
    subjectTarget, overallTarget, safetyBuffer,
    preferredBunkDays
  );

  const recommendations = [];

  for (const { classInstance, subject } of filteredClasses) {

    if (!subject || classInstance.matchConfidence < MATCH_CONFIDENCE_THRESHOLD) {
      recommendations.push(createUnverifiedRecommendation(classInstance));
      continue;
    }

    const currentPct = subject.percentage;
    const ifAttendPct = whatIfAttend(subject.attended, subject.conducted);
    const ifBunkPct = whatIfBunk(subject.attended, subject.conducted);

    const projection = projectSubject(
      subject, weeklySchedule, semesterEndDate,
      subjectTarget, safetyBuffer, holidays
    );

    const semProjection = whatIfSemesterProjection(
      subject, projection.remainingClasses, projection.maximumSafeBunks
    );

    const risk = assessSubjectRisk(
      subject, subjectTarget, safetyBuffer, projection.remainingClasses
    );

    const optimResult = optimizerResults.get(classInstance.id);

    const recType = determineRecommendationType(
      currentPct, ifBunkPct, ifAttendPct,
      subjectTarget, safeSubjectTarget,
      risk.level, projection, optimResult
    );

    const style = RECOMMENDATION_STYLES[recType];

    const reason = buildReasonText(recType, {
      currentPct, ifBunkPct, ifAttendPct,
      subjectTarget, safeSubjectTarget,
      risk, projection, optimResult, subject,
      preferredBunkDays,
    });

    const mathBreakdown = buildMathBreakdown(subject, {
      currentPct, ifAttendPct, ifBunkPct,
      projection, semProjection, subjectTarget, safeSubjectTarget,
    });

    recommendations.push({
      classId: classInstance.id,
      type: recType,
      label: style.label,
      emoji: style.emoji,
      color: style.color,
      bgColor: style.bgColor,
      borderColor: style.borderColor,
      currentPercentage: currentPct,
      ifAttendPercentage: ifAttendPct,
      ifBunkPercentage: ifBunkPct,
      semesterProjectionAttend: semProjection.attendProjection,
      semesterProjectionBunk: semProjection.bunkProjection,
      safeBunksRemaining: projection.maximumSafeBunks,
      immediateSafeBunks: projection.immediateSafeBunks || 0,
      requiredFutureClasses: projection.minimumRequired,
      reason,
      mathBreakdown,
      matchConfidence: classInstance.matchConfidence,
      subjectName: subject.name,
      attended: subject.attended,
      conducted: subject.conducted,
      facultyName: subject.facultyName,
    });
  }

  return recommendations;
}

function determineRecommendationType(currentPct, ifBunkPct, ifAttendPct, target, safeTarget, riskLevel, projection, optimResult) {

  if (riskLevel === 'HIGH' && projection.minimumRequired > projection.remainingClasses) {
    return RecommendationType.HIGH_RISK;
  }

  if (currentPct < target || ifBunkPct < target) {
    return RecommendationType.MUST_ATTEND;
  }

  if (optimResult && !optimResult.canBunk) {
    if (ifBunkPct < safeTarget) {
      return RecommendationType.ATTEND_LOW_BUFFER;
    }
    return RecommendationType.MUST_ATTEND;
  }

  if (ifBunkPct < safeTarget) {
    return RecommendationType.ATTEND_LOW_BUFFER;
  }

  if (currentPct >= safeTarget + 15 && projection.maximumSafeBunks >= 8) {
    return RecommendationType.OPTIONAL;
  }

  if (ifBunkPct >= safeTarget) {
    return RecommendationType.BUNK_SAFE;
  }

  return RecommendationType.ATTEND_LOW_BUFFER;
}

function buildReasonText(type, ctx) {
  const { currentPct, ifBunkPct, ifAttendPct, subjectTarget, safeSubjectTarget, risk, projection, subject, preferredBunkDays } = ctx;

  switch (type) {
    case RecommendationType.HIGH_RISK:
      return `Attendance at ${formatPercentage(currentPct)}% is critically low. Even with perfect future attendance, recovery is uncertain. Every class counts.`;

    case RecommendationType.MUST_ATTEND:
      if (currentPct < subjectTarget) {
        return `Attendance at ${formatPercentage(currentPct)}% is below the ${subjectTarget}% target. Must attend to recover. Need ${projection.minimumRequired} more classes.`;
      }
      return `Bunking would drop attendance to ${formatPercentage(ifBunkPct)}%, below the ${subjectTarget}% target. Must attend.`;

    case RecommendationType.ATTEND_LOW_BUFFER:
      return `Attendance at ${formatPercentage(currentPct)}% is above ${subjectTarget}% target but below the ${safeSubjectTarget}% safe zone. Only ${projection.maximumSafeBunks} safe bunks remaining this semester.`;

    case RecommendationType.BUNK_SAFE: {
      let reason = `Attendance at ${formatPercentage(currentPct)}%. After bunking: ${formatPercentage(ifBunkPct)}%, still above ${safeSubjectTarget}% safe target.`;
      if (projection.maximumSafeBunks > 0) {
        reason += ` ${projection.maximumSafeBunks} safe bunks remaining.`;
      }
      return reason;
    }

    case RecommendationType.OPTIONAL:
      return `Attendance at ${formatPercentage(currentPct)}% is well above all targets. ${projection.maximumSafeBunks} safe bunks remaining. Minimal impact.`;

    case RecommendationType.DATA_NOT_VERIFIED:
      return 'Unable to match this class with attendance data. Open the Attendance page to sync.';

    default:
      return '';
  }
}

function buildMathBreakdown(subject, ctx) {
  const { currentPct, ifAttendPct, ifBunkPct, projection, semProjection, subjectTarget, safeSubjectTarget } = ctx;

  const lines = [
    `Subject: ${subject.name}`,
    ``,
    `Current Attendance: ${subject.attended}/${subject.conducted} = ${formatPercentage(currentPct)}%`,
    ``,
    `If you ATTEND this class:`,
    `  ${subject.attended + 1}/${subject.conducted + 1} = ${formatPercentage(ifAttendPct)}%`,
    ``,
    `If you BUNK this class:`,
    `  ${subject.attended}/${subject.conducted + 1} = ${formatPercentage(ifBunkPct)}%`,
    ``,
    `----------------------------------------`,
    `Subject Target: ${subjectTarget}%`,
    `Safe Target: ${safeSubjectTarget}%`,
    ``,
  ];

  if (projection.remainingClasses > 0) {
    lines.push(
      `Remaining classes: ~${projection.remainingClasses} (${projection.remainingSource})`,
      `Min future attendance needed: ${projection.minimumRequired}`,
      `Max safe bunks: ${projection.maximumSafeBunks}`,
      ``,
    );
  }

  if (semProjection.attendProjection > 0) {
    lines.push(
      `Semester-end projection:`,
      `  If attend -> ${formatPercentage(semProjection.attendProjection)}%`,
      `  If bunk -> ${formatPercentage(semProjection.bunkProjection)}%`,
    );
  }

  return lines.join('\n');
}

function createUnverifiedRecommendation(classInstance) {
  const style = RECOMMENDATION_STYLES[RecommendationType.DATA_NOT_VERIFIED];
  return {
    classId: classInstance.id,
    type: RecommendationType.DATA_NOT_VERIFIED,
    label: style.label,
    emoji: style.emoji,
    color: style.color,
    bgColor: style.bgColor,
    borderColor: style.borderColor,
    currentPercentage: 0,
    ifAttendPercentage: 0,
    ifBunkPercentage: 0,
    semesterProjectionAttend: 0,
    semesterProjectionBunk: 0,
    safeBunksRemaining: 0,
    requiredFutureClasses: 0,
    reason: 'Unable to match this class with attendance data. Open the Attendance page to sync.',
    mathBreakdown: '',
    matchConfidence: classInstance.matchConfidence,
    subjectName: classInstance.subjectName,
    attended: 0,
    conducted: 0,
  };
}

export function generateBunkSummary(recommendations) {
  const mustAttend = [];
  const safeToBunk = [];
  const optional = [];
  const unverified = [];

  for (const rec of recommendations) {
    switch (rec.type) {
      case RecommendationType.MUST_ATTEND:
      case RecommendationType.ATTEND_LOW_BUFFER:
      case RecommendationType.HIGH_RISK:
        mustAttend.push(rec);
        break;
      case RecommendationType.BUNK_SAFE:
        safeToBunk.push(rec);
        break;
      case RecommendationType.OPTIONAL:
        optional.push(rec);
        break;
      case RecommendationType.DATA_NOT_VERIFIED:
        unverified.push(rec);
        break;
    }
  }

  let summary;
  if (mustAttend.length === 0 && unverified.length === 0) {
    summary = 'You can safely bunk all classes today.';
  } else if (safeToBunk.length === 0 && optional.length === 0) {
    summary = 'You should attend all classes today.';
  } else {
    summary = `Attend ${mustAttend.length} class(es), safe to skip ${safeToBunk.length + optional.length}${unverified.length > 0 ? `, ${unverified.length} unverified` : ''}.`;
  }

  return { mustAttend, safeToBunk, optional, unverified, summary };
}

export function generateTodayPlan(matchedClasses, allSubjects, preferences, weeklySchedule, holidays = []) {
  const recommendations = generateRecommendations(matchedClasses, allSubjects, preferences, weeklySchedule, holidays);
  const bunkSummary = generateBunkSummary(recommendations);
  const overall = calculateOverall(allSubjects);

  const active = allSubjects.filter(s => s.conducted > 0);
  let highestRisk = null;
  let worstPct = Infinity;

  for (const subject of active) {
    if (subject.percentage < worstPct) {
      worstPct = subject.percentage;
      highestRisk = subject;
    }
  }

  const isStale = (allSubjects || []).length === 0;
  const weeklyBunkPlanner = generateWeeklyBunkPlanner(weeklySchedule, allSubjects, preferences);

  return {
    date: new Date().toISOString().split('T')[0],
    day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    recommendations,
    totalClasses: recommendations.length,
    mustAttend: bunkSummary.mustAttend.length,
    safeToBunk: bunkSummary.safeToBunk.length + bunkSummary.optional.length,
    unverified: bunkSummary.unverified.length,
    overallPercentage: overall.percentage,
    overallTarget: preferences.overallTarget,
    overallAttended: overall.attended,
    overallConducted: overall.conducted,
    highestRiskSubject: highestRisk,
    generatedAt: new Date().toISOString(),
    isStale,
    bunkSummary: bunkSummary.summary,
    weeklyBunkPlanner,
    dateWiseBunkPlanner: generateDateWiseBunkPlanner(weeklySchedule, allSubjects, preferences),
  };
}

export function resolveFullSubject(name, subjects = []) {
  if (!name) return name;
  const rawNorm = name.toLowerCase().trim();
  const cleanNorm = name.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
  const isPractical = rawNorm.includes('(p)') || rawNorm.includes('lab') || rawNorm.includes('practical');

  const matched = (subjects || []).find(s => {
    const sName = (s.name || '').toLowerCase();
    const isSubPractical = sName.includes('lab') || sName.includes('practical') || sName.includes('(p)') || sName.includes('pr');

    if (isPractical !== isSubPractical) return false;

    if (sName === rawNorm) return true;
    if (rawNorm.length >= 6 && (sName.includes(rawNorm) || rawNorm.includes(sName))) return true;

    const words = sName.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => {
      const lw = w.toLowerCase();
      return lw.length > 0 && !['and', 'a', 'an', 'or', 'of', 'the', 'in', 'for', 'to', 'with', '&', 'at', 'on', 'by', 'from', 'ii', 'iii', 'iv', 'lab', 'practical', 'pr', 'p'].includes(lw);
    });
    const acronym = words.map(w => w[0]).join('').toLowerCase();
    const allWordsAcronym = sName.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0).map(w => w[0]).join('').toLowerCase();

    if (cleanNorm.length >= 2 && cleanNorm.length <= 6) {
      return acronym === cleanNorm || allWordsAcronym === cleanNorm || sName.toLowerCase().includes(`(${cleanNorm})`);
    }

    return false;
  });

  return matched ? matched.name : name;
}

export function generateDateWiseBunkPlanner(weeklySchedule, subjects = [], preferences = {}) {
  if (!weeklySchedule) return [];
  const target = preferences.subjectTarget || 75;

  const dateWiseMap = weeklySchedule.dateWiseSchedule || {};
  const dateKeys = Object.keys(dateWiseMap);

  if (dateKeys.length === 0 && weeklySchedule.days) {
    return [];
  }

  const planner = [];

  for (const dateStr of dateKeys) {
    const classes = dateWiseMap[dateStr] || [];
    if (classes.length === 0) continue;

    const seen = new Set();
    const uniqueClasses = classes.filter(c => {
      const k = (c.startTime || '') + '_' + (c.subjectName || '').toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let totalClasses = 0;
    let safeCount = 0;
    let mustAttendCount = 0;
    const classDetails = [];

    for (const cls of uniqueClasses) {
      const rawName = cls.subjectName || '';
      if (!rawName || isSubjectBlacklisted(rawName)) continue;

      totalClasses++;
      const fullName = resolveFullSubject(rawName, subjects);
      const matched = subjects.find(s => s.name === fullName);

      if (!matched) {
        classDetails.push({
          subjectName: fullName,
          startTime: cls.startTime,
          type: 'OPTIONAL',
          label: 'LECTURE',
          color: '#02529c',
          safeBunks: 0
        });
        continue;
      }

      const isBelow = matched.percentage < target;
      const safe = Math.max(0, Math.floor((100 * matched.attended - target * matched.conducted) / target));
      const needed = Math.max(1, Math.ceil((target * matched.conducted - 100 * matched.attended) / (100 - target)));

      if (isBelow && matched.conducted > 0) {
        mustAttendCount++;
        classDetails.push({
          subjectName: fullName,
          startTime: cls.startTime,
          type: 'MUST_ATTEND',
          label: 'MUST ATTEND',
          color: '#dc2626',
          currentPct: matched.percentage,
          safeBunks: 0,
          needed
        });
      } else if (safe > 0) {
        safeCount++;
        classDetails.push({
          subjectName: fullName,
          startTime: cls.startTime,
          type: 'BUNK_SAFE',
          label: 'SAFE TO BUNK',
          color: '#16a34a',
          currentPct: matched.percentage,
          safeBunks: safe,
          needed: 0
        });
      } else {
        mustAttendCount++;
        classDetails.push({
          subjectName: fullName,
          startTime: cls.startTime,
          type: 'LOW_BUFFER',
          label: 'LOW BUFFER',
          color: '#d97706',
          currentPct: matched.percentage,
          safeBunks: 0,
          needed: 0
        });
      }
    }

    let verdict = 'COMPULSORY';
    let verdictText = 'Compulsory Attendance Day';
    let verdictColor = '#dc2626';

    if (totalClasses > 0 && safeCount === totalClasses) {
      verdict = 'FULL_DAY_SAFE';
      verdictText = 'Full Day Safe to Bunk';
      verdictColor = '#16a34a';
    } else if (safeCount > 0) {
      verdict = 'PARTIAL_SAFE';
      verdictText = `Partial Bunk (${safeCount} of ${totalClasses} Safe)`;
      verdictColor = '#d97706';
    }

    planner.push({
      dateStr,
      totalClasses,
      safeCount,
      mustAttendCount,
      verdict,
      verdictText,
      verdictColor,
      classes: classDetails
    });
  }

  return planner;
}
export function generateWeeklyBunkPlanner(weeklySchedule, subjects = [], preferences = {}, projections = []) {
  if (!weeklySchedule || !weeklySchedule.days) return null;

  const target = preferences.subjectTarget || 75;
  const daysPlan = {};
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const day of dayOrder) {
    const classes = weeklySchedule.days[day] || [];
    if (classes.length === 0) continue;

    const classRecommendations = [];
    let totalClasses = 0;
    let safeBunkCount = 0;
    let mustAttendCount = 0;

    const seenSlots = new Set();
    const uniqueClasses = classes.filter(c => {
      const key = (c.startTime || '') + '_' + (c.subjectName || '').toLowerCase().trim();
      if (seenSlots.has(key)) return false;
      seenSlots.add(key);
      return true;
    });

    for (const cls of uniqueClasses) {
      const name = cls.subjectName || '';
      if (!name || isSubjectBlacklisted(name)) continue;

      totalClasses++;
      const fullName = resolveFullSubject(name, subjects);
      const matched = subjects.find(s => s.name === fullName);

      if (!matched) {
        classRecommendations.push({
          subjectName: fullName,
          startTime: cls.startTime,
          endTime: cls.endTime,
          type: 'OPTIONAL',
          label: 'LECTURE',
          color: '#02529c',
          safeBunks: 0,
          needed: 0,
        });
        continue;
      }

      const isBelow = matched.percentage < target;
      const safe = Math.max(0, Math.floor((100 * matched.attended - target * matched.conducted) / target));
      const needed = Math.max(1, Math.ceil((target * matched.conducted - 100 * matched.attended) / (100 - target)));

      if (isBelow && matched.conducted > 0) {
        mustAttendCount++;
        classRecommendations.push({
          subjectName: matched.name || name,
          code: matched.code || name,
          startTime: cls.startTime,
          endTime: cls.endTime,
          type: 'MUST_ATTEND',
          label: 'MUST ATTEND',
          color: '#dc2626',
          currentPct: matched.percentage,
          safeBunks: 0,
          needed,
        });
      } else if (safe > 0) {
        safeBunkCount++;
        classRecommendations.push({
          subjectName: matched.name || name,
          code: matched.code || name,
          startTime: cls.startTime,
          endTime: cls.endTime,
          type: 'BUNK_SAFE',
          label: 'SAFE TO BUNK',
          color: '#16a34a',
          currentPct: matched.percentage,
          safeBunks: safe,
          needed: 0,
        });
      } else {
        mustAttendCount++;
        classRecommendations.push({
          subjectName: matched.name || name,
          code: matched.code || name,
          startTime: cls.startTime,
          endTime: cls.endTime,
          type: 'ATTEND_LOW_BUFFER',
          label: 'LOW BUFFER',
          color: '#d97706',
          currentPct: matched.percentage,
          safeBunks: 0,
          needed: 0,
        });
      }
    }

    let dayVerdict = 'COMPULSORY';
    let verdictText = 'Classes compulsory to attend';
    let verdictColor = '#dc2626';

    if (totalClasses > 0 && safeBunkCount === totalClasses) {
      dayVerdict = 'BUNK_DAY_SAFE';
      verdictText = '100% Safe to Bunk Full Day';
      verdictColor = '#16a34a';
    } else if (safeBunkCount > 0) {
      dayVerdict = 'PARTIAL_SAFE';
      verdictText = `${safeBunkCount} of ${totalClasses} Classes Safe to Bunk`;
      verdictColor = '#d97706';
    }

    daysPlan[day] = {
      day,
      totalClasses,
      safeBunkCount,
      mustAttendCount,
      verdict: dayVerdict,
      verdictText,
      verdictColor,
      classes: classRecommendations,
    };
  }

  return daysPlan;
}
