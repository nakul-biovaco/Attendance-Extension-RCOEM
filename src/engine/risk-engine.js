import { calculatePercentage, maxSafeBunks, classesNeededToReach } from './attendance-calculator.js';
import { RiskLevel } from '../types/models.js';

export function assessSubjectRisk(subject, targetPct, bufferPct, remainingClasses) {
  const safeTarget = targetPct + bufferPct;
  const current = subject.percentage;

  if (current < targetPct) {
    const needed = classesNeededToReach(subject.attended, subject.conducted, targetPct);
    if (needed > remainingClasses || needed === -1) {
      return {
        level: RiskLevel.HIGH,
        reason: `Below ${targetPct}% target and cannot recover even with perfect attendance.`,
        urgency: 10,
      };
    }
    return {
      level: RiskLevel.HIGH,
      reason: `Below ${targetPct}% target. Need to attend ${needed} more classes without bunking.`,
      urgency: 8,
    };
  }

  if (current < safeTarget) {
    const safeBunks = maxSafeBunks(subject.attended, subject.conducted, remainingClasses, targetPct);
    return {
      level: RiskLevel.MEDIUM,
      reason: `At ${current.toFixed(1)}%, above ${targetPct}% target but below ${safeTarget}% safe zone. ${safeBunks} safe bunks remaining.`,
      urgency: 5,
    };
  }

  const safeBunks = maxSafeBunks(subject.attended, subject.conducted, remainingClasses, safeTarget);

  if (safeBunks <= 0) {
    return {
      level: RiskLevel.MEDIUM,
      reason: `At ${current.toFixed(1)}% but no safe bunks remaining for the semester.`,
      urgency: 4,
    };
  }

  if (safeBunks <= 3) {
    return {
      level: RiskLevel.LOW,
      reason: `At ${current.toFixed(1)}% with only ${safeBunks} safe bunks remaining.`,
      urgency: 2,
    };
  }

  return {
    level: RiskLevel.SAFE,
    reason: `At ${current.toFixed(1)}% with ${safeBunks} safe bunks remaining. Well above target.`,
    urgency: 0,
  };
}

export function findHighestRisk(subjects, targetPct, bufferPct, defaultRemaining = 20) {
  const active = subjects.filter(s => s.conducted > 0);
  if (active.length === 0) return null;

  let highest = null;
  let maxUrgency = -1;

  for (const subject of active) {
    const risk = assessSubjectRisk(subject, targetPct, bufferPct, defaultRemaining);
    if (risk.urgency > maxUrgency) {
      maxUrgency = risk.urgency;
      highest = { subject, risk };
    }
  }

  return highest;
}

export function riskSummary(subjects, targetPct, bufferPct, defaultRemaining = 20) {
  const active = subjects.filter(s => s.conducted > 0);
  const summary = { high: 0, medium: 0, low: 0, safe: 0, subjects: [] };

  for (const subject of active) {
    const risk = assessSubjectRisk(subject, targetPct, bufferPct, defaultRemaining);
    summary[risk.level.toLowerCase()]++;
    summary.subjects.push({ name: subject.name, ...risk });
  }

  return summary;
}
