import { calculatePercentage, maxSafeBunks, currentSafeBunks, classesNeededToReach, projectFinalAttendance } from './attendance-calculator.js';
import { weeksRemaining, countSpecificDays } from '../utils/date-utils.js';

const DAY_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function estimateRemainingClasses(subjectName, weeklySchedule, semesterEndDate, holidays = []) {
  if (!semesterEndDate) {
    return { remaining: 0, confidence: 0, source: 'no_end_date' };
  }

  const now = new Date();
  const end = new Date(semesterEndDate);
  if (end <= now) {
    return { remaining: 0, confidence: 1, source: 'semester_ended' };
  }

  const holidayDateSet = new Set((holidays || []).map(h => h.date));

  if (weeklySchedule && weeklySchedule.days) {
    let totalOccurrences = 0;
    const normalizedTarget = subjectName.toLowerCase().trim();

    for (const [dayName, classes] of Object.entries(weeklySchedule.days)) {
      const dayIdx = DAY_MAP[dayName.toLowerCase()];
      if (dayIdx === undefined) continue;

      let classesOnThisDay = 0;
      for (const cls of classes) {
        const normalizedClass = (cls.normalizedName || cls.subjectName || '').toLowerCase().trim();
        if (normalizedClass === normalizedTarget || normalizedClass.includes(normalizedTarget) || normalizedTarget.includes(normalizedClass)) {
          classesOnThisDay++;
        }
      }

      if (classesOnThisDay > 0) {

        const occurrencesOfDay = countSpecificDays(now, end, [dayIdx], holidayDateSet);
        totalOccurrences += occurrencesOfDay * classesOnThisDay;
      }
    }

    if (totalOccurrences > 0) {
      return {
        remaining: totalOccurrences,
        confidence: weeklySchedule.confidence || 0.85,
        source: holidays && holidays.length > 0 ? 'schedule_with_holidays' : 'schedule',
      };
    }
  }

  const weeks = weeksRemaining(semesterEndDate);
  return {
    remaining: Math.max(0, Math.round(weeks * 2)),
    confidence: 0.3,
    source: 'estimated',
  };
}

export function projectSubject(subject, weeklySchedule, semesterEndDate, targetPct, bufferPct, holidays = []) {
  const { remaining, confidence, source } = estimateRemainingClasses(
    subject.normalizedName || subject.name,
    weeklySchedule,
    semesterEndDate,
    holidays
  );

  const safeTarget = targetPct + bufferPct;
  const safeBunks = maxSafeBunks(subject.attended, subject.conducted, remaining, safeTarget);
  const immediateSafeBunks = currentSafeBunks(subject.attended, subject.conducted, targetPct);
  const minRequired = classesNeededToReach(subject.attended, subject.conducted, targetPct);

  const bestCase = projectFinalAttendance(subject.attended, subject.conducted, remaining, remaining);

  const minAttend = Math.max(0, remaining - Math.max(0, safeBunks));
  const projected = projectFinalAttendance(subject.attended, subject.conducted, minAttend, remaining);

  let riskLevel;
  if (subject.percentage < targetPct && minRequired > remaining) {
    riskLevel = 'HIGH';
  } else if (subject.percentage < targetPct) {
    riskLevel = 'HIGH';
  } else if (subject.percentage < safeTarget) {
    riskLevel = 'MEDIUM';
  } else if (safeBunks <= 2) {
    riskLevel = 'MEDIUM';
  } else if (safeBunks <= 5) {
    riskLevel = 'LOW';
  } else {
    riskLevel = 'SAFE';
  }

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    currentPercentage: subject.percentage,
    remainingClasses: remaining,
    remainingConfidence: confidence,
    remainingSource: source,
    minimumRequired: Math.max(0, minRequired),
    maximumSafeBunks: Math.max(0, safeBunks),
    immediateSafeBunks: Math.max(0, immediateSafeBunks),
    projectedFinal: projected,
    bestCaseFinal: bestCase,
    riskLevel,
    targetPct,
    safeTarget,
  };
}

export function projectAllSubjects(subjects, weeklySchedule, semesterEndDate, targetPct, bufferPct, holidays = []) {
  return (subjects || [])
    .map(s => projectSubject(s, weeklySchedule, semesterEndDate, targetPct, bufferPct, holidays));
}

export function whatIfSemesterProjection(subject, remainingClasses, safeBunks) {
  if (remainingClasses <= 0) {
    return {
      attendProjection: subject.percentage,
      bunkProjection: subject.percentage,
    };
  }

  const remainAfterThis = remainingClasses - 1;
  const attendFuture = Math.max(0, remainAfterThis - Math.max(0, safeBunks));
  const attendProjection = projectFinalAttendance(
    subject.attended + 1,
    subject.conducted + 1,
    attendFuture,
    remainAfterThis
  );

  const bunkSafe = Math.max(0, safeBunks - 1);
  const bunkFuture = Math.max(0, remainAfterThis - bunkSafe);
  const bunkProjection = projectFinalAttendance(
    subject.attended,
    subject.conducted + 1,
    bunkFuture,
    remainAfterThis
  );

  return { attendProjection, bunkProjection };
}
