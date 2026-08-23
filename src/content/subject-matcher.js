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

import { normalizeSubjectName, normalizeCourseCode, tokenSimilarity, isSubstringMatch } from '../utils/normalizer.js';
import { MatchMethod } from '../types/models.js';

export function matchSubjects(scheduleClasses, subjects, aliasMap = {}, matchCache = {}) {
  const results = [];
  const usedSubjects = new Set();

  for (const cls of scheduleClasses) {
    const match = findBestMatch(cls, subjects, aliasMap, matchCache, usedSubjects);
    results.push(match);

    if (match.attendanceSubject) {
      usedSubjects.add(match.attendanceSubject.id);
    }
  }

  return results;
}

function findBestMatch(cls, subjects, aliasMap, matchCache, usedSubjects) {
  const available = subjects.filter(s => !usedSubjects.has(s.id));

  // 0. Faculty + Short-Name Unique Lock (1 Subject -> 1 Faculty, Faculty can teach multiple subjects)
  if (cls.facultyName && cls.facultyName !== '-' && cls.facultyName.length >= 3) {
    const facultyNorm = cls.facultyName.toLowerCase().trim();
    const rawShort = (cls.subjectName || '').trim();
    const cleanShort = rawShort.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    for (const subject of available) {
      const subFaculty = (subject.facultyName || '').toLowerCase().trim();
      const hasFacultyMatch = subFaculty && (subFaculty === facultyNorm || subFaculty.includes(facultyNorm) || facultyNorm.includes(subFaculty));
      
      if (hasFacultyMatch) {
        const sName = subject.name || '';
        const words = sName.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => {
          const lw = w.toLowerCase();
          return lw.length > 0 && !['and', 'a', 'an', 'or', 'of', 'the', 'in', 'for', 'to', 'with', '&', 'at', 'on', 'by', 'from', 'ii', 'iii', 'iv', 'lab', 'practical', 'pr', 'p'].includes(lw);
        });
        const acronym = words.map(w => w[0]).join('').toUpperCase();
        const allWordsAcronym = sName.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase();

        if (acronym === cleanShort || allWordsAcronym === cleanShort || sName.toUpperCase().includes(cleanShort)) {
          cls.matchConfidence = 0.99;
          cls.subjectId = subject.id;
          return {
            scheduleClass: cls,
            attendanceSubject: subject,
            confidence: 0.99,
            method: MatchMethod.NAME_FUZZY,
            reason: `Faculty + Acronym lock: "${cls.facultyName}" + "${rawShort}" → "${subject.name}"`,
          };
        }
      }
    }
  }

  // 1. Confirmed Match Cache
  const cacheKey = cls.normalizedName || normalizeSubjectName(cls.subjectName);
  if (matchCache[cacheKey]) {
    const cached = available.find(s => s.id === matchCache[cacheKey]);
    if (cached) {
      cls.matchConfidence = 0.95;
      cls.subjectId = cached.id;
      return {
        scheduleClass: cls,
        attendanceSubject: cached,
        confidence: 0.95,
        method: MatchMethod.PORTAL_ID,
        reason: `Confirmed match`,
      };
    }
  }

  // 2. User Alias Map
  const aliasKey = (cls.subjectName || '').toLowerCase().trim();
  if (aliasMap[aliasKey]) {
    const aliasTarget = aliasMap[aliasKey].toLowerCase().trim();
    for (const subject of available) {
      if (normalizeSubjectName(subject.name) === aliasTarget) {
        cls.matchConfidence = 0.85;
        cls.subjectId = subject.id;
        return {
          scheduleClass: cls,
          attendanceSubject: subject,
          confidence: 0.85,
          method: MatchMethod.USER_ALIAS,
          reason: `User-defined alias: "${cls.subjectName}" → "${subject.name}"`,
        };
      }
    }
  }

  // 3. Exact Subject Name Match
  const normalizedClassName = normalizeSubjectName(cls.subjectName);
  for (const subject of available) {
    if (normalizeSubjectName(subject.name) === normalizedClassName) {
      cls.matchConfidence = 0.90;
      cls.subjectId = subject.id;
      return {
        scheduleClass: cls,
        attendanceSubject: subject,
        confidence: 0.90,
        method: MatchMethod.NAME_EXACT,
        reason: `Exact name match: "${cls.subjectName}"`,
      };
    }
  }

  // 4. Short Name to Full Name Acronym Matching (ONLY Short-Name → Full-Name)
  const rawShort = (cls.subjectName || '').trim();
  const cleanShort = rawShort.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const isPracticalClass = rawShort.toLowerCase().includes('(p)') || rawShort.toLowerCase().includes('lab') || rawShort.toLowerCase().includes('practical');

  if (cleanShort.length >= 2 && cleanShort.length <= 8) {
    for (const subject of available) {
      const sName = subject.name || '';
      const isSubPractical = sName.toLowerCase().includes('lab') || sName.toLowerCase().includes('practical') || sName.toLowerCase().includes('(p)') || sName.toLowerCase().includes('pr');
      
      if (isPracticalClass !== isSubPractical) continue;

      let facultyBoost = 0;
      if (cls.facultyName && subject.facultyName) {
        const rfNorm = cls.facultyName.toLowerCase().trim();
        const sfNorm = subject.facultyName.toLowerCase().trim();
        const rfLast = rfNorm.split(/\s+/).pop();
        const sfLast = sfNorm.split(/\s+/).pop();
        if (sfNorm.includes(rfLast) || rfNorm.includes(sfLast) || sfNorm.includes(rfNorm) || rfNorm.includes(sfNorm)) {
          facultyBoost = 0.04;
        }
      }

      const words = sName.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => {
        const lw = w.toLowerCase();
        return lw.length > 0 && !['and', 'a', 'an', 'or', 'of', 'the', 'in', 'for', 'to', 'with', '&', 'at', 'on', 'by', 'from', 'ii', 'iii', 'iv', 'lab', 'practical', 'pr', 'p'].includes(lw);
      });
      const acronym = words.map(w => w[0]).join('').toUpperCase();
      const allWordsAcronym = sName.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase();

      const hasParenthesizedCode = sName.toUpperCase().includes(`(${cleanShort})`) || sName.toUpperCase().includes(`[${cleanShort}]`);

      if (hasParenthesizedCode || acronym === cleanShort || allWordsAcronym === cleanShort) {
        cls.matchConfidence = 0.94;
        cls.subjectId = subject.id;
        return {
          scheduleClass: cls,
          attendanceSubject: subject,
          confidence: 0.94,
          method: MatchMethod.NAME_FUZZY,
          reason: `Acronym match: "${rawShort}" → "${subject.name}"`,
        };
      }
    }
  }

  for (const subject of available) {
    if (isSubstringMatch(normalizedClassName, subject.normalizedName)) {
      const shorter = Math.min(normalizedClassName.length, subject.normalizedName.length);
      const longer = Math.max(normalizedClassName.length, subject.normalizedName.length);
      const ratio = shorter / longer;
      const confidence = 0.70 + (ratio * 0.15);

      if (confidence >= 0.70) {
        cls.matchConfidence = confidence;
        cls.subjectId = subject.id;
        return {
          scheduleClass: cls,
          attendanceSubject: subject,
          confidence,
          method: MatchMethod.NAME_FUZZY,
          reason: `Substring match: "${cls.subjectName}" ↔ "${subject.name}"`,
        };
      }
    }
  }

  let bestSimilarity = 0;
  let bestMatch = null;

  for (const subject of available) {
    const similarity = tokenSimilarity(cls.subjectName, subject.name);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = subject;
    }
  }

  if (bestMatch && bestSimilarity >= 0.5) {
    const confidence = 0.50 + (bestSimilarity * 0.35);
    cls.matchConfidence = confidence;
    cls.subjectId = bestMatch.id;
    return {
      scheduleClass: cls,
      attendanceSubject: bestMatch,
      confidence,
      method: MatchMethod.NAME_FUZZY,
      reason: `Token similarity: ${(bestSimilarity * 100).toFixed(0)}% match with "${bestMatch.name}"`,
    };
  }

  cls.matchConfidence = 0;
  return {
    scheduleClass: cls,
    attendanceSubject: null,
    confidence: 0,
    method: MatchMethod.UNMATCHED,
    reason: `No matching attendance subject found for "${cls.subjectName}"`,
  };
}

export function getUnmatchedClasses(results) {
  return results.filter(r => r.confidence < 0.70);
}

export function matchStats(results) {
  const matched = results.filter(r => r.confidence >= 0.70);
  const avgConfidence = results.length > 0
    ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    : 0;

  return {
    total: results.length,
    matched: matched.length,
    unmatched: results.length - matched.length,
    avgConfidence,
  };
}
