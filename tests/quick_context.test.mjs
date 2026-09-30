import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const makeService = (providerResponse, { persistenceError = null, quickContextProvider = null } = {}) => {
  const context = vm.createContext({
    console, Error, JSON, Object, Map, Set, Promise, AbortController, URL,
    PathUtils: { join: (...parts) => parts.join('/') },
    Zotero: {
      DataDirectory: { dir: '/profile' },
      File: { pathToFile() {} },
      HTTP: { async download() {} },
      DBConnection: class {},
    },
    IOUtils: {},
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'), context);
  const aiRequests = [];
  const providerRequests = [];
  const persistedTranslations = [];
  const state = {
    storageGet() { return { dictionaryConfig: { mode: 'default', custom: null } }; },
    storageSet() {},
    async makeAIRequest(request) {
      aiRequests.push(structuredClone(request));
      return { choices: [{ message: { content: 'independent AI1' } }] };
    },
    addTranslation(word, translation, target) {
      if (persistenceError) throw persistenceError;
      persistedTranslations.push({ word, translation, target });
    },
  };
  const dependencies = {
    dataRoot: '/profile/lingkuma-zotero',
    join: (...parts) => parts.join('/'),
    file: {},
    dbFactory() { throw new Error('dictionary database must not be used by Quick Context'); },
    async sha256File() { throw new Error('dictionary hash must not be used by Quick Context'); },
  };
  dependencies.translateQuickContext = async request => {
    const { signal: _signal, ...publicRequest } = request;
    providerRequests.push(structuredClone(publicRequest));
    if (quickContextProvider) return quickContextProvider(request);
    if (providerResponse instanceof Error) throw providerResponse;
    return structuredClone(providerResponse);
  };
  const service = new context.LingKumaLookupService({
    state,
    catalog: [],
    dependencies,
  });
  return { service, aiRequests, providerRequests, persistedTranslations };
};

const loadBridge = () => {
  const context = vm.createContext({
    Zotero: { debug() {}, logError() {}, getMainWindow: () => null },
    Components: {
      utils: {
        evalInSandbox() {},
        exportFunction(fn, sandbox, options) { sandbox[options.defineAs] = fn; },
        nukeSandbox() {},
      },
    },
    setTimeout,
    Error,
    URL,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'bridge.js'), 'utf8'), context);
  return context;
};

test('Quick Context bridge echoes the current token and projects only JSON-safe public fields', async () => {
  const context = loadBridge();
  const calls = [];
  const state = { addStorageListener() {}, removeStorageListener() {} };
  const plugin = {
    lookup: {
      async lookupQuickContext(request) {
        calls.push(request);
        return {
          requestToken: 'stale-token',
          status: 'HIT',
          sentenceTranslation: '他正在研究这个问题。',
          contextualMeaning: '研究',
          path: 'D:/private/state.json',
          providerResponse: { secret: true },
        };
      },
    },
  };
  const host = new context.LingKumaMessageHost({
    state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero',
  });

  const result = JSON.parse(JSON.stringify(await host.handleMessage({
    action: 'lookupQuickContext',
    requestToken: 'current-token',
    surface: 'studying',
    sentence: 'He is studying the issue.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    ignored: 'private',
  })));

  assert.deepEqual(result, {
    requestToken: 'current-token',
    status: 'HIT',
    sentenceTranslation: '他正在研究这个问题。',
    contextualMeaning: '研究',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    requestToken: 'current-token',
    surface: 'studying',
    sentence: 'He is studying the issue.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  }]);
  assert.equal(JSON.stringify(result).includes('D:/'), false);
});
test('a pending Quick Context request does not delay the existing AI1 request path', async () => {
  const context = loadBridge();
  let releaseQuick;
  const quickGate = new Promise(resolve => { releaseQuick = resolve; });
  const state = {
    addStorageListener() {},
    removeStorageListener() {},
    async makeAIRequest() {
      return { choices: [{ message: { content: 'AI1' } }] };
    },
  };
  const plugin = {
    lookup: {
      async lookupQuickContext() { return quickGate; },
    },
  };
  const host = new context.LingKumaMessageHost({
    state, plugin, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero',
  });

  const pendingQuick = host.handleMessage({
    action: 'lookupQuickContext',
    requestToken: 'quick-pending',
    surface: 'study',
    sentence: 'I study daily.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });
  const aiResult = await host.handleMessage({
    action: 'makeAIRequest',
    requestData: { messages: [], stream: false },
  });

  assert.equal(aiResult.choices[0].message.content, 'AI1');
  releaseQuick({ requestToken: 'quick-pending', status: 'MISS' });
  assert.equal((await pendingQuick).status, 'MISS');
});
test('normal Quick Context uses the full-sentence translation provider and never AI', async () => {
  const providerResult = {
    sentenceTranslation: '他正在研究这个问题。',
    contextualMeaning: '研究',
  };
  const { service, aiRequests, providerRequests } = makeService(
    { choices: [{ message: { content: 'must not be used' } }] },
    { quickContextProvider: async () => providerResult },
  );

  const result = await service.lookupQuickContext({
    requestToken: 'quick-non-ai',
    surface: 'studying',
    sentence: 'He is studying the issue.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'quick-non-ai', status: 'HIT', ...providerResult,
  });
  assert.equal(aiRequests.length, 0);
  assert.deepEqual(providerRequests, [{
    surface: 'studying', sentence: 'He is studying the issue.',
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  }]);
});
test('default Quick Context uses one keyless Microsoft Edge marked-sentence request', async () => {
  const httpCalls = [];
  const context = vm.createContext({
    console, Error, JSON, Object, Map, Set, Promise, AbortController, URL,
    PathUtils: { join: (...parts) => parts.join('/') },
    IOUtils: {},
    Zotero: {
      DataDirectory: { dir: '/profile' },
      getMainWindow: () => null,
      File: { async download() {} },
      DBConnection: class {},
      HTTP: {
        async request(method, url, options) {
          httpCalls.push({
            method, url,
            options: { ...options, headers: { ...options.headers } },
          });
          options.cancellerReceiver?.(() => {});
          return {
            response: [
              { translations: [{
                text: '我<b>预订</b>了今晚的桌子。', to: 'zh-Hans',
                sentLen: { srcSentLen: [29], transSentLen: [11] },
              }] },
            ],
          };
        },
        async download() {},
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'), context);
  const aiRequests = [];
  const state = {
    storageGet(defaults) {
      return {
        ...structuredClone(defaults),
        dictionaryConfig: { mode: 'default', custom: null },
        translationConfig: {
          targetLanguage: 'zh-CN', provider: 'microsoft-edge',
          timeoutSeconds: 15,
        },
      };
    },
    storageSet() {},
    async makeAIRequest(request) { aiRequests.push(request); throw new Error('AI must stay independent'); },
    addTranslation() {},
  };
  const service = new context.LingKumaLookupService({ state, catalog: [] });

  const result = await service.lookupQuickContext({
    requestToken: 'quick-microsoft', surface: 'booked',
    sentence: 'I booked a table for tonight.', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'quick-microsoft', status: 'HIT',
    sentenceTranslation: '我预订了今晚的桌子。', contextualMeaning: '预订',
  });
  assert.equal(aiRequests.length, 0);
  assert.equal(httpCalls.length, 1);
  assert.equal(httpCalls[0].method, 'POST');
  const requestURL = new URL(httpCalls[0].url);
  assert.equal(requestURL.origin, 'https://edge.microsoft.com');
  assert.equal(requestURL.pathname, '/translate/translatetext');
  assert.equal(requestURL.searchParams.get('from'), 'en');
  assert.equal(requestURL.searchParams.get('to'), 'zh-Hans');
  assert.equal(requestURL.searchParams.get('isEnterpriseClient'), 'false');
  assert.equal(requestURL.searchParams.get('textType'), 'html');
  assert.deepEqual(JSON.parse(httpCalls[0].options.body), [
    'I <b>booked</b> a table for tonight.',
  ]);
  assert.equal(Object.keys(httpCalls[0].options.headers).some(key => /authorization|subscription|api.?key/i.test(key)), false);
  assert.equal(httpCalls[0].options.responseType, 'json');
  assert.equal(typeof httpCalls[0].options.cancellerReceiver, 'function');
});
test('default Quick Context escapes source HTML and fails closed without exactly one response marker', async () => {
  const responses = [
    [{ translations: [{ text: '甲<b>上下文</b>乙', to: 'zh-Hans' }] }],
    [{ translations: [{ text: '没有标记', to: 'zh-Hans' }] }],
    [{ translations: [{ text: '<b>一</b><b>二</b>', to: 'zh-Hans' }] }],
    [{ translations: [{ text: '甲<b>错误语言</b>乙', to: 'ja' }] }],
  ];
  const bodies = [];
  const context = vm.createContext({
    console, Error, JSON, Object, Map, Set, Promise, AbortController, URL,
    PathUtils: { join: (...parts) => parts.join('/') }, IOUtils: {},
    Zotero: {
      DataDirectory: { dir: '/profile' }, getMainWindow: () => null,
      File: { async download() {} }, DBConnection: class {},
      HTTP: {
        async request(_method, _url, options) {
          bodies.push(JSON.parse(options.body));
          return { response: responses.shift() };
        },
        async download() {},
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'), context);
  const state = {
    storageGet(defaults) { return { ...structuredClone(defaults), translationConfig: { timeoutSeconds: 15 } }; },
    storageSet() {}, addTranslation() {},
  };
  const service = new context.LingKumaLookupService({ state, catalog: [] });
  const request = {
    requestToken: 'escape-1', surface: 'booked',
    sentence: 'A & B < booked > C', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  };
  assert.equal((await service.lookupQuickContext(request)).contextualMeaning, '上下文');
  assert.deepEqual(bodies[0], ['A &amp; B &lt; <b>booked</b> &gt; C']);
  assert.equal((await service.lookupQuickContext({ ...request, requestToken: 'missing' })).status, 'ERROR');
  assert.equal((await service.lookupQuickContext({ ...request, requestToken: 'duplicate' })).status, 'ERROR');
  assert.equal((await service.lookupQuickContext({ ...request, requestToken: 'wrong-target' })).status, 'ERROR');
});
test('default Quick Context marks a whole lookup unit and honors its clicked occurrence', async () => {
  const bodies = [];
  const context = vm.createContext({
    console, Error, JSON, Object, Map, Set, Promise, AbortController, URL,
    PathUtils: { join: (...parts) => parts.join('/') }, IOUtils: {},
    Zotero: {
      DataDirectory: { dir: '/profile' }, getMainWindow: () => null,
      File: { async download() {} }, DBConnection: class {},
      HTTP: {
        async request(_method, _url, options) {
          bodies.push(JSON.parse(options.body)[0]);
          return { response: [{ translations: [{ text: '甲<b>目标</b>乙', to: 'zh-Hans' }] }] };
        },
        async download() {},
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'), context);
  const state = {
    storageGet(defaults) { return { ...structuredClone(defaults), translationConfig: { timeoutSeconds: 15 } }; },
    storageSet() {}, addTranslation() {},
  };
  const service = new context.LingKumaLookupService({ state, catalog: [] });
  assert.equal((await service.lookupQuickContext({
    requestToken: 'whole-word', surface: 'he', sentence: 'The hero said he left.',
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  })).status, 'HIT');
  assert.equal(bodies[0], 'The hero said <b>he</b> left.');
  assert.equal((await service.lookupQuickContext({
    requestToken: 'second-bank', surface: 'bank', sentence: 'The bank passed the bank.', surfaceStart: 20,
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  })).status, 'HIT');
  assert.equal(bodies[1], 'The bank passed the <b>bank</b>.');
});

test('default Quick Context uses a provider-stable marker for hyphenated lookup units', async () => {
  const bodies = [];
  const context = vm.createContext({
    console, Error, JSON, Object, Map, Set, Promise, AbortController, URL,
    PathUtils: { join: (...parts) => parts.join('/') }, IOUtils: {},
    Zotero: {
      DataDirectory: { dir: '/profile' }, getMainWindow: () => null,
      File: { async download() {} }, DBConnection: class {},
      HTTP: {
        async request(_method, _url, options) {
          bodies.push(JSON.parse(options.body)[0]);
          return { response: [{ translations: [{ text: '这是一个<b>样本外</b>检验。', to: 'zh-Hans' }] }] };
        },
        async download() {},
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'), context);
  const state = {
    storageGet(defaults) { return { ...structuredClone(defaults), translationConfig: { timeoutSeconds: 15 } }; },
    storageSet() {}, addTranslation() {},
  };
  const service = new context.LingKumaLookupService({ state, catalog: [] });
  const result = await service.lookupQuickContext({
    requestToken: 'hyphen-marker', surface: 'out-of-sample',
    sentence: 'This is an out-of-sample test.', surfaceStart: 11,
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(bodies[0], 'This is an <b>out-of-sample</b> test.');
  assert.equal(result.status, 'HIT');
  assert.equal(result.contextualMeaning, '样本外');
});
test('Quick Context returns the structured contract and appends only its contextual meaning', async () => {
  const providerResponse = {
    sentenceTranslation: '他正在研究这个问题。',
    contextualMeaning: '研究',
  };
  const { service, aiRequests, persistedTranslations } = makeService(providerResponse);

  const result = await service.lookupQuickContext({
    requestToken: 'quick-1',
    surface: 'studying',
    sentence: 'He is studying the issue.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'quick-1',
    status: 'HIT',
    sentenceTranslation: '他正在研究这个问题。',
    contextualMeaning: '研究',
  });
  assert.equal(aiRequests.length, 0);
  assert.deepEqual(persistedTranslations, [
    { word: 'studying', translation: '研究', target: 'zh-CN' },
  ]);
});

test('Quick Context fails closed on non-string or extra provider fields', async () => {
  for (const payload of [
    { sentenceTranslation: 123, contextualMeaning: true },
    { sentenceTranslation: '我每天学习。', contextualMeaning: '学习', extra: 'not allowed' },
  ]) {
    const { service, persistedTranslations } = makeService(payload);
    const result = await service.lookupQuickContext({
      requestToken: 'quick-strict',
      surface: 'study',
      sentence: 'I study daily.',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      requestToken: 'quick-strict',
      status: 'ERROR',
    });
    assert.deepEqual(persistedTranslations, []);
  }
});

test('a persistence enqueue error does not hide a valid Quick Context result', async () => {
  const providerResponse = {
    sentenceTranslation: '我每天学习。',
    contextualMeaning: '学习',
  };
  const { service } = makeService(providerResponse, {
    persistenceError: new Error('state queue unavailable'),
  });

  const result = await service.lookupQuickContext({
    requestToken: 'quick-persist-error',
    surface: 'study',
    sentence: 'I study daily.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'quick-persist-error',
    status: 'HIT',
    sentenceTranslation: '我每天学习。',
    contextualMeaning: '学习',
  });
});

test('pending persistence never delays a ready Quick Context result', async () => {
  const { service } = makeService({
    sentenceTranslation: '我每天学习。',
    contextualMeaning: '学习',
  });
  let persistenceStarted = false;
  service.state.addTranslation = () => {
    persistenceStarted = true;
    return new Promise(() => {});
  };

  const result = await service.lookupQuickContext({
    requestToken: 'quick-persist-pending',
    surface: 'study',
    sentence: 'I study daily.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });

  assert.equal(persistenceStarted, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'quick-persist-pending',
    status: 'HIT',
    sentenceTranslation: '我每天学习。',
    contextualMeaning: '学习',
  });
});

test('Quick Context uses ERROR rather than Dictionary-only UNAVAILABLE', async () => {
  const { service } = makeService({
    sentenceTranslation: '我每天学习。', contextualMeaning: '学习',
  });
  service.stopped = true;
  assert.deepEqual(JSON.parse(JSON.stringify(await service.lookupQuickContext({
    requestToken: 'quick-stopped',
    surface: 'study',
    sentence: 'I study daily.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  }))), {
    requestToken: 'quick-stopped',
    status: 'ERROR',
  });

  const context = loadBridge();
  const state = { addStorageListener() {}, removeStorageListener() {} };
  const host = new context.LingKumaMessageHost({
    state, plugin: {}, rootURI: 'xpi://lingkuma/', pluginID: 'lingkuma@zotero',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await host.handleMessage({
    action: 'lookupQuickContext',
    requestToken: 'quick-missing',
    surface: 'study',
    sentence: 'I study daily.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  }))), {
    requestToken: 'quick-missing',
    status: 'ERROR',
  });
});
test('Quick Context malformed output fails independently and is never persisted', async () => {
  const { service, persistedTranslations } = makeService('not structured data');

  const result = await service.lookupQuickContext({
    requestToken: 'quick-bad',
    surface: 'study',
    sentence: 'I study daily.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'quick-bad',
    status: 'ERROR',
  });
  assert.deepEqual(persistedTranslations, []);
});
test('shutdown aborts an owned Quick Context request before awaiting it', async () => {
  const { service } = makeService({ sentenceTranslation: 'x', contextualMeaning: 'y' });
  let observedSignal = null;
  let releaseRequest;
  service.dependencies.translateQuickContext = request => {
    observedSignal = request.signal || null;
    return new Promise((resolve, reject) => {
      releaseRequest = resolve;
      observedSignal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
  };
  const pending = service.lookupQuickContext({
    requestToken: 'quick-shutdown', surface: 'study', sentence: 'I study daily.',
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  await Promise.resolve();

  const shutdown = service.shutdown();
  await Promise.resolve();
  if (!observedSignal?.aborted) {
    releaseRequest({ sentenceTranslation: 'x', contextualMeaning: 'y' });
  }
  const result = await pending;
  await shutdown;

  assert.equal(typeof observedSignal?.addEventListener, 'function');
  assert.equal(observedSignal.aborted, true);
  assert.equal(result.status, 'ERROR');
});
test('shutdown rejects a late provider resolve without publishing or persisting it', async () => {
  const persistedTranslations = [];
  const { service } = makeService({ sentenceTranslation: 'x', contextualMeaning: 'y' });
  service.state.addTranslation = (...args) => persistedTranslations.push(args);
  let resolveProvider;
  service.dependencies.translateQuickContext = () => new Promise(resolve => { resolveProvider = resolve; });
  const pending = service.lookupQuickContext({
    requestToken: 'quick-late', surface: 'booked', sentence: 'I booked it.',
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  await Promise.resolve();
  const shutdown = service.shutdown();
  resolveProvider({ sentenceTranslation: '我预订了。', contextualMeaning: '预订' });
  assert.deepEqual(JSON.parse(JSON.stringify(await pending)), { requestToken: 'quick-late', status: 'ERROR' });
  await shutdown;
  assert.deepEqual(persistedTranslations, []);
});

test('state AI requests connect AbortSignal to Zotero HTTP cancellerReceiver', async () => {
  let releaseRequest = null;
  let cancelled = false;
  const context = vm.createContext({
    structuredClone, setTimeout, clearTimeout, console, Error, JSON, Object, Map, Set, Promise, URL,
    Zotero: {
      HTTP: {
        request(_method, _url, options) {
          return new Promise((resolve, reject) => {
            releaseRequest = resolve;
            options.cancellerReceiver?.(() => {
              cancelled = true;
              reject(new Error('host request cancelled'));
            });
          });
        },
      },
      debug() {}, logError() {},
    },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'state.js'), 'utf8'), context, { filename: 'adapter/state.js' });
  const state = new context.LingKumaStateAdapter({ pluginID: 'lingkuma@zotero', version: '1.0.1' });
  state.getEffectiveAIConfig = () => ({ source: 'custom', apiBaseURL: 'https://api.example/v1', apiModel: 'model', apiKey: '', temperature: 0.2 });
  const controller = new AbortController();
  const pending = state.makeAIRequest({ messages: [{ role: 'user', content: 'test' }] }, { signal: controller.signal });
  await Promise.resolve();

  controller.abort();
  if (!cancelled) {
    releaseRequest({ response: { choices: [{ message: { content: 'late' } }] } });
  }
  const error = await pending.then(() => null, value => value);

  assert.equal(cancelled, true);
  assert.match(String(error?.message || error), /cancel/i);
});
