# 🚀 RCOEM Operation 75

> **The ultimate attendance companion & smart bunk planner built for RCOEM / RBU students.**

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?style=flat-square&logo=google-chrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/Version-1.1.0-emerald?style=flat-square)](manifest.json)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary%20%7C%20All%20Rights%20Reserved-red.svg?style=flat-square)](LICENSE)
[![Zero Backend](https://img.shields.io/badge/Server-100%25%20Local-purple?style=flat-square)](#-privacy--zero-tracking)

---

## 💡 Why I Built This

If you're studying at **RCOEM / RBU**, you already know the pain of maintaining that **75% attendance criteria**. 

Every single semester, it's the same story:
- Opening Juno Campus portal, calculating fractions in your head (`7/18 = 38.8%`, `14/20 = 70.0%`).
- Wondering: *"If I bunk CN on Wednesday, will my attendance crash?"* or *"How many consecutive MTT lectures do I need to attend to hit 75%?"*.
- Staring at cryptic timetable short codes like `OSC`, `SA`, `MTT`, `SSOS`, `CS` without knowing which full subject or faculty they belong to.

Doing manual mental math and spreadsheets between classes was frustrating. So I sat down and built **Operation 75** from scratch — a clean, lightweight, client-side Chrome Extension that injects smart insights, dynamic future predictions, and safe bunk dates directly into the Juno portal.

---

## ✨ Features That Actually Save Your Semester

### 1. ⚡ 100% Pure Dynamic Portal Resolution (Zero Hardcoded Maps)
- I didn't want any lazy hardcoded subject maps that break across semesters or different branches (ECE, CSE, IT, ME, etc.).
- The extension parses raw timetable cells dynamically in real-time, stripping conjunctions and prepositions (`and`, `&`, `of`, `the`, `in`, `for`, `with`) to resolve initials into full course names:
  - `SA` $\rightarrow$ **Smart Antenna**
  - `OSC` $\rightarrow$ **Optical and Satellite Communication**
  - `MTT` $\rightarrow$ **Microwave Theory & Techniques**
  - `CN` $\rightarrow$ **Computer Networks** / `CN (P)` $\rightarrow$ **Computer Networks Lab**
  - `SSOS` $\rightarrow$ **System Software & Operating System**
  - `CS` $\rightarrow$ **Control Systems**
- Built-in substring collision shield ensures `SA` doesn't wrongly latch onto the word `satellite` inside `OSC`.

### 2. 📈 Real-Time Future Attendance Trajectory
- In your monthly timetable, it doesn't just slap a static attendance percentage on every row.
- It calculates a **progressive cumulative forecast** across upcoming calendar dates:
  - As you attend lecture-by-lecture, your forecasted percentage climbs dynamically:
    - `Computer Networks` (Base: `38.9%`) $\rightarrow$ Lecture 1: `MUST ATTEND (42.1%)` $\rightarrow$ Lecture 2: `MUST ATTEND (45.0%)` $\rightarrow$ Lecture 3: `MUST ATTEND (47.6%)`...
  - The moment you cross 75%, it automatically transitions to **`TARGET ACHIEVED (75.0%)`** and then calculates **`SAFE TO BUNK (1 safe • 76.0%)`**!

### 3. 📅 Date-Wise Semester Bunk Planner
- Generates clean, calendar date cards (`Sep 26, 2026 (Saturday)`, etc.) across your timetable.
- Tells you straight up whether an upcoming day is:
  - 🟢 **Full Safe Bunk Day** (All classes are safe to skip).
  - 🟡 **Partial Bunk Day** (Some classes safe, some must attend).
  - 🔴 **Compulsory Attendance Day** (Must be in class).

### 4. 🎨 Juno-Native Design System
- Built to blend in seamlessly with Juno's actual design language.
- Features Juno's exact **Emerald Teal (`#00a884`) active slider underline**, deep navy typography (`#02529c`), and clean border aesthetics.

### 5. 🔒 Multi-User Safe & Reset Anytime
- Sharing a laptop with friends? The extension detects student account changes and purges cached session data instantly to prevent data cross-contamination.
- Added a **"Reset All Stored Data"** button in settings so you can start fresh anytime.

---

## 🛠️ How I Built It (Tech Stack)

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Platform**: Chrome Extensions (Manifest V3).
- **Bundling**: `esbuild` (Ultra-fast, zero bloat, ~114 KB bundle).
- **Architecture**:
  - `juno-adapter.js`: Resilient DOM scraper for Juno portal tables.
  - `subject-matcher.js`: Acronym generator and token matcher.
  - `schedule-injector.js`: In-page live timetable enhancer & real-time trajectory simulator.
  - `recommendation-engine.js`: Statistical attendance recovery math and date-wise bunk engine.
  - `service-worker.js`: Background orchestration and local cache sync.

---

## 📦 How to Install (Takes 30 Seconds)

1. Clone or download this repo:
   ```bash
   git clone https://github.com/your-username/rcoem-operation-75.git
   ```
2. Open Google Chrome and go to:
   ```
   chrome://extensions/
   ```
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Log in to [rcoem.in](https://rcoem.in) — your timetable, dashboard, and attendance will instantly light up with Operation 75!

---

## 💻 Developer Commands

If you want to tweak or contribute to the code:

```bash
# Install dependencies
npm install

# Build the content bundle
npm run build

# Watch mode for live dev
npm run watch

# Create release zip
npm run package
```

---

## 🛡️ Privacy & Zero Tracking

- **100% Local**: No remote servers, no Google Analytics, no third-party APIs.
- **Zero Credentials Access**: Does not touch or store your passwords.
- All calculations happen in-memory and in your browser's `chrome.storage.local`.

---

## ⚖️ Intellectual Property & Copyright Notice

**Copyright © 2026 Nakul Mundhada. All Rights Reserved.**

This project, its source code, architecture, algorithms, and UI designs are the **exclusive intellectual property of Nakul Mundhada**.

- **Personal Use**: You are free to clone, download, and use this extension locally for your personal academic productivity with the RCOEM / RBU Juno Portal.
- **Strict Prohibition on Modifications & Derivatives**: You **MAY NOT** modify, edit, fork-and-rebrand, build derivative versions, or tamper with the source code without explicit written permission from the author.
- **Strict Prohibition on Redistribution**: You **MAY NOT** re-upload, mirror, sell, sublicense, or distribute this extension (partially or in full) to the Chrome Web Store, package managers, or any other public platforms.
- **Permissions & Collaboration**: To request permission for modifications, institutional integrations, or feature contributions, reach out to the author via GitHub: [@nakul-biovaco](https://github.com/nakul-biovaco).

---

<p align="center">
  <b>Designed, Engineered & Authored by Nakul Mundhada</b> for the student community of <b>RCOEM / RBU</b>.
</p>
