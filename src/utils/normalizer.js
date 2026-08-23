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

export function normalizeSubjectName(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s&-]/g, '')
    .trim();
}

export function normalizeCourseCode(code) {
  if (!code) return '';
  return code
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

export function decodeHTMLEntities(html) {
  if (!html) return '';
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&ndash;': '–',
    '&mdash;': '—', '&lsquo;': '\u2018', '&rsquo;': '\u2019',
    '&ldquo;': '\u201C', '&rdquo;': '\u201D', '&hellip;': '…',
  };
  let result = html;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));

  result = result.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return result;
}

export function cleanDOMText(text) {
  if (!text) return '';
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(name) {
  if (!name) return [];
  const stopWords = new Set([
    'of', 'and', 'the', 'in', 'to', 'for', 'a', 'an', 'with',
    'its', 'lab', 'laboratory', 'practical', 'theory',
  ]);
  return name
    .toLowerCase()
    .split(/[\s\-_&]+/)
    .filter(t => t.length > 1 && !stopWords.has(t));
}

export function tokenSimilarity(a, b) {
  const tokensA = new Set(tokenize(normalizeSubjectName(a)));
  const tokensB = new Set(tokenize(normalizeSubjectName(b)));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function isSubstringMatch(shorter, longer) {
  const a = normalizeSubjectName(shorter);
  const b = normalizeSubjectName(longer);
  if (!a || !b) return false;
  if (Math.min(a.length, b.length) < 6) return false;
  return b.includes(a) || a.includes(b);
}

export function generateId(input) {
  let hash = 0;
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'ai_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
}

export function deterministicId(input) {
  let hash = 0;
  const str = normalizeSubjectName(String(input));
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'det_' + Math.abs(hash).toString(36);
}

export function parseAttendanceFraction(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return {
    attended: parseInt(match[1], 10),
    conducted: parseInt(match[2], 10),
  };
}

export function parseTime(time) {
  if (!time) return null;
  const cleaned = time.trim().toUpperCase();

  let match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const mins = match[2];
    const period = match[3];
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return String(hours).padStart(2, '0') + ':' + mins;
  }

  match = cleaned.match(/^(\d{2})(\d{2})$/);
  if (match) {
    return match[1] + ':' + match[2];
  }

  match = cleaned.match(/^(\d{1,2})\.(\d{2})$/);
  if (match) {
    return String(match[1]).padStart(2, '0') + ':' + match[2];
  }

  return null;
}
