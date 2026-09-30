import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'adapter', 'state.js');
const THEME_BRIDGE_PATH = path.join(ROOT, 'adapter', 'theme_event_bridge.js');

const loadPersistedTooltipMode = async (adapterSchemaVersion, tooltipThemeMode) => {
  const persisted = JSON.stringify({
    adapterSchemaVersion,
    storage: { tooltipThemeMode },
    words: {},
  });
  const context = vm.createContext({
    structuredClone,
    setTimeout: () => 1,
    clearTimeout() {},
    PathUtils: { join: (...parts) => parts.join('/') },
    IOUtils: {
      async makeDirectory() {},
      async exists() { return false; },
    },
    Zotero: {
      DataDirectory: { dir: '/test-profile' },
      Prefs: {
        get: () => persisted,
        set() {},
      },
      File: {},
      debug() {},
      logError() {},
    },
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), context, { filename: STATE_PATH });

  const state = new context.LingKumaStateAdapter({
    pluginID: 'lingkuma-zotero@white-ink-cell',
    version: '1.0.1',
  });
  await state.load();
  return state.storage.tooltipThemeMode;
};

test('schema 8 preserves an explicit light tooltip theme', async () => {
  assert.equal(await loadPersistedTooltipMode(8, 'light'), 'light');
});

test('schema 8 preserves an explicit dark tooltip theme', async () => {
  assert.equal(await loadPersistedTooltipMode(8, 'dark'), 'dark');
});

test('schema 8 keeps auto and schema 9 preserves every valid tooltip theme', async () => {
  assert.equal(await loadPersistedTooltipMode(8, 'auto'), 'auto');
  for (const mode of ['light', 'dark', 'auto']) {
    assert.equal(await loadPersistedTooltipMode(9, mode), mode);
  }
});
test('schema 8 defaults missing or invalid tooltip themes to auto', async t => {
  const cases = [
    ['missing', undefined],
    ['null', null],
    ['empty string', ''],
    ['invalid string', 'sepia'],
    ['non-string object', { mode: 'dark' }],
  ];

  for (const [name, value] of cases) {
    await t.test(name, async () => {
      assert.equal(await loadPersistedTooltipMode(8, value), 'auto');
    });
  }
});
const exerciseThemeBridgeMessage = isDark => {
  const mutations = {
    capsuleClass: 0,
    capsuleIcon: 0,
    highlightSetDarkMode: 0,
    highlightReapply: 0,
    tooltipClass: 0,
    explosionClass: 0,
    floating: 0,
  };
  const clickRegistrations = { document: 0, tooltipRoot: 0, explosionRoot: 0 };
  const classList = (counter, state = {}) => ({
    toggle(name, enabled) {
      mutations[counter] += 1;
      state[name] = enabled === true;
    },
    contains(name) { return state[name] === true; },
  });
  const capsuleState = {};
  const floatingSwitchCapsule = { classList: classList('capsuleClass', capsuleState) };
  const capsuleThemeButton = {};
  const tooltip = { classList: classList('tooltipClass') };
  const explosion = { classList: classList('explosionClass') };
  const explosionButtons = { classList: classList('explosionClass') };
  const tooltipRoot = {
    querySelector: selector => selector === '.vocab-tooltip' ? tooltip : null,
    querySelectorAll(selector) {
      if (selector === '.header-buttons-capsule') return [floatingSwitchCapsule];
      if (selector === '.capsule-highlight-theme-btn') return [capsuleThemeButton];
      return [];
    },
    addEventListener(type) {
      if (type === 'click') clickRegistrations.tooltipRoot += 1;
    },
    removeEventListener() {},
  };
  const explosionRoot = {
    querySelector: selector => selector === '.word-explosion-container' ? explosion : null,
    querySelectorAll: () => [],
    getElementById: id => id === 'word-explosion-left-buttons-wrapper' ? explosionButtons : null,
    addEventListener(type) {
      if (type === 'click') clickRegistrations.explosionRoot += 1;
    },
    removeEventListener() {},
  };
  const floatingDataset = new Proxy({}, {
    set(target, key, value) {
      mutations.floating += 1;
      target[key] = value;
      return true;
    },
  });
  const floatingButton = {
    dataset: floatingDataset,
    setAttribute() { mutations.floating += 1; },
  };
  let runtimeListener = null;
  const context = vm.createContext({
    queueMicrotask,
    setTimeout: () => 1,
    clearTimeout() {},
    __LINGKUMA_ZOTERO_READER__: true,
    __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: {
      get(id) {
        if (id === 'lingkuma-tooltip-host') return tooltipRoot;
        if (id === 'lingkuma-explosion-host') return explosionRoot;
        return null;
      },
    },
    highlightManager: {
      isDarkMode: false,
      setDarkMode(value) {
        this.isDarkMode = value;
        mutations.highlightSetDarkMode += 1;
      },
      reapplyHighlights() { mutations.highlightReapply += 1; },
    },
    updateHighlightThemeButtonIcon(_button, value) {
      mutations.capsuleIcon += 1;
      mutations.capsuleIconDark = value === true;
    },
    document: {
      getElementById(id) {
        if (id === 'lingkuma-word-highlight-floating-root') {
          return { shadowRoot: { querySelector: () => floatingButton } };
        }
        return { shadowRoot: null };
      },
      addEventListener(type) {
        if (type === 'click') clickRegistrations.document += 1;
      },
      removeEventListener() {},
    },
    chrome: {
      storage: {
        local: { get(_defaults, callback) { callback({ tooltipThemeMode: 'auto' }); } },
        onChanged: { addListener() {}, removeListener() {} },
      },
      runtime: {
        onMessage: {
          addListener(listener) { runtimeListener = listener; },
          removeListener() {},
        },
      },
    },
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(THEME_BRIDGE_PATH, 'utf8'), context, { filename: THEME_BRIDGE_PATH });

  for (const key of Object.keys(mutations)) mutations[key] = 0;
  runtimeListener({ action: 'updateHighlightTheme', isDark }, {}, () => {});

  return {
    capsuleClassDark: capsuleState['dark-mode'] === true,
    capsuleIconDark: mutations.capsuleIconDark === true,
    capsuleClassMutations: mutations.capsuleClass,
    capsuleIconMutations: mutations.capsuleIcon,
    highlightSetDarkModeCalls: mutations.highlightSetDarkMode,
    highlightReapplyCalls: mutations.highlightReapply,
    genericTooltipClassMutations: mutations.tooltipClass,
    genericExplosionClassMutations: mutations.explosionClass,
    floatingMutations: mutations.floating,
    clickRegistrations,
  };
};

test('captured lingkuma floating switch renders theme without adapter state ownership', () => {
  const { clickRegistrations: _clickRegistrations, ...rendering } = exerciseThemeBridgeMessage(true);
  assert.deepEqual(rendering, {
    capsuleClassDark: true,
    capsuleIconDark: true,
    capsuleClassMutations: 1,
    capsuleIconMutations: 1,
    highlightSetDarkModeCalls: 0,
    highlightReapplyCalls: 0,
    genericTooltipClassMutations: 0,
    genericExplosionClassMutations: 0,
    floatingMutations: 0,
  });
});
test('theme bridge installs no adapter-owned click behavior', () => {
  const result = exerciseThemeBridgeMessage(true);
  assert.equal(result.capsuleClassDark, true);
  assert.equal(result.capsuleIconDark, true);
  assert.deepEqual(result.clickRegistrations, {
    document: 0,
    tooltipRoot: 0,
    explosionRoot: 0,
  });
});
const installThemeBridgeHarness = ({ initialHostDark = false } = {}) => {
  const state = {
    capsuleDark: false,
    iconDark: false,
    capsuleMutations: 0,
    runtimeRemovals: 0,
    storageRemovals: 0,
    captureSubscriptions: 0,
    captureUnsubscribes: 0,
  };
  const capsule = {
    classList: {
      toggle(name, enabled) {
        if (name === 'dark-mode') state.capsuleDark = enabled === true;
        state.capsuleMutations += 1;
      },
    },
  };
  const themeButton = {};
  const tooltipRoot = {
    querySelectorAll(selector) {
      if (selector === '.header-buttons-capsule') return [capsule];
      if (selector === '.capsule-highlight-theme-btn') return [themeButton];
      return [];
    },
  };
  let runtimeListener = null;
  let storageListener = null;
  let captureListener = null;
  const capture = {
    get: id => id === 'lingkuma-tooltip-host' ? tooltipRoot : null,
    onCapture(listener) {
      state.captureSubscriptions += 1;
      captureListener = listener;
      return () => { state.captureUnsubscribes += 1; };
    },
  };
  const context = vm.createContext({
    queueMicrotask,
    __LINGKUMA_ZOTERO_READER__: true,
    __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: capture,
    highlightManager: { isDarkMode: initialHostDark },
    updateHighlightThemeButtonIcon(_button, isDark) { state.iconDark = isDark === true; },
    chrome: {
      storage: {
        local: { get(_defaults, callback) { callback({ tooltipThemeMode: 'auto' }); } },
        onChanged: {
          addListener(listener) { storageListener = listener; },
          removeListener() { state.storageRemovals += 1; },
        },
      },
      runtime: {
        onMessage: {
          addListener(listener) { runtimeListener = listener; },
          removeListener() { state.runtimeRemovals += 1; },
        },
      },
    },
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(THEME_BRIDGE_PATH, 'utf8'), context, { filename: THEME_BRIDGE_PATH });

  return {
    state,
    setHostDark(value) { context.highlightManager.isDarkMode = value === true; },
    sendHighlightTheme(value) {
      runtimeListener({ action: 'updateHighlightTheme', isDark: value }, {}, () => {});
    },
    async changeTooltipMode(mode) {
      storageListener({ tooltipThemeMode: { newValue: mode } }, 'local');
      await Promise.resolve();
    },
    cleanup() { context.__LINGKUMA_ZOTERO_THEME_EVENT_BRIDGE__.cleanup(); },
    emitCapture() { captureListener?.({ id: 'lingkuma-tooltip-host' }, tooltipRoot); },
    emitStoredTheme(mode) { storageListener({ tooltipThemeMode: { newValue: mode } }, 'local'); },
    emitPageThemeOverrides(newValue, oldValue = {}) {
      storageListener({ highlightPageThemeOverrides: { oldValue, newValue } }, 'local');
    },
  };
};

test('captured capsule respects fixed tooltip modes and auto follows public theme messages', async () => {
  const harness = installThemeBridgeHarness({ initialHostDark: true });

  await harness.changeTooltipMode('light');
  harness.sendHighlightTheme(true);
  assert.equal(harness.state.capsuleDark, false);
  assert.equal(harness.state.iconDark, true);

  harness.setHostDark(false);
  await harness.changeTooltipMode('dark');
  harness.sendHighlightTheme(false);
  assert.equal(harness.state.capsuleDark, true);
  assert.equal(harness.state.iconDark, false);

  await harness.changeTooltipMode('auto');
  harness.sendHighlightTheme(true);
  assert.equal(harness.state.capsuleDark, true);
  assert.equal(harness.state.iconDark, true);
  harness.sendHighlightTheme(false);
  assert.equal(harness.state.capsuleDark, false);
  assert.equal(harness.state.iconDark, false);
});
test('theme bridge cleanup is idempotent and blocks later public callbacks', async () => {
  const harness = installThemeBridgeHarness();
  const mutationsBeforeCleanup = harness.state.capsuleMutations;

  harness.cleanup();
  harness.cleanup();

  assert.equal(harness.state.runtimeRemovals, 1);
  assert.equal(harness.state.storageRemovals, 1);
  assert.equal(harness.state.captureSubscriptions, 1);
  assert.equal(harness.state.captureUnsubscribes, 1);

  harness.sendHighlightTheme(true);
  harness.emitStoredTheme('dark');
  harness.emitCapture();
  await Promise.resolve();

  assert.equal(harness.state.capsuleMutations, mutationsBeforeCleanup);
});
test('unrelated page-theme storage broadcasts do not mutate the current capsule', async () => {
  const harness = installThemeBridgeHarness({ initialHostDark: false });
  const mutationsBeforeBroadcast = harness.state.capsuleMutations;

  harness.emitPageThemeOverrides({ 'unrelated-page-a': true });
  await Promise.resolve();

  assert.deepEqual({
    capsuleDark: harness.state.capsuleDark,
    mutationDelta: harness.state.capsuleMutations - mutationsBeforeBroadcast,
  }, {
    capsuleDark: false,
    mutationDelta: 0,
  });
});
