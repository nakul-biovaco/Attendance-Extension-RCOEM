# RCOEM Operation 75

> An attendance companion for the Juno Campus portal at RCOEM/RBU — built to answer the one question every engineering student keeps doing mental math over: *"Can I actually afford to skip this class?"*

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?style=flat-square&logo=google-chrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/Version-1.1.0-emerald?style=flat-square)](manifest.json)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary%20%7C%20All%20Rights%20Reserved-red.svg?style=flat-square)](LICENSE)
[![Zero Backend](https://img.shields.io/badge/Server-100%25%20Local-purple?style=flat-square)](#privacy)

---

## Why this exists

75% attendance is a hard line at RCOEM, and the Juno portal doesn't make it easy to live with. It shows you where you stand today, in raw lecture codes, and stops there. It won't tell you whether missing Wednesday's lecture drops you below the cutoff, or how many classes in a row you'd need to sit through to climb back out of a hole. That math falls on the student — usually done in a rush, on a phone, between classes.

Operation 75 does that math for you, inside the portal itself. It projects where your attendance is headed, flags which days you can actually afford to skip, and turns cryptic timetable shorthand into names you don't have to squint at.

---

## What it actually does

### 1. Reads the portal, not a hardcoded list
No dictionary of course codes shipped with the extension — it parses the live timetable DOM and works out what DSA, DBMS, OS (P) etc. mean on the fly, tokenizing and matching against the full course name while ignoring filler words like *and*, *of*, *the*, *in*, *for*. There's also a guard against short codes false-matching inside unrelated course names, since that's an easy way to get a wrong resolution.

A few examples of what it resolves:
- `DSA` $\rightarrow$ **Data Structures & Algorithms**
- `DBMS` $\rightarrow$ **Database Management Systems**
- `OS` $\rightarrow$ **Operating Systems**, `OS (P)` $\rightarrow$ **Operating Systems Lab**
- `AI` $\rightarrow$ **Artificial Intelligence**
- `SE` $\rightarrow$ **Software Engineering**
- `DCN` $\rightarrow$ **Data Communication & Networks**

### 2. Projects your attendance forward, lecture by lecture
Instead of one static percentage, it simulates your standing across every upcoming class using:

$$\text{Projected \%} = \left(\frac{\text{Attended} + k}{\text{Conducted} + k}\right) \times 100$$

So a subject sitting at 38.9% might show:
$$\text{MUST ATTEND (42.1\%)} \rightarrow \text{MUST ATTEND (45.0\%)} \rightarrow \text{MUST ATTEND (47.6\%)} \dots$$

and once you cross 75%, the badge switches to `TARGET ACHIEVED`, along with exactly how many bunks you've earned.

### 3. A day-by-day bunk planner
For every date in the semester, it weighs your current standing against your schedule and tells you what kind of day it is:
- **Full Safe Bunk Day** — skip everything, you're covered.
- **Partial Bunk Day** — some subjects have buffer, others don't.
- **Compulsory Attendance Day** — no room to miss anything today.

### 4. Looks like it belongs in Juno
Same emerald teal (`#00a884`) accents, same navy typography (`#02529c`), same border treatment as the portal — so it reads as a built-in feature rather than a bolted-on extension.

### 5. Doesn't leak across accounts
Everything lives in `chrome.storage.local`, nothing leaves the browser, and on a shared machine the extension detects a login/logout and wipes the cache so the next student doesn't see your data.

---

## How it's built

- **Stack**: Vanilla JavaScript (ES Modules), HTML5, CSS3 — no framework overhead.
- **Extension architecture**: Manifest V3, a service-worker background script, and content scripts driven by a DOM MutationObserver (the portal doesn't fire clean events, so this was the reliable way to catch table updates).
- **Build**: `esbuild`, keeping the bundle around ~114 KB.

```
src/
├── adapters/
│   └── juno-adapter.js          # Resilient DOM parsing for timetable and ledger tables
├── background/
│   └── service-worker.js        # Background state synchronization and lifecycle events
├── content/
│   ├── main.js                  # Content script initialization and page observers
│   ├── schedule-injector.js     # Timetable enhancement and trajectory simulation
│   └── subject-matcher.js       # Dynamic acronym tokenizer and matching engine
├── engine/
│   ├── attendance-calculator.js # Core mathematical formulas and margin calculations
│   └── recommendation-engine.js # Daily decision planner and date-wise bunk logic
├── popup/
│   ├── popup.html               # Popup view structure
│   ├── popup.css                # Juno-aligned styles and responsive slider
│   └── popup.js                 # Reactive popup state management
└── utils/
    ├── date-utils.js            # Calendar parsing and semester timeline math
    └── normalizer.js            # String sanitization and deterministic hashing
```

---

## Getting it running

1. Clone the repo:
   ```bash
   git clone https://github.com/nakul-biovaco/Attendance-Extension-RCOEM.git
   ```
2. Open Chrome and go to:
   ```
   chrome://extensions/
   ```
3. Flip on **Developer mode** (top-right corner).
4. Click **Load unpacked**, and point it at the `attendance-insights` folder.
5. Log into [rcoem.in](https://rcoem.in/) as usual — your timetable and attendance pages should now show Operation 75's overlays automatically.

---

## Working on it locally

```bash
# install dependencies
npm install

# build the content bundle
npm run build

# watch mode while developing
npm run watch

# package a release archive
npm run package
```

---

## Privacy

- No telemetry, no analytics, no calls to any external API.
- Never touches your login credentials.
- Every calculation and cached schedule stays inside your browser — nothing is sent anywhere.

---

## Copyright & usage terms

**Copyright (c) 2026 Nakul Mundhada. All rights reserved.**

This project — code, architecture, algorithms, and interface design — belongs to Nakul Mundhada.

- **Personal use**: fine to clone and run locally for your own attendance tracking on the RCOEM/RBU Juno portal.
- **No modification or derivatives**: don't alter, reverse-engineer, or build derivative versions without written permission.
- **No redistribution**: don't re-upload, mirror, or publish this on the Chrome Web Store or anywhere else without authorization.
- **Want to collaborate or deploy this at your own institution?** Reach out via GitHub: [@nakul-biovaco](https://github.com/nakul-biovaco).

---

<p align="center">
  Built by <b>Nakul Mundhada</b> for RCOEM/RBU students who are tired of doing attendance math in their heads.
</p>
