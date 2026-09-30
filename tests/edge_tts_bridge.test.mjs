import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'adapter', 'edge_tts_bridge.js'), 'utf8');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('Edge lifecycle adapter passes exact surface and explicit regional voice to upstream engine', async () => {
  const calls = [];
  const media = [];
  class Audio {
    constructor(url) { this.url = url; media.push(this); }
    addEventListener() {}
    async play() { this.played = true; }
    pause() { this.paused = true; }
  }
  const context = vm.createContext({
    __LINGKUMA_ZOTERO_READER__: true,
    edgetts_connWebsocket: async () => ({ close() {} }),
    edgetts_speak: async options => {
      calls.push(options);
      return { audioParts: [new Blob(['audio'])] };
    },
    edgetts_mp3Blob: result => new Blob(result.audioParts, { type: 'audio/mpeg' }),
    Audio,
    Blob,
    Promise,
    URL: {
      createObjectURL() { return 'blob:edge-test'; },
      revokeObjectURL(url) { calls.push({ revoked: url }); },
    },
    setTimeout,
    clearTimeout,
  });
  context.globalThis = context;
  vm.runInContext(SOURCE, context, { filename: 'adapter/edge_tts_bridge.js' });

  const result = await context.__LINGKUMA_ZOTERO_EDGE_TTS__.play({
    text: 'worked', language: 'en-GB', voice: 'en-GB-SoniaNeural',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    text: 'worked', voice: 'en-GB-SoniaNeural', language: 'en-GB',
    rate: 'default', volume: 'default', pitch: 'default',
  });
  assert.equal(result.success, true);
  assert.equal(media[0].url, 'blob:edge-test');
  assert.equal(media[0].played, true);

  context.__LINGKUMA_ZOTERO_EDGE_TTS__.stop();
  assert.equal(media[0].paused, true);
  assert.deepEqual(calls[1], { revoked: 'blob:edge-test' });
});

test('Edge lifecycle adapter escapes surface text before upstream SSML construction', async () => {
  let spoken = '';
  class Audio {
    addEventListener() {}
    async play() {}
    pause() {}
  }
  const context = vm.createContext({
    __LINGKUMA_ZOTERO_READER__: true,
    edgetts_connWebsocket: async () => ({ close() {} }),
    edgetts_speak: async options => {
      spoken = options.text;
      return { audioParts: [new Blob(['audio'])] };
    },
    edgetts_mp3Blob: result => new Blob(result.audioParts),
    Audio,
    Blob,
    Promise,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    setTimeout,
    clearTimeout,
  });
  context.globalThis = context;
  vm.runInContext(SOURCE, context, { filename: 'adapter/edge_tts_bridge.js' });

  await context.__LINGKUMA_ZOTERO_EDGE_TTS__.play({ text: 'rock & roll <live>' });
  assert.equal(spoken, 'rock &amp; roll &lt;live&gt;');
});

test('stopping an in-flight Edge attempt suppresses late audio playback', async () => {
  const synthesis = deferred();
  let audioConstructions = 0;
  const context = vm.createContext({
    __LINGKUMA_ZOTERO_READER__: true,
    edgetts_connWebsocket: async () => ({ close() {} }),
    edgetts_speak: () => synthesis.promise,
    edgetts_mp3Blob: result => new Blob(result.audioParts),
    Audio: class Audio { constructor() { audioConstructions++; } },
    Blob,
    Promise,
    URL: { createObjectURL: () => 'blob:late', revokeObjectURL() {} },
    setTimeout,
    clearTimeout,
  });
  context.globalThis = context;
  vm.runInContext(SOURCE, context, { filename: 'adapter/edge_tts_bridge.js' });

  const playback = context.__LINGKUMA_ZOTERO_EDGE_TTS__.play({ text: 'worked' });
  context.__LINGKUMA_ZOTERO_EDGE_TTS__.stop();
  synthesis.resolve({ audioParts: [new Blob(['late audio'])] });

  assert.deepEqual(JSON.parse(JSON.stringify(await playback)), { success: false, cancelled: true });
  assert.equal(audioConstructions, 0);
});
