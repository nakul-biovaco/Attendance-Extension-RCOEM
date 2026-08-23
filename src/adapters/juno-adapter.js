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

import { BasePortalAdapter } from './portal-adapter.js';
import { normalizeSubjectName, normalizeCourseCode, cleanDOMText, parseAttendanceFraction, parseTime, deterministicId } from '../utils/normalizer.js';
import { getTodayDate, getTodayDayName, parsePortalDate, nowISO } from '../utils/date-utils.js';

export class JunoAdapter extends BasePortalAdapter {
  constructor() {
    super();
  }

  detectPage() {
    const url = window.location.href.toLowerCase();
    const bodyText = document.body ? document.body.innerText : '';
    const lowerBody = bodyText.toLowerCase();

    if (url.includes('logout.htm') || url.includes('logout.aspx') || url.endsWith('/login.htm') || url.endsWith('/login.aspx')) {
      if (!lowerBody.includes('student') && !lowerBody.includes('course') && !document.querySelector('table')) {
        return 'auth';
      }
    }

    if (url.includes('studentcoursefilenew') || url.includes('coursefile') || url.includes('studentcoursefile') || url.includes('attendance') || url.includes('attnreport')) {
      return 'attendance';
    }
    if (url.includes('studentscheduleacademiccalender') || url.includes('academiccalender') || url.includes('academiccalendar') || url.includes('scheduleacademiccalender')) {
      return 'calendar';
    }
    if (url.includes('studenttimetable') || url.includes('stu_studenttimetable') || url.includes('timetable') || url.includes('time_table')) {
      return 'timetable';
    }
    if (url.includes('home.htm') || url.includes('studenthome') || url.includes('student_home') || url.includes('dashboard') || url.includes('/home')) {
      return 'student-home';
    }

    if (this._hasAttendanceMarkers(lowerBody)) {
      return 'attendance';
    }
    if (this._hasTimetableMarkers(lowerBody)) {
      return 'timetable';
    }
    if (this._hasScheduleMarkers(lowerBody)) {
      return 'student-home';
    }

    return 'unknown';
  }

  _hasScheduleMarkers(text) {
    const markers = ["today's schedule", "todays schedule", "today schedule", "daily schedule"];
    return markers.some(m => text.includes(m));
  }

  _hasAttendanceMarkers(text) {
    const hasAttendance = text.includes('attendance');
    const hasCourse = text.includes('course name') || text.includes('subject name') || text.includes('course code');
    const hasFraction = /\d+\s*\/\s*\d+/.test(text);
    return hasAttendance && (hasCourse || hasFraction);
  }

  _hasTimetableMarkers(text) {
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayCount = dayNames.filter(d => text.includes(d)).length;
    return dayCount >= 3 && (text.includes('time table') || text.includes('timetable') || text.includes('weekly schedule'));
  }

  isPortalReady() {
    return Boolean(document.body);
  }

  parseSchedule() {
    const classes = [];

    const scheduleContainer = this._findScheduleContainer();
    if (scheduleContainer) {
      const parsed = this._parseScheduleFromContainer(scheduleContainer);
      if (parsed.length > 0) return parsed;
    }

    const tableParsed = this._parseScheduleFromTable();
    if (tableParsed.length > 0) return tableParsed;

    const cardParsed = this._parseScheduleFromCards();
    if (cardParsed.length > 0) return cardParsed;

    return classes;
  }

  _findScheduleContainer() {

    const headings = this.findElementsByText("today's schedule");

    for (const heading of headings) {

      const container = this.findAncestor(heading, (el) => {

        return el.children.length > 1 ||
               el.classList.contains('card') ||
               el.classList.contains('panel') ||
               el.classList.contains('widget') ||
               el.classList.contains('section') ||
               el.tagName === 'SECTION' ||
               el.tagName === 'ARTICLE';
      }, 5);

      if (container) return container;

      if (heading.nextElementSibling) return heading.nextElementSibling;
      if (heading.parentElement) return heading.parentElement;
    }

    return null;
  }

  _parseScheduleFromContainer(container) {
    const classes = [];
    const today = getTodayDate();
    const dayName = getTodayDayName();

    const rows = container.querySelectorAll('tr, li, .schedule-item, .class-item, .row, [class*="schedule"], [class*="class"], [class*="period"]');

    if (rows.length === 0) {

      return this._parseScheduleFromText(container.innerText, today, dayName);
    }

    for (const row of rows) {
      const entry = this._extractClassFromElement(row, today, dayName);
      if (entry) classes.push(entry);
    }

    return classes;
  }

  _parseScheduleFromTable() {
    const today = getTodayDate();
    const dayName = getTodayDayName();
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const text = table.innerText.toLowerCase();
      if (text.includes('schedule') || text.includes('time') || text.includes('subject') || text.includes('period')) {
        const rows = table.querySelectorAll('tbody tr, tr');
        const classes = [];

        for (const row of rows) {
          const cells = row.querySelectorAll('td, th');
          if (cells.length < 2) continue;

          const entry = this._extractClassFromTableRow(cells, today, dayName);
          if (entry) classes.push(entry);
        }

        if (classes.length > 0) return classes;
      }
    }

    return [];
  }

  _parseScheduleFromCards() {
    const today = getTodayDate();
    const dayName = getTodayDayName();
    const classes = [];

    const cards = document.querySelectorAll('.card, .panel, [class*="schedule"], [class*="class-card"], [class*="slot"]');

    for (const card of cards) {
      const text = card.innerText || '';
      if (text.length < 5 || text.length > 500) continue;

      const entry = this._extractClassFromElement(card, today, dayName);
      if (entry) classes.push(entry);
    }

    return classes;
  }

  _extractClassFromElement(el, date, dayName) {
    const text = cleanDOMText(el.innerText || '');
    if (!text || text.length < 3) return null;

    if (text.toLowerCase().includes("today's schedule") && text.length < 30) return null;
    if (el.tagName === 'TH') return null;

    const timePattern = /(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)\s*(?:[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?))?/;
    const timeMatch = text.match(timePattern);

    let startTime = null;
    let endTime = null;

    if (timeMatch) {
      startTime = parseTime(timeMatch[1]);
      endTime = timeMatch[2] ? parseTime(timeMatch[2]) : null;
    }

    let subjectName = text;

    if (timeMatch) {
      subjectName = subjectName.replace(timeMatch[0], '').trim();
    }

    const codePattern = /\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/i;
    const codeMatch = subjectName.match(codePattern);
    let courseCode = null;
    if (codeMatch) {
      courseCode = normalizeCourseCode(codeMatch[1]);
      subjectName = subjectName.replace(codeMatch[0], '').trim();
    }

    subjectName = subjectName
      .replace(/^[-–—:\s]+/, '')
      .replace(/[-–—:\s]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!subjectName || subjectName.length < 2) return null;
    if (this._isSubjectBlacklisted(subjectName)) return null;
    if (/^\d+$/.test(subjectName)) return null;

    return {
      id: deterministicId(date + subjectName + (startTime || '')),
      subjectName,
      normalizedName: normalizeSubjectName(subjectName),
      courseCode,
      date,
      dayOfWeek: dayName,
      startTime,
      endTime,
      classType: this._detectClassType(text),
      location: this._extractLocation(text),
      faculty: this._extractFaculty(el),
      matchConfidence: 0,
      sync: {
        source: 'Juno Student Home',
        syncedAt: nowISO(),
        confidence: 1.0,
      },
    };
  }

  _extractClassFromTableRow(cells, date, dayName) {
    if (cells.length < 2) return null;

    const cellTexts = Array.from(cells).map(c => cleanDOMText(c.innerText));

    let subjectName = '';
    let startTime = null;
    let endTime = null;
    let courseCode = null;

    for (const cellText of cellTexts) {

      const timeMatch = cellText.match(/(\d{1,2}[:.]\d{2})\s*(?:[-–to]+\s*(\d{1,2}[:.]\d{2}))?/);
      if (timeMatch && !startTime) {
        startTime = parseTime(timeMatch[1]);
        endTime = timeMatch[2] ? parseTime(timeMatch[2]) : null;
        continue;
      }

      const codeMatch = cellText.match(/^([A-Z]{2,5}\d{3,5}[A-Z]?)$/i);
      if (codeMatch && !courseCode) {
        courseCode = normalizeCourseCode(codeMatch[1]);
        continue;
      }

      if (cellText.length > 2 && !subjectName) {
        subjectName = cellText;
      }
    }

    if (!subjectName) return null;

    const embeddedCode = subjectName.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/i);
    if (embeddedCode && !courseCode) {
      courseCode = normalizeCourseCode(embeddedCode[1]);
      subjectName = subjectName.replace(embeddedCode[0], '').trim();
    }

    if (!subjectName || subjectName.length < 2) return null;
    if (this._isSubjectBlacklisted(subjectName)) return null;

    return {
      id: deterministicId(date + subjectName + (startTime || '')),
      subjectName: subjectName.trim(),
      normalizedName: normalizeSubjectName(subjectName),
      courseCode,
      date,
      dayOfWeek: dayName,
      startTime,
      endTime,
      classType: null,
      location: null,
      faculty: null,
      matchConfidence: 0,
      sync: {
        source: 'Juno Student Home',
        syncedAt: nowISO(),
        confidence: 1.0,
      },
    };
  }

  _parseScheduleFromText(text, date, dayName) {
    const classes = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentTime = null;

    for (const line of lines) {

      const timeMatch = line.match(/^(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)\s*(?:[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?))?$/i);
      if (timeMatch) {
        currentTime = {
          start: parseTime(timeMatch[1]),
          end: timeMatch[2] ? parseTime(timeMatch[2]) : null,
        };
        continue;
      }

      const comboMatch = line.match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)\s*[-–—to]*\s*(?:(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)\s*[-–—]?\s*)?(.+)/i);
      if (comboMatch && comboMatch[3].length > 2 && !this._isSubjectBlacklisted(comboMatch[3])) {
        classes.push({
          id: deterministicId(date + comboMatch[3] + comboMatch[1]),
          subjectName: comboMatch[3].trim(),
          normalizedName: normalizeSubjectName(comboMatch[3]),
          courseCode: null,
          date,
          dayOfWeek: dayName,
          startTime: parseTime(comboMatch[1]),
          endTime: comboMatch[2] ? parseTime(comboMatch[2]) : null,
          matchConfidence: 0,
          sync: { source: 'Juno Student Home', syncedAt: nowISO(), confidence: 1.0 },
        });
        currentTime = null;
        continue;
      }

      if (currentTime && line.length > 2 && !/^\d/.test(line) && !line.toLowerCase().includes('schedule') && !this._isSubjectBlacklisted(line)) {
        classes.push({
          id: deterministicId(date + line + (currentTime.start || '')),
          subjectName: line.trim(),
          normalizedName: normalizeSubjectName(line),
          courseCode: null,
          date,
          dayOfWeek: dayName,
          startTime: currentTime.start,
          endTime: currentTime.end,
          matchConfidence: 0,
          sync: { source: 'Juno Student Home', syncedAt: nowISO(), confidence: 1.0 },
        });
        currentTime = null;
      }
    }

    return classes;
  }

  parseSyllabusFaculty() {
    const tables = document.querySelectorAll('table');
    const facultyMap = {};

    for (const table of tables) {
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (!headerRow) continue;

      const headerText = headerRow.innerText.toLowerCase();
      if (!headerText.includes('faculty name') && !headerText.includes('faculty')) continue;

      const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
      const headers = headerCells.map(c => c.innerText.toLowerCase().trim());

      const codeIdx = headers.findIndex(h => h.includes('code'));
      const facultyIdx = headers.findIndex(h => h.includes('faculty'));

      if (codeIdx === -1 || facultyIdx === -1) continue;

      const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length <= Math.max(codeIdx, facultyIdx)) continue;

        const code = cells[codeIdx].innerText.trim();
        const faculty = cells[facultyIdx].innerText.trim();
        if (code && faculty) {
          facultyMap[code.toLowerCase().trim()] = faculty;
        }
      }
    }

    return facultyMap;
  }

  parseAttendance() {

    const tableParsed = this._parseAttendanceFromTable();
    if (tableParsed.length > 0) return tableParsed;

    const cardParsed = this._parseAttendanceFromCards();
    if (cardParsed.length > 0) return cardParsed;

    const textParsed = this._parseAttendanceFromText();
    if (textParsed.length > 0) return textParsed;

    return [];
  }

  _parseAttendanceFromTable() {
    const tables = document.querySelectorAll('table');
    const subjects = [];

    for (const table of tables) {
      const headerText = (table.querySelector('thead, tr:first-child') || table).innerText.toLowerCase();

      if (!headerText.includes('attendance') && !headerText.includes('course') && !headerText.includes('subject')) {

        const tableText = table.innerText;
        if (!/\d+\s*\/\s*\d+/.test(tableText)) continue;
      }

      const rows = table.querySelectorAll('tbody tr, tr');

      const headerCells = table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td');
      const columns = this._detectAttendanceColumns(headerCells);

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) continue;

        const subject = this._extractSubjectFromRow(cells, columns);
        if (subject) subjects.push(subject);
      }

      if (subjects.length > 0) return subjects;
    }

    return subjects;
  }

  _detectAttendanceColumns(headerCells) {
    const columns = {
      name: -1,
      code: -1,
      faculty: -1,
      attended: -1,
      conducted: -1,
      fraction: -1,
      percentage: -1,
    };

    const cells = Array.from(headerCells);
    cells.forEach((cell, idx) => {
      const text = (cell.innerText || '').toLowerCase().trim();

      if (text.includes('course name') || text.includes('subject name') || text.includes('course title') || text.includes('subject') || text.includes('course') || text.includes('paper')) {
        if (columns.name === -1) columns.name = idx;
      }
      if (text.includes('course code') || text.includes('sub code') || text.includes('subject code') || text.includes('code')) {
        columns.code = idx;
      }
      if (text.includes('faculty') || text.includes('teacher') || text.includes('staff')) {
        columns.faculty = idx;
      }
      if (text.includes('attended') || text.includes('present') || text.includes('classes attended') || text.includes('lec attended')) {
        columns.attended = idx;
      }
      if (text.includes('conducted') || text.includes('total') || text.includes('held') || text.includes('delivered') || text.includes('classes held') || text.includes('total classes') || text.includes('total lec')) {
        columns.conducted = idx;
      }
      if (text.includes('attendance count') || text.includes('count') || text.includes('ratio') || text.includes('attended/conducted') || text.includes('present/total')) {
        columns.fraction = idx;
      }
      if (text.includes('percentage') || text.includes('%') || text.includes('percent') || text.includes('attn %')) {
        columns.percentage = idx;
      }
    });

    return columns;
  }

  _extractSubjectFromRow(cells, columns) {
    const cellTexts = Array.from(cells).map(c => cleanDOMText(c.innerText));

    let name = '';
    let code = '';
    let facultyName = '';
    let attended = 0;
    let conducted = 0;
    let displayedPercentage = null;

    if (columns.name >= 0 && columns.name < cellTexts.length) {
      name = cellTexts[columns.name];
    }
    if (columns.code >= 0 && columns.code < cellTexts.length) {
      code = cellTexts[columns.code];
    }
    if (columns.faculty >= 0 && columns.faculty < cellTexts.length) {
      facultyName = cellTexts[columns.faculty];
    }

    if (!facultyName || facultyName === '-' || facultyName.length < 3) {
      for (const cellText of cellTexts) {
        if (/^(dr\.|prof\.|mr\.|mrs\.|ms\.|er\.|dr\s|prof\s)/i.test(cellText)) {
          facultyName = cellText;
          break;
        }
      }
    }

    if (columns.fraction >= 0 && columns.fraction < cellTexts.length) {
      const fraction = parseAttendanceFraction(cellTexts[columns.fraction]);
      if (fraction) {
        attended = fraction.attended;
        conducted = fraction.conducted;
      }
    }

    if (columns.attended >= 0 && columns.attended < cellTexts.length) {
      attended = parseInt(cellTexts[columns.attended], 10) || 0;
    }
    if (columns.conducted >= 0 && columns.conducted < cellTexts.length) {
      conducted = parseInt(cellTexts[columns.conducted], 10) || 0;
    }

    if (columns.percentage >= 0 && columns.percentage < cellTexts.length) {
      displayedPercentage = parseFloat(cellTexts[columns.percentage]) || null;
    }

    if (!name) {
      for (const cellText of cellTexts) {
        if (cellText.length > 3 && !/^\d/.test(cellText) && !cellText.includes('/') && !cellText.includes('%')) {
          name = cellText;
          break;
        }
      }
    }

    if (attended === 0 && conducted === 0) {
      for (const cellText of cellTexts) {
        const fraction = parseAttendanceFraction(cellText);
        if (fraction) {
          attended = fraction.attended;
          conducted = fraction.conducted;
          break;
        }
      }
    }

    if (!code) {
      for (const cellText of cellTexts) {
        if (/^[A-Z]{2,5}\d{3,5}[A-Z]?$/i.test(cellText.trim())) {
          code = cellText.trim();
          break;
        }
      }
    }

    if (!name || name.toLowerCase() === 'total' || name.toLowerCase().startsWith('total ')) return null;

    if (!code) {
      const embeddedCode = name.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/i);
      if (embeddedCode) {
        code = embeddedCode[1];
        name = name.replace(embeddedCode[0], '').trim();
      }
    }

    const percentage = conducted > 0 ? (attended / conducted) * 100 : 0;

    return {
      id: deterministicId(code || name),
      code: code ? normalizeCourseCode(code) : undefined,
      name: name.trim(),
      normalizedName: normalizeSubjectName(name),
      facultyName: facultyName || undefined,
      attended,
      conducted,
      percentage,
      displayedPercentage,
      sync: {
        source: 'Juno Attendance Page',
        syncedAt: nowISO(),
        confidence: 1.0,
      },
    };
  }

  _parseAttendanceFromCards() {
    const subjects = [];
    const cards = document.querySelectorAll('.card, .panel, [class*="attendance"], [class*="subject"], [class*="course"]');

    for (const card of cards) {
      const text = card.innerText || '';
      if (text.length < 5) continue;

      const fraction = parseAttendanceFraction(text);
      if (!fraction) continue;

      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let name = '';
      let code = '';

      for (const line of lines) {
        if (/\d+\s*\/\s*\d+/.test(line)) continue;
        if (/^\d+\.?\d*\s*%?$/.test(line)) continue;
        if (/^[A-Z]{2,5}\d{3,5}[A-Z]?$/i.test(line)) {
          code = line;
          continue;
        }
        if (!name && line.length > 2) {
          name = line;
        }
      }

      if (!name) continue;

      const percentage = fraction.conducted > 0 ? (fraction.attended / fraction.conducted) * 100 : 0;

      subjects.push({
        id: deterministicId(code || name),
        code: code ? normalizeCourseCode(code) : undefined,
        name: name.trim(),
        normalizedName: normalizeSubjectName(name),
        attended: fraction.attended,
        conducted: fraction.conducted,
        percentage,
        sync: {
          source: 'Juno Attendance Page',
          syncedAt: nowISO(),
          confidence: 1.0,
        },
      });
    }

    return subjects;
  }

  _parseAttendanceFromText() {
    const bodyText = document.body ? document.body.innerText : '';
    const subjects = [];

    const pattern = /([A-Za-z][A-Za-z\s&\-:().]+?)\s+(\d+)\s*\/\s*(\d+)/g;
    let match;

    while ((match = pattern.exec(bodyText)) !== null) {
      const name = match[1].trim();
      const attended = parseInt(match[2], 10);
      const conducted = parseInt(match[3], 10);

      if (name.length < 3 || conducted === 0) continue;
      if (name.toLowerCase().includes('schedule') || name.toLowerCase().includes('attendance count')) continue;

      const percentage = (attended / conducted) * 100;

      subjects.push({
        id: deterministicId(name),
        name,
        normalizedName: normalizeSubjectName(name),
        attended,
        conducted,
        percentage,
        sync: {
          source: 'Juno Attendance Page',
          syncedAt: nowISO(),
          confidence: 0.8,
        },
      });
    }

    return subjects;
  }

  parseTimetable() {
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const text = table.innerText.toLowerCase();
      
      // 1. Try stu_StudentTimeTable.htm format
      if (text.includes('course name') && (text.includes('date & day') || text.includes('start time') || text.includes('faculty name'))) {
        const parsed = this._parseStudentTimeTable(table);
        if (parsed && Object.keys(parsed.days).length > 0) {
          return parsed;
        }
      }

      // 2. Try matrix table format
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const daysFound = dayNames.filter(d => text.includes(d));

      if (daysFound.length >= 3) {
        const schedule = this._parseTimetableTable(table, dayNames);
        if (schedule && Object.keys(schedule.days).length >= 3) {
          return schedule;
        }
      }
    }

    return null;
  }

  _parseStudentTimeTable(table) {
    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) return null;

    let dateColIdx = -1;
    let startColIdx = -1;
    let endColIdx = -1;
    let sessionColIdx = -1;
    let courseColIdx = -1;
    let facultyColIdx = -1;
    let roomColIdx = -1;

    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(3, rows.length); r++) {
      const ths = rows[r].querySelectorAll('th, td');
      for (let c = 0; c < ths.length; c++) {
        const text = cleanDOMText(ths[c].innerText).toLowerCase();
        if (text.includes('date') && text.includes('day')) dateColIdx = c;
        else if (text.includes('start time')) startColIdx = c;
        else if (text.includes('end time')) endColIdx = c;
        else if (text.includes('session')) sessionColIdx = c;
        else if (text.includes('course name') || text.includes('subject')) courseColIdx = c;
        else if (text.includes('faculty')) facultyColIdx = c;
        else if (text.includes('room') || text.includes('lab')) roomColIdx = c;
      }
      if (courseColIdx !== -1) {
        headerRowIdx = r;
        break;
      }
    }

    if (courseColIdx === -1) return null;

    const days = {};
    const dateWiseSchedule = {};
    const facultyMap = {};
    let currentDateStr = '';
    let currentDayName = '';

    const dayNamesList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 3) continue;

      const fullRowText = cleanDOMText(row.innerText).toLowerCase();
      if (fullRowText.includes('data not found') || fullRowText.includes('no records')) continue;

      let startTime = null;
      let endTime = null;
      let sessionNo = null;
      let courseName = null;
      let facultyName = null;
      let room = null;

      // Check if first cell contains a date/day name
      const firstCellText = cleanDOMText(cells[0].innerText);
      const isDateRow = dayNamesList.some(d => firstCellText.toLowerCase().includes(d.toLowerCase()));

      if (isDateRow) {
        currentDateStr = firstCellText;
        for (const d of dayNamesList) {
          if (firstCellText.toLowerCase().includes(d.toLowerCase())) {
            currentDayName = d;
            break;
          }
        }
        startTime = cells[1] ? cleanDOMText(cells[1].innerText) : null;
        endTime = cells[2] ? cleanDOMText(cells[2].innerText) : null;
        sessionNo = cells[3] ? cleanDOMText(cells[3].innerText) : null;
        courseName = cells[4] ? cleanDOMText(cells[4].innerText) : null;
        room = cells[6] ? cleanDOMText(cells[6].innerText) : null;
        facultyName = cells[7] ? cleanDOMText(cells[7].innerText) : null;
      } else {
        startTime = cells[0] ? cleanDOMText(cells[0].innerText) : null;
        endTime = cells[1] ? cleanDOMText(cells[1].innerText) : null;
        sessionNo = cells[2] ? cleanDOMText(cells[2].innerText) : null;
        courseName = cells[3] ? cleanDOMText(cells[3].innerText) : null;
        room = cells[5] ? cleanDOMText(cells[5].innerText) : null;
        facultyName = cells[6] ? cleanDOMText(cells[6].innerText) : null;
      }

      // Fallback: If courseName looks like time (e.g. "11:00 AM") or empty, scan cells
      if (!courseName || courseName === '-' || /^\d{1,2}:\d{2}/.test(courseName)) {
        for (let c = 0; c < cells.length; c++) {
          const txt = cleanDOMText(cells[c].innerText);
          if (txt && txt !== '-' && txt.length >= 2 && !/^\d{1,2}:\d{2}/.test(txt) && !dayNamesList.some(d => txt.toLowerCase().includes(d.toLowerCase())) && !/^\d+$/.test(txt)) {
            courseName = txt;
            break;
          }
        }
      }

      // Forceful Faculty Extraction from table cells
      if (!facultyName || facultyName === '-' || facultyName.length < 3) {
        for (let c = 0; c < cells.length; c++) {
          const txt = cleanDOMText(cells[c].innerText);
          if (!txt || txt === '-' || txt.length < 3) continue;

          if (/^(dr\.|prof\.|mr\.|mrs\.|ms\.|er\.|dr\s|prof\s)/i.test(txt)) {
            facultyName = txt;
            break;
          }

          const lower = txt.toLowerCase();
          if (!lower.includes('am') && !lower.includes('pm') && !lower.includes('lecture') && !lower.includes('lab') && !lower.includes('room') && !lower.includes('session') && !dayNamesList.some(d => lower.includes(d.toLowerCase()))) {
            const parts = txt.split(/\s+/);
            if (parts.length >= 2 && parts.length <= 4 && parts.every(p => /^[A-Z][a-z\.]*$/.test(p))) {
              facultyName = txt;
              break;
            }
          }
        }
      }

      if (!courseName || courseName === '-' || courseName.length < 2) continue;

      if (facultyName && facultyName !== '-' && courseName) {
        facultyMap[normalizeSubjectName(courseName)] = facultyName;
        facultyMap[courseName.toLowerCase().trim()] = facultyName;
      }

      const dayKey = currentDayName || 'Monday';
      if (!days[dayKey]) days[dayKey] = [];

      const classEntry = {
        id: deterministicId(dayKey + courseName + (startTime || '') + r),
        subjectName: courseName,
        normalizedName: normalizeSubjectName(courseName),
        dateStr: currentDateStr,
        dayOfWeek: dayKey,
        startTime: startTime || null,
        endTime: endTime || null,
        sessionNo: sessionNo || null,
        facultyName: facultyName || null,
        room: room || null,
        matchConfidence: 0,
        sync: { source: 'Juno stu_StudentTimeTable', syncedAt: nowISO(), confidence: 1.0 },
      };

      const slotKey = (startTime || '') + '_' + courseName.toLowerCase().trim();
      const existsInWeekly = days[dayKey].some(c => ((c.startTime || '') + '_' + c.subjectName.toLowerCase().trim()) === slotKey);
      if (!existsInWeekly) {
        days[dayKey].push(classEntry);
      }

      if (currentDateStr) {
        if (!dateWiseSchedule[currentDateStr]) dateWiseSchedule[currentDateStr] = [];
        dateWiseSchedule[currentDateStr].push(classEntry);
      }
    }

    if (Object.keys(days).length === 0) return null;

    return {
      days,
      dateWiseSchedule,
      facultyMap,
      source: 'stu_StudentTimeTable',
      confidence: 1.0,
      syncedAt: nowISO(),
      observedWeeks: 1,
    };
  }

  _parseTimetableTable(table, dayNames) {
    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) return null;

    const days = {};
    const today = getTodayDate();

    for (const row of rows) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 2) continue;

      const firstCell = cleanDOMText(cells[0].innerText).toLowerCase();
      const matchedDay = dayNames.find(d => firstCell.includes(d));

      if (matchedDay) {
        const dayKey = matchedDay.charAt(0).toUpperCase() + matchedDay.slice(1);
        days[dayKey] = [];

        for (let i = 1; i < cells.length; i++) {
          const cellText = cleanDOMText(cells[i].innerText);
          if (cellText.length < 2 || cellText === '-' || cellText === '—') continue;

          days[dayKey].push({
            id: deterministicId(dayKey + cellText + i),
            subjectName: cellText,
            normalizedName: normalizeSubjectName(cellText),
            date: today,
            dayOfWeek: dayKey,
            startTime: null,
            endTime: null,
            matchConfidence: 0,
            sync: { source: 'Juno Timetable', syncedAt: nowISO(), confidence: 1.0 },
          });
        }
      }
    }

    if (Object.keys(days).length === 0) return null;

    return {
      days,
      source: 'portal',
      confidence: 1.0,
      syncedAt: nowISO(),
      observedWeeks: 0,
    };
  }

  getPortalIdentifiers() {
    return this.extractStudentInfo();
  }

  extractStudentInfo() {
    const info = {
      name: '',
      semester: '',
      branch: '',
      section: '',
      rollNo: '',
    };

    const isExcluded = (str) => {
      if (!str || str.length < 3 || str.length > 50) return true;
      const lower = str.toLowerCase().trim();
      const blocked = [
        'student', 'student configuration', 'student portal', 'juno', 'juno campus',
        'rcoem', 'rbu', 'operation 75', 'attendance', 'dashboard', 'home',
        'academic', 'institute', 'facilities', 'communication', 'events',
        'logout', 'login', 'faculty', 'course', 'courses', 'timetable',
        'semester', 'branch', 'section', 'unknown', 'fees', 'hostel',
        'term( semester ):', 'term', 'code', 'course name', 'refresh'
      ];
      return blocked.some(b => lower === b || lower.startsWith('juno ') || lower.includes('operation 75') || lower.includes('attendance'));
    };

    try {
      const candidates = document.querySelectorAll(
        'header, .header, #header, .top-bar, .topbar, .navbar, nav, table, div, span, td, font, b, strong, a'
      );

      for (const el of candidates) {
        const text = el.innerText || el.textContent || '';
        if (/\bStudent\b/i.test(text) && text.length < 150) {
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase() === 'student') {
              const prev = lines[i - 1];
              if (prev && !isExcluded(prev) && /^[A-Za-z\s\.\'\-]+$/.test(prev)) {
                info.name = prev;
                break;
              }
              const next = lines[i + 1];
              if (next && !isExcluded(next) && /^[A-Za-z\s\.\'\-]+$/.test(next)) {
                info.name = next;
                break;
              }
            }
          }
        }
        if (info.name) break;
      }
    } catch (e) {
      console.warn('[JunoAdapter] Error extracting header user info:', e);
    }

    // Strategy 2: Common Juno & ASP.NET label IDs / classes
    if (!info.name) {
      const selectors = [
        '#lblUserName', '#lblStudentName', '#lblUser', '#lblStudent',
        '#ctl00_lblUserName', '#ctl00_lblUser', '#userName', '#username',
        '.userName', '.username', '.studentName', '.user-name', '.profile-name',
        '.user-details .user-role', '.userInfo'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && !isExcluded(txt)) {
            info.name = txt;
            break;
          }
        }
      }
    }

    // Strategy 3: Regex scan across document body
    if (document.body) {
      const bodyText = document.body.innerText || '';

      // Pattern: "Name \n Student"
      if (!info.name) {
        const headerMatch = bodyText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\n\s*Student\b/i);
        if (headerMatch && !isExcluded(headerMatch[1])) {
          info.name = headerMatch[1].trim();
        }
      }

      // Pattern: "Student Name : Richa Pradeep Rajan"
      if (!info.name) {
        const nameMatch = bodyText.match(/(?:Student Name|Name of Student|Candidate Name)\s*[:\-]\s*([A-Za-z\s\.\'\-]+?)(?:\s*\(|\s*\n|\s*\[|\s*Roll|\s*Reg|\s*ID|\s*Branch|$)/i);
        if (nameMatch && !isExcluded(nameMatch[1])) {
          info.name = nameMatch[1].trim();
        }
      }

      // Pattern: "Welcome, <Name>"
      if (!info.name) {
        const welcomeMatch = bodyText.match(/Welcome\s*,\s*([A-Za-z\s\.\'\-]+?)(?:\s*\(|\s*\n|\s*\[|$)/i);
        if (welcomeMatch && !isExcluded(welcomeMatch[1])) {
          info.name = welcomeMatch[1].trim();
        }
      }

      // Semester, Branch, Section
      const semMatch = bodyText.match(/semester\s*[:\-]?\s*(\w+)/i) || bodyText.match(/term\s*\(\s*semester\s*\)\s*[:\-]?\s*(\w+)/i);
      if (semMatch) info.semester = semMatch[1].trim();

      const branchMatch = bodyText.match(/branch\s*[:\-]?\s*([A-Za-z\s]+?)(?:\n|$)/i);
      if (branchMatch) info.branch = branchMatch[1].trim();

      const sectionMatch = bodyText.match(/section\s*[:\-]?\s*([A-Z0-9]+)/i);
      if (sectionMatch) info.section = sectionMatch[1].trim();

      const rollMatch = bodyText.match(/(?:Roll\s*(?:No|Number)|Enrollment\s*(?:No|Number)|Registration\s*(?:No|Number)|ID)\s*[:\-]?\s*([A-Z0-9\-]+)/i);
      if (rollMatch) info.rollNo = rollMatch[1].trim();
    }

    return info;
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  _detectClassType(text) {
    const lower = text.toLowerCase();
    if (lower.includes('lab') || lower.includes('practical')) return 'Lab';
    if (lower.includes('tutorial') || lower.includes('tut')) return 'Tutorial';
    if (lower.includes('lecture') || lower.includes('lec')) return 'Lecture';
    return null;
  }

  _extractLocation(text) {
    const roomMatch = text.match(/room\s*[:\-]?\s*(\w+)/i) ||
                      text.match(/\b(room\s*\d+[A-Z]?)\b/i) ||
                      text.match(/\b([A-Z]\d{3,4})\b/);
    return roomMatch ? roomMatch[1] : null;
  }

  // ──────────────────────────────────────────────
  // Academic Calendar & Holiday Parser
  // ──────────────────────────────────────────────

  /**
   * Parse holidays and key semester dates from the Academic Calendar page.
   * Scans for dates marked with green indicators/text or explicit holiday labels.
   * @returns {{ holidays: Array<{ date: string, name: string, isHoliday: boolean }>, semesterEndDate: string|null }}
   */
  parseHolidays() {
    const holidays = [];
    let semesterEndDate = null;
    const seenDates = new Set();

    // Strategy 1: Look for table rows in the academic calendar
    const rows = document.querySelectorAll('tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 2) continue;

      const rowText = cleanDOMText(row.innerText);
      const isGreen = this._isElementOrChildGreen(row);
      const isHolidayText = /holiday|vacation|jayanti|diwali|holi|eid|christmas|festival|independence|republic/i.test(rowText);

      // Check for semester end marker
      if (/last\s*working\s*day|last\s*teaching\s*day|term\s*end|semester\s*end/i.test(rowText)) {
        const dateMatch = this._extractDateFromText(rowText);
        if (dateMatch && !semesterEndDate) {
          semesterEndDate = dateMatch;
        }
      }

      if (isGreen || isHolidayText) {
        const dateStr = this._extractDateFromText(rowText);
        const nameStr = this._extractHolidayName(cells, rowText);

        if (dateStr && nameStr && !seenDates.has(dateStr)) {
          seenDates.add(dateStr);
          holidays.push({
            date: dateStr,
            name: nameStr,
            isHoliday: true,
          });
        }
      }
    }

    // Strategy 2: Look for calendar cells / grid items marked green
    const greenElements = document.querySelectorAll('[style*="green"], [style*="#28a745"], [style*="#22c55e"], [style*="#16a34a"], [class*="success"], [class*="green"], [class*="holiday"]');
    for (const el of greenElements) {
      // Find parent or nearby container with date context
      const container = el.closest('td, tr, .fc-event, [class*="day"], [class*="card"], li') || el;
      const text = cleanDOMText(container.innerText);
      const dateStr = this._extractDateFromText(text) || this._extractDateFromElement(container);

      if (dateStr && !seenDates.has(dateStr)) {
        let nameStr = cleanDOMText(el.innerText) || 'Holiday';
        nameStr = nameStr.replace(/^\d+[\/\-.]\d+[\/\-.]\d+\s*/, '').trim();
        if (nameStr.length > 2) {
          seenDates.add(dateStr);
          holidays.push({
            date: dateStr,
            name: nameStr,
            isHoliday: true,
          });
        }
      }
    }

    // Sort by date
    holidays.sort((a, b) => a.date.localeCompare(b.date));

    return { holidays, semesterEndDate };
  }

  _isElementOrChildGreen(element) {
    if (!element) return false;
    const style = element.getAttribute('style') || '';
    const className = (element.className || '').toString().toLowerCase();

    if (/green|#28a745|#22c55e|#16a34a|success|holiday/i.test(style + ' ' + className)) {
      return true;
    }

    const greenChild = element.querySelector('[style*="green"], [style*="#28a745"], [style*="#22c55e"], [style*="#16a34a"], [class*="success"], [class*="green"], [class*="holiday"]');
    return !!greenChild;
  }

  _extractDateFromText(text) {
    if (!text) return null;

    // Pattern 1: DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // Pattern 2: DD-Mon-YYYY or DD Mon YYYY (e.g. 23-Aug-2026 or 23 Aug 2026)
    const monMatch = text.match(/\b(\d{1,2})[\s\-]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-,]*(\d{4})\b/i);
    if (monMatch) {
      const months = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };
      const monthNum = months[monMatch[2].toLowerCase().slice(0, 3)];
      if (monthNum) {
        return `${monMatch[3]}-${monthNum}-${monMatch[1].padStart(2, '0')}`;
      }
    }

    return null;
  }

  _extractDateFromElement(el) {
    if (!el) return null;
    const dataDate = el.getAttribute('data-date') || el.getAttribute('date') || el.getAttribute('id');
    if (dataDate && /^\d{4}-\d{2}-\d{2}$/.test(dataDate)) {
      return dataDate;
    }
    return null;
  }

  _extractHolidayName(cells, rowText) {
    // If multiple cells, find the one with description/name
    if (cells && cells.length >= 2) {
      for (const cell of cells) {
        const text = cleanDOMText(cell.innerText);
        if (text.length > 2 && !/^\d+[\/\-.]\d+/.test(text) && !/^\d+$/.test(text)) {
          return text;
        }
      }
    }

    // Fallback: strip date from row text
    return rowText.replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g, '').replace(/holiday|vacation/gi, '').trim() || 'Holiday';
  }

  _isSubjectBlacklisted(subjectName) {
    if (!subjectName) return true;
    const lower = subjectName.toLowerCase().trim();
    // Exclude exact matches or simple menu items
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

    // Check partial containment for utility-specific keywords
    const blacklistContains = [
      'library (', 'contact mentor', 'leave details', 'fees details', 'leave report', 'admit card',
      'change password', 'sign out', 'signout', 'my profile', 'feedback form'
    ];
    if (blacklistContains.some(term => lower.includes(term))) return true;

    return false;
  }
}
