import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOOKUP_UI_PATH = path.join(ROOT, 'adapter', 'lookup_ui.js');
const MAIN_PATH = path.join(ROOT, 'adapter', 'main.js');
const BRIDGE_PATH = path.join(ROOT, 'adapter', 'bridge.js');
const LANGUAGE_BRIDGE_PATH = path.join(ROOT, 'adapter', 'language_bridge.js');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.style = {};
    this.isConnected = true;
    this.listeners = new Map();
  }

  get firstChild() { return this.children[0] || null; }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    child.parentNode = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    if (event.bubbles && !event.propagationStopped && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    const visit = node => {
      for (const child of node.children) {
        if (className && child.className.split(/\s+/).includes(className)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

const mouseDownEvent = () => ({
  type: 'mousedown', bubbles: true, defaultPrevented: false, propagationStopped: false,
  preventDefault() { this.defaultPrevented = true; },
  stopPropagation() { this.propagationStopped = true; },
});

const loadLookupUI = ({ storageGet, languageBridge, globals = {}, messageHandler = null, prelude = '' } = {}) => {
  const requests = [];
  const tasks = [];
  const pending = new Map();
  const context = vm.createContext({
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
    setTimeout,
    clearTimeout,
    document: {
      createElement: tag => new FakeElement(tag),
      documentElement: new FakeElement('html'),
    },
    chrome: {
      runtime: {
        sendMessage(message) {
          requests.push(message);
          if (messageHandler) return Promise.resolve(messageHandler(message));
          const task = deferred();
          tasks.push({ message, task });
          pending.set(message.action, task);
          return task.promise;
        },
      },
      storage: {
        local: { get: storageGet || (async () => ({ translationConfig: { targetLanguage: 'zh-CN' } })) },
        onChanged: { addListener() {}, removeListener() {} },
      },
    },
    __LINGKUMA_ZOTERO_READER__: true,
    __LINGKUMA_ZOTERO_LANGUAGE_BRIDGE__: languageBridge || {
      inferSourceLanguage: (_surface, _sentence, root) => root ? 'en' : '',
    },
  });
  Object.assign(context, globals);
  context.globalThis = context;
  if (prelude) vm.runInContext(prelude, context, { filename: 'lookup-ui-test-prelude.js' });
  vm.runInContext(fs.readFileSync(LOOKUP_UI_PATH, 'utf8'), context, { filename: LOOKUP_UI_PATH });
  return { context, requests, pending, tasks };
};

test('Quick Context renders immediately while Dictionary is pending and suppresses the short AI row', async () => {
  const { context, requests, pending } = loadLookupUI();
  const list = new FakeElement('div');
  const existingAI = new FakeElement('div');
  existingAI.className = 'translation-item ai-recommendation';
  existingAI.textContent = 'existing AI';
  list.appendChild(existingAI);

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list,
    tooltip: new FakeElement('div'),
    surface: 'bears',
    sentence: 'The bridge bears the load.',
  });

  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary', 'lookupQuickContext']);
  assert.equal(requests[0].requestToken, requests[1].requestToken);
  assert.equal(list.querySelectorAll('.lk-lookup-row').length, 0);

  pending.get('lookupQuickContext').resolve({
    requestToken: requests[1].requestToken,
    status: 'HIT',
    sentenceTranslation: '这座桥承受负荷。',
    contextualMeaning: '承受',
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const rows = list.querySelectorAll('.lk-lookup-row');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.lookupSource, 'quick-context');
  assert.equal(rows[0].textContent, '承受');
  assert.equal(list.children.includes(existingAI), true);
  assert.equal(existingAI.style.display, 'none');
  assert.equal(pending.get('lookupDictionary').promise instanceof Promise, true);
});

test('normal tooltip shows pronunciation, Dictionary, Quick Context, and AI Detail only in that order', async () => {
  const { context, requests, pending } = loadLookupUI();
  const tooltip = new FakeElement('div');
  const title = new FakeElement('div');
  title.className = 'word-title';
  const notes = new FakeElement('span');
  notes.className = 'Notes';
  const tags = new FakeElement('div');
  tags.className = 'tag-row';
  title.appendChild(notes);
  title.appendChild(tags);
  tooltip.appendChild(title);
  const list = new FakeElement('div');
  list.className = 'translation-list';
  const historical = new FakeElement('div');
  historical.className = 'translation-item';
  historical.textContent = '历史释义';
  const ai1 = new FakeElement('div');
  ai1.className = 'translation-item ai-recommendation';
  ai1.textContent = '蓝色短 AI 释义';
  const ai2 = new FakeElement('div');
  ai2.className = 'translation-item ai-recommendation-2';
  ai2.textContent = '橙色详细解析';
  list.appendChild(historical);
  list.appendChild(ai1);
  list.appendChild(ai2);
  tooltip.appendChild(list);

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list,
    tooltip,
    surface: 'problem',
    sentence: 'This problem is difficult.',
  });
  pending.get('lookupDictionary').resolve({
    requestToken: requests[0].requestToken,
    status: 'HIT',
    entry: {
      surface: 'problem',
      dictionaryForm: 'problem',
      meanings: ['问题', '困难', '难题'],
      pronunciations: [
        { region: 'US', ipa: '/ˈprɑbləm/' },
        { region: 'UK', ipa: '/ˈprɒbləm/' },
      ],
    },
  });
  pending.get('lookupQuickContext').resolve({
    requestToken: requests[1].requestToken,
    status: 'HIT',
    sentenceTranslation: '这个问题很困难。',
    contextualMeaning: '问题',
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const visible = list.children.filter(child => child.style.display !== 'none');
  assert.deepEqual(visible.map(child => (
    child.dataset.lookupSource
      || (child.className.includes('ai-recommendation-2') ? 'ai-detail' : 'upstream')
  )), ['pronunciation', 'dictionary', 'quick-context', 'ai-detail']);
  assert.deepEqual(
    visible[0].querySelectorAll('.lk-pronunciation-control').map(control => control.textContent),
    ['US /ˈprɑbləm/ 🔊', 'UK /ˈprɒbləm/ 🔊'],
  );
  assert.equal(title.querySelector('.lk-dictionary-ipa'), null);
  assert.equal(historical.style.display, 'none');
  assert.equal(ai1.style.display, 'none');
  assert.notEqual(ai2.style.display, 'none');
});

test('US and UK pronunciation controls use independent regional playback and stop propagation', async () => {
  const { context, requests, pending } = loadLookupUI();
  const tooltip = new FakeElement('div');
  const title = new FakeElement('div');
  title.className = 'word-title';
  let genericPlayback = 0;
  title.addEventListener('mousedown', () => { genericPlayback++; });
  tooltip.appendChild(title);
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list,
    tooltip,
    surface: 'problem',
    sentence: 'This problem is difficult.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  });
  pending.get('lookupDictionary').resolve({
    requestToken: requests[0].requestToken,
    status: 'HIT',
    entry: {
      surface: 'problem', dictionaryForm: 'problem', meanings: ['问题'],
      audio: { region: 'US', url: 'https://audio.example/problem-us.ogg' },
      pronunciations: [
        { region: 'US', ipa: '/ˈprɑbləm/', url: 'https://audio.example/problem-us.ogg' },
        { region: 'UK', ipa: '/ˈprɒbləm/' },
      ],
    },
  });
  pending.get('lookupQuickContext').resolve({ requestToken: requests[1].requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));

  const controls = list.querySelectorAll('.lk-pronunciation-control');
  assert.deepEqual(controls.map(control => control.dataset.region), ['US', 'UK']);
  const usEvent = mouseDownEvent();
  controls[0].dispatchEvent(usEvent);
  const ukEvent = mouseDownEvent();
  controls[1].dispatchEvent(ukEvent);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(usEvent.defaultPrevented, true);
  assert.equal(usEvent.propagationStopped, true);
  assert.equal(ukEvent.defaultPrevented, true);
  assert.equal(ukEvent.propagationStopped, true);
  assert.equal(genericPlayback, 0);
  assert.equal(controls[0].dataset.playbackSource, 'Resolving…');
  assert.equal(controls[1].dataset.playbackSource, 'Resolving…');
  assert.deepEqual(
    requests.filter(request => request.action === 'playAudio').map(request => ({
      url: request.url, text: request.text, lang: request.lang, audioType: request.audioType,
    })),
    [
      { url: 'https://audio.example/problem-us.ogg', text: undefined, lang: undefined, audioType: undefined },
      { url: undefined, text: 'problem', lang: 'en-GB', audioType: 'playEdgeTTS' },
    ],
  );
});

test('missing regional recording falls back through matching Edge, Google, then Local speech', async () => {
  const dictionary = deferred();
  const { context, requests, pending } = loadLookupUI({
    messageHandler(message) {
      if (message.action === 'lookupDictionary') return dictionary.promise;
      if (message.audioType === 'playEdgeTTS') return Promise.reject(new Error('Edge unavailable'));
      if (String(message.url || '').startsWith('https://translate.google.com/')) {
        return Promise.reject(new Error('Google unavailable'));
      }
      return { success: true };
    },
  });
  const tooltip = new FakeElement('div');
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'problem', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  dictionary.resolve({
    requestToken: requests[0].requestToken,
    status: 'HIT',
    entry: {
      surface: 'problem', dictionaryForm: 'problem', meanings: ['problem'],
      pronunciations: [{ region: 'UK', ipa: '/uk/' }],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  list.querySelector('.lk-pronunciation-control').dispatchEvent(mouseDownEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  const playback = requests.filter(request => request.action === 'playAudio');
  assert.deepEqual(playback.map(request => ({
    audioType: request.audioType,
    voice: request.voice,
    lang: request.lang,
    text: request.text,
    google: String(request.url || '').startsWith('https://translate.google.com/'),
  })), [
    { audioType: 'playEdgeTTS', voice: 'en-GB-SoniaNeural', lang: 'en-GB', text: 'problem', google: false },
    { audioType: undefined, voice: undefined, lang: undefined, text: undefined, google: true },
    { audioType: 'playLocal', voice: undefined, lang: 'en-GB', text: 'problem', google: false },
  ]);
  const control = list.querySelector('.lk-pronunciation-control');
  assert.equal(control.dataset.playbackSource, 'Local TTS');
  assert.equal(control.title, 'UK pronunciation — source: Local TTS');
});
test('pronunciation control reports the provider that actually accepted playback', async () => {
  const dictionary = deferred();
  const { context, requests } = loadLookupUI({
    messageHandler(message) {
      if (message.action === 'lookupDictionary') return dictionary.promise;
      return { success: true };
    },
  });
  const tooltip = new FakeElement('div');
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);
  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'problem', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  dictionary.resolve({
    requestToken: requests[0].requestToken,
    status: 'HIT',
    entry: {
      surface: 'problem', dictionaryForm: 'problem', meanings: ['problem'],
      pronunciations: [{ region: 'UK', ipa: '/uk/' }],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const control = list.querySelector('.lk-pronunciation-control');
  control.dispatchEvent(mouseDownEvent());
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(control.dataset.playbackSource, 'Edge TTS');
  assert.equal(control.title, 'UK pronunciation — source: Edge TTS');
});
test('regional recorded audio remains available while disabled word TTS suppresses only synthesis fallback', async () => {
  const { context, requests, pending } = loadLookupUI({
    storageGet: async () => ({
      translationConfig: { targetLanguage: 'zh-CN' },
      enableWordTTS: false,
    }),
  });
  const tooltip = new FakeElement('div');
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);
  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'problem', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  pending.get('lookupDictionary').resolve({
    requestToken: requests[0].requestToken,
    status: 'HIT',
    entry: {
      surface: 'problem', dictionaryForm: 'problem', meanings: ['problem'],
      pronunciations: [
        { region: 'US', ipa: '/us/', url: 'https://audio.example/problem-us.ogg' },
        { region: 'UK', ipa: '/uk/' },
      ],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const controls = list.querySelectorAll('.lk-pronunciation-control');
  controls[0].dispatchEvent(mouseDownEvent());
  controls[1].dispatchEvent(mouseDownEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests.filter(request => request.action === 'playAudio').map(request => request.url), [
    'https://audio.example/problem-us.ogg',
  ]);
});
test('Dictionary and IPA paint before Quick Context, then survive an upstream list refresh without refetching', async () => {
  const root = new FakeElement('div');
  const tooltip = new FakeElement('div');
  tooltip.className = 'vocab-tooltip';
  const title = new FakeElement('div');
  title.className = 'word-title';
  const notes = new FakeElement('div');
  notes.className = 'Notes';
  title.appendChild(notes);
  tooltip.appendChild(title);
  const list = new FakeElement('div');
  list.className = 'translation-list';
  const initialAI = new FakeElement('div');
  initialAI.className = 'translation-item ai-recommendation';
  initialAI.textContent = 'AI1 pending';
  list.appendChild(initialAI);
  tooltip.appendChild(list);
  root.appendChild(tooltip);
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() {}
    trigger() { this.callback([{ type: 'childList', target: this.target }]); }
  }
  const { context, requests, tasks } = loadLookupUI({
    globals: {
      MutationObserver: FakeMutationObserver,
      showEnhancedTooltipForWord: async () => undefined,
      __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: { get: () => root, onCapture: () => () => {} },
    },
  });

  await context.showEnhancedTooltipForWord('study', 'They study bridges.', {}, {}, 'study');
  await new Promise(resolve => setTimeout(resolve, 0));
  const dictionary = tasks.find(({ message }) => message.action === 'lookupDictionary');
  const quick = tasks.find(({ message }) => message.action === 'lookupQuickContext');
  dictionary.task.resolve({
    requestToken: dictionary.message.requestToken,
    status: 'HIT',
    entry: { surface: 'study', dictionaryForm: 'study', meanings: ['学习'], ipa: '/ˈstʌdi/' },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(
    list.children.filter(child => child.style.display !== 'none').map(child => child.dataset.lookupSource || 'ai'),
    ['pronunciation', 'dictionary'],
  );
  assert.deepEqual(
    list.querySelector('.lk-lookup-pronunciation')?.querySelectorAll('.lk-pronunciation-control').map(control => control.textContent),
    ['/ˈstʌdi/ 🔊'],
  );
  assert.equal(tooltip.querySelector('.lk-dictionary-ipa'), null);

  const lateAI = new FakeElement('div');
  lateAI.className = 'translation-item ai-recommendation-2';
  lateAI.textContent = 'AI Detail arrived';
  list.appendChild(lateAI);
  quick.task.resolve({
    requestToken: quick.message.requestToken,
    status: 'HIT',
    sentenceTranslation: '他们研究桥梁。',
    contextualMeaning: '研究',
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(
    list.children.filter(child => child.style.display !== 'none').map(child => child.dataset.lookupSource || 'ai'),
    ['pronunciation', 'dictionary', 'quick-context', 'ai'],
  );

  for (const child of [...list.children]) child.remove();
  const refreshedAI = new FakeElement('div');
  refreshedAI.className = 'translation-item ai-recommendation';
  refreshedAI.textContent = 'AI1 refreshed';
  list.appendChild(refreshedAI);
  observers[0].trigger();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(
    list.children.filter(child => child.style.display !== 'none').map(child => child.dataset.lookupSource || 'ai'),
    ['pronunciation', 'dictionary', 'quick-context'],
  );
  assert.equal(requests.length, 2);
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
});
test('tooltip sentence capture forwards the clicked repeated-word occurrence to Quick Context', async () => {
  const root = new FakeElement('div');
  const tooltip = new FakeElement('div');
  tooltip.className = 'vocab-tooltip';
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);
  root.appendChild(tooltip);
  const upstreamGetSentence = () => ({
    sentence: 'The bank passed the bank.',
    range: {
      cloneRange() {
        return {
          setEnd() {},
          toString() { return 'The bank passed the '; },
        };
      },
    },
  });
  const upstreamShow = async () => undefined;
  const { context, requests } = loadLookupUI({
    globals: {
      getSentenceForWord: upstreamGetSentence,
      showEnhancedTooltipForWord: upstreamShow,
      __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: { get: () => root, onCapture: () => () => {} },
    },
  });
  context.getSentenceForWord({ word: 'bank', range: { startContainer: {}, startOffset: 0 } });
  await context.showEnhancedTooltipForWord('bank', 'The bank passed the bank.', {}, {}, 'bank');
  await new Promise(resolve => setTimeout(resolve, 0));

  const quick = requests.find(request => request.action === 'lookupQuickContext');
  assert.equal(quick?.surfaceStart, 20);
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
  assert.equal(context.getSentenceForWord, upstreamGetSentence);
});
test('clicking a component of an explicit hyphenated compound looks up the whole compound', async () => {
  const sentence = 'A peer-on-peer protocol is useful.';
  const root = new FakeElement('div');
  const tooltip = new FakeElement('div');
  tooltip.className = 'vocab-tooltip';
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);
  root.appendChild(tooltip);
  const shown = [];
  const ttsCalls = [];
  const upstreamGetSentence = () => ({
    sentence,
    range: {
      cloneRange() {
        return {
          setEnd() {},
          toString() { return 'A peer-'; },
        };
      },
    },
  });
  const { context, requests, tasks } = loadLookupUI({
    globals: {
      getSentenceForWord: upstreamGetSentence,
      showEnhancedTooltipForWord(...args) { shown.push(args); },
      playText(params) { ttsCalls.push(params); },
      __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: { get: () => root, onCapture: () => () => {} },
    },
  });

  context.getSentenceForWord({ word: 'on', range: { startContainer: {}, startOffset: 0 } });
  await context.showEnhancedTooltipForWord('on', sentence, {}, {}, 'on');
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(shown[0][0], 'peer-on-peer');
  assert.equal(shown[0][4], 'peer-on-peer');
  assert.deepEqual(requests.map(request => [request.action, request.surface]), [
    ['lookupDictionary', 'peer-on-peer'],
    ['lookupQuickContext', 'peer-on-peer'],
  ]);
  assert.equal(requests[1].surfaceStart, 2);

  context.playText({ text: 'on', sentence, count: 1 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.some(request => request.surface === 'on'), false);
  const dictionary = tasks.find(({ message }) => message.action === 'lookupDictionary');
  dictionary.task.resolve({ requestToken: dictionary.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const pronunciation = tasks.find(({ message }) => message.action === 'lookupPronunciation');
  pronunciation.task.resolve({ requestToken: pronunciation.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const compoundEdge = tasks.find(({ message }) => message.audioType === 'playEdgeTTS');
  assert.equal(compoundEdge.message.text, 'peer-on-peer');
  assert.equal(compoundEdge.message.voice, 'en-US-AriaNeural');
  assert.equal(ttsCalls.length, 0);
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
});
test('positioned-text normalized click coordinates preserve compounds and repaired split words', async () => {
  for (const { sentence, word, clickedSurfaceStart, nativePrefix, expected } of [
    {
      sentence: 'A robust out-of-sample estimate.',
      word: 'out',
      clickedSurfaceStart: 9,
      nativePrefix: 'A robust',
      expected: 'out-of-sample',
    },
    {
      sentence: 'The international study ends here.',
      word: 'national',
      clickedSurfaceStart: 9,
      nativePrefix: 'The inter-',
      expected: 'international',
    },
  ]) {
    const root = new FakeElement('div');
    const tooltip = new FakeElement('div');
    tooltip.className = 'vocab-tooltip';
    const list = new FakeElement('div');
    list.className = 'translation-list';
    tooltip.appendChild(list);
    root.appendChild(tooltip);
    const shown = [];
    const { context, requests } = loadLookupUI({
      globals: {
        getSentenceForWord: () => ({
          sentence,
          clickedSurfaceStart,
          range: { cloneRange: () => ({ setEnd() {}, toString: () => nativePrefix }) },
        }),
        showEnhancedTooltipForWord(...args) { shown.push(args); },
        __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: { get: () => root, onCapture: () => () => {} },
      },
    });

    context.getSentenceForWord({ word, range: { startContainer: {}, startOffset: 0 } });
    await context.showEnhancedTooltipForWord(word, sentence, {}, {}, word);
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(shown[0][0], expected);
    assert.equal(shown[0][4], expected);
    assert.deepEqual(requests.map(request => request.surface), [expected, expected]);
    context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
  }
});
test('an uncaptured duplicate show cannot downgrade a pending compound lookup unit', async () => {
  const sentence = 'An out-of-sample test differs from standalone out.';
  const root = new FakeElement('div');
  const tooltip = new FakeElement('div');
  tooltip.className = 'vocab-tooltip';
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);
  root.appendChild(tooltip);
  const firstShow = deferred();
  const shown = [];
  let showCount = 0;
  let sentencePrefix = 'An ';
  const { context, requests } = loadLookupUI({
    globals: {
      getSentenceForWord: () => ({
        sentence,
        range: { cloneRange: () => ({ setEnd() {}, toString: () => sentencePrefix }) },
      }),
      showEnhancedTooltipForWord(...args) {
        shown.push(args);
        showCount++;
        return showCount === 1 ? firstShow.promise : undefined;
      },
      __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: { get: () => root, onCapture: () => () => {} },
    },
  });

  context.getSentenceForWord({ word: 'out', range: { startContainer: {}, startOffset: 0 } });
  const pendingCompound = context.showEnhancedTooltipForWord('out', sentence, {}, {}, 'out');
  await context.showEnhancedTooltipForWord('out', sentence, {}, {}, 'out');
  await new Promise(resolve => setTimeout(resolve, 0));
  firstShow.resolve();
  await pendingCompound;
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(shown.map(args => [args[0], args[4]]), [
    ['out-of-sample', 'out-of-sample'],
    ['out-of-sample', 'out-of-sample'],
  ]);
  assert.deepEqual(requests.map(request => [request.action, request.surface]), [
    ['lookupDictionary', 'out-of-sample'],
    ['lookupQuickContext', 'out-of-sample'],
  ]);
  assert.equal(requests.some(request => request.surface === 'out'), false);

  sentencePrefix = sentence.slice(0, sentence.lastIndexOf('out'));
  context.getSentenceForWord({ word: 'out', range: { startContainer: {}, startOffset: 0 } });
  await context.showEnhancedTooltipForWord('out', sentence, {}, {}, 'out');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(shown.at(-1).filter((_, index) => index === 0 || index === 4), ['out', 'out']);
  assert.deepEqual(requests.slice(-2).map(request => [request.action, request.surface]), [
    ['lookupDictionary', 'out'],
    ['lookupQuickContext', 'out'],
  ]);
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
});

test('duplicate AI Detail consumers for one compound share the final in-flight result', async () => {
  const gate = deferred();
  const calls = [];
  const { context } = loadLookupUI({
    globals: {
      fetchAIWordTranslation2(word, sentence) {
        calls.push({ word, sentence });
        return gate.promise;
      },
    },
  });

  const first = context.fetchAIWordTranslation2('out-of-sample', 'An out-of-sample test.');
  const duplicate = context.fetchAIWordTranslation2('out-of-sample', 'An out-of-sample test.');
  assert.equal(calls.length, 1);
  gate.resolve('表示样本外检验');
  assert.deepEqual(await Promise.all([first, duplicate]), ['表示样本外检验', '表示样本外检验']);
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
});

test('the public compound show seam synchronizes upstream tooltip identity before AI Detail refresh', async () => {
  const gate = deferred();
  const calls = [];
  const { context } = loadLookupUI({
    globals: {
      __aiGate: gate,
      __aiCalls: calls,
      fetchAIWordTranslation2(word, sentence) {
        calls.push({ word, sentence });
        return gate.promise;
      },
      getSentenceForWord: () => ({
        sentence: 'A three-factor model.',
        range: { cloneRange: () => ({ setEnd() {}, toString: () => 'A ' }) },
      }),
    },
    prelude: `
      let currentTooltipWord = 'three';
      globalThis.__readCurrentTooltipWord = () => currentTooltipWord;
      globalThis.showEnhancedTooltipForWord = async function(word, sentence) {
        globalThis.__shownWord = word;
        globalThis.__aiText = 'Hmm...';
        const first = globalThis.fetchAIWordTranslation2(word, sentence);
        const duplicate = globalThis.fetchAIWordTranslation2(word, sentence);
        const translation = await duplicate;
        if (currentTooltipWord && currentTooltipWord.toLowerCase() !== word.toLowerCase()) return;
        globalThis.__aiText = translation;
        await first;
      };
    `,
  });

  context.getSentenceForWord({ word: 'three', range: { startContainer: {}, startOffset: 0 } });
  const shown = context.showEnhancedTooltipForWord(
    'three', 'A three-factor model.', {}, {}, 'three',
  );
  assert.equal(context.__shownWord, 'three-factor');
  assert.equal(context.__readCurrentTooltipWord(), 'three-factor');
  assert.equal(calls.length, 1);
  gate.resolve('三因子模型中的复合修饰语');
  await shown;
  assert.equal(context.__aiText, '三因子模型中的复合修饰语');
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
});
test('compound capture covers first and last components without treating spaced punctuation as a phrase', async () => {
  for (const { sentence, word, prefix, expected } of [
    { sentence: 'A state-of-the-art method.', word: 'state', prefix: 'A ', expected: 'state-of-the-art' },
    { sentence: 'A state-of-the-art method.', word: 'art', prefix: 'A state-of-the-', expected: 'state-of-the-art' },
    { sentence: 'A well‑known fact.', word: 'known', prefix: 'A well‑', expected: 'well‑known' },
    { sentence: 'A peer - on comparison.', word: 'on', prefix: 'A peer - ', expected: 'on' },
  ]) {
    const root = new FakeElement('div');
    const tooltip = new FakeElement('div');
    tooltip.className = 'vocab-tooltip';
    const list = new FakeElement('div');
    list.className = 'translation-list';
    tooltip.appendChild(list);
    root.appendChild(tooltip);
    const shown = [];
    const { context, requests } = loadLookupUI({
      globals: {
        getSentenceForWord: () => ({
          sentence,
          range: { cloneRange: () => ({ setEnd() {}, toString: () => prefix }) },
        }),
        showEnhancedTooltipForWord(...args) { shown.push(args); },
        __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: { get: () => root, onCapture: () => () => {} },
      },
    });

    context.getSentenceForWord({ word, range: { startContainer: {}, startOffset: 0 } });
    await context.showEnhancedTooltipForWord(word, sentence, {}, {}, word);
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(shown[0][0], expected, `${word} in ${sentence}`);
    assert.equal(shown[0][4], expected, `${word} originalWord in ${sentence}`);
    assert.deepEqual(requests.map(request => request.surface), [expected, expected]);
    context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
  }
});
test('Dictionary meaning and IPA render without sentence context while Quick Context stays idle', async () => {
  const { context, requests, pending } = loadLookupUI();
  const list = new FakeElement('div');
  const tooltip = new FakeElement('div');
  const title = new FakeElement('div');
  title.className = 'word-title';
  const notes = new FakeElement('div');
  notes.className = 'Notes';
  title.appendChild(notes);
  tooltip.appendChild(title);

  const token = await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list,
    tooltip,
    surface: 'book',
  });

  assert.equal(typeof token, 'string');
  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary']);
  pending.get('lookupDictionary').resolve({
    requestToken: token,
    status: 'HIT',
    entry: {
      surface: 'book', dictionaryForm: 'book', meanings: ['册', '书', '记录'], ipa: '/bʊk/',
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const rows = list.querySelectorAll('.lk-lookup-row');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.dataset.lookupSource), ['pronunciation', 'dictionary']);
  assert.deepEqual(rows[0].querySelectorAll('.lk-pronunciation-control').map(control => control.textContent), ['/bʊk/ 🔊']);
  assert.equal(rows[1].textContent, '册 · 书 · 记录');
  assert.equal(tooltip.querySelector('.lk-dictionary-ipa'), null);
  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary']);
});

test('a Dictionary MISS still queries the independent pronunciation source for a common English word', async () => {
  const { context, requests, pending } = loadLookupUI();
  const list = new FakeElement('div');

  const token = await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list,
    tooltip: new FakeElement('div'),
    surface: 'specific',
    sentence: '',
  });

  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary']);
  pending.get('lookupDictionary').resolve({ requestToken: token, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(
    requests.map(request => request.action),
    ['lookupDictionary', 'lookupPronunciation'],
  );
  pending.get('lookupPronunciation').resolve({
    requestToken: token,
    status: 'HIT',
    entry: {
      surface: 'specific',
      pronunciations: [
        { region: 'US', ipa: '/spɪˈsɪf.ɪk/', url: 'https://audio.example/specific.mp3' },
        { region: 'UK', ipa: '/spɪˈsɪf.ɪk/' },
      ],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const rows = list.querySelectorAll('.lk-lookup-row');
  assert.deepEqual(rows.map(row => row.dataset.lookupSource), ['pronunciation']);
  assert.deepEqual(
    rows[0].querySelectorAll('.lk-pronunciation-control').map(control => control.dataset.region),
    ['US', 'UK'],
  );
  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary', 'lookupPronunciation']);
});

test('AI pronunciation replaces a total pronunciation MISS in the existing US and UK controls', async () => {
  const { context, requests, pending } = loadLookupUI();
  const list = new FakeElement('div');

  const token = await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list,
    tooltip: new FakeElement('div'),
    surface: 'pricing',
    sentence: 'The pricing remains specific.',
  });

  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary', 'lookupQuickContext']);
  pending.get('lookupQuickContext').resolve({
    requestToken: token, status: 'HIT',
    sentenceTranslation: 'translated sentence', contextualMeaning: 'contextual meaning',
  });
  pending.get('lookupDictionary').resolve({ requestToken: token, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.at(-1).action, 'lookupPronunciation');

  pending.get('lookupPronunciation').resolve({ requestToken: token, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.at(-1).action, 'lookupAIPronunciation');

  pending.get('lookupAIPronunciation').resolve({
    requestToken: token, status: 'HIT',
    entry: {
      surface: 'pricing',
      pronunciations: [
        { region: 'US', ipa: '/pricing-us/' },
        { region: 'UK', ipa: '/pricing-uk/' },
      ],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const rows = list.querySelectorAll('.lk-lookup-row');
  assert.deepEqual(rows.map(row => row.dataset.lookupSource), ['pronunciation', 'quick-context']);
  const controls = rows[0].querySelectorAll('.lk-pronunciation-control');
  assert.deepEqual(controls.map(control => control.dataset.region), ['US', 'UK']);

  const beforePlayback = requests.length;
  controls[0].dispatchEvent(mouseDownEvent());
  controls[1].dispatchEvent(mouseDownEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests.slice(beforePlayback).map(request => ({
    action: request.action, audioType: request.audioType, text: request.text, lang: request.lang,
  })), [
    { action: 'playAudio', audioType: 'playEdgeTTS', text: 'pricing', lang: 'en-US' },
    { action: 'playAudio', audioType: 'playEdgeTTS', text: 'pricing', lang: 'en-GB' },
  ]);
});

test('AI IPA preserves an exact Dictionary recording and fills only the missing regional text', async () => {
  const { context, requests, pending } = loadLookupUI();
  const list = new FakeElement('div');
  const tooltip = new FakeElement('div');
  const token = await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'pricing', sentence: '',
  });

  pending.get('lookupDictionary').resolve({
    requestToken: token, status: 'HIT',
    entry: {
      surface: 'pricing', dictionaryForm: 'pricing', meanings: ['price setting'],
      pronunciations: [{ region: 'US', url: 'https://audio.example/pricing-us.mp3' }],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.at(-1).action, 'lookupPronunciation');

  const beforeTopPlayback = requests.length;
  assert.equal(context.__LINGKUMA_LOOKUP_PLAY_AUDIO__({ tooltip, fallback() {} }), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests.slice(beforeTopPlayback).map(request => ({
    action: request.action, url: request.url,
  })), [{ action: 'playAudio', url: 'https://audio.example/pricing-us.mp3' }]);

  pending.get('lookupPronunciation').resolve({ requestToken: token, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.at(-1).action, 'lookupAIPronunciation');
  pending.get('lookupAIPronunciation').resolve({
    requestToken: token, status: 'HIT',
    entry: {
      surface: 'pricing',
      pronunciations: [
        { region: 'US', ipa: '/pricing-us/' },
        { region: 'UK', ipa: '/pricing-uk/' },
      ],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const controls = list.querySelectorAll('.lk-pronunciation-control');
  assert.deepEqual(controls.map(control => control.dataset.region), ['US', 'UK']);
  const beforeRegionalPlayback = requests.length;
  controls[0].dispatchEvent(mouseDownEvent());
  controls[1].dispatchEvent(mouseDownEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests.slice(beforeRegionalPlayback).map(request => ({
    action: request.action, url: request.url, audioType: request.audioType, lang: request.lang,
  })), [
    { action: 'playAudio', url: 'https://audio.example/pricing-us.mp3', audioType: undefined, lang: undefined },
    { action: 'playAudio', url: undefined, audioType: 'playEdgeTTS', lang: 'en-GB' },
  ]);
});

test('English pronunciation remains visible for a non-Chinese translation target without leaking Chinese meanings', async () => {
  const { context, requests, pending } = loadLookupUI({
    storageGet: async () => ({ translationConfig: { targetLanguage: 'ja' } }),
  });
  const list = new FakeElement('div');
  const tooltip = new FakeElement('div');

  const token = await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'book', sourceLanguage: 'en', targetLanguage: 'ja',
  });
  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary']);

  pending.get('lookupDictionary').resolve({ requestToken: token, status: 'UNAVAILABLE' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests.map(request => request.action), ['lookupDictionary', 'lookupPronunciation']);

  pending.get('lookupPronunciation').resolve({
    requestToken: token,
    status: 'HIT',
    entry: {
      surface: 'book', ipa: '/bʊk/',
      pronunciations: [
        { ipa: '/bʊk/', region: 'US', url: 'https://audio.example/book-us.mp3' },
        { ipa: '/bʊk/', region: 'UK', url: 'https://audio.example/book-uk.mp3' },
      ],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const rows = list.querySelectorAll('.lk-lookup-row');
  assert.deepEqual(rows.map(row => row.dataset.lookupSource), ['pronunciation']);
  assert.deepEqual(rows[0].querySelectorAll('.lk-pronunciation-control').map(control => control.dataset.region), ['US', 'UK']);
  assert.equal(list.querySelector('.lk-lookup-dictionary'), null);
  assert.equal(list.textContent.includes('书'), false);
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
});
test('cleanup invalidates a late cross-target pronunciation result and queued playback', async () => {
  const { context, requests, pending } = loadLookupUI({
    storageGet: async () => ({ translationConfig: { targetLanguage: 'de' } }),
  });
  const list = new FakeElement('div');
  const tooltip = new FakeElement('div');
  const token = await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'book', sourceLanguage: 'en', targetLanguage: 'de',
  });
  pending.get('lookupDictionary').resolve({ requestToken: token, status: 'UNAVAILABLE' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.at(-1).action, 'lookupPronunciation');

  let fallbackCalls = 0;
  assert.equal(context.__LINGKUMA_LOOKUP_PLAY_AUDIO__({
    tooltip, fallback: () => { fallbackCalls++; },
  }), true);
  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
  pending.get('lookupPronunciation').resolve({
    requestToken: token, status: 'HIT',
    entry: {
      surface: 'book', ipa: '/bʊk/',
      pronunciations: [{ ipa: '/bʊk/', region: 'US', url: 'https://audio.example/book.mp3' }],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(list.querySelectorAll('.lk-lookup-row').length, 0);
  assert.equal(requests.some(request => request.action === 'playAudio'), false);
  assert.equal(fallbackCalls, 0);
});
test('cleanup invalidates a late AI pronunciation result', async () => {
  const { context, requests, pending } = loadLookupUI();
  const list = new FakeElement('div');
  const token = await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip: new FakeElement('div'), surface: 'pricing', sourceLanguage: 'en',
  });
  pending.get('lookupDictionary').resolve({ requestToken: token, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  pending.get('lookupPronunciation').resolve({ requestToken: token, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.at(-1).action, 'lookupAIPronunciation');

  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
  pending.get('lookupAIPronunciation').resolve({
    requestToken: token, status: 'HIT',
    entry: {
      surface: 'pricing',
      pronunciations: [
        { region: 'US', ipa: '/pricing-us/' },
        { region: 'UK', ipa: '/pricing-uk/' },
      ],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(list.querySelectorAll('.lk-lookup-row').length, 0);
});

test('real bundled book entry reaches the tooltip as Chinese Dictionary meaning plus IPA', async () => {
  const asset = path.join(ROOT, 'assets', 'dictionaries', 'kaikki-en-zh-cn-2026-09.lkdict');
  const catalogContext = vm.createContext({ Object });
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'adapter', 'dictionary_catalog.js'), 'utf8'),
    catalogContext,
  );
  const catalog = JSON.parse(JSON.stringify(catalogContext.LK_DICTIONARY_CATALOG));
  const lookupContext = vm.createContext({ console, Error, JSON, Object, Map, Set, Promise, AbortController, URL });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'), lookupContext);
  const cacheColumns = [
    { name: 'dictionary_identity', pk: 1 }, { name: 'source_language', pk: 2 },
    { name: 'target_language', pk: 3 }, { name: 'normalized_term', pk: 4 },
    { name: 'result_json', pk: 0 },
  ];
  let aiCalls = 0;
  const service = new lookupContext.LingKumaLookupService({
    state: {
      storageGet(defaults) { return structuredClone(defaults); },
      storageSet() {},
      makeAIRequest() { aiCalls++; throw new Error('Dictionary lexical facts must not use AI'); },
    },
    catalog,
    dependencies: {
      dataRoot: path.join(ROOT, 'assets'),
      join(...parts) {
        const leaf = String(parts.at(-1));
        return leaf === `${catalog[0].dictionaryID}.lkdict` ? asset : path.join(...parts);
      },
      file: {
        async exists(filePath) { return fs.existsSync(filePath); },
        async stat(filePath) {
          const stat = fs.statSync(filePath);
          return { type: stat.isFile() ? 'regular' : 'other', size: stat.size, lastModified: stat.mtimeMs, creationTime: stat.birthtimeMs };
        },
        async makeDirectory() {},
        async remove() {},
      },
      dbFactory(filePath) {
        if (filePath.endsWith('lookup-cache.sqlite')) {
          return {
            async valueQueryAsync() { return null; },
            async queryAsync(sql) { return /table_info\(lookup_cache\)/i.test(sql) ? cacheColumns : []; },
            async closeDatabase() {},
          };
        }
        const database = new DatabaseSync(filePath, { readOnly: true });
        return {
          async valueQueryAsync(sql, params = []) {
            const row = database.prepare(sql).get(...params);
            return row ? Object.values(row)[0] : null;
          },
          async queryAsync(sql, params = []) { return database.prepare(sql).all(...params); },
          async closeDatabase() { database.close(); },
        };
      },
      async sha256File(filePath) {
        return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
      },
      now: () => '2026-09-29T00:00:00.000Z',
    },
  });
  await service.init();
  const { context, requests } = loadLookupUI({
    messageHandler(message) {
      if (message.action === 'lookupDictionary') return service.lookupDictionary(message);
      if (message.action === 'lookupPronunciation') return service.lookupPronunciation(message);
      if (message.action === 'playAudio') return {};
      throw new Error(`unexpected action: ${message.action}`);
    },
  });
  const list = new FakeElement('div');
  const tooltip = new FakeElement('div');
  const title = new FakeElement('div');
  title.className = 'word-title';
  const notes = new FakeElement('div');
  notes.className = 'Notes';
  title.appendChild(notes);
  tooltip.appendChild(title);

  try {
    await context.__LINGKUMA_LOOKUP_RENDER__({
      translationList: list, tooltip, surface: 'book', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    });
    for (let attempt = 0; attempt < 20 && !String(list.querySelector('.lk-lookup-dictionary')?.textContent || '').includes('册'); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    assert.deepEqual(requests.map(request => request.action), ['lookupDictionary']);
    assert.equal(list.querySelector('.lk-lookup-dictionary')?.textContent, '册 · 书 · 记录');
    const bookControls = list.querySelectorAll('.lk-pronunciation-control');
    assert.deepEqual(bookControls.map(control => control.dataset.region), ['US', 'UK']);
    assert.deepEqual(bookControls.map(control => control.textContent), ['US /bʊk/ 🔊', 'UK /bɵk/ 🔊']);
    assert.equal(tooltip.querySelector('.lk-dictionary-ipa'), null);
    bookControls[0].dispatchEvent(mouseDownEvent());
    bookControls[1].dispatchEvent(mouseDownEvent());
    await new Promise(resolve => setTimeout(resolve, 0));
    const bookPlayback = requests.filter(request => request.action === 'playAudio');
    assert.deepEqual(bookPlayback.map(request => request.url), [
      'https://upload.wikimedia.org/wikipedia/commons/3/3d/En-us-book.ogg',
      'https://upload.wikimedia.org/wikipedia/commons/7/70/En-uk-book.ogg',
    ]);
    assert.notEqual(bookPlayback[0].url, bookPlayback[1].url);

    await context.__LINGKUMA_LOOKUP_RENDER__({
      translationList: list, tooltip, surface: 'problem', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    });
    for (let attempt = 0; attempt < 20 && !String(list.querySelector('.lk-lookup-dictionary')?.textContent || '').includes('问题'); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const problemControls = list.querySelectorAll('.lk-pronunciation-control');
    assert.deepEqual(problemControls.map(control => control.dataset.region), ['US', 'UK']);
    const beforeProblemPlayback = requests.length;
    problemControls[0].dispatchEvent(mouseDownEvent());
    problemControls[1].dispatchEvent(mouseDownEvent());
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(requests.slice(beforeProblemPlayback).map(request => ({
      action: request.action, url: request.url, text: request.text, lang: request.lang, audioType: request.audioType,
    })), [
      {
        action: 'playAudio',
        url: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/En-us-problem.ogg',
        text: undefined,
        lang: undefined,
        audioType: undefined,
      },
        { action: 'playAudio', url: undefined, text: 'problem', lang: 'en-GB', audioType: 'playEdgeTTS' },
    ]);

    await context.__LINGKUMA_LOOKUP_RENDER__({
      translationList: list, tooltip, surface: 'book', sourceLanguage: 'en', targetLanguage: 'de',
    });
    for (let attempt = 0; attempt < 20 && list.querySelectorAll('.lk-pronunciation-control').length !== 2; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(list.querySelector('.lk-lookup-dictionary'), null);
    assert.deepEqual(
      list.querySelectorAll('.lk-pronunciation-control').map(control => control.dataset.region),
      ['US', 'UK'],
    );
    assert.equal(String(list.textContent || '').includes('书'), false);

    const beforeSpecific = requests.length;
    await context.__LINGKUMA_LOOKUP_RENDER__({
      translationList: list, tooltip, surface: 'specific', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    });
    for (let attempt = 0; attempt < 20 && list.querySelectorAll('.lk-pronunciation-control').length < 2; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual(
      requests.slice(beforeSpecific).map(request => request.action),
      ['lookupDictionary', 'lookupPronunciation'],
    );
    assert.equal(list.querySelector('.lk-lookup-dictionary'), null);
    const specificControls = list.querySelectorAll('.lk-pronunciation-control');
    assert.deepEqual(specificControls.slice(0, 2).map(control => control.dataset.region), ['US', 'UK']);
    assert.match(specificControls[0].textContent, /\/spɪˈsɪf\.ɪk\//);
    specificControls[0].dispatchEvent(mouseDownEvent());
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(
      requests.at(-1).url,
      'https://upload.wikimedia.org/wikipedia/commons/f/fb/En-us-specific.ogg',
    );

    const compoundCases = [
      ['out-of-sample', 'MISS'],
      ['well-known', 'HIT'],
      ['peer-on-peer', 'MISS'],
      ['out', 'HIT'],
    ];
    for (const [surface, expectedStatus] of compoundCases) {
      const result = await service.lookupDictionary({
        requestToken: `real-${surface}`, surface, sourceLanguage: 'en', targetLanguage: 'zh-CN',
      });
      assert.equal(result.status, expectedStatus, surface);
      if (expectedStatus === 'HIT') assert.equal(result.entry.surface, surface);
      if (expectedStatus === 'MISS') assert.equal(result.entry, undefined);
    }

    const enjoys = await service.lookupDictionary({
      requestToken: 'real-enjoys', surface: 'enjoys', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    });
    assert.equal(enjoys.status, 'HIT');
    assert.deepEqual(JSON.parse(JSON.stringify(enjoys.entry.meanings)), ['欣赏', '喜爱', '享受']);
    assert.deepEqual(JSON.parse(JSON.stringify(enjoys.entry.pos)), ['verb']);
    assert.equal(enjoys.entry.surface, 'enjoys');
    assert.equal(enjoys.entry.dictionaryForm, 'enjoy');
    assert.equal(enjoys.entry.ipa, '/ɛnˈd͡ʒɔɪz/');
    assert.equal(enjoys.entry.pronunciations[0].ipa, '/ɛnˈd͡ʒɔɪz/');
    assert.equal(enjoys.entry.pronunciations[0].url, undefined);
    assert.equal(enjoys.entry.audio, undefined);
    assert.equal(aiCalls, 0);
    for (const [surface, ipa, region, audioLeaf] of [
      ['books', '/bʊks/', 'US', 'En-us-books.ogg'],
      ['worked', '/wɝkt/', 'US', 'En-us-worked.ogg'],
      ['studies', '/ˈstʌdiz/', 'US', 'En-us-studies.ogg'],
    ]) {
      const result = await service.lookupDictionary({
        requestToken: `real-${surface}`, surface, sourceLanguage: 'en', targetLanguage: 'zh-CN',
      });
      assert.equal(result.status, 'HIT', surface);
      assert.equal(result.entry.surface, surface);
      assert.equal(result.entry.ipa, ipa);
      assert.equal(result.entry.audio?.region, region);
      assert.equal(result.entry.audio?.url.endsWith(audioLeaf), true);
      assert.match(result.entry.audio?.sourceURL || '', /^https:\/\/commons\.wikimedia\.org\//);
    }
  } finally {
    await service.shutdown();
  }
});
test('the shared hook repaints completed rows after an upstream list rebuild without refetching', async () => {
  const { context, requests, pending } = loadLookupUI();
  const list = new FakeElement('div');
  const existingAI = new FakeElement('div');
  existingAI.className = 'translation-item ai-recommendation';
  list.appendChild(existingAI);
  const input = {
    translationList: list,
    tooltip: new FakeElement('div'),
    surface: 'study',
    sentence: 'They study the bridge.',
  };

  const token = await context.__LINGKUMA_LOOKUP_RENDER__(input);
  pending.get('lookupQuickContext').resolve({
    requestToken: token, status: 'HIT', sentenceTranslation: '他们研究这座桥。', contextualMeaning: '研究',
  });
  pending.get('lookupDictionary').resolve({
    requestToken: token, status: 'HIT', entry: { surface: 'study', dictionaryForm: 'study', meanings: ['学习'] },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(list.children.map(child => child.dataset.lookupSource || 'ai'), ['dictionary', 'quick-context', 'ai']);

  for (const row of list.querySelectorAll('.lk-lookup-row')) row.remove();
  assert.deepEqual(list.children.map(child => child.dataset.lookupSource || 'ai'), ['ai']);

  const repaintedToken = await context.__LINGKUMA_LOOKUP_RENDER__(input);

  assert.equal(repaintedToken, token);
  assert.equal(requests.length, 3);
  assert.equal(requests[2].action, 'lookupPronunciation');
  assert.deepEqual(list.children.map(child => child.dataset.lookupSource || 'ai'), ['dictionary', 'quick-context', 'ai']);
});
test('main loads the lookup adapter after the language seam and before visual fallbacks', () => {
  const main = fs.readFileSync(MAIN_PATH, 'utf8');
  const bridge = fs.readFileSync(BRIDGE_PATH, 'utf8');
  const languageBridge = fs.readFileSync(LANGUAGE_BRIDGE_PATH, 'utf8');

  assert.match(bridge, /case "playAudio":[\s\S]*playAudioMessage\(message, sender\)/);
  assert.match(main, /const url = message\?\.url[\s\S]*new win\.Audio\(url\)/);
  assert.match(languageBridge, /inferSourceLanguage\(surface, sentence, root\)[\s\S]*sourceLanguageForRoot\(root, surface\)/);
  const languageIndex = main.indexOf('loadAdapterScript(context, "language_bridge.js")');
  const lookupIndex = main.indexOf('loadAdapterScript(context, "lookup_ui.js")');
  const glassIndex = main.indexOf('loadAdapterScript(context, "glass_fallback.js")');
  assert.ok(languageIndex >= 0 && lookupIndex > languageIndex && glassIndex > lookupIndex);
});

test('top word waits for Dictionary, then uses the default Edge fallback', async () => {
  const timers = new Map();
  let nextTimer = 0;
  const ttsCalls = [];
  const { context, tasks } = loadLookupUI({
    globals: {
      setTimeout(callback) {
        const id = ++nextTimer;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
      playText(params) {
        ttsCalls.push(params);
        return 'upstream-tts';
      },
    },
  });

  const playback = context.playText({ text: 'book', count: 1 });
  await new Promise(resolve => setImmediate(resolve));
  const dictionary = tasks.find(({ message }) => (
    message.action === 'lookupDictionary' && message.surface === 'book'
  ));
  assert.ok(dictionary);
  for (const callback of [...timers.values()]) callback();
  assert.equal(ttsCalls.length, 0);

  dictionary.task.resolve({ requestToken: dictionary.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setImmediate(resolve));
  const edge = tasks.find(({ message }) => message.audioType === 'playEdgeTTS' && message.text === 'book');
  assert.equal(edge?.message.lang, 'en-US');
  assert.equal(edge?.message.voice, 'en-US-AriaNeural');
  edge.task.resolve({ success: true });
  await playback;
  assert.equal(ttsCalls.length, 0);
});

test('top word fallback advances Edge to Google to Local, while explicit custom remains authoritative', async () => {
  const automatic = loadLookupUI({ globals: { playText() {} } });
  const playback = automatic.context.playText({ text: 'book', count: 1 });
  await new Promise(resolve => setImmediate(resolve));
  const dictionary = automatic.tasks.find(({ message }) => message.action === 'lookupDictionary');
  dictionary.task.resolve({ requestToken: dictionary.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setImmediate(resolve));
  const edge = automatic.tasks.find(({ message }) => message.audioType === 'playEdgeTTS');
  edge.task.reject(new Error('Edge unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  const google = automatic.tasks.find(({ message }) => String(message.url || '').includes('translate_tts'));
  google.task.reject(new Error('Google unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  const local = automatic.tasks.find(({ message }) => message.audioType === 'playLocal');
  local.task.resolve({ success: true });
  await playback;
  assert.equal(local.message.lang, 'en-US');

  const customCalls = [];
  const custom = loadLookupUI({
    storageGet: async () => ({
      translationConfig: { targetLanguage: 'zh-CN' },
      ttsConfig: { wordTTSProvider: 'custom' },
      enableWordTTS: true,
    }),
    globals: { playText(params) { customCalls.push(params); } },
  });
  const customPlayback = custom.context.playText({ text: 'book', count: 1 });
  await new Promise(resolve => setImmediate(resolve));
  const customDictionary = custom.tasks.find(({ message }) => message.action === 'lookupDictionary');
  customDictionary.task.resolve({ requestToken: customDictionary.message.requestToken, status: 'MISS' });
  await customPlayback;
  assert.equal(customCalls.length, 1);
  assert.equal(custom.tasks.some(({ message }) => message.audioType === 'playEdgeTTS'), false);
});

test('the adapter owns canonical tooltip render, rebuild, audio, and cleanup seams', async () => {
  const root = new FakeElement('shadow-root');
  const tooltip = new FakeElement('div');
  tooltip.className = 'vocab-tooltip';
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    trigger(records = [{ type: 'childList', target: this.target, removedNodes: [] }]) {
      this.callback(records);
    }
  }
  let captureListener = null;
  let captureUnsubscribed = false;
  const capture = {
    get(id) { return id === 'lingkuma-tooltip-host' ? root : null; },
    onCapture(listener) {
      captureListener = listener;
      return () => { captureUnsubscribed = true; captureListener = null; };
    },
  };
  let showCalls = 0;
  const upstreamShow = async () => {
    showCalls++;
    if (!tooltip.parentNode) root.appendChild(tooltip);
  };
  const ttsCalls = [];
  const upstreamPlayText = params => {
    ttsCalls.push(params);
    return 'upstream-tts';
  };
  const { context, requests, tasks } = loadLookupUI({
    globals: {
      MutationObserver: FakeMutationObserver,
      queueMicrotask,
      showEnhancedTooltipForWord: upstreamShow,
      playText: upstreamPlayText,
      __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: capture,
    },
  });

  assert.notEqual(context.showEnhancedTooltipForWord, upstreamShow);
  assert.notEqual(context.playText, upstreamPlayText);

  assert.equal(context.playText({ text: 'Sentence-only playback.' }), 'upstream-tts');
  assert.equal(ttsCalls.length, 1);
  const bookPlayback = context.playText({ text: 'book', count: 1 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ttsCalls.length, 1);
  const bookDictionary = tasks.find(({ message }) => (
    message.action === 'lookupDictionary' && message.surface === 'book'
  ));
  assert.ok(bookDictionary);
  bookDictionary.task.resolve({
    requestToken: bookDictionary.message.requestToken,
    status: 'HIT',
    entry: {
      surface: 'book', dictionaryForm: 'book', meanings: ['书'],
      audio: { url: 'https://audio.example/book.mp3', region: 'US' },
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const bookAudio = tasks.find(({ message }) => (
    message.action === 'playAudio' && message.url === 'https://audio.example/book.mp3'
  ));
  assert.ok(bookAudio);
  bookAudio.task.resolve();
  await bookPlayback;
  assert.equal(ttsCalls.length, 1);
  context.playText({ text: 'keyboard', sentence: 'Use the keyboard.', count: 1 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ttsCalls.length, 1);
  const keyboardDictionary = tasks.find(({ message }) => (
    message.action === 'lookupDictionary' && message.surface === 'keyboard'
  ));
  assert.ok(keyboardDictionary);
  keyboardDictionary.task.resolve({
    requestToken: keyboardDictionary.message.requestToken,
    status: 'HIT',
    entry: {
      surface: 'keyboard', dictionaryForm: 'keyboard', meanings: ['键盘'],
      audio: { url: 'https://audio.example/keyboard.mp3' },
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const keyboardAudio = tasks.find(({ message }) => (
    message.action === 'playAudio' && message.url === 'https://audio.example/keyboard.mp3'
  ));
  assert.ok(keyboardAudio);
  assert.equal(ttsCalls.length, 1);
  keyboardAudio.task.reject(new Error('keyboard dictionary audio unavailable'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const keyboardEdge = tasks.find(({ message }) => (
    message.audioType === 'playEdgeTTS' && message.text === 'keyboard'
  ));
  assert.equal(keyboardEdge?.message.voice, 'en-US-AriaNeural');
  assert.equal(ttsCalls.length, 1);
  keyboardEdge.task.resolve({ success: true });
  ttsCalls.length = 0;

  await context.showEnhancedTooltipForWord(
    'studies',
    'She studies bridges.',
    { left: 1, top: 1 },
    new FakeElement('div'),
    'studies',
  );
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(showCalls, 1);
  const studiesRequests = requests.filter(request => request.surface === 'studies');
  assert.deepEqual(studiesRequests.map(request => request.action), ['lookupDictionary', 'lookupQuickContext']);
  assert.equal(studiesRequests[0].surface, 'studies');
  assert.equal(studiesRequests[1].sentence, 'She studies bridges.');

  context.playText({ text: 'studies', sentence: 'She studies bridges.', count: 1 });
  assert.equal(ttsCalls.length, 0);
  const dictionary = tasks.find(({ message }) => message.action === 'lookupDictionary' && message.surface === 'studies');
  const quick = tasks.find(({ message }) => message.action === 'lookupQuickContext' && message.surface === 'studies');
  dictionary.task.resolve({
    requestToken: dictionary.message.requestToken,
    status: 'HIT',
    entry: {
      surface: 'studies', dictionaryForm: 'studies', meanings: ['学习'],
      audio: { url: 'https://audio.example/studies.mp3' },
    },
  });
  quick.task.resolve({ requestToken: quick.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));

  const audio = tasks.find(({ message }) => message.action === 'playAudio' && message.url === 'https://audio.example/studies.mp3');
  assert.equal(audio?.message.url, 'https://audio.example/studies.mp3');
  assert.equal(ttsCalls.length, 0);
  audio.task.reject(new Error('dictionary audio unavailable'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const studiesEdge = tasks.find(({ message }) => (
    message.audioType === 'playEdgeTTS' && message.text === 'studies'
  ));
  assert.equal(studiesEdge?.message.voice, 'en-US-AriaNeural');
  assert.equal(ttsCalls.length, 0);

  for (const row of list.querySelectorAll('.lk-lookup-row')) row.remove();
  assert.equal(list.querySelectorAll('.lk-lookup-row').length, 0);
  observers[0].trigger([{ type: 'childList', target: list, removedNodes: [] }]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(list.querySelectorAll('.lk-lookup-row').map(row => row.dataset.lookupSource), ['dictionary']);
  assert.deepEqual(
    requests
      .filter(request => request.surface === 'studies' || request.url === 'https://audio.example/studies.mp3')
      .map(request => request.action),
    ['lookupDictionary', 'lookupQuickContext', 'lookupPronunciation', 'playAudio'],
  );

  context.__LINGKUMA_ZOTERO_LOOKUP_UI__.cleanup();
  assert.equal(context.showEnhancedTooltipForWord, upstreamShow);
  assert.equal(context.playText, upstreamPlayText);
  assert.equal(observers[0].disconnected, true);
  assert.equal(captureUnsubscribed, true);
  assert.equal(captureListener, null);
});

test('results from a superseded selection cannot paint the current list', async () => {
  const { context, tasks } = loadLookupUI();
  const list = new FakeElement('div');

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip: new FakeElement('div'), surface: 'first', sentence: 'The first selection.',
  });
  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip: new FakeElement('div'), surface: 'second', sentence: 'The second selection.',
  });

  const oldQuick = tasks.find(({ message }) => message.action === 'lookupQuickContext' && message.surface === 'first');
  oldQuick.task.resolve({
    requestToken: oldQuick.message.requestToken,
    status: 'HIT',
    contextualMeaning: 'stale result',
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(list.querySelectorAll('.lk-lookup-row').length, 0);
});

test('MISS, ERROR, and UNAVAILABLE responses do not create empty lookup rows', async () => {
  for (const [dictionaryStatus, quickStatus] of [
    ['MISS', 'UNAVAILABLE'],
    ['ERROR', 'MISS'],
  ]) {
    const { context, requests, pending } = loadLookupUI();
    const list = new FakeElement('div');
    await context.__LINGKUMA_LOOKUP_RENDER__({
      translationList: list, tooltip: new FakeElement('div'), surface: 'quiet', sentence: 'A quiet fallback.',
    });
    pending.get('lookupDictionary').resolve({ requestToken: requests[0].requestToken, status: dictionaryStatus });
    pending.get('lookupQuickContext').resolve({ requestToken: requests[1].requestToken, status: quickStatus });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(list.querySelectorAll('.lk-lookup-row').length, 0);
  }
});
test('surface-form pronunciation is Zone 1 and top-level audio waits for the pronunciation source before fallback', async () => {
  const { context, requests, pending, tasks } = loadLookupUI();
  const tooltip = new FakeElement('div');
  const title = new FakeElement('div');
  title.className = 'word-title';
  const notes = new FakeElement('span');
  notes.className = 'Notes';
  const tagRow = new FakeElement('div');
  tagRow.className = 'tag-row';
  title.appendChild(notes);
  title.appendChild(tagRow);
  tooltip.appendChild(title);
  const list = new FakeElement('div');

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'studies', sentence: 'She studies bridges.',
  });
  pending.get('lookupDictionary').resolve({
    requestToken: requests[0].requestToken,
    status: 'HIT',
    entry: {
      surface: 'studies', dictionaryForm: 'study', meanings: ['学习'],
      ipa: '/ˈstʌdiz/', audio: { url: 'https://audio.example/studies.mp3' },
    },
  });
  pending.get('lookupQuickContext').resolve({ requestToken: requests[1].requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));

  const pronunciation = list.querySelector('.lk-lookup-pronunciation');
  assert.deepEqual(pronunciation?.querySelectorAll('.lk-pronunciation-control').map(control => control.textContent), ['/ˈstʌdiz/ 🔊']);
  assert.deepEqual(list.querySelectorAll('.lk-lookup-row').map(row => row.dataset.lookupSource), ['pronunciation', 'dictionary']);
  assert.deepEqual(title.children.map(child => child.className), ['Notes', 'tag-row']);
  assert.equal(title.style.flexWrap || '', '');
  assert.equal(tooltip.querySelector('.lk-dictionary-ipa'), null);

  let fallbackCalls = 0;
  assert.equal(context.__LINGKUMA_LOOKUP_PLAY_AUDIO__({ tooltip, fallback: () => { fallbackCalls++; } }), true);
  const audioTask = tasks.find(({ message }) => message.action === 'playAudio');
  assert.equal(audioTask.message.url, 'https://audio.example/studies.mp3');
  audioTask.task.reject(new Error('playback failed'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fallbackCalls, 1);

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'plain', sentence: 'A plain form.',
  });
  const nextDictionary = tasks.find(({ message }) => message.action === 'lookupDictionary' && message.surface === 'plain');
  const nextQuick = tasks.find(({ message }) => message.action === 'lookupQuickContext' && message.surface === 'plain');
  nextDictionary.task.resolve({
    requestToken: nextDictionary.message.requestToken,
    status: 'HIT',
    entry: { surface: 'plain', dictionaryForm: 'plain', meanings: ['simple'] },
  });
  nextQuick.task.resolve({ requestToken: nextQuick.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(tooltip.querySelector('.lk-dictionary-ipa'), null);
  assert.equal(title.style.flexWrap || '', '');
  assert.equal(context.__LINGKUMA_LOOKUP_PLAY_AUDIO__({ tooltip, fallback: () => { fallbackCalls++; } }), true);
  const nextPronunciation = tasks.find(({ message }) => message.action === 'lookupPronunciation' && message.surface === 'plain');
  nextPronunciation.task.resolve({ requestToken: nextPronunciation.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fallbackCalls, 2);
});

test('top-level playback chooses structured US audio before UK regardless of legacy scalar audio', async () => {
  const { context, requests, pending, tasks } = loadLookupUI();
  const tooltip = new FakeElement('div');
  const list = new FakeElement('div');
  list.className = 'translation-list';
  tooltip.appendChild(list);
  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'book', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  pending.get('lookupDictionary').resolve({
    requestToken: requests[0].requestToken,
    status: 'HIT',
    entry: {
      surface: 'book', dictionaryForm: 'book', meanings: ['book'],
      audio: { region: 'UK', url: 'https://audio.example/book-uk.mp3' },
      pronunciations: [
        { region: 'UK', ipa: '/bʊk/', url: 'https://audio.example/book-uk.mp3' },
        { region: 'US', ipa: '/bʊk/', url: 'https://audio.example/book-us.mp3' },
      ],
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(context.__LINGKUMA_LOOKUP_PLAY_AUDIO__({ tooltip, fallback() {} }), true);
  const playback = tasks.find(({ message }) => message.action === 'playAudio');
  assert.equal(playback.message.url, 'https://audio.example/book-us.mp3');
});

test('an older render awaiting storage cannot supersede a newer selection', async () => {
  const reads = [];
  const storageGet = () => {
    const task = deferred();
    reads.push(task);
    return task.promise;
  };
  const { context, requests } = loadLookupUI({ storageGet });
  const list = new FakeElement('div');
  const tooltip = new FakeElement('div');

  const oldRender = context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'old', sentence: 'The old selection.',
  });
  const currentRender = context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'current', sentence: 'The current selection.',
  });
  reads[1].resolve({ translationConfig: { targetLanguage: 'zh-CN' } });
  await currentRender;
  reads[0].resolve({ translationConfig: { targetLanguage: 'zh-CN' } });
  await oldRender;

  assert.deepEqual(requests.map(request => request.surface), ['current', 'current']);
});

test('an audio request made before lookup state exists waits for Dictionary, then falls back only after audio failure', async () => {
  const { context, requests, tasks } = loadLookupUI();
  const tooltip = new FakeElement('div');
  const list = new FakeElement('div');
  let fallbackCalls = 0;

  assert.equal(context.__LINGKUMA_LOOKUP_PLAY_AUDIO__({
    tooltip,
    fallback: () => { fallbackCalls++; },
  }), true);
  assert.equal(requests.length, 0);

  await context.__LINGKUMA_LOOKUP_RENDER__({
    translationList: list, tooltip, surface: 'study', sentence: 'They study bridges.',
  });
  const dictionary = tasks.find(({ message }) => message.action === 'lookupDictionary');
  const quick = tasks.find(({ message }) => message.action === 'lookupQuickContext');
  assert.equal(tasks.some(({ message }) => message.action === 'playAudio'), false);
  assert.equal(fallbackCalls, 0);

  dictionary.task.resolve({
    requestToken: dictionary.message.requestToken,
    status: 'HIT',
    entry: { surface: 'study', dictionaryForm: 'study', meanings: ['learn'], audio: { url: 'https://audio.example/study.mp3' } },
  });
  quick.task.resolve({ requestToken: quick.message.requestToken, status: 'MISS' });
  await new Promise(resolve => setTimeout(resolve, 0));

  const audio = tasks.find(({ message }) => message.action === 'playAudio');
  assert.equal(audio?.message.url, 'https://audio.example/study.mp3');
  assert.equal(fallbackCalls, 0);
  audio.task.reject(new Error('audio failed'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fallbackCalls, 1);
});
