// (c) 2026 Nakul Mundhada. All rights reserved.


(async () => {
  try {
    const src = chrome.runtime.getURL('src/content/main.js');
    await import(src);
  } catch (err) {
    console.error('[Attendance Insights] Failed to load content script module:', err);
  }
})();
