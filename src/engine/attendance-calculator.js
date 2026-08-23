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

export function calculatePercentage(attended, conducted) {
  if (conducted <= 0) return 0;
  return (attended / conducted) * 100;
}

export function formatPercentage(pct) {
  if (typeof pct !== 'number' || isNaN(pct)) return '—';
  return pct.toFixed(2);
}

export function calculateOverall(subjects) {

  const active = subjects.filter(s => s.conducted > 0);

  const totalAttended = active.reduce((sum, s) => sum + s.attended, 0);
  const totalConducted = active.reduce((sum, s) => sum + s.conducted, 0);

  return {
    attended: totalAttended,
    conducted: totalConducted,
    percentage: calculatePercentage(totalAttended, totalConducted),
  };
}

export function whatIfAttend(attended, conducted) {
  return calculatePercentage(attended + 1, conducted + 1);
}

export function whatIfBunk(attended, conducted) {
  return calculatePercentage(attended, conducted + 1);
}

export function classesNeededToReach(attended, conducted, targetPct) {
  const current = calculatePercentage(attended, conducted);

  if (current >= targetPct) return 0;
  if (targetPct >= 100) return -1;

  const needed = Math.ceil(
    (targetPct * conducted - 100 * attended) / (100 - targetPct)
  );

  return Math.max(0, needed);
}

export function maxSafeBunks(attended, conducted, remainingClasses, targetPct) {
  if (remainingClasses <= 0) return 0;

  const bestCase = calculatePercentage(attended + remainingClasses, conducted + remainingClasses);
  if (bestCase < targetPct) return -1;

  let lo = 0;
  let hi = remainingClasses;
  let result = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const futureAttended = attended + (remainingClasses - mid);
    const futureConducted = conducted + remainingClasses;
    const futurePct = calculatePercentage(futureAttended, futureConducted);

    if (futurePct >= targetPct) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

export function currentSafeBunks(attended, conducted, targetPct) {
  if (conducted <= 0) return 0;
  const current = calculatePercentage(attended, conducted);
  if (current < targetPct) return 0;
  const maxBunks = Math.floor((100 * attended - targetPct * conducted) / targetPct);
  return Math.max(0, maxBunks);
}

export function projectFinalAttendance(attended, conducted, futureAttend, futureTotal) {
  return calculatePercentage(
    attended + futureAttend,
    conducted + futureTotal
  );
}

export function overallImpact(subjects, subjectId) {
  const current = calculateOverall(subjects);

  const subject = subjects.find(s => s.id === subjectId);
  if (!subject) return {
    overallCurrent: current.percentage,
    overallIfAttend: current.percentage,
    overallIfBunk: current.percentage,
  };

  return {
    overallCurrent: current.percentage,
    overallIfAttend: calculatePercentage(
      current.attended + 1,
      current.conducted + 1
    ),
    overallIfBunk: calculatePercentage(
      current.attended,
      current.conducted + 1
    ),
  };
}

export function validatePercentage(attended, conducted, displayedPct) {
  const calculated = calculatePercentage(attended, conducted);
  const diff = Math.abs(calculated - displayedPct);
  return {
    matches: diff < 0.5,
    calculated,
    displayed: displayedPct,
    diff,
  };
}
