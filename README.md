# RCOEM Operation 75

> An intelligent attendance companion and dynamic bunk planner designed for students using the Juno Campus portal at RCOEM / RBU.

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?style=flat-square&logo=google-chrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/Version-1.1.0-emerald?style=flat-square)](manifest.json)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary%20%7C%20All%20Rights%20Reserved-red.svg?style=flat-square)](LICENSE)
[![Zero Backend](https://img.shields.io/badge/Server-100%25%20Local-purple?style=flat-square)](#privacy--local-execution)

---

## Why I Built This

Maintaining the mandatory 75% attendance criteria throughout an engineering semester is an everyday challenge. Between lab practicals, theory lectures, and changing schedules, calculating attendance fractions by hand or tracking them across separate spreadsheets gets tedious very quickly.

The default portal interface presents raw lecture codes and static historical figures without giving students any predictive visibility into their upcoming weeks. Questions like *"If I miss a lecture on Wednesday, will my overall percentage drop below the threshold?"* or *"How many consecutive classes do I need to attend to recover from a dip?"* typically require manual mental math.

I built Operation 75 as a lightweight, privacy-focused Chrome Extension to solve this directly inside the Juno portal. It calculates future attendance trajectories, highlights safe bunk opportunities date-by-date, and resolves shorthand timetable codes into full course names in real time.

---

## Key Capabilities

### 1. Pure Dynamic Portal Resolution
The extension does not rely on hardcoded dictionaries, pre-configured course lists, or static departmental mappings. It parses live table structures directly from the portal DOM, applying dynamic tokenization and initial extraction while ignoring common prepositions and conjunctions (such as *and*, *&*, *of*, *the*, *in*, *for*, *with*).

Examples of automated resolution across branches:
- `DSA` $\rightarrow$ **Data Structures & Algorithms**
- `DBMS` $\rightarrow$ **Database Management Systems**
- `OS` $\rightarrow$ **Operating Systems** / `OS (P)` $\rightarrow$ **Operating Systems Lab**
- `AI` $\rightarrow$ **Artificial Intelligence**
- `SE` $\rightarrow$ **Software Engineering**
- `DCN` $\rightarrow$ **Data Communication & Networks**

A substring collision guard prevents short abbreviations from false-matching internal character sequences within unrelated course names.

### 2. Real-Time Progressive Attendance Trajectory
Rather than displaying a static percentage on every timetable row, the extension runs a cumulative simulation across your upcoming calendar lectures:

$$\text{Projected \%} = \left(\frac{\text{Attended} + k}{\text{Conducted} + k}\right) \times 100$$

As you progress through your schedule, each upcoming class displays your exact forecasted standing:
- `Data Structures & Algorithms` (Baseline: `38.9%`) $\rightarrow$ Class 1: `MUST ATTEND (42.1%)` $\rightarrow$ Class 2: `MUST ATTEND (45.0%)` $\rightarrow$ Class 3: `MUST ATTEND (47.6%)`...
- Once attendance crosses the 75% mark, the badge dynamically transitions to `TARGET ACHIEVED` followed by the exact count of available safe bunks.

### 3. Date-Wise Semester Bunk Planner
The planner evaluates your weekly schedule against current subject standing to generate date-wise recommendations:
- **Full Safe Bunk Day**: All scheduled lectures for the date can be missed without breaching target thresholds.
- **Partial Bunk Day**: Certain subjects require attendance, while others have sufficient buffer.
- **Compulsory Attendance Day**: All lectures must be attended to maintain or recover required percentages.

### 4. Juno-Aligned Interface Design
The user interface follows the design principles of the Juno Campus portal. It incorporates the signature emerald teal (`#00a884`) active slider indicator, deep navy typography (`#02529c`), and clean border treatments so the extension feels like an organic, built-in feature of the portal.

### 5. Multi-User Isolation & Data Privacy
All data is stored exclusively on the client machine using `chrome.storage.local`. When a student logs out or switches accounts on a shared workstation, the extension detects the session change and immediately purges local caches to prevent cross-profile data leakage.

---

## Engineering & Architecture

- **Core Technologies**: Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Extension Architecture**: Manifest V3 compliant, Service Worker background orchestration, DOM MutationObserver content scripts.
- **Build System**: `esbuild` for zero-overhead bundle optimization (~114 KB distribution).

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

## Installation & Setup

1. Clone or download this repository:
   ```bash
   git clone https://github.com/nakul-biovaco/Attendance-Extension-RCOEM.git
   ```
2. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the `attendance-insights` directory.
5. Navigate to [rcoem.in](https://rcoem.in) and log in — your schedule, timetable, and attendance pages will automatically display Operation 75 insights.

---

## Development & Build

To modify or build the project locally:

```bash
# Install development dependencies
npm install

# Compile the content bundle
npm run build

# Watch mode for active development
npm run watch

# Package into a release archive
npm run package
```

---

## Privacy & Local Execution

- **Zero Remote Communication**: No telemetry, analytics, or external API calls.
- **Zero Credential Access**: The extension does not intercept, read, or transmit student login credentials.
- All computations and schedule caches remain strictly inside your browser environment.

---

## Intellectual Property & Copyright Notice

**Copyright (c) 2026 Nakul Mundhada. All Rights Reserved.**

This project, its source code, architecture, algorithms, and interface designs are the exclusive intellectual property of **Nakul Mundhada**.

- **Personal Use**: You may clone, download, and execute this extension locally for personal academic productivity with the RCOEM / RBU Juno Portal.
- **Prohibition on Modifications & Derivatives**: Modifying, altering, reverse-engineering, or creating derivative versions of this software without prior written consent is strictly prohibited.
- **Prohibition on Redistribution**: Re-uploading, mirroring, distributing, sublicensing, or publishing this extension on third-party platforms or the Chrome Web Store without authorization is prohibited.
- **Inquiries**: For permissions, institutional deployments, or feature collaboration, contact the author via GitHub: [@nakul-biovaco](https://github.com/nakul-biovaco).

---

<p align="center">
  Designed and engineered by <b>Nakul Mundhada</b> for the student community of <b>RCOEM / RBU</b>.
</p>
