import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'adapter', 'state.js');

const loadStoredState = async stored => {
  const context = vm.createContext({
    structuredClone,
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
      debug() {},
      logError() {},
    },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), context, { filename: STATE_PATH });
  const state = new context.LingKumaStateAdapter({
    pluginID: 'lingkuma-zotero@white-ink-cell',
    version: '1.0.1',
  });
  await state.load();
  if (state.saveTimer) clearTimeout(state.saveTimer);
  return state;
};

test('old profiles preserve an explicit disabled alphabetic highlight choice', async () => {
  for (const adapterSchemaVersion of [5, 7]) {
    const state = await loadStoredState({
      adapterSchemaVersion,
      storage: { highlightAlphabeticEnabled: false },
      words: {},
    });

    assert.equal(state.storageGet('highlightAlphabeticEnabled').highlightAlphabeticEnabled, false);
  }
});

test('legacy RGBA colors migrate their explicit alpha into new opacity controls', async () => {
  const state = await loadStoredState({
    adapterSchemaVersion: 10,
    storage: {
      wordExplosionHighlightColor: '#112233cc',
      wordExplosionUnderlineColor: '#4455661a',
      posHighlightVerbBackgroundColor: '#77889980',
      posHighlightPrepositionBackgroundColor: '#aabbcc00',
    },
    words: {},
  });

  assert.equal(state.storage.wordExplosionHighlightOpacity, 80);
  assert.equal(state.storage.wordExplosionUnderlineOpacity, 10);
  assert.equal(state.storage.posHighlightVerbBackgroundOpacity, 50);
  assert.equal(state.storage.posHighlightPrepositionBackgroundOpacity, 0);

  const explicit = await loadStoredState({
    adapterSchemaVersion: 10,
    storage: { wordExplosionHighlightColor: '#112233cc', wordExplosionHighlightOpacity: 0 },
    words: {},
  });
  assert.equal(explicit.storage.wordExplosionHighlightOpacity, 0);
});

test('translation settings use the keyless Microsoft Edge provider and discard obsolete credentials', async () => {
  const state = await loadStoredState({
    adapterSchemaVersion: 11,
    storage: { translationConfig: {
      targetLanguage: 'ja', microsoftKey: 'obsolete', microsoftRegion: 'obsolete',
      microsoftEndpoint: 'https://obsolete.invalid',
    } },
    words: {},
  });

  assert.deepEqual(JSON.parse(JSON.stringify(state.storage.translationConfig)), {
    targetLanguage: 'ja',
    provider: 'microsoft-edge',
    timeoutSeconds: 15,
  });
});


test('learning-data export excludes settings and credentials', async () => {
  const state = await loadStoredState({
    adapterSchemaVersion: 10,
    storage: {
      aiConfig: { apiKey: 'secret-api-key' },
      translationConfig: { microsoftKey: 'secret-microsoft-key' },
      webdavConfig: { url: 'https://dav.example', username: 'reader', password: 'secret-webdav' },
      tooltipThemeMode: 'dark',
      enableWordTTS: false,
      wordTTSProvider: 'custom',
    },
    words: {
      study: { word: 'study', term: 'study', status: '3', translations: ['学习'] },
    },
  });

  const exported = state.exportData();
  const serialized = JSON.stringify(exported);

  assert.equal(Object.hasOwn(exported, 'storage'), false);
  assert.equal(exported.words.study.status, '3');
  assert.doesNotMatch(serialized, /secret-api-key|secret-microsoft-key|secret-webdav|tooltipThemeMode|enableWordTTS|wordTTSProvider/);
});


const loadPrefs = ({ backup }) => {
  const backupNode = { value: JSON.stringify(backup) };
  const context = vm.createContext({
    window: { confirm() { return true; } },
    document: {
      getElementById(id) { return id === 'lk-backup-text' ? backupNode : null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
    },
    navigator: {},
    NodeFilter: { SHOW_TEXT: 4 },
    Zotero: {
      locale: 'en-US',
      HTTP: { async request() { return { responseText: JSON.stringify(backup) }; } },
    },
  });
  const prefsPath = path.join(ROOT, 'ui', 'prefs.js');
  vm.runInContext(fs.readFileSync(prefsPath, 'utf8'), context, { filename: prefsPath });
  return context.window.LingKumaZoteroPrefs;
};

test('backup restore imports learning data without replacing local settings', async () => {
  for (const merge of [true, false]) {
    const backup = {
      storage: { aiConfig: { apiKey: 'remote-secret' }, tooltipThemeMode: 'dark' },
      words: { remote: { word: 'remote', status: '2' } },
    };
    const prefs = loadPrefs({ backup });
    const calls = [];
    const state = {
      importLingKuma(payload, shouldMerge) { calls.push({ payload, shouldMerge }); return 1; },
      storageClear() { throw new Error('restore must not clear local settings'); },
      storageSet() { throw new Error('restore must not import remote settings'); },
      async save() {},
    };
    prefs.state = () => state;
    prefs.loadControls = () => {};
    prefs.refreshWordSummary = () => {};
    prefs.renderWordList = () => {};
    prefs.renderStatistics = () => {};
    prefs.plugin = () => null;
    prefs.status = () => {};

    await prefs.restoreBackup(merge);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].shouldMerge, merge);
    assert.equal(calls[0].payload.words.remote.status, '2');
  }
});


test('WebDAV download imports learning data without replacing local settings', async () => {
  for (const merge of [true, false]) {
    const backup = {
      storage: { webdavConfig: { password: 'remote-secret' }, enableWordTTS: false },
      words: { remote: { word: 'remote', status: '2' } },
    };
    const prefs = loadPrefs({ backup });
    const calls = [];
    const state = {
      importLingKuma(payload, shouldMerge) { calls.push({ payload, shouldMerge }); return 1; },
      restoreWords() { throw new Error('WebDAV must use the shared import seam'); },
      storageClear() { throw new Error('WebDAV must not clear local settings'); },
      storageSet() { throw new Error('WebDAV must not import remote settings'); },
      async save() {},
    };
    prefs.state = () => state;
    prefs.saveSettings = async () => {};
    prefs.webdavURL = () => 'https://dav.example/backup.json';
    prefs.webdavHeaders = () => ({});
    prefs.setWebdavStatus = () => {};
    prefs.loadControls = () => {};
    prefs.refreshWordSummary = () => {};
    prefs.renderWordList = () => {};
    prefs.renderStatistics = () => {};
    prefs.plugin = () => null;

    await prefs.webdavDownload(merge);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].shouldMerge, merge);
    assert.equal(calls[0].payload.words.remote.status, '2');
  }
});


test('learning-data merge keeps the conservative unmastered status on conflict', async () => {
  for (const [localStatus, remoteStatus] of [['5', '1'], ['1', '5']]) {
    const state = await loadStoredState({
      adapterSchemaVersion: 10,
      storage: {},
      words: {
        study: {
          word: 'study',
          status: localStatus,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    state.importLingKuma({
      words: {
        study: {
          word: 'study',
          status: remoteStatus,
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      },
    }, true);

    assert.equal(state.words.study.status, '1', `${localStatus} + ${remoteStatus}`);
  }
});


test('legacy settings-only backup action cannot serialize local settings', async () => {
  const prefs = loadPrefs({ backup: {} });
  let copied = '';
  prefs.state = () => ({
    storage: { aiConfig: { apiKey: 'secret-api-key' }, webdavConfig: { password: 'secret-webdav' } },
    exportData() { return { format: 'lingkuma-zotero-export', words: { study: { status: '3' } } }; },
  });
  prefs.copyText = async text => { copied = text; };
  prefs.status = () => {};

  await prefs.copyBackup(true);

  const payload = JSON.parse(copied);
  assert.equal(Object.hasOwn(payload, 'storage'), false);
  assert.equal(payload.words.study.status, '3');
  assert.doesNotMatch(copied, /secret-api-key|secret-webdav/);
});


test('saving visible controls does not rewrite hidden cloud settings', () => {
  const prefs = loadPrefs({ backup: {} });
  const cloudConfig = {
    cloudDbEnabled: true,
    cloudDualWrite: true,
    cloudSelfHosted: true,
    serverUrl: 'https://private.example',
  };
  prefs.plugin = () => ({ state: { storage: { cloudConfig } } });

  const values = prefs.collectSettings();

  assert.equal(Object.hasOwn(values, 'cloudConfig'), false);
  assert.equal(Object.hasOwn(values, 'cloudDbEnabled'), false);
  assert.equal(Object.hasOwn(values, 'cloudServerUrl'), false);
});

const makeControl = ({ key, object, subkey, profileField, special, type = 'text', value = '', checked = false, dataType, min = '', max = '' }) => ({
  type,
  value,
  checked,
  min,
  max,
  dataset: {
    ...(key ? { lkKey: key } : {}),
    ...(object ? { lkObject: object, lkSubkey: subkey } : {}),
    ...(profileField ? { lkProfileField: profileField } : {}),
    ...(special ? { lkSpecial: special } : {}),
    ...(dataType ? { lkType: dataType } : {}),
  },
});

const loadPrefsWithControls = (storage, controls) => {
  const context = vm.createContext({
    window: {},
    document: {
      getElementById() { return null; },
      querySelectorAll(selector) {
        if (selector === '[data-lk-key]') return controls.filter(control => control.dataset.lkKey);
        if (selector === '[data-lk-object]') return controls.filter(control => control.dataset.lkObject);
        if (selector === '[data-lk-profile-field]') return controls.filter(control => control.dataset.lkProfileField);
        return [];
      },
      querySelector(selector) {
        const match = selector.match(/^\[data-lk-special="([^"]+)"\]$/);
        return match ? controls.find(control => control.dataset.lkSpecial === match[1]) || null : null;
      },
    },
    navigator: {},
    NodeFilter: { SHOW_TEXT: 4 },
    Zotero: { locale: 'en-US' },
    URL,
  });
  const prefsPath = path.join(ROOT, 'ui', 'prefs.js');
  vm.runInContext(fs.readFileSync(prefsPath, 'utf8'), context, { filename: prefsPath });
  const prefs = context.window.LingKumaZoteroPrefs;
  prefs.plugin = () => ({ state: { storage } });
  return prefs;
};

test('supported Edge and unsupported persisted TTS providers survive unrelated settings saves', () => {
  for (const provider of ['edge', 'gpt']) {
    const control = makeControl({
      object: 'ttsConfig', subkey: 'wordTTSProvider', type: 'select-one',
      value: provider === 'edge' ? 'edge' : '',
    });
    const prefs = loadPrefsWithControls({ ttsConfig: { wordTTSProvider: provider, localTTSRate: 1 } }, [control]);

    const values = prefs.collectSettings();

    assert.equal(values.ttsConfig.wordTTSProvider, provider);
  }
});

test('shortcut settings normalize keys and reject conflicts or invalid multi-key values', () => {
  const valid = [
    makeControl({ key: 'wordQueryKey', value: 'Q' }),
    makeControl({ key: 'copySentenceKey', value: 'W' }),
    makeControl({ object: 'wordStatusKeys', subkey: 'toggle', value: 'Space' }),
  ];
  const validPrefs = loadPrefsWithControls({ wordStatusKeys: {} }, valid);
  const values = validPrefs.collectSettings();
  assert.equal(values.wordQueryKey, 'q');
  assert.equal(values.copySentenceKey, 'w');
  assert.equal(values.wordStatusKeys.toggle, ' ');

  const duplicatePrefs = loadPrefsWithControls({ wordStatusKeys: {} }, [
    makeControl({ key: 'wordQueryKey', value: 'Q' }),
    makeControl({ key: 'copySentenceKey', value: 'q' }),
  ]);
  assert.throws(() => duplicatePrefs.collectSettings(), /shortcut.*conflict/i);

  const invalidPrefs = loadPrefsWithControls({}, [makeControl({ key: 'wordQueryKey', value: 'Control+Q' })]);
  assert.throws(() => invalidPrefs.collectSettings(), /invalid shortcut/i);

  const hiddenConflictPrefs = loadPrefsWithControls({}, [makeControl({ key: 'sentenceExplosionKey', value: 'R' })]);
  assert.throws(() => hiddenConflictPrefs.collectSettings(), /shortcut.*conflict.*sidePanelKey/i);

  const strictStatusPrefs = loadPrefsWithControls({ wordStatusKeys: {} }, [
    makeControl({ object: 'wordStatusKeys', subkey: '0', value: 'ArrowUp' }),
  ]);
  assert.throws(() => strictStatusPrefs.collectSettings(), /invalid shortcut/i);
});

test('custom capsule settings require upstream container, button, method, and http URL shape', () => {
  const invalid = makeControl({
    key: 'customCapsules', dataType: 'json',
    value: '[{"name":"Google","url":"https://google.example/?q={word}"}]',
  });
  invalid.dataset.lkDirty = 'true';
  const invalidPrefs = loadPrefsWithControls({}, [invalid]);
  assert.throws(() => invalidPrefs.collectSettings(), /buttons/i);

  const validValue = [{ buttons: [{ name: 'Google', url: 'https://google.example/?q={word}', openMethod: 'newTab' }] }];
  const valid = makeControl({ key: 'customCapsules', dataType: 'json', value: JSON.stringify(validValue) });
  valid.dataset.lkDirty = 'true';
  const validPrefs = loadPrefsWithControls({}, [valid]);
  assert.deepEqual(JSON.parse(JSON.stringify(validPrefs.collectSettings().customCapsules)), validValue);

  valid.value = '[{"buttons":[{"name":"Bad","url":"javascript:alert(1)","openMethod":"newTab"}]}]';
  assert.throws(() => validPrefs.collectSettings(), /http/i);

  valid.value = JSON.stringify([{ buttons: [{ name: '"><img src=x>', url: 'https://safe.example/', openMethod: 'newTab' }] }]);
  assert.throws(() => validPrefs.collectSettings(), /name.*safe/i);

  valid.value = '[{"buttons":[{"name":"Safe","url":"https://safe.example/","openMethod":"newTab","icon":"<img src=x onerror=alert(1)>"}]}]';
  assert.throws(() => validPrefs.collectSettings(), /icon.*unsupported/i);

  valid.dataset.lkDirty = 'false';
  const legacyValue = [{ buttons: [{ name: 'Legacy', url: 'https://safe.example/', openMethod: 'newTab', icon: '<svg>legacy</svg>' }] }];
  valid.value = JSON.stringify(legacyValue);
  assert.deepEqual(JSON.parse(JSON.stringify(validPrefs.collectSettings().customCapsules)), legacyValue);
});
test('numeric settings are clamped to their declared control bounds', () => {
  const controls = [
    makeControl({ key: 'autoAddSentencesLimit', type: 'number', value: '999', dataType: 'number', min: '1', max: '20' }),
    makeControl({ object: 'rulerSettings', subkey: 'opacity', type: 'number', value: '-0.5', dataType: 'number', min: '0', max: '1' }),
  ];
  const prefs = loadPrefsWithControls({ rulerSettings: {} }, controls);

  const values = prefs.collectSettings();

  assert.equal(values.autoAddSentencesLimit, 20);
  assert.equal(values.rulerSettings.opacity, 0);
});

test('POS opacity settings update the alpha channel consumed by the upstream renderer', () => {
  const controls = [
    makeControl({ key: 'posHighlightVerbBackgroundColor', value: '#11223340' }),
    makeControl({ key: 'posHighlightVerbBackgroundOpacity', type: 'range', value: '50', dataType: 'number', min: '0', max: '100' }),
    makeControl({ key: 'posHighlightPrepositionBackgroundColor', value: '#abcdef' }),
    makeControl({ key: 'posHighlightPrepositionBackgroundOpacity', type: 'range', value: '25', dataType: 'number', min: '0', max: '100' }),
  ];
  const prefs = loadPrefsWithControls({}, controls);

  const values = prefs.collectSettings();

  assert.equal(values.posHighlightVerbBackgroundColor, '#1122337f');
  assert.equal(values.posHighlightPrepositionBackgroundColor, '#abcdef40');
});

test('tooltip background saves only the packaged SVG background type', () => {
  const enabled = makeControl({ special: 'tooltipBackgroundEnabled', type: 'checkbox', checked: true });
  const defaultType = makeControl({ special: 'tooltipBackgroundDefaultType', type: 'select-one', value: 'svg' });
  const prefs = loadPrefsWithControls({ tooltipBackground: { enabled: false, defaultType: 'video', specificBgPath: 'legacy.jpg' } }, [enabled, defaultType]);

  const values = prefs.collectSettings();

  assert.equal(values.tooltipBackground.enabled, true);
  assert.equal(values.tooltipBackground.defaultType, 'svg');
  assert.equal(values.tooltipBackground.useCustom, false);
  assert.equal(values.tooltipBackground.specificBgPath, 'legacy.jpg');
});

test('AI profile fields round-trip through the one-page settings collector', () => {
  const controls = [
    makeControl({ profileField: 'name', value: 'Research endpoint' }),
    makeControl({ profileField: 'apiBaseURL', value: 'https://api.example/v1' }),
    makeControl({ profileField: 'apiModel', value: 'model-x' }),
    makeControl({ profileField: 'apiKey', type: 'password', value: 'secret' }),
    makeControl({ profileField: 'apiTemperature', type: 'number', value: '0.3', dataType: 'number', min: '0', max: '2' }),
    makeControl({ profileField: 'enablePolling', type: 'checkbox', checked: true }),
    makeControl({ profileField: 'excludeTemperature', type: 'checkbox', checked: false }),
    makeControl({ profileField: 'customRequestBody', value: 'max_tokens=500' }),
  ];
  const storage = {
    aiConfig: { enableApiPolling: true },
    customApiProfiles: { activeProfileId: 'default', profiles: [{ id: 'default', name: 'Default' }] },
  };
  const prefs = loadPrefsWithControls(storage, controls);

  const values = prefs.collectSettings();
  const active = values.customApiProfiles.profiles[0];

  assert.equal(active.name, 'Research endpoint');
  assert.equal(active.apiBaseURL, 'https://api.example/v1');
  assert.equal(active.apiTemperature, 0.3);
  assert.equal(active.enablePolling, true);
  assert.equal(active.customRequestBody, 'max_tokens=500');
  assert.equal(values.aiConfig.apiBaseURL, active.apiBaseURL);
  assert.equal(values.aiConfig.apiKey, 'secret');
});

test('AI profile add copy and delete actions preserve a valid active profile', async () => {
  const prefs = loadPrefs({ backup: {} });
  const state = {
    storage: {
      aiConfig: {},
      customApiProfiles: {
        activeProfileId: 'base',
        profiles: [{ id: 'base', name: 'Base', apiBaseURL: 'https://base.example/v1', apiTemperature: 0.4 }],
      },
    },
  };
  prefs.state = () => state;
  prefs.renderAIProfiles = () => {};
  prefs.saveSettings = async () => {};

  await prefs.addAIProfile(true);
  assert.equal(state.storage.customApiProfiles.profiles.length, 2);
  const copiedID = state.storage.customApiProfiles.activeProfileId;
  assert.notEqual(copiedID, 'base');
  assert.equal(state.storage.customApiProfiles.profiles[1].apiBaseURL, 'https://base.example/v1');

  await prefs.addAIProfile(false);
  assert.equal(state.storage.customApiProfiles.profiles.length, 3);
  assert.equal(state.storage.customApiProfiles.profiles[2].apiBaseURL, '');

  await prefs.deleteAIProfile();
  assert.equal(state.storage.customApiProfiles.profiles.length, 2);
  assert.ok(state.storage.customApiProfiles.profiles.some(profile => profile.id === state.storage.customApiProfiles.activeProfileId));
});

test('plain-list import preserves language, status, and status history', () => {
  const prefs = loadPrefs({ backup: {} });
  const records = prefs.parseImportText('alpha\nbeta', '2', 'de');
  assert.deepEqual(JSON.parse(JSON.stringify(records.map(item => ({
    word: item.word,
    language: item.language,
    status: item.status,
    history: Object.keys(item.statusHistory),
  })))), [
    { word: 'alpha', language: 'de', status: '2', history: ['2'] },
    { word: 'beta', language: 'de', status: '2', history: ['2'] },
  ]);
  assert.throws(() => prefs.parseImportText('alpha', '2', 'english'), /ISO 639-1/i);
  assert.throws(() => prefs.parseImportText('alpha', '7', 'en'), /between 0 and 5/i);
});
test('partial nested reader settings preserve explicit values and fill missing defaults', async () => {
  const state = await loadStoredState({
    adapterSchemaVersion: 10,
    storage: {
      wordStatusKeys: { 1: 'x' },
      rulerSettings: { height: 48 },
    },
    words: {},
  });

  assert.equal(state.storage.wordStatusKeys['1'], 'x');
  assert.equal(state.storage.wordStatusKeys.toggle, ' ');
  assert.equal(state.storage.wordStatusKeys.closeTooltip, 'capslock');
  assert.equal(state.storage.rulerSettings.height, 48);
  assert.equal(state.storage.rulerSettings.color, '#6f6f6f');
  assert.equal(state.storage.rulerSettings.widthMode, 'auto');
});

test('partial nested TTS config migrates only missing equivalent top-level values', async () => {
  const migrated = await loadStoredState({
    adapterSchemaVersion: 10,
    storage: {
      ttsConfig: { wordTTSProvider: 'custom' },
      localTTSRate: 1.6,
      localTTSPitch: 0.7,
      wordAudioUrlTemplate: 'https://audio.example/{word}',
    },
    words: {},
  });
  assert.equal(migrated.storage.ttsConfig.wordTTSProvider, 'custom');
  assert.equal(migrated.storage.ttsConfig.localTTSRate, 1.6);
  assert.equal(migrated.storage.ttsConfig.localTTSPitch, 0.7);
  assert.equal(migrated.storage.ttsConfig.wordAudioUrlTemplate, 'https://audio.example/{word}');

  const nestedWins = await loadStoredState({
    adapterSchemaVersion: 10,
    storage: { ttsConfig: { localTTSRate: 1.2 }, localTTSRate: 1.8 },
    words: {},
  });
  assert.equal(nestedWins.storage.ttsConfig.localTTSRate, 1.2);
});
test('Edge is the fresh default, legacy Edge migrates, and unsupported GPT remains inert', async () => {
  const fresh = await loadStoredState({ adapterSchemaVersion: 11, storage: {}, words: {} });
  assert.equal(fresh.storage.ttsConfig.wordTTSProvider, 'edge');
  assert.equal(fresh.storage.ttsConfig.sentenceTTSProvider, 'edge');

  const explicit = await loadStoredState({
    adapterSchemaVersion: 11,
    storage: { ttsConfig: { wordTTSProvider: 'local', sentenceTTSProvider: 'custom2' } },
    words: {},
  });
  assert.equal(explicit.storage.ttsConfig.wordTTSProvider, 'local');
  assert.equal(explicit.storage.ttsConfig.sentenceTTSProvider, 'custom2');

  const state = await loadStoredState({
    adapterSchemaVersion: 10,
    storage: { wordTTSProvider: 'edge', sentenceTTSProvider: 'gpt' },
    words: {},
  });

  assert.equal(state.storage.wordTTSProvider, 'edge');
  assert.equal(state.storage.sentenceTTSProvider, 'gpt');
  assert.equal(state.storage.ttsConfig.wordTTSProvider, 'edge');
  assert.equal(state.storage.ttsConfig.sentenceTTSProvider, 'edge');
});
