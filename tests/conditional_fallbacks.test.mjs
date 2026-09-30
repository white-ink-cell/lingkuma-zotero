import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENTENCE_PANEL_SOURCE = fs.readFileSync(path.join(ROOT, 'adapter', 'sentence_panel_patch.js'), 'utf8');
const GLASS_FALLBACK_SOURCE = fs.readFileSync(path.join(ROOT, 'adapter', 'glass_fallback.js'), 'utf8');

const loadSentencePanel = ({ nativePanelVisible = false, settings = {}, sentenceRange = null } = {}) => {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const storageListeners = new Set();
  const elementsById = new Map();
  const activeTimers = new Set();
  let shows = 0;
  const originalHideWordExplosion = function hideWordExplosion() {};
  const trackedSetTimeout = (callback, delay) => {
    const timer = setTimeout(() => {
      activeTimers.delete(timer);
      callback();
    }, delay);
    activeTimers.add(timer);
    return timer;
  };
  const trackedClearTimeout = timer => {
    activeTimers.delete(timer);
    clearTimeout(timer);
  };
  const nativePanel = {
    style: { display: 'block' },
    getBoundingClientRect() { return { width: 320, height: 180 }; },
  };
  const nativeHost = {
    shadowRoot: {
      querySelector() { return nativePanel; },
    },
  };
  const context = vm.createContext({
    console: { warn() {} },
    document: {
      addEventListener(type, listener) { documentListeners.set(type, listener); },
      removeEventListener(type, listener) { if (documentListeners.get(type) === listener) documentListeners.delete(type); },
      getElementById(id) {
        if (nativePanelVisible && id === 'lingkuma-explosion-host') return nativeHost;
        return elementsById.get(id) || null;
      },
      contains() { return true; },
      documentElement: {
        appendChild(element) {
          if (element.id) elementsById.set(element.id, element);
        },
      },
      createElement() {
        return {
          id: '',
          dataset: {},
          style: {},
          setAttribute() {},
          appendChild() {},
          remove() {
            if (this.id) elementsById.delete(this.id);
          },
        };
      },
    },
    chrome: {
      storage: {
        local: {
          get(_keys, callback) {
            callback({
              enablePlugin: true,
              wordExplosionEnabled: true,
              wordExplosionTriggerMode: 'click',
              wordExplosionHighlightSentence: false,
              ...settings,
            });
          },
        },
        onChanged: {
          addListener(listener) { storageListeners.add(listener); },
          removeListener(listener) { storageListeners.delete(listener); },
        },
      },
    },
    findWordAndSentenceAtPosition() {
      return { sentence: 'A cleanup race must not reopen this panel.', sentenceRange };
    },
    showWordExplosion() { shows++; },
    hideWordExplosion: originalHideWordExplosion,
    removeExplosionSentenceHighlight() {},
    getComputedStyle() { return { display: 'block', visibility: 'visible', opacity: '1' }; },
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
  });
  context.window = context;
  context.addEventListener = (type, listener) => { windowListeners.set(type, listener); };
  context.removeEventListener = (type, listener) => { if (windowListeners.get(type) === listener) windowListeners.delete(type); };
  vm.runInContext(SENTENCE_PANEL_SOURCE, context, { filename: 'adapter/sentence_panel_patch.js' });
  return {
    context,
    documentListeners,
    windowListeners,
    storageListeners,
    elementsById,
    activeTimers,
    originalHideWordExplosion,
    get shows() { return shows; },
  };
};

test('sentence fallback cleanup prevents queued activation from reopening the panel', async () => {
  const harness = loadSentencePanel();
  const target = {
    tagName: 'SPAN',
    textContent: 'A cleanup race must not reopen this panel.',
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };

  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 20,
    clientY: 30,
    target,
    composedPath() { return [target]; },
  });
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
  await new Promise(resolve => setTimeout(resolve, 240));

  assert.equal(harness.shows, 0);
  assert.equal(harness.documentListeners.has('pointerdown'), false);
  assert.equal(harness.windowListeners.size, 0);
  assert.equal(harness.storageListeners.size, 0);
});

test('a later blank-surface click cancels a queued sentence fallback', async () => {
  const harness = loadSentencePanel();
  const textTarget = {
    tagName: 'SPAN',
    textContent: 'A stale sentence must not reopen after a blank click.',
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };
  const blankTarget = {
    tagName: 'CANVAS',
    textContent: '',
    closest() { return null; },
  };
  const pointerdown = harness.documentListeners.get('pointerdown');

  pointerdown({
    button: 0,
    clientX: 20,
    clientY: 30,
    target: textTarget,
    composedPath() { return [textTarget]; },
  });
  await Promise.resolve();
  pointerdown({
    button: 0,
    clientX: 200,
    clientY: 300,
    target: blankTarget,
    composedPath() { return [blankTarget]; },
  });
  await new Promise(resolve => setTimeout(resolve, 240));

  assert.equal(harness.shows, 0);
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
});

test('a visible native sentence panel suppresses the delayed fallback', async () => {
  const harness = loadSentencePanel({ nativePanelVisible: true });
  const target = {
    tagName: 'SPAN',
    textContent: 'The native panel is already visible.',
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };

  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 40,
    clientY: 50,
    target,
    composedPath() { return [target]; },
  });
  await new Promise(resolve => setTimeout(resolve, 240));

  assert.equal(harness.shows, 0);
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
});
test('an absent native sentence panel activates the fallback exactly once', async () => {
  const harness = loadSentencePanel();
  const target = {
    tagName: 'SPAN',
    textContent: 'The missing native panel needs one fallback.',
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };

  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 60,
    clientY: 70,
    target,
    composedPath() { return [target]; },
  });
  await new Promise(resolve => setTimeout(resolve, 280));

  assert.equal(harness.shows, 1);
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
});
test('disabled, hover, plugin UI, and non-text input never activate the fallback', async t => {
  const textTarget = {
    tagName: 'SPAN',
    textContent: 'This is a valid text surface.',
    matches() { return false; },
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };
  const cases = [
    {
      name: 'plugin disabled',
      options: { settings: { enablePlugin: false } },
      target: textTarget,
    },
    {
      name: 'hover mode',
      options: { settings: { wordExplosionTriggerMode: 'hover' } },
      target: textTarget,
    },
    {
      name: 'plugin UI',
      options: {},
      target: {
        id: 'lingkuma-tooltip-host',
        tagName: 'DIV',
        textContent: 'Plugin UI',
        matches() { return false; },
        closest() { return null; },
      },
    },
    {
      name: 'non-text surface',
      options: {},
      target: {
        tagName: 'CANVAS',
        textContent: '',
        matches() { return false; },
        closest() { return null; },
      },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const harness = loadSentencePanel(scenario.options);
      harness.documentListeners.get('pointerdown')({
        button: 0,
        clientX: 80,
        clientY: 90,
        target: scenario.target,
        composedPath() { return [scenario.target]; },
      });
      await new Promise(resolve => setTimeout(resolve, 240));

      assert.equal(harness.shows, 0);
      harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
    });
  }
});
test('cleanup restores hide identity and removes overlay, listeners, and timers', async () => {
  const startContainer = {};
  const endContainer = {};
  const sentenceRange = {
    startContainer,
    endContainer,
    getClientRects() {
      return [{ left: 10, top: 20, right: 210, bottom: 40, width: 200, height: 20 }];
    },
  };
  const harness = loadSentencePanel({
    settings: { wordExplosionHighlightSentence: true },
    sentenceRange,
  });
  const target = {
    tagName: 'SPAN',
    textContent: 'Cleanup owns every sentence fallback resource.',
    matches() { return false; },
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };
  const wrappedHideWordExplosion = harness.context.hideWordExplosion;

  assert.notEqual(wrappedHideWordExplosion, harness.originalHideWordExplosion);
  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 100,
    clientY: 30,
    target,
    composedPath() { return [target]; },
  });
  await new Promise(resolve => setTimeout(resolve, 140));
  assert.ok(harness.elementsById.has('lingkuma-zotero-sentence-range-overlay'));
  assert.ok(harness.activeTimers.size > 0);

  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();

  assert.equal(harness.context.hideWordExplosion, harness.originalHideWordExplosion);
  assert.equal(harness.elementsById.has('lingkuma-zotero-sentence-range-overlay'), false);
  assert.equal(harness.documentListeners.size, 0);
  assert.equal(harness.windowListeners.size, 0);
  assert.equal(harness.storageListeners.size, 0);
  assert.equal(harness.activeTimers.size, 0);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(harness.shows, 0);
});
test('glass fallback styles only tooltip roots once and cleanup unsubscribes', () => {
  const captureListeners = new Set();
  const registry = {
    get() { return null; },
    onCapture(listener) {
      captureListeners.add(listener);
      return () => captureListeners.delete(listener);
    },
  };
  const context = vm.createContext({
    console: { warn() {} },
    __LINGKUMA_ZOTERO_READER__: true,
    __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: registry,
    document: {
      getElementById() { return null; },
      createElement(tagName) {
        return { tagName, id: '', textContent: '' };
      },
    },
  });
  context.globalThis = context;
  vm.runInContext(GLASS_FALLBACK_SOURCE, context, { filename: 'adapter/glass_fallback.js' });

  assert.equal(captureListeners.size, 1);
  const capture = Array.from(captureListeners)[0];
  const makeRoot = () => {
    const styles = new Map();
    return {
      styles,
      getElementById(id) { return styles.get(id) || null; },
      appendChild(node) { styles.set(node.id, node); },
    };
  };
  const tooltipRoot = makeRoot();
  const explosionRoot = makeRoot();
  const tooltipHost = { localName: 'lingkuma-tooltip-root' };
  const explosionHost = { localName: 'lingkuma-explosion-root' };

  capture(tooltipHost, tooltipRoot);
  capture(tooltipHost, tooltipRoot);
  capture(explosionHost, explosionRoot);

  assert.equal(tooltipRoot.styles.size, 1);
  assert.ok(tooltipRoot.styles.has('lingkuma-zotero-gecko-glass-fallback-style'));
  assert.equal(explosionRoot.styles.size, 0);

  context.__LINGKUMA_ZOTERO_GLASS_FALLBACK__.cleanup();
  assert.equal(captureListeners.size, 0);
});
test('disabling the plugin cancels a queued sentence fallback', async () => {
  const harness = loadSentencePanel();
  const target = {
    tagName: 'SPAN',
    textContent: 'Disabling LingKuma must cancel this queued fallback.',
    matches() { return false; },
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };

  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 120,
    clientY: 130,
    target,
    composedPath() { return [target]; },
  });
  await Promise.resolve();
  const storageListener = Array.from(harness.storageListeners)[0];
  storageListener({ enablePlugin: { newValue: false } }, 'local');
  const timersAfterDisable = harness.activeTimers.size;
  await new Promise(resolve => setTimeout(resolve, 240));

  assert.deepEqual(
    { timersAfterDisable, shows: harness.shows },
    { timersAfterDisable: 0, shows: 0 },
  );
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
});

test('inactive sentence modes never redraw an overlay on scroll', async t => {
  const sentenceRange = {
    startContainer: {},
    endContainer: {},
    getClientRects() {
      return [{ left: 10, top: 20, right: 210, bottom: 40, width: 200, height: 20 }];
    },
  };
  const target = {
    tagName: 'SPAN',
    textContent: 'Inactive modes must not redraw this sentence.',
    matches() { return false; },
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };
  const cases = [
    ['plugin disabled', { enablePlugin: false }],
    ['word explosion disabled', { wordExplosionEnabled: false }],
    ['hover mode', { wordExplosionTriggerMode: 'hover' }],
    ['sentence highlight disabled', { wordExplosionHighlightSentence: false }],
  ];

  for (const [name, settings] of cases) {
    await t.test(name, async () => {
      const harness = loadSentencePanel({ settings, sentenceRange });
      harness.documentListeners.get('pointerdown')({
        button: 0,
        clientX: 140,
        clientY: 150,
        target,
        composedPath() { return [target]; },
      });
      harness.windowListeners.get('scroll')();
      await new Promise(resolve => setTimeout(resolve, 40));
      const actual = {
        hasOverlay: harness.elementsById.has('lingkuma-zotero-sentence-range-overlay'),
        shows: harness.shows,
      };
      harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();

      assert.deepEqual(actual, { hasOverlay: false, shows: 0 });
    });
  }
});
test('disabling word explosion cancels a queued sentence fallback', async () => {
  const harness = loadSentencePanel();
  const target = {
    tagName: 'SPAN',
    textContent: 'Disabling Word Explosion must cancel this queued fallback.',
    matches() { return false; },
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };

  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 160,
    clientY: 170,
    target,
    composedPath() { return [target]; },
  });
  await Promise.resolve();
  const storageListener = Array.from(harness.storageListeners)[0];
  storageListener({ wordExplosionEnabled: { newValue: false } }, 'local');
  const timersAfterDisable = harness.activeTimers.size;
  await new Promise(resolve => setTimeout(resolve, 240));

  assert.deepEqual(
    { timersAfterDisable, shows: harness.shows },
    { timersAfterDisable: 0, shows: 0 },
  );
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
});

test('switching to hover cancels a queued click sentence fallback', async () => {
  const harness = loadSentencePanel();
  const target = {
    tagName: 'SPAN',
    textContent: 'Hover mode must cancel this queued click fallback.',
    matches() { return false; },
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };

  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 180,
    clientY: 190,
    target,
    composedPath() { return [target]; },
  });
  await Promise.resolve();
  const storageListener = Array.from(harness.storageListeners)[0];
  storageListener({ wordExplosionTriggerMode: { newValue: 'hover' } }, 'local');
  const timersAfterSwitch = harness.activeTimers.size;
  await new Promise(resolve => setTimeout(resolve, 240));

  assert.deepEqual(
    { timersAfterSwitch, shows: harness.shows },
    { timersAfterSwitch: 0, shows: 0 },
  );
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
});
test('disabling sentence highlight preserves the queued panel without visual residue', async () => {
  const sentenceRange = {
    startContainer: {},
    endContainer: {},
    getClientRects() {
      return [{ left: 10, top: 20, right: 210, bottom: 40, width: 200, height: 20 }];
    },
  };
  const harness = loadSentencePanel({
    settings: { wordExplosionHighlightSentence: true },
    sentenceRange,
  });
  const target = {
    tagName: 'SPAN',
    textContent: 'The panel remains available while sentence highlighting turns off.',
    matches() { return false; },
    closest(selector) { return selector.includes('.textLayer') ? {} : null; },
  };

  harness.documentListeners.get('pointerdown')({
    button: 0,
    clientX: 200,
    clientY: 210,
    target,
    composedPath() { return [target]; },
  });
  await Promise.resolve();
  const storageListener = Array.from(harness.storageListeners)[0];
  storageListener({ wordExplosionHighlightSentence: { newValue: false } }, 'local');
  await new Promise(resolve => setTimeout(resolve, 300));

  assert.deepEqual(
    {
      shows: harness.shows,
      hasOverlay: harness.elementsById.has('lingkuma-zotero-sentence-range-overlay'),
      activeTimers: harness.activeTimers.size,
    },
    { shows: 1, hasOverlay: false, activeTimers: 0 },
  );
  harness.context.__LINGKUMA_SENTENCE_PANEL_PATCH__.cleanup();
});