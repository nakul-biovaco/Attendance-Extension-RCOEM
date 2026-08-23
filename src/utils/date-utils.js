export function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

export function getTodayDayName() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

export function getTodayDayIndex() {
  return new Date().getDay();
}

export function nowISO() {
  return new Date().toISOString();
}

export function getDynamicSemesterEndDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 6) {
    return `${year}-11-30`;
  }
  return `${year}-05-15`;
}

export function weekdaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const current = new Date(start);

  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function weeksRemaining(endDate) {
  const now = new Date();
  const end = new Date(endDate);
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

export function countSpecificDays(startDate, endDate, dayIndices, holidayDates = null) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const current = new Date(start);
  const daySet = new Set(dayIndices);
  const holidaySet = holidayDates ? (holidayDates instanceof Set ? holidayDates : new Set(holidayDates)) : null;

  while (current <= end) {
    if (daySet.has(current.getDay())) {
      const dateStr = current.toISOString().split('T')[0];
      if (!holidaySet || !holidaySet.has(dateStr)) {
        count++;
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function checkHoliday(date, holidays = []) {
  if (!date || !holidays || holidays.length === 0) return null;
  const dateStr = typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
  const found = holidays.find(h => h.date === dateStr);
  if (found) {
    return { isHoliday: true, name: found.name || 'Holiday' };
  }
  return null;
}

export function relativeTime(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;

  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isOlderThan(timestamp, hours) {
  if (!timestamp) return true;
  const then = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return diffMs > hours * 60 * 60 * 1000;
}

export function parsePortalDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  let match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }

  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  match = cleaned.match(/^(\d{1,2})[\/\-](\w{3})[\/\-](\d{4})$/i);
  if (match && months[match[2].toLowerCase()]) {
    return `${match[3]}-${months[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
  }

  match = cleaned.match(/^(\w{3,})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (match) {
    const monthKey = match[1].substring(0, 3).toLowerCase();
    if (months[monthKey]) {
      return `${match[3]}-${months[monthKey]}-${match[2].padStart(2, '0')}`;
    }
  }

  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

export function getDayName(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}
