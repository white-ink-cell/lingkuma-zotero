import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'adapter', 'state.js');

const loadState = async stored => {
  const requests = [];
  const context = vm.createContext({
    structuredClone,
    atob,
    URL,
    setTimeout,
    clearTimeout,
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
    PathUtils: { join: (...parts) => parts.join('/') },
    IOUtils: {
      async makeDirectory() {},
      async exists() { return true; },
    },
    Zotero: {
      DataDirectory: { dir: '/zotero-data' },
      File: {
        async getContentsAsync() { return JSON.stringify(stored); },
        async putContentsAsync() {},
      },
      Prefs: { get() { return null; }, set() {} },
      HTTP: {
        async request(_method, url, options) {
          requests.push({ url, body: JSON.parse(options.body), headers: options.headers });
          return { response: { choices: [{ message: { content: 'ok' } }] } };
        },
      },
      debug() {},
      logError() {},
    },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), context, { filename: STATE_PATH });
  const state = new context.LingKumaStateAdapter({ pluginID: 'lingkuma-zotero@white-ink-cell', version: '1.0.1' });
  await state.load();
  if (state.saveTimer) clearTimeout(state.saveTimer);
  return { state, requests };
};

const request = { messages: [{ role: 'user', content: 'test' }], temperature: 0.7, _skipLanguageRetarget: true };

test('legacy single custom endpoint becomes the default editable profile without losing values', async () => {
  const { state } = await loadState({
    adapterSchemaVersion: 10,
    storage: { aiConfig: { apiBaseURL: 'https://legacy.example/v1', apiModel: 'legacy', apiKey: 'key', apiTemperature: 0.4 } },
    words: {},
  });

  assert.equal(state.storage.customApiProfiles.profiles.length, 1);
  assert.equal(state.storage.customApiProfiles.activeProfileId, state.storage.customApiProfiles.profiles[0].id);
  assert.equal(state.storage.customApiProfiles.profiles[0].apiBaseURL, 'https://legacy.example/v1');
  assert.equal(state.storage.customApiProfiles.profiles[0].apiTemperature, 0.4);
});

test('enabled profile polling uses each configured endpoint and applies its request-body contract', async () => {
  const { state, requests } = await loadState({
    adapterSchemaVersion: 10,
    storage: {
      aiConfig: { enableApiPolling: true },
      customApiProfiles: {
        activeProfileId: 'a',
        profiles: [
          {
            id: 'a', name: 'A', apiBaseURL: 'https://a.example/v1', apiModel: 'model-a', apiKey: 'a-key',
            apiTemperature: 0.2, enablePolling: true, excludeTemperature: true,
            customRequestBody: 'reasoning={"effort":"low"}\nmax_tokens=321',
          },
          {
            id: 'b', name: 'B', apiBaseURL: 'https://b.example/v1', apiModel: 'model-b', apiKey: 'b-key',
            apiTemperature: 0.6, enablePolling: true, excludeTemperature: false, customRequestBody: '',
          },
        ],
      },
    },
    words: {},
  });

  await state.makeAIRequest(request);
  await state.makeAIRequest(request);

  assert.deepEqual(requests.map(item => item.url), [
    'https://a.example/v1/chat/completions',
    'https://b.example/v1/chat/completions',
  ]);
  assert.equal(Object.hasOwn(requests[0].body, 'temperature'), false);
  assert.deepEqual(requests[0].body.reasoning, { effort: 'low' });
  assert.equal(requests[0].body.max_tokens, 321);
  assert.equal(requests[1].body.temperature, 0.6);
});

test('custom request body rejects prototype keys and cannot replace messages or model', async () => {
  const { state } = await loadState({
    adapterSchemaVersion: 10,
    storage: {
      customApiProfiles: {
        activeProfileId: 'unsafe',
        profiles: [{
          id: 'unsafe', name: 'Unsafe', apiBaseURL: 'https://api.example/v1', apiModel: 'safe-model',
          enablePolling: true, customRequestBody: '__proto__={"polluted":true}\nmessages={"bad":true}\nmodel="bad"',
        }],
      },
    },
    words: {},
  });

  await assert.rejects(() => state.makeAIRequest(request), /custom request body/i);
  assert.equal({}.polluted, undefined);
});

test('reading content-facing AI config does not consume the next polling profile', async () => {
  const { state, requests } = await loadState({
    adapterSchemaVersion: 10,
    storage: {
      aiConfig: { enableApiPolling: true },
      customApiProfiles: {
        activeProfileId: 'a',
        profiles: [
          { id: 'a', apiBaseURL: 'https://a.example/v1', enablePolling: true },
          { id: 'b', apiBaseURL: 'https://b.example/v1', enablePolling: true },
        ],
      },
    },
    words: {},
  });

  state.getAIConfigForContent();
  state.getAIConfigForContent();
  await state.makeAIRequest(request);

  assert.equal(requests[0].url, 'https://a.example/v1/chat/completions');
});

test('AI profile state is bounded and rejects non-HTTP endpoint schemes', async () => {
  const oversizedProfiles = Array.from({ length: 25 }, (_, index) => ({
    id: `p-${index}`,
    apiBaseURL: index === 0 ? 'file:///private/data' : `https://${index}.example/v1`,
    apiTemperature: 99,
    customRequestBody: 'x'.repeat(40000),
  }));
  const { state } = await loadState({
    adapterSchemaVersion: 10,
    storage: {
      customApiProfiles: { activeProfileId: 'p-0', profiles: oversizedProfiles },
    },
    words: {},
  });

  assert.equal(state.storage.customApiProfiles.profiles.length, 20);
  assert.equal(state.storage.customApiProfiles.profiles[0].apiTemperature, 2);
  assert.equal(state.storage.customApiProfiles.profiles[0].customRequestBody.length, 32768);
  await assert.rejects(() => state.makeAIRequest(request), /HTTP or HTTPS/i);
});
