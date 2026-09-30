import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Dictionary, Quick Context, and AI1 stay independent while actual state append-dedups both meanings', async () => {
  const context = vm.createContext({
    structuredClone,
    setTimeout,
    clearTimeout,
    console,
    Error,
    JSON,
    Object,
    Map,
    Set,
    Promise,
    AbortController,
    URL,
    PathUtils: { join: (...parts) => parts.join('/') },
    IOUtils: {},
    Components: {
      utils: {
        evalInSandbox() {},
        exportFunction(fn, sandbox, options) { sandbox[options.defineAs] = fn; },
        nukeSandbox() {},
      },
    },
    Zotero: {
      DataDirectory: { dir: '/profile' },
      File: {
        pathToFile() {},
        async putContentsAsync() {},
      },
      HTTP: { async download() {} },
      DBConnection: class {},
      Prefs: { get() { return null; }, set() {} },
      debug() {},
      logError() {},
      getMainWindow: () => null,
    },
  });
  context.globalThis = context;
  for (const relative of ['adapter/state.js', 'adapter/lookup.js', 'adapter/bridge.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), context, {
      filename: relative,
    });
  }

  const state = new context.LingKumaStateAdapter({
    pluginID: 'lingkuma-zotero@white-ink-cell',
    version: '1.0.1',
  });
  state.loaded = true;
  let releaseQuick;
  const quickGate = new Promise(resolve => { releaseQuick = resolve; });
  state.makeAIRequest = async () => ({ choices: [{ message: { content: 'AI1 释义' } }] });

  const lookup = new context.LingKumaLookupService({
    state,
    catalog: [],
    dependencies: {
      dataRoot: '/profile/lingkuma-zotero',
      join: (...parts) => parts.join('/'),
      file: {},
      dbFactory() { throw new Error('no dictionary database exists for this pair'); },
      async sha256File() { throw new Error('no dictionary hash exists for this pair'); },
      translateQuickContext() { return quickGate; },
    },
  });
  const host = new context.LingKumaMessageHost({
    state,
    plugin: { lookup },
    rootURI: 'xpi://lingkuma/',
    pluginID: 'lingkuma@zotero',
  });
  context.window = context;
  context.dispatchEvent = () => {};
  context.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  context.highlightManager = { wordDetailsFromDB: { study: { translations: ['历史释义'] } } };
  context.ShouldAutoUpdateStatus = false;
  context.getTranslationCount = word => context.highlightManager.wordDetailsFromDB[word.toLowerCase()]?.translations?.length || 0;
  context.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const defaults = typeof keys === 'string' ? { [keys]: undefined } : (keys || {});
          callback(state.storageGet(defaults));
        },
      },
    },
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        Promise.resolve(host.handleMessage(message, { tab: { id: 1 } }))
          .then(value => callback?.(value), error => callback?.({ error: error?.message || String(error) }));
      },
    },
  };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'upstream', 'src', 'service', 'a3_aiFragen.js'), 'utf8'), context, {
    filename: 'upstream/src/service/a3_aiFragen.js',
  });

  state.addTranslation('study', '历史释义', 'zh-CN');
  const pendingQuick = host.handleMessage({
    action: 'lookupQuickContext',
    requestToken: 'integrated-quick',
    surface: 'study',
    sentence: 'I study daily.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });
  const dictionary = await host.handleMessage({
    action: 'lookupDictionary',
    requestToken: 'integrated-dictionary',
    surface: 'study',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });
  const ai1 = await context.fetchAIWordTranslation('study', 'I study daily.');
  assert.equal(ai1, 'AI1 释义');
  await new Promise(resolve => setTimeout(resolve, 0));


  assert.equal(dictionary.status, 'UNAVAILABLE');
  assert.deepEqual(
    JSON.parse(JSON.stringify(state.getWordDetails('study', 'zh-CN').translations)),
    ['历史释义', 'AI1 释义'],
  );

  releaseQuick({ sentenceTranslation: '我每天学习。', contextualMeaning: '语境释义' });
  assert.equal((await pendingQuick).status, 'HIT');
  await new Promise(resolve => setTimeout(resolve, 0));


  assert.deepEqual(
    JSON.parse(JSON.stringify(state.getWordDetails('study', 'zh-CN').translations)),
    ['历史释义', 'AI1 释义', '语境释义'],
  );
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  host.destroy();
});
