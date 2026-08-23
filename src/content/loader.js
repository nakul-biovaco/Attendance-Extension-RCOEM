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

(async () => {
  try {
    const src = chrome.runtime.getURL('src/content/main.js');
    await import(src);
  } catch (err) {
    console.error('[Attendance Insights] Failed to load content script module:', err);
  }
})();
