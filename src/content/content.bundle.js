/** Copyright (c) 2026 Nakul Mundhada. All Rights Reserved. PROPRIETARY & CONFIDENTIAL. https://github.com/nakul-biovaco/Attendance-Extension-RCOEM */
(() => {
  // src/adapters/portal-adapter.js
  var BasePortalAdapter = class {
    constructor() {
      this._observer = null;
      this._callbacks = [];
    }
    elementExists(selector) {
      const el = document.querySelector(selector);
      return el !== null && el.offsetParent !== null;
    }
    findElementsByText(text, tagFilter) {
      const normalizedSearch = text.toLowerCase().trim();
      const selector = tagFilter || "*";
      const elements = document.querySelectorAll(selector);
      const results = [];
      for (const el of elements) {
        const directText = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").toLowerCase().trim();
        if (directText.includes(normalizedSearch)) {
          results.push(el);
          continue;
        }
        if (el.textContent && el.textContent.toLowerCase().trim().includes(normalizedSearch)) {
          results.push(el);
        }
      }
      return results;
    }
    findAncestor(el, predicate, maxDepth = 10) {
      let current = el.parentElement;
      let depth = 0;
      while (current && depth < maxDepth) {
        if (predicate(current)) return current;
        current = current.parentElement;
        depth++;
      }
      return null;
    }
    observeContentChanges(callback, target) {
      this.disconnect();
      const observeTarget = target || document.body;
      if (!observeTarget) return;
      let timeout = null;
      let lastFireTime = 0;
      const THROTTLE_MS = 600;
      const debouncedCallback = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          const now = Date.now();
          if (now - lastFireTime < THROTTLE_MS) return;
          lastFireTime = now;
          callback();
        }, 100);
      };
      const isExtensionNode = (node) => {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        return node.hasAttribute("data-ai-injected") || node.hasAttribute("data-ai-attendance-injected") || node.hasAttribute("data-ai-enhanced") || node.id?.startsWith("ai-") || typeof node.className === "string" && (node.className.includes("ai-") || node.className.includes("juno-enhanced")) || Boolean(node.closest?.('[data-ai-injected="true"], [data-ai-attendance-injected="true"], [id^="ai-"]'));
      };
      this._observer = new MutationObserver((mutations) => {
        const hasRelevantChange = mutations.some((m) => {
          if (m.type === "childList") {
            for (const node of m.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && !isExtensionNode(node)) {
                return true;
              }
            }
            for (const node of m.removedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && !isExtensionNode(node)) {
                return true;
              }
            }
          }
          if (m.type === "characterData") {
            const parent = m.target.parentElement;
            if (parent && !isExtensionNode(parent)) {
              return true;
            }
          }
          return false;
        });
        if (hasRelevantChange) {
          debouncedCallback();
        }
      });
      this._observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    disconnect() {
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
    }
  };

  // src/utils/normalizer.js
  function normalizeSubjectName(text) {
    if (!text) return "";
    return text.toLowerCase().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/&\w+;/g, "").replace(/\s+/g, " ").replace(/[^\w\s&-]/g, "").trim();
  }
  function normalizeCourseCode(code) {
    if (!code) return "";
    return code.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "").trim();
  }
  function cleanDOMText(text) {
    if (!text) return "";
    return text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+/g, " ").replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
  }
  function deterministicId(input) {
    let hash = 0;
    const str = normalizeSubjectName(String(input));
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return "det_" + Math.abs(hash).toString(36);
  }
  function parseAttendanceFraction(text) {
    if (!text) return null;
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return null;
    return {
      attended: parseInt(match[1], 10),
      conducted: parseInt(match[2], 10)
    };
  }
  function parseTime(time) {
    if (!time) return null;
    const cleaned = time.trim().toUpperCase();
    let match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const mins = match[2];
      const period = match[3];
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      return String(hours).padStart(2, "0") + ":" + mins;
    }
    match = cleaned.match(/^(\d{2})(\d{2})$/);
    if (match) {
      return match[1] + ":" + match[2];
    }
    match = cleaned.match(/^(\d{1,2})\.(\d{2})$/);
    if (match) {
      return String(match[1]).padStart(2, "0") + ":" + match[2];
    }
    return null;
  }

  // src/utils/date-utils.js
  function getTodayDate() {
    return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  }
  function getTodayDayName() {
    return (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { weekday: "long" });
  }
  function nowISO() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function getDynamicSemesterEndDate() {
    const now = /* @__PURE__ */ new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (month >= 6) {
      return `${year}-11-30`;
    }
    return `${year}-05-15`;
  }
  function relativeTime(timestamp) {
    const now = /* @__PURE__ */ new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    if (diffMs < 0) return "just now";
    const seconds = Math.floor(diffMs / 1e3);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
    return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // src/adapters/juno-adapter.js
  var JunoAdapter = class extends BasePortalAdapter {
    constructor() {
      super();
    }
    detectPage() {
      const url = window.location.href.toLowerCase();
      const bodyText = document.body ? document.body.innerText : "";
      const lowerBody = bodyText.toLowerCase();
      if (url.includes("logout.htm") || url.includes("logout.aspx") || url.endsWith("/login.htm") || url.endsWith("/login.aspx")) {
        if (!lowerBody.includes("student") && !lowerBody.includes("course") && !document.querySelector("table")) {
          return "auth";
        }
      }
      if (url.includes("studentcoursefilenew") || url.includes("coursefile") || url.includes("studentcoursefile") || url.includes("attendance") || url.includes("attnreport")) {
        return "attendance";
      }
      if (url.includes("studentscheduleacademiccalender") || url.includes("academiccalender") || url.includes("academiccalendar") || url.includes("scheduleacademiccalender")) {
        return "calendar";
      }
      if (url.includes("studenttimetable") || url.includes("stu_studenttimetable") || url.includes("timetable") || url.includes("time_table")) {
        return "timetable";
      }
      if (url.includes("home.htm") || url.includes("studenthome") || url.includes("student_home") || url.includes("dashboard") || url.includes("/home")) {
        return "student-home";
      }
      if (this._hasAttendanceMarkers(lowerBody)) {
        return "attendance";
      }
      if (this._hasTimetableMarkers(lowerBody)) {
        return "timetable";
      }
      if (this._hasScheduleMarkers(lowerBody)) {
        return "student-home";
      }
      return "unknown";
    }
    _hasScheduleMarkers(text) {
      const markers = ["today's schedule", "todays schedule", "today schedule", "daily schedule"];
      return markers.some((m) => text.includes(m));
    }
    _hasAttendanceMarkers(text) {
      const hasAttendance = text.includes("attendance");
      const hasCourse = text.includes("course name") || text.includes("subject name") || text.includes("course code");
      const hasFraction = /\d+\s*\/\s*\d+/.test(text);
      return hasAttendance && (hasCourse || hasFraction);
    }
    _hasTimetableMarkers(text) {
      const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayCount = dayNames.filter((d) => text.includes(d)).length;
      return dayCount >= 3 && (text.includes("time table") || text.includes("timetable") || text.includes("weekly schedule"));
    }
    isPortalReady() {
      return Boolean(document.body);
    }
    parseSchedule() {
      const stripClasses = this._parseScheduleFromHomeStrip();
      if (stripClasses.length > 0) return stripClasses;
      const transposedClasses = this._parseScheduleFromTransposedTable();
      if (transposedClasses.length > 0) return transposedClasses;
      const scheduleContainer = this._findScheduleContainer();
      if (scheduleContainer) {
        const parsed = this._parseScheduleFromContainer(scheduleContainer);
        if (parsed.length > 0) return parsed;
      }
      const tableParsed = this._parseScheduleFromTable();
      if (tableParsed.length > 0) return tableParsed;
      const cardParsed = this._parseScheduleFromCards();
      if (cardParsed.length > 0) return cardParsed;
      const genericParsed = this._parseScheduleFromGenericDOM();
      if (genericParsed.length > 0) return genericParsed;
      return [];
    }
    _parseScheduleFromHomeStrip() {
      const today = getTodayDate();
      const dayName = getTodayDayName();
      const headings = this.findElementsByText("today's schedule");
      for (const heading of headings) {
        let root = heading.closest(".card, .panel, .widget, .box, div, tr") || heading.parentElement;
        if (!root) continue;
        const elementsToScan = [root, root.nextElementSibling, root.parentElement].filter(Boolean);
        for (const el of elementsToScan) {
          const tables = el.querySelectorAll("table");
          for (const table of tables) {
            const rows = table.querySelectorAll("tbody tr, tr");
            if (rows.length >= 2) {
              for (let r = 0; r < rows.length - 1; r++) {
                const row1Cells = rows[r].querySelectorAll("td, th");
                const row2Cells = rows[r + 1].querySelectorAll("td, th");
                const minLen = Math.min(row1Cells.length, row2Cells.length);
                if (minLen === 0) continue;
                const classes = [];
                for (let c = 0; c < minLen; c++) {
                  const timeText = cleanDOMText(row1Cells[c].innerText || "");
                  const subText = cleanDOMText(row2Cells[c].innerText || "");
                  const timeMatch = timeText.match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)\s*(?:[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?))?/i);
                  if (timeMatch && subText && subText !== "-" && subText.length >= 2 && !this._isSubjectBlacklisted(subText)) {
                    classes.push({
                      id: deterministicId(today + subText + (timeMatch[1] || "")),
                      subjectName: subText.trim(),
                      normalizedName: normalizeSubjectName(subText),
                      courseCode: null,
                      date: today,
                      dayOfWeek: dayName,
                      startTime: parseTime(timeMatch[1]),
                      endTime: timeMatch[2] ? parseTime(timeMatch[2]) : null,
                      classType: this._detectClassType(subText),
                      location: null,
                      faculty: null,
                      matchConfidence: 0,
                      sync: {
                        source: "Juno Student Home Strip",
                        syncedAt: nowISO(),
                        confidence: 1
                      }
                    });
                  }
                }
                if (classes.length > 0) return classes;
              }
            }
          }
        }
      }
      return [];
    }
    _parseScheduleFromTransposedTable() {
      const today = getTodayDate();
      const dayName = getTodayDayName();
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const rows = table.querySelectorAll("tbody tr, tr");
        if (rows.length < 2) continue;
        for (let r = 0; r < rows.length - 1; r++) {
          const row1Cells = rows[r].querySelectorAll("td, th");
          const row2Cells = rows[r + 1].querySelectorAll("td, th");
          if (row1Cells.length === 0 || row2Cells.length === 0) continue;
          const row1HasTimes = Array.from(row1Cells).some((c) => /(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)/.test(c.innerText || ""));
          const row2HasTimes = Array.from(row2Cells).some((c) => /(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)/.test(c.innerText || ""));
          if (row1HasTimes && !row2HasTimes) {
            const classes = [];
            const minLen = Math.min(row1Cells.length, row2Cells.length);
            for (let c = 0; c < minLen; c++) {
              const timeText = cleanDOMText(row1Cells[c].innerText || "");
              const subText = cleanDOMText(row2Cells[c].innerText || "");
              const timeMatch = timeText.match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)\s*(?:[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?))?/i);
              if (!timeMatch) continue;
              if (!subText || subText === "-" || subText.length < 2) continue;
              if (this._isSubjectBlacklisted(subText)) continue;
              const startTime = parseTime(timeMatch[1]);
              const endTime = timeMatch[2] ? parseTime(timeMatch[2]) : null;
              classes.push({
                id: deterministicId(today + subText + (startTime || "")),
                subjectName: subText.trim(),
                normalizedName: normalizeSubjectName(subText),
                courseCode: null,
                date: today,
                dayOfWeek: dayName,
                startTime,
                endTime,
                classType: this._detectClassType(subText),
                location: null,
                faculty: null,
                matchConfidence: 0,
                sync: {
                  source: "Juno Transposed Table",
                  syncedAt: nowISO(),
                  confidence: 1
                }
              });
            }
            if (classes.length > 0) return classes;
          }
        }
      }
      return [];
    }
    _parseScheduleFromGenericDOM() {
      const today = getTodayDate();
      const dayName = getTodayDayName();
      const headings = this.findElementsByText("today's schedule");
      for (const heading of headings) {
        let root = heading.closest(".card, .panel, .widget, div") || heading.parentElement;
        if (!root) continue;
        const timeElements = Array.from(root.querySelectorAll("*")).filter((el) => {
          const t = (el.innerText || "").trim();
          return /^(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)\s*[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)$/i.test(t);
        });
        if (timeElements.length > 0) {
          const classes = [];
          for (const tEl of timeElements) {
            const timeText = tEl.innerText.trim();
            const timeMatch = timeText.match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)\s*[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)/i);
            if (!timeMatch) continue;
            let subEl = tEl.nextElementSibling || (tEl.parentElement ? tEl.parentElement.querySelector('a, strong, span:not([class*="time"]), div:not([class*="time"])') : null);
            let subText = subEl ? cleanDOMText(subEl.innerText) : "";
            if (!subText || subText === timeText) {
              const parentCells = tEl.closest("td, div");
              if (parentCells && parentCells.nextElementSibling) {
                subText = cleanDOMText(parentCells.nextElementSibling.innerText);
              }
            }
            if (subText && subText.length >= 2 && !this._isSubjectBlacklisted(subText)) {
              classes.push({
                id: deterministicId(today + subText + timeMatch[1]),
                subjectName: subText.trim(),
                normalizedName: normalizeSubjectName(subText),
                courseCode: null,
                date: today,
                dayOfWeek: dayName,
                startTime: parseTime(timeMatch[1]),
                endTime: timeMatch[2] ? parseTime(timeMatch[2]) : null,
                classType: this._detectClassType(subText),
                location: null,
                faculty: null,
                matchConfidence: 0,
                sync: { source: "Juno Generic DOM Scanner", syncedAt: nowISO(), confidence: 1 }
              });
            }
          }
          if (classes.length > 0) return classes;
        }
      }
      return [];
    }
    _findScheduleContainer() {
      const headings = this.findElementsByText("today's schedule");
      for (const heading of headings) {
        const container = this.findAncestor(heading, (el) => {
          return el.children.length > 1 || el.classList.contains("card") || el.classList.contains("panel") || el.classList.contains("widget") || el.classList.contains("section") || el.tagName === "SECTION" || el.tagName === "ARTICLE";
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
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const text = table.innerText.toLowerCase();
        if (text.includes("schedule") || text.includes("time") || text.includes("subject") || text.includes("period")) {
          const rows = table.querySelectorAll("tbody tr, tr");
          const classes = [];
          for (const row of rows) {
            const cells = row.querySelectorAll("td, th");
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
        const text = card.innerText || "";
        if (text.length < 5 || text.length > 500) continue;
        const entry = this._extractClassFromElement(card, today, dayName);
        if (entry) classes.push(entry);
      }
      return classes;
    }
    _extractClassFromElement(el, date, dayName) {
      const text = cleanDOMText(el.innerText || "");
      if (!text || text.length < 3) return null;
      if (text.toLowerCase().includes("today's schedule") && text.length < 30) return null;
      if (el.tagName === "TH") return null;
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
        subjectName = subjectName.replace(timeMatch[0], "").trim();
      }
      const codePattern = /\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/i;
      const codeMatch = subjectName.match(codePattern);
      let courseCode = null;
      if (codeMatch) {
        courseCode = normalizeCourseCode(codeMatch[1]);
        subjectName = subjectName.replace(codeMatch[0], "").trim();
      }
      subjectName = subjectName.replace(/^[-–—:\s]+/, "").replace(/[-–—:\s]+$/, "").replace(/\s+/g, " ").trim();
      if (!subjectName || subjectName.length < 2) return null;
      if (this._isSubjectBlacklisted(subjectName)) return null;
      if (/^\d+$/.test(subjectName)) return null;
      return {
        id: deterministicId(date + subjectName + (startTime || "")),
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
          source: "Juno Student Home",
          syncedAt: nowISO(),
          confidence: 1
        }
      };
    }
    _extractClassFromTableRow(cells, date, dayName) {
      if (cells.length < 2) return null;
      const cellTexts = Array.from(cells).map((c) => cleanDOMText(c.innerText));
      let subjectName = "";
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
        subjectName = subjectName.replace(embeddedCode[0], "").trim();
      }
      if (!subjectName || subjectName.length < 2) return null;
      if (this._isSubjectBlacklisted(subjectName)) return null;
      return {
        id: deterministicId(date + subjectName + (startTime || "")),
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
          source: "Juno Student Home",
          syncedAt: nowISO(),
          confidence: 1
        }
      };
    }
    _parseScheduleFromText(text, date, dayName) {
      const classes = [];
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      let currentTime = null;
      for (const line of lines) {
        const timeMatch = line.match(/^(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)\s*(?:[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?))?$/i);
        if (timeMatch) {
          currentTime = {
            start: parseTime(timeMatch[1]),
            end: timeMatch[2] ? parseTime(timeMatch[2]) : null
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
            sync: { source: "Juno Student Home", syncedAt: nowISO(), confidence: 1 }
          });
          currentTime = null;
          continue;
        }
        if (currentTime && line.length > 2 && !/^\d/.test(line) && !line.toLowerCase().includes("schedule") && !this._isSubjectBlacklisted(line)) {
          classes.push({
            id: deterministicId(date + line + (currentTime.start || "")),
            subjectName: line.trim(),
            normalizedName: normalizeSubjectName(line),
            courseCode: null,
            date,
            dayOfWeek: dayName,
            startTime: currentTime.start,
            endTime: currentTime.end,
            matchConfidence: 0,
            sync: { source: "Juno Student Home", syncedAt: nowISO(), confidence: 1 }
          });
          currentTime = null;
        }
      }
      return classes;
    }
    parseSyllabusFaculty() {
      const tables = document.querySelectorAll("table");
      const facultyMap = {};
      for (const table of tables) {
        const headerRow = table.querySelector("thead tr, tr:first-child");
        if (!headerRow) continue;
        const headerText = headerRow.innerText.toLowerCase();
        if (!headerText.includes("faculty name") && !headerText.includes("faculty")) continue;
        const headerCells = Array.from(headerRow.querySelectorAll("th, td"));
        const headers = headerCells.map((c) => c.innerText.toLowerCase().trim());
        const codeIdx = headers.findIndex((h) => h.includes("code"));
        const facultyIdx = headers.findIndex((h) => h.includes("faculty"));
        if (codeIdx === -1 || facultyIdx === -1) continue;
        const rows = table.querySelectorAll("tbody tr, tr:not(:first-child)");
        for (const row of rows) {
          const cells = row.querySelectorAll("td");
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
      const tables = document.querySelectorAll("table");
      const subjects = [];
      for (const table of tables) {
        const headerText = (table.querySelector("thead, tr:first-child") || table).innerText.toLowerCase();
        if (!headerText.includes("attendance") && !headerText.includes("course") && !headerText.includes("subject")) {
          const tableText = table.innerText;
          if (!/\d+\s*\/\s*\d+/.test(tableText)) continue;
        }
        const rows = table.querySelectorAll("tbody tr, tr");
        const headerCells = table.querySelectorAll("thead th, thead td, tr:first-child th, tr:first-child td");
        const columns = this._detectAttendanceColumns(headerCells);
        for (const row of rows) {
          const cells = row.querySelectorAll("td");
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
        percentage: -1
      };
      const cells = Array.from(headerCells);
      cells.forEach((cell, idx) => {
        const text = (cell.innerText || "").toLowerCase().trim();
        if (text.includes("course name") || text.includes("subject name") || text.includes("course title") || text.includes("subject") || text.includes("course") || text.includes("paper")) {
          if (columns.name === -1) columns.name = idx;
        }
        if (text.includes("course code") || text.includes("sub code") || text.includes("subject code") || text.includes("code")) {
          columns.code = idx;
        }
        if (text.includes("faculty") || text.includes("teacher") || text.includes("staff")) {
          columns.faculty = idx;
        }
        if (text.includes("attended") || text.includes("present") || text.includes("classes attended") || text.includes("lec attended")) {
          columns.attended = idx;
        }
        if (text.includes("conducted") || text.includes("total") || text.includes("held") || text.includes("delivered") || text.includes("classes held") || text.includes("total classes") || text.includes("total lec")) {
          columns.conducted = idx;
        }
        if (text.includes("attendance count") || text.includes("count") || text.includes("ratio") || text.includes("attended/conducted") || text.includes("present/total")) {
          columns.fraction = idx;
        }
        if (text.includes("percentage") || text.includes("%") || text.includes("percent") || text.includes("attn %")) {
          columns.percentage = idx;
        }
      });
      return columns;
    }
    _extractSubjectFromRow(cells, columns) {
      const cellTexts = Array.from(cells).map((c) => cleanDOMText(c.innerText));
      let name = "";
      let code = "";
      let facultyName = "";
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
      if (!facultyName || facultyName === "-" || facultyName.length < 3) {
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
          if (cellText.length > 3 && !/^\d/.test(cellText) && !cellText.includes("/") && !cellText.includes("%")) {
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
      if (!name || name.toLowerCase() === "total" || name.toLowerCase().startsWith("total ")) return null;
      if (!code) {
        const embeddedCode = name.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/i);
        if (embeddedCode) {
          code = embeddedCode[1];
          name = name.replace(embeddedCode[0], "").trim();
        }
      }
      const percentage = conducted > 0 ? attended / conducted * 100 : 0;
      return {
        id: deterministicId(code || name),
        code: code ? normalizeCourseCode(code) : void 0,
        name: name.trim(),
        normalizedName: normalizeSubjectName(name),
        facultyName: facultyName || void 0,
        attended,
        conducted,
        percentage,
        displayedPercentage,
        sync: {
          source: "Juno Attendance Page",
          syncedAt: nowISO(),
          confidence: 1
        }
      };
    }
    _parseAttendanceFromCards() {
      const subjects = [];
      const cards = document.querySelectorAll('.card, .panel, [class*="attendance"], [class*="subject"], [class*="course"]');
      for (const card of cards) {
        const text = card.innerText || "";
        if (text.length < 5) continue;
        const fraction = parseAttendanceFraction(text);
        if (!fraction) continue;
        const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        let name = "";
        let code = "";
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
        const percentage = fraction.conducted > 0 ? fraction.attended / fraction.conducted * 100 : 0;
        subjects.push({
          id: deterministicId(code || name),
          code: code ? normalizeCourseCode(code) : void 0,
          name: name.trim(),
          normalizedName: normalizeSubjectName(name),
          attended: fraction.attended,
          conducted: fraction.conducted,
          percentage,
          sync: {
            source: "Juno Attendance Page",
            syncedAt: nowISO(),
            confidence: 1
          }
        });
      }
      return subjects;
    }
    _parseAttendanceFromText() {
      const bodyText = document.body ? document.body.innerText : "";
      const subjects = [];
      const pattern = /([A-Za-z][A-Za-z\s&\-:().]+?)\s+(\d+)\s*\/\s*(\d+)/g;
      let match;
      while ((match = pattern.exec(bodyText)) !== null) {
        const name = match[1].trim();
        const attended = parseInt(match[2], 10);
        const conducted = parseInt(match[3], 10);
        if (name.length < 3 || conducted === 0) continue;
        if (name.toLowerCase().includes("schedule") || name.toLowerCase().includes("attendance count")) continue;
        const percentage = attended / conducted * 100;
        subjects.push({
          id: deterministicId(name),
          name,
          normalizedName: normalizeSubjectName(name),
          attended,
          conducted,
          percentage,
          sync: {
            source: "Juno Attendance Page",
            syncedAt: nowISO(),
            confidence: 0.8
          }
        });
      }
      return subjects;
    }
    parseTimetable() {
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const text = table.innerText.toLowerCase();
        if (text.includes("course name") && (text.includes("date & day") || text.includes("start time") || text.includes("faculty name"))) {
          const parsed = this._parseStudentTimeTable(table);
          if (parsed && Object.keys(parsed.days).length > 0) {
            return parsed;
          }
        }
        const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const daysFound = dayNames.filter((d) => text.includes(d));
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
      const rows = table.querySelectorAll("tr");
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
        const ths = rows[r].querySelectorAll("th, td");
        for (let c = 0; c < ths.length; c++) {
          const text = cleanDOMText(ths[c].innerText).toLowerCase();
          if (text.includes("date") && text.includes("day")) dateColIdx = c;
          else if (text.includes("start time")) startColIdx = c;
          else if (text.includes("end time")) endColIdx = c;
          else if (text.includes("session")) sessionColIdx = c;
          else if (text.includes("course name") || text.includes("subject")) courseColIdx = c;
          else if (text.includes("faculty")) facultyColIdx = c;
          else if (text.includes("room") || text.includes("lab")) roomColIdx = c;
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
      let currentDateStr = "";
      let currentDayName = "";
      const dayNamesList = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 3) continue;
        const fullRowText = cleanDOMText(row.innerText).toLowerCase();
        if (fullRowText.includes("data not found") || fullRowText.includes("no records")) continue;
        let startTime = null;
        let endTime = null;
        let sessionNo = null;
        let courseName = null;
        let facultyName = null;
        let room = null;
        const firstCellText = cleanDOMText(cells[0].innerText);
        const isDateRow = dayNamesList.some((d) => firstCellText.toLowerCase().includes(d.toLowerCase()));
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
        if (!courseName || courseName === "-" || /^\d{1,2}:\d{2}/.test(courseName)) {
          for (let c = 0; c < cells.length; c++) {
            const txt = cleanDOMText(cells[c].innerText);
            if (txt && txt !== "-" && txt.length >= 2 && !/^\d{1,2}:\d{2}/.test(txt) && !dayNamesList.some((d) => txt.toLowerCase().includes(d.toLowerCase())) && !/^\d+$/.test(txt)) {
              courseName = txt;
              break;
            }
          }
        }
        if (!facultyName || facultyName === "-" || facultyName.length < 3) {
          for (let c = 0; c < cells.length; c++) {
            const txt = cleanDOMText(cells[c].innerText);
            if (!txt || txt === "-" || txt.length < 3) continue;
            if (/^(dr\.|prof\.|mr\.|mrs\.|ms\.|er\.|dr\s|prof\s)/i.test(txt)) {
              facultyName = txt;
              break;
            }
            const lower = txt.toLowerCase();
            if (!lower.includes("am") && !lower.includes("pm") && !lower.includes("lecture") && !lower.includes("lab") && !lower.includes("room") && !lower.includes("session") && !dayNamesList.some((d) => lower.includes(d.toLowerCase()))) {
              const parts = txt.split(/\s+/);
              if (parts.length >= 2 && parts.length <= 4 && parts.every((p) => /^[A-Z][a-z\.]*$/.test(p))) {
                facultyName = txt;
                break;
              }
            }
          }
        }
        if (!courseName || courseName === "-" || courseName.length < 2) continue;
        if (facultyName && facultyName !== "-" && courseName) {
          facultyMap[normalizeSubjectName(courseName)] = facultyName;
          facultyMap[courseName.toLowerCase().trim()] = facultyName;
        }
        const dayKey = currentDayName || "Monday";
        if (!days[dayKey]) days[dayKey] = [];
        const classEntry = {
          id: deterministicId(dayKey + courseName + (startTime || "") + r),
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
          sync: { source: "Juno stu_StudentTimeTable", syncedAt: nowISO(), confidence: 1 }
        };
        const slotKey = (startTime || "") + "_" + courseName.toLowerCase().trim();
        const existsInWeekly = days[dayKey].some((c) => (c.startTime || "") + "_" + c.subjectName.toLowerCase().trim() === slotKey);
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
        source: "stu_StudentTimeTable",
        confidence: 1,
        syncedAt: nowISO(),
        observedWeeks: 1
      };
    }
    _parseTimetableTable(table, dayNames) {
      const rows = table.querySelectorAll("tr");
      if (rows.length < 2) return null;
      const days = {};
      const today = getTodayDate();
      for (const row of rows) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 2) continue;
        const firstCell = cleanDOMText(cells[0].innerText).toLowerCase();
        const matchedDay = dayNames.find((d) => firstCell.includes(d));
        if (matchedDay) {
          const dayKey = matchedDay.charAt(0).toUpperCase() + matchedDay.slice(1);
          days[dayKey] = [];
          for (let i = 1; i < cells.length; i++) {
            const cellText = cleanDOMText(cells[i].innerText);
            if (cellText.length < 2 || cellText === "-" || cellText === "\u2014") continue;
            days[dayKey].push({
              id: deterministicId(dayKey + cellText + i),
              subjectName: cellText,
              normalizedName: normalizeSubjectName(cellText),
              date: today,
              dayOfWeek: dayKey,
              startTime: null,
              endTime: null,
              matchConfidence: 0,
              sync: { source: "Juno Timetable", syncedAt: nowISO(), confidence: 1 }
            });
          }
        }
      }
      if (Object.keys(days).length === 0) return null;
      return {
        days,
        source: "portal",
        confidence: 1,
        syncedAt: nowISO(),
        observedWeeks: 0
      };
    }
    getPortalIdentifiers() {
      return this.extractStudentInfo();
    }
    extractStudentInfo() {
      const info = {
        name: "",
        semester: "",
        branch: "",
        section: "",
        rollNo: ""
      };
      const isExcluded = (str) => {
        if (!str || str.length < 3 || str.length > 50) return true;
        const lower = str.toLowerCase().trim();
        const blocked = [
          "student",
          "student configuration",
          "student portal",
          "juno",
          "juno campus",
          "rcoem",
          "rbu",
          "operation 75",
          "attendance",
          "dashboard",
          "home",
          "academic",
          "institute",
          "facilities",
          "communication",
          "events",
          "logout",
          "login",
          "faculty",
          "course",
          "courses",
          "timetable",
          "semester",
          "branch",
          "section",
          "unknown",
          "fees",
          "hostel",
          "term( semester ):",
          "term",
          "code",
          "course name",
          "refresh"
        ];
        return blocked.some((b) => lower === b || lower.startsWith("juno ") || lower.includes("operation 75") || lower.includes("attendance"));
      };
      try {
        const candidates = document.querySelectorAll(
          "header, .header, #header, .top-bar, .topbar, .navbar, nav, table, div, span, td, font, b, strong, a"
        );
        for (const el of candidates) {
          const text = el.innerText || el.textContent || "";
          if (/\bStudent\b/i.test(text) && text.length < 150) {
            const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase() === "student") {
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
        console.warn("[JunoAdapter] Error extracting header user info:", e);
      }
      if (!info.name) {
        const selectors = [
          "#lblUserName",
          "#lblStudentName",
          "#lblUser",
          "#lblStudent",
          "#ctl00_lblUserName",
          "#ctl00_lblUser",
          "#userName",
          "#username",
          ".userName",
          ".username",
          ".studentName",
          ".user-name",
          ".profile-name",
          ".user-details .user-role",
          ".userInfo"
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const txt = (el.innerText || el.textContent || "").trim();
            if (txt && !isExcluded(txt)) {
              info.name = txt;
              break;
            }
          }
        }
      }
      if (document.body) {
        const bodyText = document.body.innerText || "";
        if (!info.name) {
          const headerMatch = bodyText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\n\s*Student\b/i);
          if (headerMatch && !isExcluded(headerMatch[1])) {
            info.name = headerMatch[1].trim();
          }
        }
        if (!info.name) {
          const nameMatch = bodyText.match(/(?:Student Name|Name of Student|Candidate Name)\s*[:\-]\s*([A-Za-z\s\.\'\-]+?)(?:\s*\(|\s*\n|\s*\[|\s*Roll|\s*Reg|\s*ID|\s*Branch|$)/i);
          if (nameMatch && !isExcluded(nameMatch[1])) {
            info.name = nameMatch[1].trim();
          }
        }
        if (!info.name) {
          const welcomeMatch = bodyText.match(/Welcome\s*,\s*([A-Za-z\s\.\'\-]+?)(?:\s*\(|\s*\n|\s*\[|$)/i);
          if (welcomeMatch && !isExcluded(welcomeMatch[1])) {
            info.name = welcomeMatch[1].trim();
          }
        }
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
      if (lower.includes("lab") || lower.includes("practical")) return "Lab";
      if (lower.includes("tutorial") || lower.includes("tut")) return "Tutorial";
      if (lower.includes("lecture") || lower.includes("lec")) return "Lecture";
      return null;
    }
    _extractLocation(text) {
      const roomMatch = text.match(/room\s*[:\-]?\s*(\w+)/i) || text.match(/\b(room\s*\d+[A-Z]?)\b/i) || text.match(/\b([A-Z]\d{3,4})\b/);
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
      const seenDates = /* @__PURE__ */ new Set();
      const rows = document.querySelectorAll("tr");
      for (const row of rows) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 2) continue;
        const rowText = cleanDOMText(row.innerText);
        const isGreen = this._isElementOrChildGreen(row);
        const isHolidayText = /holiday|vacation|jayanti|diwali|holi|eid|christmas|festival|independence|republic/i.test(rowText);
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
              isHoliday: true
            });
          }
        }
      }
      const greenElements = document.querySelectorAll('[style*="green"], [style*="#28a745"], [style*="#22c55e"], [style*="#16a34a"], [class*="success"], [class*="green"], [class*="holiday"]');
      for (const el of greenElements) {
        const container = el.closest('td, tr, .fc-event, [class*="day"], [class*="card"], li') || el;
        const text = cleanDOMText(container.innerText);
        const dateStr = this._extractDateFromText(text) || this._extractDateFromElement(container);
        if (dateStr && !seenDates.has(dateStr)) {
          let nameStr = cleanDOMText(el.innerText) || "Holiday";
          nameStr = nameStr.replace(/^\d+[\/\-.]\d+[\/\-.]\d+\s*/, "").trim();
          if (nameStr.length > 2) {
            seenDates.add(dateStr);
            holidays.push({
              date: dateStr,
              name: nameStr,
              isHoliday: true
            });
          }
        }
      }
      holidays.sort((a, b) => a.date.localeCompare(b.date));
      return { holidays, semesterEndDate };
    }
    _isElementOrChildGreen(element) {
      if (!element) return false;
      const style = element.getAttribute("style") || "";
      const className = (element.className || "").toString().toLowerCase();
      if (/green|#28a745|#22c55e|#16a34a|success|holiday/i.test(style + " " + className)) {
        return true;
      }
      const greenChild = element.querySelector('[style*="green"], [style*="#28a745"], [style*="#22c55e"], [style*="#16a34a"], [class*="success"], [class*="green"], [class*="holiday"]');
      return !!greenChild;
    }
    _extractDateFromText(text) {
      if (!text) return null;
      const dmyMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
      if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
      }
      const monMatch = text.match(/\b(\d{1,2})[\s\-]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-,]*(\d{4})\b/i);
      if (monMatch) {
        const months = {
          jan: "01",
          feb: "02",
          mar: "03",
          apr: "04",
          may: "05",
          jun: "06",
          jul: "07",
          aug: "08",
          sep: "09",
          oct: "10",
          nov: "11",
          dec: "12"
        };
        const monthNum = months[monMatch[2].toLowerCase().slice(0, 3)];
        if (monthNum) {
          return `${monMatch[3]}-${monthNum}-${monMatch[1].padStart(2, "0")}`;
        }
      }
      return null;
    }
    _extractDateFromElement(el) {
      if (!el) return null;
      const dataDate = el.getAttribute("data-date") || el.getAttribute("date") || el.getAttribute("id");
      if (dataDate && /^\d{4}-\d{2}-\d{2}$/.test(dataDate)) {
        return dataDate;
      }
      return null;
    }
    _extractHolidayName(cells, rowText) {
      if (cells && cells.length >= 2) {
        for (const cell of cells) {
          const text = cleanDOMText(cell.innerText);
          if (text.length > 2 && !/^\d+[\/\-.]\d+/.test(text) && !/^\d+$/.test(text)) {
            return text;
          }
        }
      }
      return rowText.replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g, "").replace(/holiday|vacation/gi, "").trim() || "Holiday";
    }
    _isSubjectBlacklisted(subjectName) {
      if (!subjectName) return true;
      const lower = subjectName.toLowerCase().trim();
      const blacklistExact = /* @__PURE__ */ new Set([
        "profile",
        "my profile",
        "syllabus",
        "calendar",
        "calender",
        "academic calendar",
        "academic calender",
        "timetable",
        "time table",
        "student timetable",
        "student timetable",
        "library",
        "library (0 issued)",
        "fees details",
        "fees",
        "fees detail",
        "leave details",
        "leave detail",
        "leave",
        "hostel",
        "contact mentor",
        "mentor",
        "mentoring",
        "blogs",
        "blog",
        "dashboard",
        "logout",
        "change password",
        "feedback",
        "registration",
        "exam registration",
        "result",
        "results",
        "admit card",
        "hall ticket",
        "curriculum",
        "home",
        "about",
        "contact",
        "gallery",
        "news",
        "event",
        "events",
        "admission",
        "admissions",
        "placement",
        "placements",
        "grievance",
        "alumni",
        "anti ragging",
        "download",
        "downloads",
        "course file",
        "student portfolio",
        "mentee",
        "blogs details",
        "academic schedule",
        "syllabus plan",
        "contact mentor",
        "leave details"
      ]);
      if (blacklistExact.has(lower)) return true;
      const blacklistContains = [
        "library (",
        "contact mentor",
        "leave details",
        "fees details",
        "leave report",
        "admit card",
        "change password",
        "sign out",
        "signout",
        "my profile",
        "feedback form"
      ];
      if (blacklistContains.some((term) => lower.includes(term))) return true;
      return false;
    }
  };

  // src/types/models.js
  var ExtensionState = Object.freeze({
    INITIALIZING: "INITIALIZING",
    WAITING_FOR_PORTAL: "WAITING_FOR_PORTAL",
    SCHEDULE_DETECTED: "SCHEDULE_DETECTED",
    ATTENDANCE_DETECTED: "ATTENDANCE_DETECTED",
    MATCHING: "MATCHING",
    READY: "READY",
    STALE_DATA: "STALE_DATA",
    MATCH_ERROR: "MATCH_ERROR",
    PARSER_ERROR: "PARSER_ERROR"
  });
  var PageType = Object.freeze({
    STUDENT_HOME: "student-home",
    ATTENDANCE: "attendance",
    TIMETABLE: "timetable",
    UNKNOWN: "unknown"
  });
  var RecommendationType = Object.freeze({
    MUST_ATTEND: "MUST_ATTEND",
    ATTEND_LOW_BUFFER: "ATTEND_LOW_BUFFER",
    BUNK_SAFE: "BUNK_SAFE",
    OPTIONAL: "OPTIONAL",
    DATA_NOT_VERIFIED: "DATA_NOT_VERIFIED",
    HIGH_RISK: "HIGH_RISK"
  });
  var RiskLevel = Object.freeze({
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
    SAFE: "SAFE"
  });
  var MatchMethod = Object.freeze({
    COURSE_CODE_EXACT: "COURSE_CODE_EXACT",
    COURSE_CODE_PARTIAL: "COURSE_CODE_PARTIAL",
    NAME_EXACT: "NAME_EXACT",
    NAME_FUZZY: "NAME_FUZZY",
    USER_ALIAS: "USER_ALIAS",
    PORTAL_ID: "PORTAL_ID",
    UNMATCHED: "UNMATCHED"
  });
  var MessageType = Object.freeze({
    SCHEDULE_PARSED: "SCHEDULE_PARSED",
    ATTENDANCE_PARSED: "ATTENDANCE_PARSED",
    TIMETABLE_PARSED: "TIMETABLE_PARSED",
    CALENDAR_PARSED: "CALENDAR_PARSED",
    PAGE_DETECTED: "PAGE_DETECTED",
    FACULTY_PARSED: "FACULTY_PARSED",
    STUDENT_INFO_PARSED: "STUDENT_INFO_PARSED",
    INJECT_RECOMMENDATIONS: "INJECT_RECOMMENDATIONS",
    INJECT_ATTENDANCE_ENHANCEMENTS: "INJECT_ATTENDANCE_ENHANCEMENTS",
    GET_TODAY_PLAN: "GET_TODAY_PLAN",
    GET_STATE: "GET_STATE",
    GET_SUBJECTS: "GET_SUBJECTS",
    GET_HOLIDAYS: "GET_HOLIDAYS",
    GET_DEBUG_INFO: "GET_DEBUG_INFO",
    GET_PREFERENCES: "GET_PREFERENCES",
    SAVE_PREFERENCES: "SAVE_PREFERENCES",
    FORCE_RESYNC: "FORCE_RESYNC",
    EXPORT_DATA: "EXPORT_DATA",
    CLEAR_DATA: "CLEAR_DATA",
    SAVE_ALIAS: "SAVE_ALIAS",
    GET_WHAT_IF: "GET_WHAT_IF",
    GET_PROJECTIONS: "GET_PROJECTIONS",
    GET_STUDENT_INFO: "GET_STUDENT_INFO",
    OPEN_OPTIONS: "OPEN_OPTIONS",
    USER_LOGGED_OUT: "USER_LOGGED_OUT",
    RESET_SESSION: "RESET_SESSION"
  });
  var DEFAULT_PREFERENCES = Object.freeze({
    subjectTarget: 60,
    overallTarget: 75,
    safetyBuffer: 2,
    preferredBunkDays: [],
    semesterEndDate: null,
    portalDomain: "rcoem.in",
    aliasMap: {},
    debugMode: false,
    staleDataThresholdHours: 48,
    firstRunComplete: false
  });

  // src/content/schedule-injector.js
  var INJECTOR_ATTR = "data-ai-injected";
  function injectScheduleRecommendations(recommendations, classes, lastSyncTime, isStale) {
    removeInjectedContent();
    const scheduleContainer = findScheduleContainer();
    if (!scheduleContainer) return;
    const scheduleItems = findScheduleItems(scheduleContainer);
    if (scheduleItems.length === 0) {
      injectSummaryCard(scheduleContainer, recommendations, lastSyncTime, isStale);
      return;
    }
    for (const item of scheduleItems) {
      const matchingRec = findMatchingRecommendation(item, recommendations, classes);
      if (matchingRec) {
        injectRecommendationCard(item.element, matchingRec, lastSyncTime);
      }
    }
    injectSyncStatus(scheduleContainer, lastSyncTime, isStale);
  }
  function removeInjectedContent() {
    const existing = document.querySelectorAll(`[${INJECTOR_ATTR}]`);
    existing.forEach((el) => el.remove());
  }
  function findScheduleContainer() {
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      const directText = getDirectText(el).toLowerCase();
      if (directText.includes("today's schedule") || directText.includes("todays schedule")) {
        return el.parentElement || el;
      }
    }
    return null;
  }
  function findScheduleItems(container) {
    const items = [];
    const selectors = [
      "tr:not(:first-child)",
      "li",
      ".schedule-item",
      ".class-item",
      '[class*="schedule-row"]',
      '[class*="class-row"]',
      '[class*="period"]',
      ".row",
      ".card"
    ];
    for (const selector of selectors) {
      const elements = container.querySelectorAll(selector);
      if (elements.length >= 1) {
        for (const el of elements) {
          const text = el.innerText || "";
          if (text.trim().length > 3 && !text.toLowerCase().includes("today's schedule")) {
            items.push({ element: el, text: text.trim() });
          }
        }
        if (items.length > 0) return items;
      }
    }
    for (const child of container.children) {
      const text = child.innerText || "";
      if (text.trim().length > 3 && !text.toLowerCase().includes("today's schedule")) {
        items.push({ element: child, text: text.trim() });
      }
    }
    return items;
  }
  function findMatchingRecommendation(item, recommendations, classes) {
    const itemTextLower = item.text.toLowerCase();
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const cls = classes[i];
      if (!cls) continue;
      const subjectLower = (cls.subjectName || "").toLowerCase();
      const normalizedLower = (cls.normalizedName || "").toLowerCase();
      if (subjectLower && (itemTextLower.includes(subjectLower) || subjectLower.includes(itemTextLower.substring(0, 20)))) {
        return rec;
      }
      if (normalizedLower && itemTextLower.includes(normalizedLower)) {
        return rec;
      }
      if (cls.courseCode && itemTextLower.includes(cls.courseCode.toLowerCase())) {
        return rec;
      }
    }
    return null;
  }
  function injectRecommendationCard(afterElement, rec, lastSyncTime) {
    const card = document.createElement("div");
    card.setAttribute(INJECTOR_ATTR, "true");
    card.style.cssText = `
    margin: 8px 0;
    padding: 12px 16px;
    border-radius: 10px;
    border-left: 4px solid ${rec.borderColor};
    background: ${rec.bgColor};
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.5;
    backdrop-filter: blur(10px);
    transition: all 0.2s ease;
  `;
    const header = document.createElement("div");
    header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  `;
    const badge = document.createElement("span");
    badge.style.cssText = `
    font-weight: 700;
    font-size: 13px;
    color: ${rec.color};
    letter-spacing: 0.3px;
  `;
    badge.textContent = rec.label;
    header.appendChild(badge);
    const percentage = document.createElement("span");
    percentage.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    color: ${rec.color};
  `;
    percentage.textContent = rec.currentPercentage > 0 ? `${rec.currentPercentage.toFixed(1)}%` : "";
    header.appendChild(percentage);
    card.appendChild(header);
    if (rec.ifAttendPercentage > 0) {
      const whatIf = document.createElement("div");
      whatIf.style.cssText = `
      display: flex;
      gap: 16px;
      margin: 6px 0;
      font-size: 12px;
      color: #666;
    `;
      whatIf.innerHTML = `
      <span>If attend: <strong style="color:#22c55e">${rec.ifAttendPercentage.toFixed(2)}%</strong></span>
      <span>If bunk: <strong style="color:#ef4444">${rec.ifBunkPercentage.toFixed(2)}%</strong></span>
    `;
      card.appendChild(whatIf);
    }
    const reason = document.createElement("div");
    reason.style.cssText = `
    font-size: 11.5px;
    color: #888;
    margin-top: 4px;
    line-height: 1.4;
  `;
    reason.textContent = rec.reason;
    card.appendChild(reason);
    if (rec.mathBreakdown) {
      const whyBtn = document.createElement("button");
      whyBtn.textContent = "WHY?";
      whyBtn.style.cssText = `
      margin-top: 8px;
      padding: 4px 12px;
      border: 1px solid ${rec.borderColor};
      border-radius: 6px;
      background: transparent;
      color: ${rec.color};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.5px;
      transition: all 0.15s ease;
    `;
      whyBtn.addEventListener("mouseenter", () => {
        whyBtn.style.background = rec.bgColor;
      });
      whyBtn.addEventListener("mouseleave", () => {
        whyBtn.style.background = "transparent";
      });
      const breakdown = document.createElement("pre");
      breakdown.style.cssText = `
      display: none;
      margin-top: 8px;
      padding: 10px;
      background: rgba(0,0,0,0.05);
      border-radius: 6px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      line-height: 1.6;
      color: #555;
      white-space: pre-wrap;
      word-break: break-word;
    `;
      breakdown.textContent = rec.mathBreakdown;
      whyBtn.addEventListener("click", () => {
        breakdown.style.display = breakdown.style.display === "none" ? "block" : "none";
        whyBtn.textContent = breakdown.style.display === "none" ? "WHY?" : "HIDE";
      });
      card.appendChild(whyBtn);
      card.appendChild(breakdown);
    }
    afterElement.parentNode.insertBefore(card, afterElement.nextSibling);
  }
  function injectSummaryCard(container, recommendations, lastSyncTime, isStale) {
    const card = document.createElement("div");
    card.setAttribute(INJECTOR_ATTR, "true");
    card.style.cssText = `
    margin: 12px 0;
    padding: 14px 16px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
    const title = document.createElement("div");
    title.style.cssText = `
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 10px;
    letter-spacing: 0.3px;
  `;
    title.textContent = "RCOEM ATTENDANCE SE BACHO YOJNA";
    card.appendChild(title);
    if (isStale) {
      const staleWarning = document.createElement("div");
      staleWarning.style.cssText = `
      padding: 8px 12px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      font-size: 12px;
      color: #b45309;
      margin-bottom: 10px;
    `;
      staleWarning.textContent = `Attendance cache may be outdated. Last synced ${relativeTime(lastSyncTime)}. Open Attendance page to refresh.`;
      card.appendChild(staleWarning);
    }
    for (const rec of recommendations) {
      const row = document.createElement("div");
      row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12.5px;
    `;
      const left = document.createElement("span");
      left.innerHTML = `<strong>${rec.subjectName || "Unknown"}</strong>`;
      row.appendChild(left);
      const right = document.createElement("span");
      right.style.cssText = `font-size: 11px; color: ${rec.color}; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${rec.bgColor}; border: 1px solid ${rec.borderColor};`;
      right.textContent = rec.label;
      row.appendChild(right);
      card.appendChild(row);
    }
    if (lastSyncTime) {
      const sync = document.createElement("div");
      sync.style.cssText = `
      margin-top: 8px;
      font-size: 11px;
      color: #64748b;
      text-align: right;
    `;
      sync.textContent = `Attendance synced ${relativeTime(lastSyncTime)}`;
      card.appendChild(sync);
    }
    container.appendChild(card);
  }
  function injectSyncStatus(container, lastSyncTime, isStale) {
    const status = document.createElement("div");
    status.setAttribute(INJECTOR_ATTR, "true");
    status.style.cssText = `
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 11px;
    text-align: right;
    color: ${isStale ? "#b45309" : "#64748b"};
    background: ${isStale ? "#fffbeb" : "transparent"};
  `;
    if (lastSyncTime) {
      status.textContent = `Attendance synced ${relativeTime(lastSyncTime)}`;
    } else {
      status.textContent = "No attendance data. Open Attendance page to sync.";
    }
    container.appendChild(status);
  }
  function getDirectText(el) {
    return Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim();
  }
  function injectDashboardCounterCard(plan, studentInfo, lastSync, isStale) {
    const floatingRoot = document.getElementById("ai-floating-widget-root");
    if (floatingRoot) floatingRoot.remove();
    const existingCard = document.getElementById("ai-operation75-dashboard-card");
    if (existingCard) existingCard.remove();
    let cardRow = null;
    let placementCard = null;
    const allContainers = Array.from(document.querySelectorAll("div, tr, tbody, table, section, ul"));
    for (const container of allContainers) {
      const text = (container.innerText || "").toLowerCase();
      if (text.includes("announcements") && text.includes("attendance") && text.includes("assessment") && text.includes("task") && text.includes("placement")) {
        const statChildren = Array.from(container.children).filter((child) => {
          const ct = (child.innerText || "").toLowerCase();
          return ct.includes("announcements") || ct.includes("attendance") || ct.includes("assessment") || ct.includes("task") || ct.includes("placement");
        });
        if (statChildren.length >= 4) {
          cardRow = container;
          placementCard = statChildren.find((c) => (c.innerText || "").toLowerCase().includes("placement")) || statChildren[statChildren.length - 1];
          break;
        }
      }
    }
    if (!cardRow || !placementCard) {
      console.log("[Attendance Insights] Top 5-card dashboard row not found yet");
      return;
    }
    const realCard = placementCard;
    const overallPct = plan?.overallPercentage || 0;
    const target = plan?.overallTarget || 75;
    const isBelow = overallPct < target;
    const overallColor = isBelow ? "#dc2626" : "#16a34a";
    const overallConducted = plan?.overallConducted || 0;
    const overallAttended = plan?.overallAttended || 0;
    let metricTop = "75%";
    let metricSub = "Operation 75";
    if (isBelow && target < 100 && overallConducted > 0) {
      const needed = Math.max(1, Math.ceil((target * overallConducted - 100 * overallAttended) / (100 - target)));
      metricTop = `Need ${needed}`;
      metricSub = "To 75% Target";
    } else if (!isBelow && overallConducted > 0) {
      const safeBunks = Math.max(0, Math.floor((100 * overallAttended - target * overallConducted) / target));
      metricTop = `${safeBunks}`;
      metricSub = "Safe Bunks";
    } else if (overallPct > 0) {
      metricTop = `${overallPct.toFixed(1)}%`;
      metricSub = "Overall Attendance";
    }
    const newCardWrapper = realCard.cloneNode(true);
    newCardWrapper.id = "ai-operation75-dashboard-card";
    newCardWrapper.setAttribute(INJECTOR_ATTR, "true");
    newCardWrapper.style.cursor = "pointer";
    newCardWrapper.style.position = "relative";
    const innerElements = Array.from(newCardWrapper.querySelectorAll("*"));
    const footerEl = innerElements.find((el) => {
      const t = (el.innerText || "").trim().toLowerCase();
      return t === "placement" || t === "task" || t === "assessment" || t === "attendance" || t === "announcements";
    });
    if (footerEl) {
      footerEl.innerText = "Operation 75";
      footerEl.style.backgroundColor = "#02529c";
      footerEl.style.color = "#ffffff";
    }
    const valueEl = innerElements.find((el) => {
      const t = (el.innerText || "").trim();
      return /^\d+(\.\d+)?%?$/.test(t) && el !== footerEl;
    });
    if (valueEl) {
      valueEl.innerText = metricTop;
    }
    let detailsModal = document.getElementById("ai-operation75-details-modal");
    if (detailsModal) detailsModal.remove();
    detailsModal = document.createElement("div");
    detailsModal.id = "ai-operation75-details-modal";
    detailsModal.setAttribute(INJECTOR_ATTR, "true");
    detailsModal.style.cssText = `
    display: block;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-6px) scale(0.98);
    position: fixed;
    width: 320px;
    background: #ffffff;
    border: 1px solid #c8d6e5;
    border-radius: 6px;
    box-shadow: 0 14px 35px rgba(0, 0, 0, 0.22);
    z-index: 99999999;
    padding: 12px;
    text-align: left;
    color: #333333;
    font-family: Arial, sans-serif;
    box-sizing: border-box;
    transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  `;
    const dateWisePlanner = plan?.dateWiseBunkPlanner || [];
    const weeklyPlanner = plan?.weeklyBunkPlanner || null;
    const daysList = weeklyPlanner ? Object.keys(weeklyPlanner) : [];
    const hasDateWise = dateWisePlanner.length > 0;
    detailsModal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eef2f6;padding-bottom:8px;margin-bottom:8px;">
      <div>
        <div style="font-size:12px;font-weight:800;color:#02529c;">RCOEM/RBU OPERATION 75</div>
        ${studentInfo?.name ? `<div style="font-size:10.5px;color:#555555;font-weight:600;">${studentInfo.name}</div>` : ""}
      </div>
      <button id="ai-btn-close-modal" style="background:none;border:none;cursor:pointer;font-size:18px;color:#888888;font-weight:bold;line-height:1;padding:0 4px;transition:color 0.15s ease;">\xD7</button>
    </div>

    <!-- Navigation Tabs -->
    <div style="display:flex;gap:4px;background:#f1f5f9;padding:3px;border-radius:5px;margin-bottom:10px;">
      <button id="ai-tab-today" style="flex:1;background:#ffffff;border:none;border-radius:4px;padding:4px 6px;font-size:10.5px;font-weight:700;color:#02529c;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.08);">
        Today's Plan
      </button>
      <button id="ai-tab-bunkdates" style="flex:1;background:transparent;border:none;border-radius:4px;padding:4px 6px;font-size:10.5px;font-weight:700;color:#64748b;cursor:pointer;">
        Bunk Dates & Planner
      </button>
    </div>

    <!-- Overall Attendance Card -->
    <div style="background:#f4f7fb;padding:8px 10px;border-radius:4px;border:1px solid #d8ebf9;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:18px;font-weight:800;color:${overallColor};">${overallPct > 0 ? overallPct.toFixed(2) + "%" : "\u2014"}</div>
        <div style="font-size:10px;color:#666666;font-weight:600;">Overall Attendance</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10.5px;color:#333333;">Target: <strong>${target}%</strong></div>
        <div style="font-size:10.5px;font-weight:700;color:${overallColor};">${isBelow ? `Need ${metricTop.replace("Need ", "")} classes` : `Safe to bunk: ${metricTop}`}</div>
      </div>
    </div>

    <!-- View 1: Today's Plan -->
    <div id="ai-view-today">
      <div style="font-size:10.5px;font-weight:700;color:#02529c;text-transform:uppercase;margin-bottom:6px;">Today's Lectures</div>
      ${plan?.recommendations && plan.recommendations.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:5px;max-height:160px;overflow-y:auto;">
          ${plan.recommendations.map((r) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;transition:background 0.12s ease;">
              <div style="min-width:0;flex:1;margin-right:6px;">
                <div style="font-size:10.5px;font-weight:700;color:#222222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.subjectName}</div>
                <div style="font-size:9.5px;color:#666666;">Bunk: <strong>${r.immediateSafeBunks ?? 0}</strong> &bull; Term: <strong>${r.safeBunksRemaining ?? 0}</strong></div>
              </div>
              <span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;background:${r.type === "BUNK_SAFE" ? "#f0fdf4" : "#fef2f2"};color:${r.type === "BUNK_SAFE" ? "#16a34a" : "#dc2626"};">${r.label || "Lecture"}</span>
            </div>
          `).join("")}
        </div>
      ` : `
        <div style="font-size:10.5px;color:#777777;text-align:center;padding:8px;background:#f8fafc;border-radius:3px;border:1px dashed #d2d2d2;">
          No classes scheduled for today
        </div>
      `}
    </div>

    <!-- View 2: Bunk Dates & Calendar -->
    <div id="ai-view-bunkdates" style="display:none;">
      <div style="font-size:10.5px;font-weight:700;color:#02529c;text-transform:uppercase;margin-bottom:6px;">Date-Wise Bunk Planner</div>
      ${hasDateWise ? `
        <div style="display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;padding-right:2px;">
          ${dateWisePlanner.map((item) => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <strong style="font-size:10.5px;color:#1e293b;">${item.dateStr}</strong>
                <span style="font-size:9px;font-weight:700;color:${item.verdictColor};padding:1px 6px;border-radius:3px;background:${item.verdict === "FULL_DAY_SAFE" ? "#f0fdf4" : item.verdict === "PARTIAL_SAFE" ? "#fffbeb" : "#fef2f2"};">
                  ${item.verdictText}
                </span>
              </div>
              <div style="font-size:9.5px;color:#64748b;display:flex;flex-direction:column;gap:3px;">
                ${item.classes.map((c) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:#ffffff;border:1px solid #e2e8f0;border-radius:3px;padding:3px 6px;">
                    <span style="font-weight:600;color:#334155;">${c.subjectName} ${c.startTime ? `(${c.startTime})` : ""}</span>
                    <span style="font-weight:700;color:${c.color};">${c.label}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      ` : daysList.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;padding-right:2px;">
          ${daysList.map((dName) => {
      const d = weeklyPlanner[dName];
      return `
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                  <strong style="font-size:11px;color:#1e293b;">${d.day}</strong>
                  <span style="font-size:9.5px;font-weight:700;color:${d.verdictColor};padding:1px 6px;border-radius:3px;background:${d.verdict === "BUNK_DAY_SAFE" ? "#f0fdf4" : d.verdict === "PARTIAL_SAFE" ? "#fffbeb" : "#fef2f2"};">
                    ${d.verdictText}
                  </span>
                </div>
                <div style="font-size:9.5px;color:#64748b;display:flex;flex-wrap:wrap;gap:4px;">
                  ${d.classes.map((c) => `<span style="background:#ffffff;border:1px solid #e2e8f0;border-radius:2px;padding:1px 4px;color:${c.color};font-weight:600;">${c.subjectName}: ${c.label}</span>`).join("")}
                </div>
              </div>
            `;
    }).join("")}
        </div>
      ` : `
        <div style="font-size:10.5px;color:#777777;text-align:center;padding:10px;background:#f8fafc;border-radius:3px;border:1px dashed #d2d2d2;">
          Open <strong>stu_StudentTimeTable.htm</strong> to sync full schedule
        </div>
      `}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid #eef2f6;">
      <button id="ai-btn-open-settings" style="background:#02529c;color:#ffffff;border:none;border-radius:3px;padding:5px 10px;font-size:10.5px;font-weight:700;cursor:pointer;transition:opacity 0.15s ease;">Settings & Target</button>
      <span style="font-size:9px;color:#888888;">${lastSync ? `Synced ${relativeTime(lastSync)}` : ""}</span>
    </div>
  `;
    const tabToday = detailsModal.querySelector("#ai-tab-today");
    const tabBunkDates = detailsModal.querySelector("#ai-tab-bunkdates");
    const viewToday = detailsModal.querySelector("#ai-view-today");
    const viewBunkDates = detailsModal.querySelector("#ai-view-bunkdates");
    tabToday?.addEventListener("click", (e) => {
      e.stopPropagation();
      tabToday.style.background = "#ffffff";
      tabToday.style.color = "#02529c";
      tabToday.style.boxShadow = "0 1px 2px rgba(0,0,0,0.08)";
      tabBunkDates.style.background = "transparent";
      tabBunkDates.style.color = "#64748b";
      tabBunkDates.style.boxShadow = "none";
      viewToday.style.display = "block";
      viewBunkDates.style.display = "none";
    });
    tabBunkDates?.addEventListener("click", (e) => {
      e.stopPropagation();
      tabBunkDates.style.background = "#ffffff";
      tabBunkDates.style.color = "#02529c";
      tabBunkDates.style.boxShadow = "0 1px 2px rgba(0,0,0,0.08)";
      tabToday.style.background = "transparent";
      tabToday.style.color = "#64748b";
      tabToday.style.boxShadow = "none";
      viewToday.style.display = "none";
      viewBunkDates.style.display = "block";
    });
    document.body.appendChild(detailsModal);
    if (realCard.nextSibling) {
      cardRow.insertBefore(newCardWrapper, realCard.nextSibling);
    } else {
      cardRow.appendChild(newCardWrapper);
    }
    console.log("[Attendance Insights] Operation 75 Counter Card successfully mounted");
    const hideModal = () => {
      detailsModal.style.opacity = "0";
      detailsModal.style.transform = "translateY(-6px) scale(0.98)";
      detailsModal.style.pointerEvents = "none";
    };
    const showModal = () => {
      const rect = newCardWrapper.getBoundingClientRect();
      detailsModal.style.top = `${rect.bottom + 6}px`;
      detailsModal.style.left = `${Math.max(10, rect.right - 320)}px`;
      detailsModal.style.opacity = "1";
      detailsModal.style.transform = "translateY(0) scale(1)";
      detailsModal.style.pointerEvents = "auto";
    };
    newCardWrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = detailsModal.style.opacity === "1";
      if (isVisible) {
        hideModal();
      } else {
        showModal();
      }
    });
    detailsModal.querySelector("#ai-btn-close-modal")?.addEventListener("click", (e) => {
      e.stopPropagation();
      hideModal();
    });
    detailsModal.querySelector("#ai-btn-open-settings")?.addEventListener("click", (e) => {
      e.stopPropagation();
      try {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      } catch (err) {
      }
    });
    document.addEventListener("click", (e) => {
      if (!newCardWrapper.contains(e.target) && !detailsModal.contains(e.target)) {
        hideModal();
      }
    });
  }
  function injectFloatingDashboard(plan, studentInfo, lastSync, isStale) {
    injectDashboardCounterCard(plan, studentInfo, lastSync, isStale);
  }
  function injectTimetableEnhancements(timetable, subjects = [], preferences = {}, projections = []) {
    const existingToolbar = document.getElementById("ai-timetable-toolbar");
    if (existingToolbar) existingToolbar.remove();
    const existingQuickBtn = document.getElementById("ai-quick-sem-btn");
    if (existingQuickBtn) existingQuickBtn.remove();
    const allTables = Array.from(document.querySelectorAll("table"));
    const timetableTable = allTables.find((t) => {
      const text = t.innerText.toLowerCase();
      return text.includes("course name") && (text.includes("date & day") || text.includes("start time") || text.includes("faculty name"));
    });
    const dateInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="date"], input:not([type="hidden"]):not([type="submit"]):not([type="button"])'));
    const toInput = dateInputs.find((i) => (i.id || i.name || "").toLowerCase().includes("to") || (i.placeholder || "").toLowerCase().includes("to")) || (dateInputs.length >= 2 ? dateInputs[1] : null);
    const submitBtn = document.querySelector('input[type="submit"], button[type="submit"], input[value*="Submit"], button') || Array.from(document.querySelectorAll("input, button")).find((b) => (b.value || b.innerText || "").toLowerCase().includes("submit"));
    const semesterEnd = preferences.semesterEndDate || getDynamicSemesterEndDate();
    if (submitBtn && submitBtn.parentElement) {
      const quickSemBtn = document.createElement("button");
      quickSemBtn.id = "ai-quick-sem-btn";
      quickSemBtn.type = "button";
      quickSemBtn.setAttribute(INJECTOR_ATTR, "true");
      quickSemBtn.style.cssText = `
      background: #02529c;
      color: #ffffff;
      border: 1px solid #003d75;
      border-radius: 4px;
      padding: 4px 12px;
      margin-left: 8px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      vertical-align: middle;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      transition: background 0.15s ease;
    `;
      quickSemBtn.innerHTML = "Auto-Fetch to Sem End";
      quickSemBtn.title = `Auto-fill To Date to ${semesterEnd} and fetch semester schedule`;
      quickSemBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerSemesterFetch();
      });
      submitBtn.parentElement.appendChild(quickSemBtn);
    }
    const toolbar = document.createElement("div");
    toolbar.id = "ai-timetable-toolbar";
    toolbar.setAttribute(INJECTOR_ATTR, "true");
    toolbar.style.cssText = `
    background: #f4f7fb;
    border: 1px solid #c8d6e5;
    border-radius: 6px;
    padding: 10px 16px;
    margin: 12px 0 16px 0;
    font-family: Arial, sans-serif;
    color: #222222;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  `;
    toolbar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="background:#02529c;color:#ffffff;font-size:11.5px;font-weight:800;padding:4px 8px;border-radius:4px;letter-spacing:0.3px;">
        OPERATION 75
      </div>
      <div style="font-size:12.5px;font-weight:700;color:#02529c;">
        Date-Wise Timetable & Bunk Planner
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <button id="ai-btn-autofill-semend" style="background:#02529c;color:#ffffff;border:none;border-radius:4px;padding:6px 14px;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;">
        Auto-Fetch Full Semester Schedule (To: ${semesterEnd})
      </button>
    </div>
  `;
    function triggerSemesterFetch() {
      if (toInput) {
        const d = new Date(semesterEnd);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const formattedDate = `${months[d.getMonth()]} ${d.getDate()},${d.getFullYear()}`;
        toInput.value = formattedDate;
        toInput.dispatchEvent(new Event("change", { bubbles: true }));
        toInput.dispatchEvent(new Event("input", { bubbles: true }));
        if (submitBtn) {
          submitBtn.click();
        }
      }
    }
    toolbar.querySelector("#ai-btn-autofill-semend")?.addEventListener("click", (e) => {
      e.preventDefault();
      triggerSemesterFetch();
    });
    if (timetableTable) {
      let mountTarget = timetableTable;
      while (mountTarget.parentElement && mountTarget.parentElement !== document.body && !mountTarget.parentElement.matches("form, .container, #content, body")) {
        mountTarget = mountTarget.parentElement;
      }
      mountTarget.parentElement.insertBefore(toolbar, mountTarget);
    } else {
      const form = document.querySelector("form") || document.body;
      form.prepend(toolbar);
    }
    if (!timetableTable) return;
    const rows = timetableTable.querySelectorAll("tr");
    const target = preferences.overallTarget || 75;
    const dayNamesList = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const simState = {};
    for (const s of subjects || []) {
      const key = s.id || s.name;
      simState[key] = {
        attended: s.attended || 0,
        conducted: s.conducted || 0,
        basePercentage: s.percentage || 0
      };
    }
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.hasAttribute("data-ai-enhanced")) continue;
      const cells = row.querySelectorAll("td");
      if (cells.length < 3) continue;
      const fullRowText = (row.innerText || "").toLowerCase();
      if (fullRowText.includes("data not found") || fullRowText.includes("no records")) continue;
      let courseCell = null;
      const firstCellText = (cells[0]?.innerText || "").trim();
      const isDateRow = dayNamesList.some((d) => firstCellText.toLowerCase().includes(d.toLowerCase()));
      if (isDateRow && cells.length >= 5) {
        courseCell = cells[4];
      } else if (!isDateRow && cells.length >= 4) {
        courseCell = cells[3];
      }
      if (!courseCell || (courseCell.innerText || "").trim() === "-" || /^\d{1,2}:\d{2}/.test((courseCell.innerText || "").trim())) {
        for (let c = 0; c < cells.length; c++) {
          const txt = (cells[c].innerText || "").trim();
          if (txt && txt !== "-" && txt.length >= 2 && !/^\d{1,2}:\d{2}/.test(txt) && !dayNamesList.some((d) => txt.toLowerCase().includes(d.toLowerCase())) && !/^\d+$/.test(txt) && !txt.includes("Shared Documents")) {
            courseCell = cells[c];
            break;
          }
        }
      }
      if (!courseCell) continue;
      const courseText = row.getAttribute("data-original-course") || (courseCell.innerText || "").trim();
      if (!courseText || courseText === "-" || courseText.length < 2) continue;
      row.setAttribute("data-original-course", courseText);
      const rawNorm = courseText.toLowerCase().trim();
      const cleanNorm = courseText.replace(/\s*\([^)]*\)/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().trim();
      const isPracticalClass = rawNorm.includes("(p)") || rawNorm.includes("lab") || rawNorm.includes("practical");
      let rowFacultyName = null;
      for (let c = 0; c < cells.length; c++) {
        const txt = (cells[c]?.innerText || "").trim();
        if (/^(dr\.|prof\.|mr\.|mrs\.|ms\.|er\.|dr\s|prof\s)/i.test(txt)) {
          rowFacultyName = txt;
          break;
        }
      }
      const matchedSubject = (subjects || []).find((s) => {
        const sName = (s.name || "").toLowerCase();
        const sFaculty = (s.facultyName || "").toLowerCase().trim();
        const isSubPractical = sName.includes("lab") || sName.includes("practical") || sName.includes("(p)") || sName.includes("pr");
        if (isPracticalClass !== isSubPractical) return false;
        if (sName === rawNorm) return true;
        if (rawNorm.length >= 6 && (sName.includes(rawNorm) || rawNorm.includes(sName))) return true;
        const words = sName.replace(/\s*\([^)]*\)/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter((w) => {
          const lw = w.toLowerCase();
          return lw.length > 0 && !["and", "a", "an", "or", "of", "the", "in", "for", "to", "with", "&", "at", "on", "by", "from", "ii", "iii", "iv", "lab", "practical", "pr", "p"].includes(lw);
        });
        const acronym = words.map((w) => w[0]).join("").toLowerCase();
        const allWordsAcronym = sName.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 0).map((w) => w[0]).join("").toLowerCase();
        if (cleanNorm.length >= 2 && cleanNorm.length <= 8) {
          return acronym === cleanNorm || allWordsAcronym === cleanNorm || sName.toLowerCase().includes(`(${cleanNorm})`);
        }
        return false;
      });
      const fullSubjectName = matchedSubject ? matchedSubject.name : courseText;
      let badgeHtml = "";
      if (matchedSubject) {
        const subKey = matchedSubject.id || matchedSubject.name;
        if (!simState[subKey]) {
          simState[subKey] = {
            attended: matchedSubject.attended || 0,
            conducted: matchedSubject.conducted || 0,
            basePercentage: matchedSubject.percentage || 0
          };
        }
        const sim = simState[subKey];
        const prevPct = sim.conducted > 0 ? sim.attended / sim.conducted * 100 : 0;
        sim.attended += 1;
        sim.conducted += 1;
        const newPct = sim.conducted > 0 ? sim.attended / sim.conducted * 100 : 0;
        const isBelow = newPct < target;
        const safeBunks = Math.max(0, Math.floor((100 * sim.attended - target * sim.conducted) / target));
        if (matchedSubject.conducted === 0) {
          badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:600;background:#f8fafc;color:#02529c;border:1px solid #d8ebf9;border-radius:3px;">TARGET ${target}%</span>`;
        } else if (isBelow) {
          badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:700;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:3px;">MUST ATTEND (${newPct.toFixed(1)}%)</span>`;
        } else if (prevPct < target && newPct >= target) {
          badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:700;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:3px;">TARGET ACHIEVED (${newPct.toFixed(1)}%)</span>`;
        } else {
          badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:700;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:3px;">SAFE TO BUNK (${safeBunks} safe &bull; ${newPct.toFixed(1)}%)</span>`;
        }
        courseCell.innerHTML = `<span style="font-weight:700;color:#02529c;">${fullSubjectName}</span> ${badgeHtml}`;
      } else {
        const badgeText = isPracticalClass ? "LAB (P)" : "LECTURE";
        const badgeColor = isPracticalClass ? "#7c3aed" : "#02529c";
        const badgeBg = isPracticalClass ? "#f5f3ff" : "#f8fafc";
        const badgeBorder = isPracticalClass ? "#ddd6fe" : "#d8ebf9";
        badgeHtml = `<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:9.5px;font-weight:600;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};border-radius:3px;">${badgeText}</span>`;
        courseCell.innerHTML = `<span style="font-weight:700;color:#02529c;">${fullSubjectName}</span> ${badgeHtml}`;
      }
      row.setAttribute("data-ai-enhanced", "true");
    }
  }

  // src/engine/attendance-calculator.js
  function formatPercentage(pct) {
    if (typeof pct !== "number" || isNaN(pct)) return "\u2014";
    return pct.toFixed(2);
  }

  // src/content/attendance-injector.js
  var INJECTOR_ATTR2 = "data-ai-attendance-injected";
  function injectAttendanceEnhancements(projections, subjects, overallPercentage, overallTarget, syncTime) {
    removeAttendanceInjections();
    injectOverviewCard(subjects, overallPercentage, overallTarget, syncTime);
    enhanceAttendanceTable(projections, subjects, overallPercentage, overallTarget);
    if (!document.querySelector(`table [${INJECTOR_ATTR2}]`)) {
      injectProjectionCards(projections);
    }
  }
  function removeAttendanceInjections() {
    document.querySelectorAll(`[${INJECTOR_ATTR2}]`).forEach((el) => el.remove());
  }
  function injectOverviewCard(subjects, overallPct, target, syncTime) {
    const container = document.querySelector("table")?.parentElement || document.querySelector('[class*="attendance"]') || document.body;
    const card = document.createElement("div");
    card.setAttribute(INJECTOR_ATTR2, "true");
    card.style.cssText = `
    margin: 16px 0;
    background: #ffffff;
    border: 1px solid #d2d2d2;
    border-radius: 4px;
    color: #333333;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  `;
    const header = document.createElement("div");
    header.style.cssText = `
    background: #02529c;
    color: #ffffff;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
    header.innerHTML = `
    <span>ATTENDANCE ADVISOR \u2014 BACHO YOJNA</span>
    <span style="font-size:10px;opacity:0.85;font-weight:400">Synced ${relativeTime(syncTime)}</span>
  `;
    card.appendChild(header);
    const stats = document.createElement("div");
    stats.style.cssText = `
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px;
  `;
    const overallColor = overallPct >= target ? "#16a34a" : overallPct >= target - 5 ? "#d97706" : "#dc2626";
    stats.innerHTML = `
    <div style="flex:1;min-width:120px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${overallColor}">${formatPercentage(overallPct)}%</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Overall Attendance</div>
    </div>
    <div style="flex:1;min-width:120px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#333">${target}%</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Target Threshold</div>
    </div>
    <div style="flex:1;min-width:120px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#333">${subjects.filter((s) => s.conducted > 0).length}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Active Subjects</div>
    </div>
  `;
    card.appendChild(stats);
    const firstTable = container.querySelector("table");
    if (firstTable) {
      firstTable.parentNode.insertBefore(card, firstTable);
    } else {
      container.insertBefore(card, container.firstChild);
    }
  }
  function enhanceAttendanceTable(projections, subjects = [], overallPercentage = 0, overallTarget = 75) {
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const headerRow = table.querySelector("thead tr, tr:first-child");
      if (!headerRow) continue;
      const text = headerRow.innerText.toLowerCase();
      const hasCode = text.includes("code");
      const hasCourse = text.includes("course") || text.includes("subject") || text.includes("name");
      const hasCount = text.includes("count") || text.includes("attendance") || text.includes("percentage") || text.includes("%");
      if (!(hasCode && hasCourse && hasCount)) continue;
      const headers = ["Target", "Safe Bunks", "Risk", "Forecast", "Classes to Maintain"];
      const siblingTh = headerRow.querySelector("th, td");
      const headerComputed = siblingTh ? window.getComputedStyle(siblingTh) : null;
      for (const headerText of headers) {
        const th = document.createElement("th");
        th.setAttribute(INJECTOR_ATTR2, "true");
        if (siblingTh) {
          th.className = siblingTh.className;
          if (siblingTh.style.cssText) {
            th.style.cssText = siblingTh.style.cssText;
          }
          if (headerComputed) {
            th.style.fontFamily = headerComputed.fontFamily;
            th.style.fontSize = headerComputed.fontSize;
            th.style.fontWeight = headerComputed.fontWeight;
            th.style.lineHeight = headerComputed.lineHeight;
            th.style.letterSpacing = headerComputed.letterSpacing;
            th.style.padding = headerComputed.padding;
            th.style.margin = headerComputed.margin;
            th.style.border = headerComputed.border;
            if (headerComputed.backgroundColor && headerComputed.backgroundColor !== "rgba(0, 0, 0, 0)" && headerComputed.backgroundColor !== "transparent") {
              th.style.backgroundColor = headerComputed.backgroundColor;
            }
          }
        }
        th.style.textAlign = "center";
        th.style.whiteSpace = "nowrap";
        th.style.color = "#02529c";
        th.textContent = headerText;
        headerRow.appendChild(th);
      }
      const rows = table.querySelectorAll("tbody tr, tr:not(:first-child)");
      let totalProjectedAttended = 0;
      let totalProjectedConducted = 0;
      let totalClassesToMaintain = 0;
      let totalImmediateBunks = 0;
      let totalTermBunks = 0;
      let hasHighRiskSubject = false;
      let baseTargetPct = projections[0]?.targetPct || 62;
      for (const proj of projections) {
        const subject = subjects.find((s) => s.id === proj.subjectId);
        if (subject) {
          const remaining = proj.remainingClasses || 0;
          const maxBunks = proj.maximumSafeBunks || 0;
          totalProjectedConducted += subject.conducted + remaining;
          totalProjectedAttended += subject.attended + remaining - maxBunks;
        }
        totalClassesToMaintain += proj.minimumRequired || 0;
        totalImmediateBunks += proj.immediateSafeBunks || 0;
        totalTermBunks += proj.maximumSafeBunks || 0;
        if (proj.riskLevel === "HIGH") {
          hasHighRiskSubject = true;
        }
      }
      const overallForecastVal = totalProjectedConducted > 0 ? totalProjectedAttended / totalProjectedConducted * 100 : overallPercentage;
      const overallRiskVal = overallPercentage < overallTarget || hasHighRiskSubject ? "HIGH" : "SAFE";
      for (const row of rows) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 2) continue;
        const rowText = row.innerText.toLowerCase();
        let projection = null;
        for (const proj of projections) {
          if (proj.subjectCode && rowText.includes(proj.subjectCode.toLowerCase())) {
            projection = proj;
            break;
          }
        }
        if (!projection) {
          const sortedProjections = [...projections].sort((a, b) => b.subjectName.length - a.subjectName.length);
          for (const proj of sortedProjections) {
            if (proj.subjectName && rowText.includes(proj.subjectName.toLowerCase())) {
              projection = proj;
              break;
            }
          }
        }
        if (projection) {
          appendCell(row, `${projection.targetPct}%`, "#333333", false);
          const bunkText = `${projection.immediateSafeBunks} (Term: ${projection.maximumSafeBunks})`;
          const bunkColor = projection.immediateSafeBunks <= 0 ? "#dc2626" : projection.immediateSafeBunks <= 2 ? "#d97706" : "#16a34a";
          appendCell(row, bunkText, bunkColor, false);
          const riskColors = { HIGH: "#dc2626", MEDIUM: "#d97706", LOW: "#ca8a04", SAFE: "#16a34a" };
          appendCell(row, projection.riskLevel, riskColors[projection.riskLevel] || "#64748b", false);
          appendCell(row, projection.projectedFinal > 0 ? `${formatPercentage(projection.projectedFinal)}%` : "\u2014", "#02529c", false);
          const maintainColor = projection.minimumRequired > 0 ? "#dc2626" : "#16a34a";
          appendCell(row, String(projection.minimumRequired), maintainColor, false);
        } else {
          const isLastRow = row === rows[rows.length - 1];
          if (isLastRow) {
            appendCell(row, `${overallTarget}%`, "#02529c", true);
            const totalBunkColor = totalImmediateBunks <= 0 ? "#dc2626" : "#16a34a";
            appendCell(row, `${totalImmediateBunks} (Term: ${totalTermBunks})`, totalBunkColor, true);
            const totalRiskColor = overallRiskVal === "HIGH" ? "#dc2626" : "#16a34a";
            appendCell(row, overallRiskVal, totalRiskColor, true);
            appendCell(row, `${overallForecastVal.toFixed(2)}%`, "#02529c", true);
            const totalMaintainColor = totalClassesToMaintain > 0 ? "#dc2626" : "#16a34a";
            appendCell(row, String(totalClassesToMaintain), totalMaintainColor, true);
          } else {
            for (let i = 0; i < 5; i++) {
              appendCell(row, "\u2014", "#64748b", false);
            }
          }
        }
      }
      break;
    }
  }
  function appendCell(row, text, color, isLastRow = false) {
    const nativeCells = row.querySelectorAll("td:not([data-ai-injected]), th:not([data-ai-injected])");
    const siblingTd = nativeCells.length > 0 ? nativeCells[nativeCells.length - 1] : null;
    const tagName = siblingTd && siblingTd.tagName.toLowerCase() === "th" ? "th" : "td";
    const td = document.createElement(tagName);
    td.setAttribute(INJECTOR_ATTR2, "true");
    if (siblingTd) {
      td.className = siblingTd.className;
      if (siblingTd.style.cssText) {
        td.style.cssText = siblingTd.style.cssText;
      }
      const computed = window.getComputedStyle(siblingTd);
      if (computed) {
        td.style.fontFamily = computed.fontFamily;
        td.style.fontSize = computed.fontSize;
        td.style.fontWeight = computed.fontWeight;
        td.style.lineHeight = computed.lineHeight;
        td.style.letterSpacing = computed.letterSpacing;
        td.style.padding = computed.padding;
        td.style.margin = computed.margin;
        td.style.border = computed.border;
        if (computed.backgroundColor && computed.backgroundColor !== "rgba(0, 0, 0, 0)" && computed.backgroundColor !== "transparent") {
          td.style.backgroundColor = computed.backgroundColor;
        }
      }
    }
    if (isLastRow) {
      const rowComp = window.getComputedStyle(row);
      let totalBg = "#e8f2fc";
      if (siblingTd) {
        const sibComp = window.getComputedStyle(siblingTd);
        if (sibComp.backgroundColor && sibComp.backgroundColor !== "rgba(0, 0, 0, 0)" && sibComp.backgroundColor !== "transparent") {
          totalBg = sibComp.backgroundColor;
        }
      }
      if (rowComp && rowComp.backgroundColor && rowComp.backgroundColor !== "rgba(0, 0, 0, 0)" && rowComp.backgroundColor !== "transparent") {
        totalBg = rowComp.backgroundColor;
      }
      td.style.backgroundColor = totalBg;
    }
    td.style.textAlign = "center";
    td.style.whiteSpace = "nowrap";
    td.style.color = color;
    td.textContent = text;
    row.appendChild(td);
    return td;
  }
  function injectProjectionCards(projections) {
    const container = document.querySelector('[class*="attendance"]') || document.body;
    const grid = document.createElement("div");
    grid.setAttribute(INJECTOR_ATTR2, "true");
    grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
    margin: 14px 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
    for (const proj of projections) {
      const riskColors = { HIGH: "#dc2626", MEDIUM: "#d97706", LOW: "#ca8a04", SAFE: "#16a34a" };
      const riskBg = { HIGH: "#fef2f2", MEDIUM: "#fffbeb", LOW: "#fefce8", SAFE: "#f0fdf4" };
      const riskBorder = { HIGH: "#fecaca", MEDIUM: "#fde68a", LOW: "#fef08a", SAFE: "#bbf7d0" };
      const card = document.createElement("div");
      card.style.cssText = `
      padding: 12px 14px;
      border-radius: 8px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
    `;
      card.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px">${proj.subjectName}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11.5px;color:#64748b">Current</span>
        <span style="font-size:12px;font-weight:700;color:${riskColors[proj.riskLevel]}">${formatPercentage(proj.currentPercentage)}%</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11.5px;color:#64748b">Target</span>
        <span style="font-size:12px;font-weight:600;color:#0f172a">${proj.targetPct}%</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11.5px;color:#64748b">Safe Bunks</span>
        <span style="font-size:12px;font-weight:700;color:${proj.maximumSafeBunks > 3 ? "#16a34a" : "#dc2626"}">${proj.maximumSafeBunks >= 0 ? proj.maximumSafeBunks : "\u2014"}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11.5px;color:#64748b">Risk Status</span>
        <span style="font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:4px;background:${riskBg[proj.riskLevel]};border:1px solid ${riskBorder[proj.riskLevel]};color:${riskColors[proj.riskLevel]}">${proj.riskLevel}</span>
      </div>
    `;
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  // src/content/main.js
  var adapter = null;
  var currentPage = "unknown";
  var hasSetupObserver = false;
  var cachedPlanData = null;
  var cachedStudentInfo = null;
  var cachedLastSync = null;
  var cachedIsStale = false;
  function init() {
    console.log("[Attendance Insights] Content script loaded");
    adapter = new JunoAdapter();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
  }
  var lastProcessedTime = 0;
  function onReady() {
    console.log("[Attendance Insights] Portal DOM ready, initiating fast sync...");
    setupLogoutInterceptor();
    detectAndProcess();
    setupObserver();
    [150, 450, 1e3, 2e3].forEach((delay) => {
      setTimeout(() => {
        detectAndProcess(true);
      }, delay);
    });
    setInterval(() => {
      const page = adapter?.detectPage();
      if (page === "student-home" && !document.getElementById("ai-operation75-dashboard-card")) {
        injectFloatingDashboard(
          cachedPlanData || {},
          cachedStudentInfo,
          cachedLastSync,
          cachedIsStale
        );
      } else if (page === "timetable" && (!document.getElementById("ai-timetable-toolbar") || !document.getElementById("ai-quick-sem-btn"))) {
        processTimetablePage();
      }
    }, 1200);
    chrome.runtime.onMessage.addListener(handleMessage);
  }
  function setupLogoutInterceptor() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      const link = target?.closest?.('a, button, input[type="submit"], input[type="button"]');
      if (!link) return;
      const href = link.getAttribute("href")?.toLowerCase() || "";
      const text = (link.innerText || link.getAttribute("value") || link.getAttribute("title") || "").toLowerCase();
      const onclick = link.getAttribute("onclick")?.toLowerCase() || "";
      if (href.includes("logout") || href.includes("signout") || text.includes("logout") || text.includes("sign out") || onclick.includes("logout")) {
        console.log("[Attendance Insights] User logout action intercepted. Triggering high security session reset...");
        sendMessage({ type: MessageType.USER_LOGGED_OUT });
        cleanupInjectedContent();
      }
    }, true);
  }
  function cleanupInjectedContent() {
    document.querySelectorAll("[data-ai-injected], [data-ai-attendance-injected], #ai-floating-widget-root").forEach((el) => el.remove());
  }
  function detectAndProcess(force = false) {
    try {
      const page = adapter.detectPage();
      if (page === "auth") {
        console.log("[Attendance Insights] Login/Logout screen detected. Erasing session data...");
        sendMessage({ type: MessageType.USER_LOGGED_OUT });
        cleanupInjectedContent();
        return;
      }
      const studentInfo = adapter.extractStudentInfo();
      if (studentInfo && studentInfo.name) {
        sendMessage({
          type: MessageType.STUDENT_INFO_PARSED,
          data: { studentInfo }
        });
      }
      if (page === "unknown") {
        return;
      }
      const now = Date.now();
      if (!force && page === currentPage && now - lastProcessedTime < 800) {
        return;
      }
      lastProcessedTime = now;
      currentPage = page;
      console.log(`[Attendance Insights] Fast syncing page: ${page}`);
      processPage(page);
      sendMessage({
        type: MessageType.PAGE_DETECTED,
        data: { page }
      });
    } catch (err) {
      console.error("[Attendance Insights] Error during detection:", err);
    }
  }
  function processPage(page) {
    switch (page) {
      case "student-home":
        processStudentHome();
        break;
      case "attendance":
        processAttendancePage();
        break;
      case "timetable":
        processTimetablePage();
        break;
      case "calendar":
        processCalendarPage();
        break;
      case "auth":
        console.log("[Attendance Insights] Auth/Login page detected. Purging previous session data...");
        sendMessage({ type: MessageType.USER_LOGGED_OUT });
        cleanupInjectedContent();
        break;
      default:
        console.log("[Attendance Insights] Unknown page, no action");
    }
  }
  async function processStudentHome() {
    console.log("[Attendance Insights] Processing Student Home...");
    const classes = adapter.parseSchedule();
    console.log(`[Attendance Insights] Parsed ${classes.length} classes from schedule`);
    const studentInfo = adapter.extractStudentInfo();
    const response = await sendMessage({
      type: MessageType.SCHEDULE_PARSED,
      data: { classes }
    });
    if (response && response.recommendations && response.recommendations.length > 0) {
      injectScheduleRecommendations(
        response.recommendations,
        classes,
        response.lastSync,
        response.isStale
      );
    } else if (response && response.needsAttendance) {
      injectAttendancePrompt();
    }
    const planResponse = await sendMessage({ type: MessageType.GET_TODAY_PLAN });
    const planData = planResponse?.plan || {};
    cachedPlanData = planData;
    cachedStudentInfo = studentInfo;
    cachedLastSync = response?.lastSync || planData.generatedAt;
    cachedIsStale = response?.isStale || planData.isStale;
    injectFloatingDashboard(
      cachedPlanData,
      cachedStudentInfo,
      cachedLastSync,
      cachedIsStale
    );
    [150, 450, 1e3, 2e3].forEach((delay) => {
      setTimeout(() => {
        injectFloatingDashboard(
          cachedPlanData,
          cachedStudentInfo,
          cachedLastSync,
          cachedIsStale
        );
      }, delay);
    });
  }
  async function processAttendancePage() {
    console.log("[Attendance Insights] Processing Attendance Page...");
    const facultyMap = adapter.parseSyllabusFaculty();
    if (Object.keys(facultyMap).length > 0) {
      console.log(`[Attendance Insights] Parsed ${Object.keys(facultyMap).length} faculty names`);
      await sendMessage({
        type: MessageType.FACULTY_PARSED,
        data: { facultyMap }
      });
    }
    const subjects = adapter.parseAttendance();
    console.log(`[Attendance Insights] Parsed ${subjects.length} subjects from attendance`);
    if (subjects.length === 0) {
      console.log("[Attendance Insights] No subjects found in attendance table");
      return;
    }
    const response = await sendMessage({
      type: MessageType.ATTENDANCE_PARSED,
      data: { subjects }
    });
    if (response && response.projections) {
      injectAttendanceEnhancements(
        response.projections,
        subjects,
        response.overallPercentage,
        response.overallTarget,
        response.syncTime
      );
      console.log(`[Attendance Insights] Enhanced attendance table with ${response.projections.length} projections`);
    }
  }
  async function processTimetablePage() {
    console.log("[Attendance Insights] Processing Timetable Page...");
    const timetable = adapter.parseTimetable();
    const [subResponse, prefsResponse, projResponse] = await Promise.all([
      sendMessage({ type: MessageType.GET_SUBJECTS }),
      sendMessage({ type: MessageType.GET_PREFERENCES }),
      sendMessage({ type: MessageType.GET_PROJECTIONS })
    ]);
    const subjects = subResponse?.subjects || [];
    const preferences = prefsResponse?.preferences || {};
    const projections = projResponse?.projections || [];
    if (timetable) {
      console.log(`[Attendance Insights] Parsed timetable with ${Object.keys(timetable.days).length} days`);
      if (timetable.facultyMap && Object.keys(timetable.facultyMap).length > 0) {
        await sendMessage({
          type: MessageType.FACULTY_PARSED,
          data: { facultyMap: timetable.facultyMap }
        });
      }
      await sendMessage({
        type: MessageType.TIMETABLE_PARSED,
        data: { timetable }
      });
    }
    injectTimetableEnhancements(timetable, subjects, preferences, projections);
  }
  async function processCalendarPage() {
    console.log("[Attendance Insights] Processing Academic Calendar Page...");
    const { holidays, semesterEndDate } = adapter.parseHolidays();
    console.log(`[Attendance Insights] Parsed ${holidays.length} holidays from calendar`, { holidays, semesterEndDate });
    await sendMessage({
      type: MessageType.CALENDAR_PARSED,
      data: { holidays, semesterEndDate }
    });
    injectCalendarSyncBanner(holidays.length, semesterEndDate);
  }
  function injectCalendarSyncBanner(holidayCount, semesterEndDate) {
    document.querySelectorAll("[data-ai-calendar-banner]").forEach((el) => el.remove());
    const banner = document.createElement("div");
    banner.setAttribute("data-ai-calendar-banner", "true");
    banner.style.cssText = `
    margin: 14px 0;
    padding: 12px 16px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    color: #166534;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12.5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
    banner.innerHTML = `
    <div>
      <strong style="color:#14532d;display:block;margin-bottom:2px">RCOEM Attendance Se Bacho Yojna</strong>
      <span>Synced <strong>${holidayCount}</strong> holidays${semesterEndDate ? ` & Term End (${semesterEndDate})` : ""} into attendance forecast engine.</span>
    </div>
    <span style="font-size:11px;font-weight:700;padding:3px 8px;background:#dcfce7;border-radius:4px;color:#15803d">SYNCED</span>
  `;
    const container = document.querySelector("table") || document.body;
    if (container.parentElement) {
      container.parentElement.insertBefore(banner, container);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }
  function injectAttendancePrompt() {
    removeInjectedContent();
    const container = findScheduleContainer2();
    if (!container) return;
    const prompt = document.createElement("div");
    prompt.setAttribute("data-ai-injected", "true");
    prompt.style.cssText = `
    margin: 12px 0;
    padding: 14px 16px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.06), rgba(139, 92, 246, 0.06));
    border: 1px solid rgba(99, 102, 241, 0.12);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #4f46e5;
    line-height: 1.6;
  `;
    prompt.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">\u{1F4CA} Attendance Insights</div>
    <div style="color:#6b7280">
      \u26A0\uFE0F Attendance data unavailable.
      <strong>Open your Attendance page</strong> once to enable intelligent recommendations.
    </div>
  `;
    container.appendChild(prompt);
  }
  function findScheduleContainer2() {
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      const text = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").toLowerCase().trim();
      if (text.includes("today's schedule") || text.includes("todays schedule")) {
        return el.parentElement || el;
      }
    }
    return null;
  }
  function setupObserver() {
    if (hasSetupObserver) return;
    hasSetupObserver = true;
    adapter.observeContentChanges(() => {
      console.log("[Attendance Insights] Content change detected, re-processing...");
      setTimeout(detectAndProcess, 50);
    });
  }
  function handleMessage(message, sender, sendResponse) {
    console.log("[Attendance Insights] Content received message:", message.type);
    switch (message.type) {
      case MessageType.INJECT_RECOMMENDATIONS:
        if (currentPage === "student-home" && message.data) {
          injectScheduleRecommendations(
            message.data.recommendations,
            message.data.classes || [],
            message.data.lastSync,
            message.data.isStale
          );
        }
        sendResponse({ ok: true });
        break;
      case MessageType.INJECT_ATTENDANCE_ENHANCEMENTS:
        if (currentPage === "attendance" && message.data) {
          injectAttendanceEnhancements(
            message.data.projections,
            message.data.subjects || [],
            message.data.overallPercentage,
            message.data.overallTarget,
            message.data.syncTime
          );
        }
        sendResponse({ ok: true });
        break;
      case MessageType.FORCE_RESYNC:
        currentPage = "unknown";
        detectAndProcess();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
    return true;
  }
  function sendMessage(message) {
    return new Promise((resolve) => {
      if (!chrome.runtime?.id) {
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || "";
            if (!errMsg.includes("Extension context invalidated")) {
              console.warn("[Attendance Insights] Message error:", errMsg);
            }
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        if (!err.message?.includes("Extension context invalidated")) {
          console.warn("[Attendance Insights] Failed to send message:", err);
        }
        resolve(null);
      }
    });
  }
  init();
})();
