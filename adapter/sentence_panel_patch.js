/* LingKuma Zotero sentence-panel resilience adapter
 *
 * LingKuma's original A7 word-explosion listener and A4 word-tooltip listener
 * both react to the same pointerdown. In Zotero's PDF iframe, the delayed A7
 * listener can occasionally lose the race after A4 creates its Shadow DOM,
 * leaving only the word tooltip visible. This adapter does not replace A7. It
 * captures the sentence before the UI changes, waits for the original handler,
 * and invokes the original showWordExplosion() only when the panel did not open.
 * It also provides a rectangle overlay fallback when CSS Custom Highlight is
 * unavailable or the upstream highlight is not painted by PDF.js.
 */
(() => {
  'use strict';

  const VERSION = '1.2.0';
  if (globalThis.__LINGKUMA_SENTENCE_PANEL_PATCH__?.installed) return;

  const state = globalThis.__LINGKUMA_SENTENCE_PANEL_PATCH__ = {
    installed: true,
    version: VERSION,
    activations: 0,
    fallbacks: 0,
    last: null,
    currentRange: null,
    currentColor: '#955FBD40',
    cleanup: null
  };

  const OVERLAY_ID = 'lingkuma-zotero-sentence-range-overlay';
  const UI_SELECTOR = [
    '#lingkuma-tooltip-host',
    '#lingkuma-explosion-host',
    '#lingkuma-word-highlight-floating-root',
    '.vocab-tooltip',
    '.word-explosion-container',
    '.custom-word-tooltip',
    '.custom-word-selection-popup',
    '[data-extension-element="true"]'
  ].join(',');

  const safePath = event => {
    try { return event.composedPath?.() || [event.target]; }
    catch (_) { return [event.target]; }
  };

  const isPluginUIEvent = event => {
    for (const node of safePath(event)) {
      if (!node || node === window || node === document) continue;
      try {
        if (node.id === 'lingkuma-tooltip-host' || node.id === 'lingkuma-explosion-host' || node.id === OVERLAY_ID) return true;
        if (node.matches?.(UI_SELECTOR) || node.closest?.(UI_SELECTOR)) return true;
      } catch (_) {}
    }
    return false;
  };

  const isTextSurfaceEvent = event => {
    const target = event?.target;
    if (!target) return false;
    const tag = String(target.tagName || '').toUpperCase();
    if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG'].includes(tag)) return false;
    try {
      if (target.closest?.('.textLayer, .page, #viewer, #viewerContainer')) return true;
      return !!String(target.textContent || '').trim();
    } catch (_) { return false; }
  };

  const getExplosionElement = () => {
    const host = document.getElementById('lingkuma-explosion-host');
    const registry = globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__;
    const root = registry?.get?.(host || 'lingkuma-explosion-host') || host?.shadowRoot || null;
    if (!root) return null;
    return root.querySelector('.word-explosion-container, #word-explosion-container');
  };

  const isExplosionVisible = () => {
    const element = getExplosionElement();
    if (!element) return false;
    try {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 1 && rect.height > 1;
    } catch (_) { return element.style.display !== 'none'; }
  };

  const mergeLineRects = rects => {
    const input = Array.from(rects || []).filter(rect => rect && rect.width > 0.5 && rect.height > 0.5)
      .sort((a, b) => (a.top - b.top) || (a.left - b.left));
    const lines = [];
    for (const rect of input) {
      const tolerance = Math.max(2, rect.height * 0.35);
      const line = lines.find(item => rect.top <= item.bottom + tolerance && rect.bottom >= item.top - tolerance);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.top = Math.min(line.top, rect.top);
        line.right = Math.max(line.right, rect.right);
        line.bottom = Math.max(line.bottom, rect.bottom);
        line.width = line.right - line.left;
        line.height = line.bottom - line.top;
      } else {
        lines.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      }
    }
    return lines;
  };

  const removeOverlay = () => {
    try { document.getElementById(OVERLAY_ID)?.remove?.(); } catch (_) {}
  };

  const clearSentenceVisuals = () => {
    state.currentRange = null;
    removeOverlay();
    try {
      const remover = typeof removeExplosionSentenceHighlight === 'function'
        ? removeExplosionSentenceHighlight
        : globalThis.removeExplosionSentenceHighlight;
      if (typeof remover === 'function') remover();
    } catch (_) {}
  };
  state.clear = clearSentenceVisuals;

  // Upstream intentionally keeps its sentence highlight after the panel closes.
  // Zotero 0.4.11 established a narrower desktop behavior: the PDF sentence
  // overlay belongs to the visible panel. Preserve only that Zotero exception
  // here instead of editing a7_words_boom.js.
  let originalHideWordExplosion = null;
  let wrappedHideWordExplosion = null;
  const installHideCleanupBridge = () => {
    if (wrappedHideWordExplosion) return;
    const original = globalThis.hideWordExplosion;
    if (typeof original !== 'function') return;
    originalHideWordExplosion = original;
    wrappedHideWordExplosion = function(...args) {
      const result = original.apply(this, args);
      clearSentenceVisuals();
      return result;
    };
    globalThis.hideWordExplosion = wrappedHideWordExplosion;
  };
  installHideCleanupBridge();

  const renderOverlay = () => {
    removeOverlay();
    if (disposed || !highlightAllowed) return false;
    const range = state.currentRange;
    if (!range?.startContainer || !range?.endContainer) return false;
    try {
      if (!document.contains(range.startContainer) || !document.contains(range.endContainer)) return false;
      const rects = mergeLineRects(range.getClientRects());
      if (!rects.length) return false;

      const container = document.createElement('div');
      container.id = OVERLAY_ID;
      container.dataset.extensionElement = 'true';
      container.setAttribute('aria-hidden', 'true');
      Object.assign(container.style, {
        position: 'fixed', left: '0', top: '0', width: '0', height: '0',
        pointerEvents: 'none', zIndex: '2147483642'
      });
      for (const rect of rects) {
        const part = document.createElement('div');
        Object.assign(part.style, {
          position: 'fixed',
          left: `${rect.left}px`, top: `${rect.top}px`,
          width: `${rect.width}px`, height: `${rect.height}px`,
          background: state.currentColor || '#955FBD40',
          borderRadius: '3px', pointerEvents: 'none', boxSizing: 'border-box'
        });
        container.appendChild(part);
      }
      document.documentElement.appendChild(container);
      return true;
    } catch (_) {
      removeOverlay();
      return false;
    }
  };

  let disposed = false;
  let activationGeneration = 0;
  let highlightAllowed = false;
  let highlightRevision = 0;
  const pendingTimers = new Set();
  let redrawTimer = null;

  const scheduleOwnedTimer = (callback, delay) => {
    if (disposed) return null;
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (!disposed) callback();
    }, delay);
    pendingTimers.add(timer);
    return timer;
  };

  const clearOwnedTimers = () => {
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
    redrawTimer = null;
  };

  const scheduleRedraw = () => {
    if (disposed || !highlightAllowed || !state.currentRange) return;
    if (redrawTimer !== null) {
      clearTimeout(redrawTimer);
      pendingTimers.delete(redrawTimer);
    }
    redrawTimer = scheduleOwnedTimer(() => {
      redrawTimer = null;
      renderOverlay();
    }, 16);
  };
  window.addEventListener('scroll', scheduleRedraw, true);
  window.addEventListener('resize', scheduleRedraw, true);

  const readSettings = () => new Promise(resolve => {
    const fallback = {
      enablePlugin: true,
      wordExplosionEnabled: true,
      wordExplosionTriggerMode: 'click',
      wordExplosionHighlightSentence: true,
      wordExplosionHighlightColor: '#955FBD40'
    };
    try {
      chrome.storage.local.get(Object.keys(fallback), values => resolve({ ...fallback, ...(values || {}) }));
    } catch (_) { resolve(fallback); }
  });

  const captureSentenceInfo = (x, y) => {
    try {
      const finder = typeof findWordAndSentenceAtPosition === 'function'
        ? findWordAndSentenceAtPosition
        : globalThis.findWordAndSentenceAtPosition;
      if (typeof finder === 'function') {
        const result = finder(x, y);
        if (result?.sentence) return result;
      }
    } catch (_) {}
    try {
      const range = document.caretRangeFromPoint?.(x, y);
      const extractor = typeof getSentenceForWord === 'function' ? getSentenceForWord : globalThis.getSentenceForWord;
      if (range && typeof extractor === 'function') {
        const found = extractor({ range, word: '' });
        if (found?.sentence) return { sentence: found.sentence, range, sentenceRange: found.range };
      }
    } catch (_) {}
    return null;
  };

  const getSentenceRect = info => {
    try {
      const rectFinder = typeof getSentenceRect === 'function' ? getSentenceRect : globalThis.getSentenceRect;
      if (typeof rectFinder === 'function') {
        const rect = rectFinder(info.sentence, {
          textNode: info.textNode,
          range: info.range,
          sentenceRange: info.sentenceRange
        });
        if (rect) return rect;
      }
    } catch (_) {}
    try {
      const rects = mergeLineRects(info.sentenceRange?.getClientRects?.() || []);
      if (!rects.length) return null;
      return rects.reduce((box, rect) => ({
        left: Math.min(box.left, rect.left), top: Math.min(box.top, rect.top),
        right: Math.max(box.right, rect.right), bottom: Math.max(box.bottom, rect.bottom),
        width: Math.max(box.right, rect.right) - Math.min(box.left, rect.left),
        height: Math.max(box.bottom, rect.bottom) - Math.min(box.top, rect.top)
      }), { left: rects[0].left, top: rects[0].top, right: rects[0].right, bottom: rects[0].bottom, width: rects[0].width, height: rects[0].height });
    } catch (_) { return null; }
  };

  const activateFallback = async (info, settings, x, y, generation) => {
    if (disposed || generation !== activationGeneration || settings?.enablePlugin === false || !info?.sentence || isExplosionVisible()) return;
    const shouldHighlight = settings.wordExplosionHighlightSentence !== false && highlightAllowed;
    if (shouldHighlight) {
      state.currentRange = info.sentenceRange || globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__?.lastRange || null;
      state.currentColor = settings.wordExplosionHighlightColor || '#955FBD40';
      renderOverlay();
    }

    try {
      const shower = typeof showWordExplosion === 'function' ? showWordExplosion : globalThis.showWordExplosion;
      if (typeof shower === 'function') {
        const rect = getSentenceRect(info);
        shower(info.sentence, rect, info);
        state.fallbacks++;
        state.last = { sentence: info.sentence.slice(0, 180), x, y, hasRange: !!state.currentRange, openedAt: Date.now() };
        if (shouldHighlight) {
          scheduleOwnedTimer(() => {
            if (generation !== activationGeneration || !highlightAllowed) return;
            try {
              const painter = typeof applyExplosionSentenceHighlight === 'function'
                ? applyExplosionSentenceHighlight
                : globalThis.applyExplosionSentenceHighlight;
              if (typeof painter === 'function') painter();
            } catch (_) {}
            if (!document.getElementById('explosion-sentence-rect-highlight')) renderOverlay();
          }, 80);
        }
      }
    } catch (error) {
      try { console.warn('[LingKumaSentencePanelPatch] fallback activation failed', error); } catch (_) {}
    }
  };

  const onPointerDown = event => {
    if (!event || event.button > 0 || isPluginUIEvent(event)) return;
    const generation = ++activationGeneration;
    clearOwnedTimers();
    // A sentence highlight belongs to the currently open sentence panel only.
    // Clear it immediately on the next click, including blank page areas.
    clearSentenceVisuals();
    if (!isTextSurfaceEvent(event)) return;
    const x = Number(event.clientX || 0);
    const y = Number(event.clientY || 0);
    const info = captureSentenceInfo(x, y);
    if (!info?.sentence) return;
    state.activations++;
    const sentenceRange = info.sentenceRange || globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__?.lastRange || null;
    const highlightRevisionAtRead = highlightRevision;
    state.last = { sentence: info.sentence.slice(0, 180), x, y, hasRange: !!sentenceRange, capturedAt: Date.now() };

    readSettings().then(settings => {
      if (disposed || generation !== activationGeneration) return;
      if (settings.enablePlugin === false || settings.wordExplosionEnabled === false || settings.wordExplosionTriggerMode === 'hover') return;
      if (highlightRevisionAtRead === highlightRevision) {
        highlightAllowed = settings.wordExplosionHighlightSentence !== false;
      }
      state.currentColor = settings.wordExplosionHighlightColor || '#955FBD40';
      if (highlightAllowed && settings.wordExplosionHighlightSentence !== false && sentenceRange) {
        state.currentRange = sentenceRange;
        scheduleOwnedTimer(() => {
          if (generation !== activationGeneration || !highlightAllowed) return;
          const upstreamPainted = !!document.getElementById('explosion-sentence-rect-highlight') || !!globalThis.CSS?.highlights?.has?.('explosion-sentence-highlight');
          if (!upstreamPainted) renderOverlay();
        }, 120);
      }
      scheduleOwnedTimer(() => activateFallback(info, settings, x, y, generation), 180);
    });
  };

  const onStorageChanged = (changes, area) => {
    if (area !== 'local') return;
    if (Object.prototype.hasOwnProperty.call(changes, 'wordExplosionHighlightSentence')) {
      highlightRevision++;
      highlightAllowed = changes.wordExplosionHighlightSentence?.newValue !== false;
      if (!highlightAllowed) clearSentenceVisuals();
    }
    if (changes.enablePlugin?.newValue === false || changes.wordExplosionEnabled?.newValue === false || changes.wordExplosionTriggerMode?.newValue === 'hover') {
      activationGeneration++;
      clearOwnedTimers();
      clearSentenceVisuals();
      return;
    }
  };
  try { chrome.storage.onChanged.addListener(onStorageChanged); } catch (_) {}

  document.addEventListener('pointerdown', onPointerDown, true);
  state.cleanup = () => {
    if (disposed) return;
    disposed = true;
    highlightAllowed = false;
    highlightRevision++;
    activationGeneration++;
    clearOwnedTimers();
    try { document.removeEventListener('pointerdown', onPointerDown, true); } catch (_) {}
    try { window.removeEventListener('scroll', scheduleRedraw, true); } catch (_) {}
    try { window.removeEventListener('resize', scheduleRedraw, true); } catch (_) {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (_) {}
    if (wrappedHideWordExplosion && globalThis.hideWordExplosion === wrappedHideWordExplosion) {
      try { globalThis.hideWordExplosion = originalHideWordExplosion; } catch (_) {}
    }
    wrappedHideWordExplosion = null;
    originalHideWordExplosion = null;
    clearSentenceVisuals();
  };
})();
