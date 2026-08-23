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

export class BasePortalAdapter {
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
    const selector = tagFilter || '*';
    const elements = document.querySelectorAll(selector);
    const results = [];

    for (const el of elements) {

      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent)
        .join('')
        .toLowerCase()
        .trim();

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
      return (
        node.hasAttribute('data-ai-injected') ||
        node.hasAttribute('data-ai-attendance-injected') ||
        node.hasAttribute('data-ai-enhanced') ||
        node.id?.startsWith('ai-') ||
        (typeof node.className === 'string' && (node.className.includes('ai-') || node.className.includes('juno-enhanced'))) ||
        Boolean(node.closest?.('[data-ai-injected="true"], [data-ai-attendance-injected="true"], [id^="ai-"]'))
      );
    };

    this._observer = new MutationObserver((mutations) => {
      const hasRelevantChange = mutations.some(m => {
        if (m.type === 'childList') {
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
        if (m.type === 'characterData') {
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
      characterData: true,
    });
  }

  disconnect() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }
}
