// (c) 2026 Nakul Mundhada. All rights reserved.


export function computeBadges(subjects, overallPct, streakDays = 0, targetPct = 75) {
  const activeSubjects = subjects.filter(s => s.conducted > 0);
  const totalSubjects = activeSubjects.length;

  const allAboveTarget = totalSubjects > 0 && activeSubjects.every(s => s.percentage >= targetPct);
  const allAbove60 = totalSubjects > 0 && activeSubjects.every(s => s.percentage >= 60);
  const anyBelow60 = activeSubjects.some(s => s.percentage < 60);
  const anyPerfect = activeSubjects.some(s => s.percentage >= 100);
  const bestSubject = activeSubjects.reduce((best, s) => (!best || s.percentage > best.percentage) ? s : best, null);
  const worstSubject = activeSubjects.reduce((worst, s) => (!worst || s.percentage < worst.percentage) ? s : worst, null);
  const recoverySubjects = activeSubjects.filter(s => s.percentage < 60);
  const safeSubjects = activeSubjects.filter(s => s.percentage >= targetPct);

  const badges = [
    {
      id: 'warrior_75',
      name: 'Target Achieved (>=75%)',
      description: `Overall attendance above ${targetPct}%`,
      color: '#02529c',
      bgColor: '#d8ebf9',
      earned: overallPct >= targetPct,
    },
    {
      id: 'perfect_attender',
      name: '100% Subject Attendance',
      description: '100% in at least one subject',
      color: '#16a34a',
      bgColor: '#f0fdf4',
      earned: anyPerfect,
    },
    {
      id: 'safe_zone',
      name: 'All Subjects Cleared',
      description: `All subjects above ${targetPct}% target`,
      color: '#16a34a',
      bgColor: '#f0fdf4',
      earned: allAboveTarget,
    },
    {
      id: 'survivor',
      name: 'All Above 60% Minimum',
      description: 'All subjects above 60% threshold',
      color: '#02529c',
      bgColor: '#eaf3fa',
      earned: allAbove60,
    },
    {
      id: 'streak_3',
      name: '3-Day Attendance Streak',
      description: 'Attended 3 consecutive scheduled days',
      color: '#2563eb',
      bgColor: '#eff6ff',
      earned: streakDays >= 3,
    },
    {
      id: 'streak_7',
      name: '7-Day Attendance Streak',
      description: 'Attended 7 consecutive scheduled days',
      color: '#2563eb',
      bgColor: '#eff6ff',
      earned: streakDays >= 7,
    },
    {
      id: 'streak_14',
      name: '14-Day Consistent Streak',
      description: 'Attended 14 consecutive scheduled days',
      color: '#02529c',
      bgColor: '#d8ebf9',
      earned: streakDays >= 14,
    },
    {
      id: 'recovery_hero',
      name: 'Subject Recovered',
      description: 'Recovered a subject from below 60% threshold',
      color: '#16a34a',
      bgColor: '#f0fdf4',
      earned: false,
    },
    {
      id: 'half_safe',
      name: 'Majority Cleared',
      description: `Majority of subjects above ${targetPct}%`,
      color: '#02529c',
      bgColor: '#eaf3fa',
      earned: totalSubjects > 0 && safeSubjects.length >= Math.ceil(totalSubjects / 2),
    },
    {
      id: 'danger_zone',
      name: 'Action Required (<60%)',
      description: 'One or more subjects below 60% minimum',
      color: '#dc2626',
      bgColor: '#fef2f2',
      earned: anyBelow60,
    },
  ];

  return badges;
}

export function getBadgeSummary(badges) {
  const earned = badges.filter(b => b.earned);
  return {
    earned: earned.length,
    total: badges.length,
    badges: earned,
  };
}
