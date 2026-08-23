import { calculatePercentage, maxSafeBunks, calculateOverall } from './attendance-calculator.js';

export function optimizeTodayBunks(todayClasses, allSubjects, subjectTarget, overallTarget, buffer, preferredBunkDays) {
  const results = new Map();
  const todayDayIndex = new Date().getDay();
  const isPreferredBunkDay = Array.isArray(preferredBunkDays) ? preferredBunkDays.includes(todayDayIndex) : false;

  const overall = calculateOverall(allSubjects);
  const safeSubjectTarget = subjectTarget + buffer;
  const safeOverallTarget = overallTarget + buffer;

  let cumulativeOverallAttended = overall.attended;
  let cumulativeOverallConducted = overall.conducted;

  const evaluations = [];

  for (const { classInstance, subject } of todayClasses) {
    if (!subject) {
      results.set(classInstance.id, {
        canBunk: false,
        reason: 'Cannot determine attendance data for this class.',
        priority: -1,
      });
      continue;
    }

    const currentPct = subject.percentage;
    const ifBunkPct = calculatePercentage(subject.attended, subject.conducted + 1);
    const ifAttendPct = calculatePercentage(subject.attended + 1, subject.conducted + 1);

    const subjectSafeAfterBunk = ifBunkPct >= safeSubjectTarget;
    const subjectValidAfterBunk = ifBunkPct >= subjectTarget;

    const overallAfterBunk = calculatePercentage(
      cumulativeOverallAttended,
      cumulativeOverallConducted + 1
    );
    const overallSafe = overallAfterBunk >= safeOverallTarget;
    const overallValid = overallAfterBunk >= overallTarget;

    evaluations.push({
      classInstance,
      subject,
      currentPct,
      ifBunkPct,
      ifAttendPct,
      subjectSafeAfterBunk,
      subjectValidAfterBunk,
      overallSafe,
      overallValid,
      margin: ifBunkPct - subjectTarget,
    });
  }

  evaluations.sort((a, b) => b.margin - a.margin);

  let runningOverallAttended = overall.attended;
  let runningOverallConducted = overall.conducted;

  const subjectClassCount = new Map();
  for (const ev of evaluations) {
    const key = ev.subject.id;
    subjectClassCount.set(key, (subjectClassCount.get(key) || 0) + 1);
  }

  const bunksBySubject = new Map();

  for (const ev of evaluations) {
    const subjectKey = ev.subject.id;
    const bunksSoFar = bunksBySubject.get(subjectKey) || 0;

    const simAttended = ev.subject.attended;
    const simConducted = ev.subject.conducted + bunksSoFar + 1;
    const simPct = calculatePercentage(simAttended, simConducted);

    const simOverallPct = calculatePercentage(
      runningOverallAttended,
      runningOverallConducted + 1
    );

    const subjectOk = simPct >= subjectTarget;
    const overallOk = simOverallPct >= overallTarget;

    if (subjectOk && overallOk) {

      const withinBuffer = simPct >= safeSubjectTarget && simOverallPct >= safeOverallTarget;

      let priority = 0;
      let reason = '';

      if (withinBuffer) {
        priority = isPreferredBunkDay ? 3 : 2;
        reason = `Safe to bunk. After bunking: ${simPct.toFixed(1)}% (target: ${subjectTarget}%).`;
        if (isPreferredBunkDay) reason += ' Preferred bunk day.';
      } else {
        priority = 1;
        reason = `Can bunk but low buffer. After bunking: ${simPct.toFixed(1)}% (safe target: ${safeSubjectTarget}%).`;
      }

      results.set(ev.classInstance.id, { canBunk: true, reason, priority });
      bunksBySubject.set(subjectKey, bunksSoFar + 1);

      runningOverallConducted++;
    } else {
      let reason = '';
      if (!subjectOk) {
        reason = `Must attend. Bunking would drop to ${simPct.toFixed(1)}%, below ${subjectTarget}% target.`;
      } else {
        reason = `Must attend. Overall would drop to ${simOverallPct.toFixed(1)}%, below ${overallTarget}% target.`;
      }

      results.set(ev.classInstance.id, { canBunk: false, reason, priority: 0 });
      runningOverallAttended++;
      runningOverallConducted++;
    }
  }

  return results;
}

export function calculateSemesterBunkBudget(subjects, subjectTarget, overallTarget, buffer, remainingClassesPerSubject) {
  const active = subjects.filter(s => s.conducted > 0);
  const safeTarget = subjectTarget + buffer;

  const perSubject = new Map();
  let totalSafeBunks = 0;

  for (const subject of active) {
    const remaining = typeof remainingClassesPerSubject === 'number'
      ? remainingClassesPerSubject
      : (remainingClassesPerSubject?.get?.(subject.id) ?? 20);

    const safe = maxSafeBunks(subject.attended, subject.conducted, remaining, safeTarget);
    perSubject.set(subject.id, Math.max(0, safe));
    totalSafeBunks += Math.max(0, safe);
  }

  const overall = calculateOverall(active);
  const totalRemaining = active.length * (typeof remainingClassesPerSubject === 'number' ? remainingClassesPerSubject : 20);
  const overallSafe = maxSafeBunks(overall.attended, overall.conducted, totalRemaining, overallTarget + buffer);

  return {
    totalSafeBunks: Math.min(totalSafeBunks, Math.max(0, overallSafe)),
    perSubject,
  };
}
