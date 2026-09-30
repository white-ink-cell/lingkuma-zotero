import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const loadBootstrap = () => {
  const context = vm.createContext({
    APP_SHUTDOWN: 2,
    Zotero: {
      debug() {},
      logError() {},
    },
    Services: { scriptloader: { loadSubScript() {} } },
    Error,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'bootstrap.js'), 'utf8'), context, { filename: 'bootstrap.js' });
  return context;
};

const loadMain = () => {
  const registrations = [];
  const lifecycle = [];
  class StateAdapter {
    constructor() { this.words = {}; }
    async load() { lifecycle.push('state-load'); }
    async save() { lifecycle.push('state-save'); }
    addStorageListener() {}
  }
  class LookupService {
    async init() { lifecycle.push('lookup-init'); }
    async shutdown() { lifecycle.push('lookup-shutdown'); }
  }
  class MessageHost {
    constructor() { this.contexts = new Set(); }
  }
  const context = vm.createContext({
    LK_CONTENT_CSS_TEXT: '',
    LK_RESOURCE_DATA: {},
    LingKumaStateAdapter: StateAdapter,
    LingKumaLookupService: LookupService,
    LingKumaMessageHost: MessageHost,
    Zotero: {
      debug() {},
      logError() {},
      getMainWindows: () => [],
      Reader: {
        _readers: [],
        registerEventListener(type, handler, id) { registrations.push([type, handler, id]); },
        unregisterEventListener() {},
      },
    },
    setTimeout,
    clearTimeout,
    Error,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'main.js'), 'utf8'), context, { filename: 'adapter/main.js' });
  return { context, registrations, lifecycle };
};

const loadBridge = () => {
  const counts = { eval: 0, nuke: 0, sources: [] };
  const context = vm.createContext({
    Zotero: { debug() {}, logError() {}, getMainWindow: () => null },
    Components: {
      utils: {
        evalInSandbox(source) { counts.eval++; counts.sources.push(source); },
        exportFunction(fn, sandbox, options) { sandbox[options.defineAs] = fn; },
        nukeSandbox() { counts.nuke++; },
      },
    },
    setTimeout,
    Error,
    URL,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'bridge.js'), 'utf8'), context, { filename: 'adapter/bridge.js' });
  return { context, counts };
};

test('APP_SHUTDOWN uses the same idempotent plugin cleanup path', async () => {
  const context = loadBootstrap();
  let stopCalls = 0;
  context.LingKumaPluginInstance = { async stop() { stopCalls++; } };
  context.LingKumaBootstrapData = { id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' };

  await context.shutdown(context.LingKumaBootstrapData, context.APP_SHUTDOWN);
  await context.shutdown({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' }, context.APP_SHUTDOWN);

  assert.equal(stopCalls, 1);
  assert.equal(context.LingKumaPluginInstance, null);
  assert.equal(context.LingKumaBootstrapData, null);
});
test('bootstrap loads the catalog and lookup service before bridge and main', async () => {
  const context = loadBootstrap();
  const loaded = [];
  context.Zotero.uiReadyPromise = Promise.resolve();
  context.Zotero.getMainWindow = () => null;
  context.Zotero.PreferencePanes = { async register() {} };
  context.Services.scriptloader.loadSubScript = url => loaded.push(url);
  context.LingKumaZoteroPlugin = class {
    async start() {}
    async stop() {}
  };

  await context.startup({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' }, 1);

  assert.deepEqual(loaded.map(url => url.replace('xpi://lingkuma/', '')), [
    'adapter/state.js',
    'adapter/resources.js',
    'adapter/dictionary_catalog.js',
    'adapter/lookup.js',
    'adapter/bridge.js',
    'adapter/main.js',
  ]);
});
test('lookup lifecycle is nested between state load and final state persistence', async () => {
  const { context, lifecycle } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });

  await plugin.start();
  await plugin.stop();

  assert.deepEqual(lifecycle, ['state-load', 'lookup-init', 'lookup-shutdown', 'state-save']);
});
test('repeated start registers each Zotero reader lifecycle hook once', async () => {
  const { context, registrations } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });

  await plugin.start();
  await plugin.start();

  assert.deepEqual(registrations.map(([type]) => type), ['renderToolbar', 'renderTextSelectionPopup']);
  assert.equal(plugin.readerHandlers.length, 2);
});
test('stop is idempotent and releases timers, contexts, DOM, menus, audio, host, and retry state', async () => {
  const { context } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });
  const counts = { unregister: 0, context: 0, dom: 0, menu: 0, audio: 0, host: 0, save: 0 };
  const contentWindow = {
    document: {
      getElementById() { return { remove() { counts.dom++; } }; },
      querySelector() { return { remove() { counts.dom++; } }; },
    },
  };
  const mainWindow = { LingKumaZoteroPlugin: plugin };
  const reader = { __lingkumaRetryCount: 5 };
  const timer = setTimeout(() => {}, 60_000);

  context.Zotero.Reader.unregisterEventListener = () => { counts.unregister++; };
  context.Zotero.Reader._readers = [reader];
  plugin.readerHandlers = [['renderToolbar', () => {}], ['renderTextSelectionPopup', () => {}]];
  plugin.contextsByWindow.set(contentWindow, { destroy() { counts.context++; } });
  plugin.windowMenus.set(mainWindow, [{ remove() { counts.menu++; } }]);
  plugin.scanTimers.set(reader, timer);
  plugin.stopAudio = () => { counts.audio++; };
  plugin.host = { destroy() { counts.host++; } };
  plugin.state.save = async () => { counts.save++; };
  plugin.started = true;

  await plugin.stop();
  await plugin.stop();

  assert.deepEqual(counts, { unregister: 2, context: 1, dom: 6, menu: 1, audio: 1, host: 1, save: 1 });
  assert.equal(plugin.contextsByWindow.size, 0);
  assert.equal(plugin.scanTimers.size, 0);
  assert.equal(reader.__lingkumaRetryCount, 0);
  assert.equal('LingKumaZoteroPlugin' in mainWindow, false);
});
test('main-window close releases only its reader contexts, timers, retry state, and DOM', () => {
  const { context } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });
  const counts = { ownedContext: 0, otherContext: 0, ownedDom: 0, menu: 0 };
  const mainWindow = { LingKumaZoteroPlugin: plugin };
  const otherMainWindow = {};
  const ownedWindow = {
    top: mainWindow,
    document: {
      getElementById() { return { remove() { counts.ownedDom++; } }; },
      querySelector() { return { remove() { counts.ownedDom++; } }; },
    },
  };
  const otherWindow = { top: otherMainWindow, document: { getElementById() { return null; }, querySelector() { return null; } } };
  const ownedReader = { _iframeWindow: ownedWindow, __lingkumaRetryCount: 4 };
  const otherReader = { _iframeWindow: otherWindow, __lingkumaRetryCount: 3 };
  const ownedTimer = setTimeout(() => {}, 60_000);
  const otherTimer = setTimeout(() => {}, 60_000);
  ownedTimer.unref();
  otherTimer.unref();

  plugin.windowMenus.set(mainWindow, [{ remove() { counts.menu++; } }]);
  plugin.contextsByWindow.set(ownedWindow, { destroy() { counts.ownedContext++; } });
  plugin.contextsByWindow.set(otherWindow, { destroy() { counts.otherContext++; } });
  plugin.scanTimers.set(ownedReader, ownedTimer);
  plugin.scanTimers.set(otherReader, otherTimer);

  plugin.onMainWindowUnload(mainWindow);

  assert.deepEqual(counts, { ownedContext: 1, otherContext: 0, ownedDom: 6, menu: 1 });
  assert.equal(plugin.contextsByWindow.has(ownedWindow), false);
  assert.equal(plugin.contextsByWindow.has(otherWindow), true);
  assert.equal(plugin.scanTimers.has(ownedReader), false);
  assert.equal(plugin.scanTimers.has(otherReader), true);
  assert.equal(ownedReader.__lingkumaRetryCount, 0);
  assert.equal(otherReader.__lingkumaRetryCount, 3);
  assert.equal('LingKumaZoteroPlugin' in mainWindow, false);

  clearTimeout(otherTimer);
});
test('content context destroy is idempotent across pagehide and stop cleanup', () => {
  const { context, counts } = loadBridge();
  let unregisterCalls = 0;
  const host = {
    nextContextID: 1,
    registerContext() {},
    unregisterContext() { unregisterCalls++; },
  };
  const content = new context.LingKumaContentContext({
    host,
    win: { location: { href: 'reader://pdf' }, document: { documentElement: {} }, closed: false },
    reader: {},
    tabId: 1,
    rootURI: 'xpi://lingkuma/',
    pluginID: 'lingkuma@zotero',
  });
  content.sandbox = {};

  content.destroy();
  content.destroy();

  assert.equal(unregisterCalls, 1);
  assert.equal(counts.eval, 13);
  assert.match(counts.sources[0], /__lkDispatchRuntimeMessageJSON.*teardownHighlightRuntime/);
  assert.match(counts.sources[1], /__lkDispatchRuntimeMessageJSON.*toggleBionic.*isEnabled.*false/);
  assert.match(counts.sources[2], /reading-ruler-container.*remove/);
  assert.match(counts.sources[3], /__lkDispatchRuntimeMessageJSON.*togglePosHighlight.*enabled.*false/);
  assert.match(counts.sources[4], /clearAllPopupsAndWindows/);
  assert.match(counts.sources[5], /__LINGKUMA_ZOTERO_WORD_EXPLOSION__.*cleanup/);
  assert.match(counts.sources[6], /__LINGKUMA_ZOTERO_LOOKUP_UI__.*cleanup/);
  assert.match(counts.sources[7], /__LINGKUMA_ZOTERO_EDGE_TTS__.*cleanup/);
  assert.match(counts.sources[12], /__LINGKUMA_ZOTERO_SHADOW_CAPTURE__.*cleanup/);
  assert.doesNotMatch(counts.sources.join('\n'), /toggleReadingRuler/);
  assert.equal(counts.nuke, 1);
  assert.equal(content.destroyed, true);
  assert.equal(content.sandbox, null);
  assert.equal(content.win, null);
  assert.equal(content.reader, null);
});

test('message host cleanup removes its state listener and destroys contexts once', () => {
  const { context } = loadBridge();
  const listeners = new Set();
  let removed = 0;
  let contextDestroys = 0;
  const state = {
    addStorageListener(listener) { listeners.add(listener); },
    removeStorageListener(listener) { if (listeners.delete(listener)) removed++; },
  };
  const host = new context.LingKumaMessageHost({ state, plugin: {}, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });
  host.contexts.add({ destroy() { contextDestroys++; host.contexts.clear(); } });

  host.destroy();
  host.destroy();

  assert.equal(listeners.size, 0);
  assert.equal(removed, 1);
  assert.equal(contextDestroys, 1);
  assert.equal(host.contexts.size, 0);
});
test('target-language storage changes recheck the exact pair for each live reader context', async () => {
  const { context } = loadBridge();
  let storageListener = null;
  const state = {
    addStorageListener(listener) { storageListener = listener; },
    removeStorageListener() {},
  };
  const ensured = [];
  const dispatched = [];
  const plugin = {
    ensureDefaultDictionaryForContext(readerContext) { ensured.push(readerContext.name); },
  };
  const host = new context.LingKumaMessageHost({ state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });
  host.contexts.add({ name: 'live', destroyed: false, dispatchStorageChanged() { dispatched.push('live'); } });
  host.contexts.add({ name: 'dead', destroyed: true, dispatchStorageChanged() { dispatched.push('dead'); } });

  storageListener({ translationConfig: { oldValue: { targetLanguage: 'zh-CN' }, newValue: { targetLanguage: 'ja' } } }, 'local');
  await new Promise(resolve => setTimeout(resolve, 5));

  assert.deepEqual(dispatched, ['live']);
  assert.deepEqual(ensured, ['live']);
});
test('startup failure cleans a partially initialized plugin before rethrowing', async () => {
  const context = loadBootstrap();
  let stopCalls = 0;
  context.Zotero.uiReadyPromise = Promise.resolve();
  context.Zotero.getMainWindow = () => null;
  context.Zotero.PreferencePanes = { async register() {} };
  context.LingKumaZoteroPlugin = class LingKumaZoteroPlugin {
    async start() { throw new Error('partial startup failure'); }
    async stop() { stopCalls++; }
  };

  await assert.rejects(
    context.startup({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' }, 1),
    /partial startup failure/,
  );

  assert.equal(stopCalls, 1);
  assert.equal(context.LingKumaPluginInstance, null);
  assert.equal(context.LingKumaBootstrapData, null);
});
test('concurrent start calls share one initialization', async () => {
  const { context, registrations } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });
  let releaseLoad;
  const loadGate = new Promise(resolve => { releaseLoad = resolve; });
  plugin.state.load = () => loadGate;

  const first = plugin.start();
  const second = plugin.start();
  releaseLoad();
  await Promise.all([first, second]);

  assert.deepEqual(registrations.map(([type]) => type), ['renderToolbar', 'renderTextSelectionPopup']);
});

test('stop during pending start prevents stale initialization from reactivating', async () => {
  const { context, registrations } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });
  let releaseLoad;
  const loadGate = new Promise(resolve => { releaseLoad = resolve; });
  plugin.state.load = () => loadGate;

  const pendingStart = plugin.start();
  await plugin.stop();
  releaseLoad();
  await pendingStart;

  assert.equal(plugin.started, false);
  assert.equal(registrations.length, 0);
  assert.equal(plugin.readerHandlers.length, 0);
});
test('main-window load cannot reattach while stop awaits state persistence', async () => {
  const { context } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });
  let releaseSave;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  let attaches = 0;
  let scans = 0;
  plugin.state.save = () => saveGate;
  plugin.attachMainWindow = () => { attaches++; };
  plugin.scanAllReaders = () => { scans++; };
  plugin.started = true;
  const win = {};

  const pendingStop = plugin.stop();
  plugin.onMainWindowLoad(win);

  assert.equal(attaches, 0);
  assert.equal(scans, 0);
  assert.equal('LingKumaZoteroPlugin' in win, false);

  releaseSave();
  await pendingStop;
});
test('pagehide and dead-context pruning use the same DOM cleanup path', () => {
  const { context } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });
  const cleaned = [];
  let destroys = 0;
  plugin.cleanupStylesheet = win => { cleaned.push(win); };

  const pagehideWindow = { document: { documentElement: {} }, closed: false };
  const pagehideContext = { destroyed: false, destroy() { destroys++; this.destroyed = true; } };
  plugin.contextsByWindow.set(pagehideWindow, pagehideContext);
  plugin.onContentContextPageHide(pagehideContext);

  const deadWindow = { document: { documentElement: null }, closed: true };
  const deadContext = { destroyed: false, destroy() { destroys++; this.destroyed = true; } };
  plugin.contextsByWindow.set(deadWindow, deadContext);
  plugin.pruneDeadContexts();

  assert.equal(destroys, 2);
  assert.deepEqual(cleaned, [pagehideWindow, deadWindow]);
  assert.equal(plugin.contextsByWindow.size, 0);
});
test('reload and disable-re-enable stop the old instance before starting a fresh one', async () => {
  const context = loadBootstrap();
  let starts = 0;
  let stops = 0;
  context.Zotero.uiReadyPromise = Promise.resolve();
  context.Zotero.getMainWindow = () => null;
  context.Zotero.PreferencePanes = { async register() {} };
  context.LingKumaZoteroPlugin = class LingKumaZoteroPlugin {
    async start() { starts++; }
    async stop() { stops++; }
  };
  const data = { id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' };

  await context.startup(data, 1);
  const first = context.LingKumaPluginInstance;
  await context.shutdown(data, 3);
  await context.startup(data, 3);
  const second = context.LingKumaPluginInstance;
  await context.shutdown(data, 4);
  await context.startup(data, 5);
  const third = context.LingKumaPluginInstance;

  assert.equal(starts, 3);
  assert.equal(stops, 2);
  assert.notEqual(first, second);
  assert.notEqual(second, third);
  assert.equal(context.LingKumaBootstrapData.version, '1.0.1');

  await context.shutdown(data, context.APP_SHUTDOWN);
  assert.equal(stops, 3);
});
test('shutdown while startup awaits UI readiness prevents stale activation', async () => {
  const context = loadBootstrap();
  let releaseUI;
  let starts = 0;
  let stops = 0;
  context.Zotero.uiReadyPromise = new Promise(resolve => { releaseUI = resolve; });
  context.Zotero.getMainWindow = () => null;
  context.Zotero.PreferencePanes = { async register() {} };
  context.LingKumaZoteroPlugin = class LingKumaZoteroPlugin {
    async start() { starts++; }
    async stop() { stops++; }
  };
  const data = { id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' };

  const pendingStartup = context.startup(data, 1);
  await context.shutdown(data, 4);
  releaseUI();
  await pendingStartup;

  assert.equal(starts, 0);
  assert.equal(stops, 0);
  assert.equal(context.LingKumaPluginInstance, null);
  assert.equal(context.LingKumaBootstrapData, null);
});
test('shutdown while plugin start awaits cannot continue to preference registration', async () => {
  const context = loadBootstrap();
  let releaseStart;
  const startGate = new Promise(resolve => { releaseStart = resolve; });
  let starts = 0;
  let stops = 0;
  let preferenceRegistrations = 0;
  context.Zotero.uiReadyPromise = Promise.resolve();
  context.Zotero.getMainWindow = () => null;
  context.Zotero.PreferencePanes = { async register() { preferenceRegistrations++; } };
  context.LingKumaZoteroPlugin = class LingKumaZoteroPlugin {
    async start() { starts++; await startGate; }
    async stop() { if (!this.stopped) { this.stopped = true; stops++; } }
  };
  const data = { id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' };

  const pendingStartup = context.startup(data, 1);
  while (starts === 0) await Promise.resolve();
  await context.shutdown(data, 4);
  releaseStart();
  await pendingStartup;

  assert.equal(stops, 1);
  assert.equal(preferenceRegistrations, 0);
  assert.equal(context.LingKumaPluginInstance, null);
  assert.equal(context.LingKumaBootstrapData, null);
});
test('shutdown while preference registration awaits cannot restore a stale instance', async () => {
  const context = loadBootstrap();
  let releaseRegistration;
  const registrationGate = new Promise(resolve => { releaseRegistration = resolve; });
  let registrations = 0;
  let stops = 0;
  context.Zotero.uiReadyPromise = Promise.resolve();
  context.Zotero.getMainWindow = () => null;
  context.Zotero.PreferencePanes = { async register() { registrations++; await registrationGate; } };
  context.LingKumaZoteroPlugin = class LingKumaZoteroPlugin {
    async start() {}
    async stop() { if (!this.stopped) { this.stopped = true; stops++; } }
  };
  const data = { id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' };

  const pendingStartup = context.startup(data, 1);
  while (registrations === 0) await Promise.resolve();
  await context.shutdown(data, 4);
  releaseRegistration();
  await pendingStartup;

  assert.equal(stops, 1);
  assert.equal(context.LingKumaPluginInstance, null);
  assert.equal(context.LingKumaBootstrapData, null);
});
test('an old shutdown cannot clear bootstrap data from a newer startup', async () => {
  const context = loadBootstrap();
  let releaseOldStop;
  const oldStopGate = new Promise(resolve => { releaseOldStop = resolve; });
  let instanceNumber = 0;
  context.Zotero.uiReadyPromise = Promise.resolve();
  context.Zotero.getMainWindow = () => null;
  context.Zotero.PreferencePanes = { async register() {} };
  context.LingKumaZoteroPlugin = class LingKumaZoteroPlugin {
    constructor() { this.number = ++instanceNumber; }
    async start() {}
    async stop() { if (this.number === 1) await oldStopGate; }
  };
  const oldData = { id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://old/' };
  const newData = { id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://new/' };

  await context.startup(oldData, 1);
  const oldShutdown = context.shutdown(oldData, 3);
  await context.startup(newData, 3);
  const freshInstance = context.LingKumaPluginInstance;
  releaseOldStop();
  await oldShutdown;

  assert.equal(context.LingKumaPluginInstance, freshInstance);
  assert.equal(context.LingKumaBootstrapData.rootURI, 'xpi://new/');
});
test('PDF viewer class cleanup removes only adapter-owned state', () => {
  const { context } = loadMain();
  const plugin = new context.LingKumaZoteroPlugin({ id: 'lingkuma@zotero', version: '1.0.1', rootURI: 'xpi://lingkuma/' });
  const classes = new Set();
  const root = {
    dataset: {},
    classList: {
      contains(name) { return classes.has(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
  };
  const existingStyle = { tagName: 'style', dataset: { build: 'bridge17' } };
  const doc = {
    documentElement: root,
    querySelector(selector) { return selector.includes('.textLayer') ? {} : null; },
    getElementById(id) { return id === 'lingkuma-zotero-upstream-style' ? existingStyle : null; },
  };

  plugin.ensureStylesheet({ document: doc });
  assert.equal(classes.has('pdf-viewer'), true);
  assert.equal(root.dataset.lingkumaPdfViewerClass, 'true');

  doc.getElementById = () => null;
  plugin.cleanupStylesheet({ document: doc });
  assert.equal(classes.has('pdf-viewer'), false);
  assert.equal('lingkumaPdfViewerClass' in root.dataset, false);

  doc.getElementById = id => id === 'lingkuma-zotero-upstream-style' ? existingStyle : null;
  classes.add('pdf-viewer');
  plugin.ensureStylesheet({ document: doc });
  plugin.cleanupStylesheet({ document: doc });
  assert.equal(classes.has('pdf-viewer'), true);
});

test('custom capsule actions open only validated external URLs while browser sidebar stays unsupported', async () => {
  const { context } = loadBridge();
  context.URL = URL;
  const launched = [];
  context.Zotero.launchURL = url => launched.push(url);
  let vocabularyOpens = 0;
  const state = {
    addStorageListener() {},
    removeStorageListener() {},
  };
  const plugin = { openVocabularyManager() { vocabularyOpens++; } };
  const host = new context.LingKumaMessageHost({ state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });

  for (const action of ['openSidebar', 'showSidebar']) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(await host.handleMessage({ action }))),
      { success: false, unsupported: true },
    );
  }
  assert.equal(vocabularyOpens, 0);
  assert.deepEqual(launched, []);

  for (const action of ['openCustomCapsuleSidebar', 'openCustomCapsuleTab', 'openCustomCapsuleWindow']) {
    const result = await host.handleMessage({ action, url: `https://example.test/${action}?q=study` });
    assert.equal(result.success, true);
  }
  assert.equal(vocabularyOpens, 0);
  assert.deepEqual(Array.from(launched), [
    'https://example.test/openCustomCapsuleSidebar?q=study',
    'https://example.test/openCustomCapsuleTab?q=study',
    'https://example.test/openCustomCapsuleWindow?q=study',
  ]);

  for (const url of ['javascript:alert(1)', 'file:///private.txt', 'data:text/plain,bad', '']) {
    await assert.rejects(host.handleMessage({ action: 'openCustomCapsuleTab', url }), /http/i);
  }
  assert.equal(launched.length, 3);
});

test('reader storage view exposes Edge but keeps unsupported TTS and side-panel state inert without mutating persistence', () => {
  const { context } = loadBridge();
  context.URL = URL;
  const raw = {
    ttsConfig: { wordTTSProvider: 'edge', sentenceTTSProvider: 'gpt', localTTSRate: 1.4 },
    sidePanelBtn: true,
    sidePanelKey: 'r',
  };
  const state = {
    storageGet() { return structuredClone(raw); },
    getAIConfigForStorage() { return {}; },
    addStorageListener() {},
    removeStorageListener() {},
  };
  const host = new context.LingKumaMessageHost({ state, plugin: {}, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });
  const content = new context.LingKumaContentContext({
    host,
    win: { location: { href: 'reader://pdf' }, document: { documentElement: {} }, closed: false },
    reader: {},
    tabId: 1,
    rootURI: 'xpi://lingkuma/',
    pluginID: 'lingkuma@zotero',
  });
  const sandbox = {};
  content._installExportedHostFunctions(sandbox);

  const visible = JSON.parse(sandbox.__lkHostStorageGet('null'));

  assert.equal(visible.ttsConfig.wordTTSProvider, 'edge');
  assert.equal(visible.ttsConfig.sentenceTTSProvider, 'edge');
  assert.equal(visible.ttsConfig.localTTSRate, 1.4);
  assert.equal(visible.sidePanelBtn, false);
  assert.equal(visible.sidePanelKey, '__disabled__');
  assert.deepEqual(raw, {
    ttsConfig: { wordTTSProvider: 'edge', sentenceTTSProvider: 'gpt', localTTSRate: 1.4 },
    sidePanelBtn: true,
    sidePanelKey: 'r',
  });
});

test('custom capsule storage view strips legacy HTML injection without mutating source data', () => {
  const { context } = loadBridge();
  context.URL = URL;
  const raw = [{ buttons: [
    { name: 'Safe', url: 'https://safe.example/?q={word}', openMethod: 'newTab', icon: '<svg onload=alert(1)>' },
    { name: '"><img src=x>', url: 'https://safe.example/', openMethod: 'newTab' },
    { name: 'Script', url: 'javascript:alert(1)', openMethod: 'newTab' },
  ] }];

  const safe = context.lkSanitizeCustomCapsules(raw);

  assert.deepEqual(JSON.parse(JSON.stringify(safe)), [{ buttons: [
    { name: 'Safe', url: 'https://safe.example/?q={word}', openMethod: 'newTab' },
  ] }]);
  assert.equal(raw[0].buttons[0].icon, '<svg onload=alert(1)>');

});

test('reader storage change events sanitize unsupported state without mutating persistence', async () => {
  const { context } = loadBridge();
  context.URL = URL;
  let storageListener;
  const state = {
    addStorageListener(listener) { storageListener = listener; },
    removeStorageListener() {},
  };
  const host = new context.LingKumaMessageHost({ state, plugin: {}, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });
  const rawChanges = {
    ttsConfig: { oldValue: { wordTTSProvider: 'edge' }, newValue: { wordTTSProvider: 'gpt' } },
    sidePanelBtn: { oldValue: false, newValue: true },
    sidePanelKey: { oldValue: 'x', newValue: 'r' },
    customCapsules: { oldValue: [], newValue: [{ buttons: [{ name: 'Bad', url: 'javascript:alert(1)', openMethod: 'newTab' }] }] },
  };
  const dispatched = new Promise(resolve => {
    host.contexts.add({ destroyed: false, dispatchStorageChanged(changes, area) { resolve({ changes, area }); } });
  });

  storageListener(rawChanges, 'local');
  const { changes, area } = await dispatched;

  assert.equal(area, 'local');
  assert.equal(changes.ttsConfig.oldValue.wordTTSProvider, 'edge');
  assert.equal(changes.ttsConfig.newValue.wordTTSProvider, 'edge');
  assert.equal(changes.sidePanelBtn.newValue, false);
  assert.equal(changes.sidePanelKey.newValue, '__disabled__');
  assert.deepEqual(JSON.parse(JSON.stringify(changes.customCapsules.newValue)), []);
  assert.equal(rawChanges.ttsConfig.newValue.wordTTSProvider, 'gpt');
  assert.equal(rawChanges.sidePanelBtn.newValue, true);
  assert.equal(rawChanges.sidePanelKey.newValue, 'r');
});
test('reader dictionary status is projected to JSON-safe fields and cannot import host paths', async () => {
  const { context } = loadBridge();
  const calls = [];
  const state = {
    addStorageListener() {},
    removeStorageListener() {},
  };
  const plugin = {
    lookup: {
      async getDictionaryStatus(pair) {
        calls.push(['status', pair]);
        return {
          mode: 'custom', status: 'READY', dictionaryID: 'custom-en-zh',
          sourceLanguage: 'en', targetLanguage: 'zh-CN', entryCount: 3,
          path: 'D:/private/custom-selected.lkdict', db: { privileged: true },
        };
      },
      async importCustomDictionary(path) { calls.push(['import', path]); },
      selectDictionary(mode) { calls.push(['select', mode]); },
    },
  };
  const host = new context.LingKumaMessageHost({ state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });

  const status = JSON.parse(JSON.stringify(await host.handleMessage({
    action: 'getDictionaryStatus', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  })));
  const importResult = JSON.parse(JSON.stringify(await host.handleMessage({ action: 'importCustomDictionary', path: 'D:/secret.lkdict' })));
  const selectResult = JSON.parse(JSON.stringify(await host.handleMessage({ action: 'selectDictionary', mode: 'custom' })));

  assert.deepEqual(status, {
    mode: 'custom', status: 'READY', dictionaryID: 'custom-en-zh',
    sourceLanguage: 'en', targetLanguage: 'zh-CN', entryCount: 3,
  });
  assert.deepEqual(importResult, {});
  assert.deepEqual(selectResult, {});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['status', { sourceLanguage: 'en', targetLanguage: 'zh-CN' }]]);
  assert.equal(JSON.stringify(status).includes('D:/'), false);
});

test('reader dictionary lookup is token-bound and projected to the frozen JSON shape', async () => {
  const { context } = loadBridge();
  const calls = [];
  const state = { addStorageListener() {}, removeStorageListener() {} };
  const plugin = {
    lookup: {
      async lookupDictionary(request) {
        calls.push(request);
        return {
          requestToken: 'hostile-old-token', status: 'HIT',
          entry: {
            surface: request.surface, dictionaryForm: 'study',
            meanings: ['学习', '', '研究', '学习', 'fourth'],
            pos: ['v', 'n'], ipa: '/ˈstʌdi/',
            pronunciations: [
              {
                ipa: '/ˈstʌdi/', region: 'US',
                url: 'https://audio.example/study-us.mp3',
                sourceURL: 'https://commons.wikimedia.org/wiki/File:study-us.ogg',
                license: 'CC BY-SA 4.0',
              },
              { ipa: '/ˈstʌdi/', region: 'US' },
              { ipa: '/ˈstʌdi/', region: 'UK' },
              { ipa: '', region: 'Other' },
            ],
            audio: {
              url: 'https://audio.example/study.mp3', license: 'CC BY-SA 4.0', region: 'US',
              sourceURL: 'https://commons.wikimedia.org/wiki/File:study.ogg', path: 'D:/private.mp3',
            },
            path: 'D:/private/custom-selected.lkdict',
          },
          db: { privileged: true },
        };
      },
    },
  };
  const host = new context.LingKumaMessageHost({ state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });

  const result = JSON.parse(JSON.stringify(await host.handleMessage({
    action: 'lookupDictionary', requestToken: 'current-token', surface: 'Study',
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  })));

  assert.deepEqual(result, {
    requestToken: 'current-token', status: 'HIT',
    entry: {
      surface: 'Study', dictionaryForm: 'study',
      meanings: ['学习', '研究', 'fourth'], pos: ['v', 'n'], ipa: '/ˈstʌdi/',
      pronunciations: [
        {
          ipa: '/ˈstʌdi/', region: 'US',
          url: 'https://audio.example/study-us.mp3',
          sourceURL: 'https://commons.wikimedia.org/wiki/File:study-us.ogg',
          license: 'CC BY-SA 4.0',
        },
        { ipa: '/ˈstʌdi/', region: 'UK' },
      ],
      audio: {
        url: 'https://audio.example/study.mp3', license: 'CC BY-SA 4.0', region: 'US',
        sourceURL: 'https://commons.wikimedia.org/wiki/File:study.ogg',
      },
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    requestToken: 'current-token', surface: 'Study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  }]);
  assert.equal(JSON.stringify(result).includes('D:/'), false);
});

test('reader AI pronunciation lookup exposes only exact-surface US and UK records', async () => {
  const { context } = loadBridge();
  const calls = [];
  const state = { addStorageListener() {}, removeStorageListener() {} };
  const plugin = {
    lookup: {
      async lookupAIPronunciation(request) {
        calls.push(request);
        return {
          requestToken: 'hostile-old-token', status: 'HIT',
          entry: {
            surface: request.surface, source: 'ai', meanings: ['private'],
            pronunciations: [
              {
                ipa: '/test-us/', region: 'US', path: 'D:/private-us.mp3',
                url: 'https://hostile.example/not-a-dictionary-recording.mp3',
              },
              { ipa: '/test-uk/', region: 'UK', path: 'D:/private-uk.mp3' },
              { ipa: '/test-other/', region: 'Other' },
            ],
          },
        };
      },
    },
  };
  const host = new context.LingKumaMessageHost({ state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });

  const result = JSON.parse(JSON.stringify(await host.handleMessage({
    action: 'lookupAIPronunciation', requestToken: 'current-ai-pron', surface: 'Pricing',
    sourceLanguage: 'en-US', targetLanguage: 'ja',
  })));

  assert.deepEqual(result, {
    requestToken: 'current-ai-pron', status: 'HIT',
    entry: {
      surface: 'Pricing',
      pronunciations: [
        { ipa: '/test-us/', region: 'US' },
        { ipa: '/test-uk/', region: 'UK' },
      ],
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    requestToken: 'current-ai-pron', surface: 'Pricing', sourceLanguage: 'en-US',
  }]);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('D:/'), false);
});

test('reader pronunciation lookup exposes only exact-surface pronunciation fields', async () => {
  const { context } = loadBridge();
  const calls = [];
  const state = { addStorageListener() {}, removeStorageListener() {} };
  const plugin = {
    lookup: {
      async lookupPronunciation(request) {
        calls.push(request);
        return {
          requestToken: 'hostile-old-token', status: 'HIT',
          entry: {
            surface: request.surface, ipa: '/bʊk/', meanings: ['书'], dictionaryForm: 'book',
            pronunciations: [{
              ipa: '/bʊk/', region: 'US', url: 'https://audio.example/book.mp3',
              sourceURL: 'https://source.example/book', license: 'CC BY-SA 4.0',
            }],
            audio: { url: 'https://audio.example/book.mp3', region: 'US', path: 'D:/private.mp3' },
          },
        };
      },
    },
  };
  const host = new context.LingKumaMessageHost({ state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero' });

  const result = JSON.parse(JSON.stringify(await host.handleMessage({
    action: 'lookupPronunciation', requestToken: 'current-pron', surface: 'Book',
    sourceLanguage: 'en', targetLanguage: 'ja',
  })));

  assert.deepEqual(result, {
    requestToken: 'current-pron', status: 'HIT',
    entry: {
      surface: 'Book', ipa: '/bʊk/',
      pronunciations: [{
        ipa: '/bʊk/', region: 'US', url: 'https://audio.example/book.mp3',
        sourceURL: 'https://source.example/book', license: 'CC BY-SA 4.0',
      }],
      audio: { url: 'https://audio.example/book.mp3', region: 'US' },
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    requestToken: 'current-pron', surface: 'Book', sourceLanguage: 'en',
  }]);
  assert.equal(JSON.stringify(result).includes('书'), false);
  assert.equal(JSON.stringify(result).includes('D:/'), false);
});
