import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const loadMain = mainWindow => {
  class StateAdapter {
    constructor() { this.storage = {}; this.words = {}; }
    addStorageListener() {}
  }
  class MessageHost {}
  const context = vm.createContext({
    LK_CONTENT_CSS_TEXT: '',
    LK_RESOURCE_DATA: {},
    LingKumaStateAdapter: StateAdapter,
    LingKumaLookupService: class LingKumaLookupService { async init() {} async shutdown() {} },
    LingKumaMessageHost: MessageHost,
    Zotero: {
      debug() {},
      logError() {},
      getMainWindow: () => mainWindow,
      Reader: { _readers: [], registerEventListener() {}, unregisterEventListener() {} },
    },
    setTimeout,
    clearTimeout,
    Error,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'main.js'), 'utf8'), context, { filename: 'adapter/main.js' });
  return context;
};

test('normal reader local TTS applies nested voice, rate, and pitch settings only to local playback', async () => {
  const context = loadMain({});
  const plugin = new context.LingKumaZoteroPlugin({ id: 'test', version: 'test', rootURI: 'xpi://test/' });
  plugin.state.storage.ttsConfig = { localTTSVoice: 'Reader Voice', localTTSRate: 1.6, localTTSPitch: 0.7 };
  const calls = [];
  plugin.speak = async (text, options) => calls.push({ text, options });

  await plugin.playAudioMessage({ action: 'playAudio', audioType: 'playLocal', text: 'lesen', lang: 'de' });
  await plugin.playAudioMessage({ action: 'playAudio', text: 'plain', lang: 'en', options: { rate: 1.2 } });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { text: 'lesen', options: { lang: 'de', rate: 1.6, pitch: 0.7, voice: 'Reader Voice' } },
    { text: 'plain', options: { rate: 1.2, lang: 'en' } },
  ]);
});

test('host speech selects the configured system voice by name', async () => {
  const spoken = [];
  const voices = [{ name: 'Default Voice', lang: 'en-US' }, { name: 'Reader Voice', lang: 'de-DE' }];
  class Utterance {
    constructor(text) { this.text = text; }
  }
  const mainWindow = {
    SpeechSynthesisUtterance: Utterance,
    speechSynthesis: {
      cancel() {},
      getVoices() { return voices; },
      speak(utterance) { spoken.push(utterance); utterance.onend(); },
    },
  };
  const context = loadMain(mainWindow);
  const plugin = new context.LingKumaZoteroPlugin({ id: 'test', version: 'test', rootURI: 'xpi://test/' });

  await plugin.speak('lesen', { lang: 'de', rate: 1.4, pitch: 0.8, voice: 'Reader Voice' });

  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].voice, voices[1]);
  assert.equal(spoken[0].rate, 1.4);
  assert.equal(spoken[0].pitch, 0.8);
  assert.equal(spoken[0].lang, 'de');
});

test('dictionary HTTPS audio uses the existing host Audio path', async () => {
  const calls = [];
  class Audio {
    constructor(url) { calls.push(['construct', url]); }
    async play() { calls.push(['play']); }
    pause() { calls.push(['pause']); }
  }
  const context = loadMain({ Audio, speechSynthesis: { cancel() {} } });
  const plugin = new context.LingKumaZoteroPlugin({ id: 'test', version: 'test', rootURI: 'xpi://test/' });

  await plugin.playAudioMessage({ action: 'playAudio', url: 'https://audio.example/study.mp3' });

  assert.deepEqual(calls, [
    ['construct', 'https://audio.example/study.mp3'],
    ['play'],
  ]);
});

test('unsupported browser TTS messages are rejected instead of masquerading as local speech', async () => {
  const context = loadMain({});
  const plugin = new context.LingKumaZoteroPlugin({ id: 'test', version: 'test', rootURI: 'xpi://test/' });
  const calls = [];
  plugin.speak = async (...args) => calls.push(args);

  for (const audioType of ['playGptTTS', 'playMinimaxi', 'playSupertoneTTS']) {
    await assert.rejects(
      () => plugin.playAudioMessage({ action: 'playAudio', audioType, text: 'test' }),
      /intentionally unsupported/i,
    );
  }
  assert.equal(calls.length, 0);
});

test('Edge playback is delegated only to the originating live reader context', async () => {
  const context = loadMain({});
  const plugin = new context.LingKumaZoteroPlugin({ id: 'test', version: 'test', rootURI: 'xpi://test/' });
  const calls = [];
  const contexts = [
    { id: 10, destroyed: false, playEdgeTTS: async options => calls.push(['wrong', options]) },
    { id: 11, destroyed: false, playEdgeTTS: async options => calls.push(['origin', options]) },
  ];
  plugin.host = { contextsForTab: tabID => tabID === 7 ? contexts : [] };

  await plugin.playAudioMessage({
    action: 'playAudio', audioType: 'playEdgeTTS', text: 'worked',
    voice: 'en-GB-SoniaNeural', lang: 'en-GB', rate: 1, volume: 1, pitch: 1,
  }, { tab: { id: 7 }, frameId: 11 });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[
    'origin',
    { text: 'worked', voice: 'en-GB-SoniaNeural', language: 'en-GB', rate: 1, volume: 1, pitch: 1 },
  ]]);

  await assert.rejects(
    () => plugin.playAudioMessage({ action: 'playAudio', audioType: 'playEdgeTTS', text: 'worked' }, {
      tab: { id: 7 }, frameId: 99,
    }),
    /originating.*context/i,
  );
  contexts[1].destroyed = true;
  await assert.rejects(
    () => plugin.playAudioMessage({ action: 'playAudio', audioType: 'playEdgeTTS', text: 'worked' }, {
      tab: { id: 7 }, frameId: 11,
    }),
    /originating.*context/i,
  );
});
