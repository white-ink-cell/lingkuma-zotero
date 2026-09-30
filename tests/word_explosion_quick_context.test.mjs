import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER_PATH = path.join(ROOT, 'adapter', 'word_explosion_bridge.js');
const MAIN_PATH = path.join(ROOT, 'adapter', 'main.js');
const BRIDGE_PATH = path.join(ROOT, 'adapter', 'bridge.js');

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.isConnected = true;
    this.listeners = new Map();
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  replaceChildren(...children) { this.children = []; for (const child of children) this.appendChild(child); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type) { this.listeners.get(type)?.({ stopPropagation() {} }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (className && child.className.split(/\s+/).includes(className)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function loadFixture({ quickResult, stored = {}, callWordAI = true, aiEnabled = true } = {}) {
  const source = fs.readFileSync(ADAPTER_PATH, 'utf8');
  const requests = [];
  const aiCalls = [];
  const producerResults = [];
  const spoken = [];
  const originalSentenceTranslation = async () => ['整句 AI'];
  const context = vm.createContext({
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
    setTimeout,
    clearTimeout,
    Intl,
    Promise,
    document: { createElement: tag => new FakeElement(tag), documentElement: new FakeElement('html') },
    __LINGKUMA_ZOTERO_READER__: true,
    __LINGKUMA_ZOTERO_LOOKUP_UI__: {
      installed: true,
      inferSourceLanguage: () => 'en',
      explicitCompoundRanges(sentence) {
        const ranges = [];
        const pattern = /[\p{Script=Latin}\p{M}]+(?:[-‐‑][\p{Script=Latin}\p{M}]+)+/gu;
        let match;
        while ((match = pattern.exec(sentence))) ranges.push({ surface: match[0], surfaceStart: match.index });
        return ranges;
      },
    },
    chrome: {
      storage: { local: { get: async () => ({
        translationConfig: { targetLanguage: 'zh-CN' },
        autoRequestAITranslations: aiEnabled,
      }) } },
      runtime: {
        async sendMessage(message) {
          requests.push(message);
          if (message.action !== 'lookupQuickContext') return {};
          if (typeof quickResult === 'function') return quickResult(message);
          return quickResult || { requestToken: message.requestToken, status: 'HIT', contextualMeaning: `语境:${message.surface}` };
        },
      },
    },
    async fetchAIWordTranslation(word, sentence) {
      aiCalls.push({ word, sentence });
      return `AI:${word}`;
    },
    getSentenceTranslations: originalSentenceTranslation,
    playText({ text }) { spoken.push(text); },
  });
  context.globalThis = context;
  context.createWordItem = async wordInfo => {
    const card = new FakeElement('div');
    card.className = 'word-explosion-word-item';
    const title = card.appendChild(new FakeElement('div'));
    title.className = 'word-explosion-word-title';
    const button = title.appendChild(new FakeElement('span'));
    button.className = 'word-explosion-tts-button';
    button.addEventListener('click', () => context.playText({ text: wordInfo.word, count: 1 }));
    const translations = card.appendChild(new FakeElement('div'));
    translations.className = 'word-explosion-word-translations';
    const row = translations.appendChild(new FakeElement('div'));
    row.className = 'word-explosion-word-translation';
    row.textContent = wordInfo.details?.translations?.[0] || '加载中...';
    return card;
  };
  context.extractUnknownWords = async sentence => {
    const words = Array.from(new context.Intl.Segmenter('en', { granularity: 'word' }).segment(sentence))
      .filter(segment => segment.isWordLike)
      .map(segment => segment.segment);
    const items = words.map(word => ({
      word,
      wordLower: word.toLowerCase(),
      details: stored[word.toLowerCase()] || { translations: [] },
    }));
    if (callWordAI === 'delayed') {
      for (const item of items) {
        setTimeout(() => {
          Promise.resolve(context.fetchAIWordTranslation(item.word, sentence))
            .then(value => producerResults.push({ word: item.word, value }));
        }, 0);
      }
    } else if (callWordAI) {
      for (const item of items) await context.fetchAIWordTranslation(item.word, sentence);
    }
    return items;
  };
  context.hideWordExplosion = () => {};
  vm.runInContext(source, context, { filename: ADAPTER_PATH });
  return { context, requests, aiCalls, producerResults, spoken, originalSentenceTranslation };
}

test('Edge HIT is the one visible per-word gloss and makes zero AI requests', async () => {
  const sentence = 'Thus neither option works for the sample.';
  const fixture = loadFixture();
  const words = await fixture.context.extractUnknownWords(sentence);
  const neither = words.find(item => item.wordLower === 'neither');
  const card = await fixture.context.createWordItem(neither);
  await tick();

  assert.equal(fixture.aiCalls.length, 0);
  const quick = fixture.requests.filter(request => request.action === 'lookupQuickContext');
  assert.equal(fixture.requests.some(request => request.action === 'lookupDictionary'), false);
  assert.equal(quick.filter(request => request.surface === 'neither').length, 1);
  assert.equal(quick.find(request => request.surface === 'neither').sentence, sentence);
  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, '语境:neither');
});

test('current contextual result wins visually without mutating stored translations', async () => {
  const history = ['旧释义'];
  const fixture = loadFixture({ stored: { for: { translations: history } }, callWordAI: false });
  const [word] = await fixture.context.extractUnknownWords('for the current purpose');
  const card = await fixture.context.createWordItem(word);
  await tick();

  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, '语境:for');
  assert.deepEqual(history, ['旧释义']);
});

test('Edge failure preserves stored fallback and only missing data may use original AI fallback', async () => {
  const quickResult = message => ({ requestToken: message.requestToken, status: 'ERROR' });
  const storedFixture = loadFixture({
    quickResult,
    stored: { for: { translations: ['已有释义'] } },
    callWordAI: false,
  });
  const [storedWord] = await storedFixture.context.extractUnknownWords('for now');
  const card = await storedFixture.context.createWordItem(storedWord);
  await tick();
  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, '已有释义');
  assert.equal(storedFixture.aiCalls.length, 0);

  const missingFixture = loadFixture({ quickResult });
  const [missingWord] = await missingFixture.context.extractUnknownWords('neither works');
  const missingCard = await missingFixture.context.createWordItem(missingWord);
  await tick();
  assert.deepEqual(missingFixture.aiCalls.map(call => call.word), ['neither', 'works']);
  assert.equal(missingCard.querySelector('.word-explosion-word-translation').textContent, 'AI:neither');
});

test('whole-sentence AI function is untouched and card speaker keeps the existing playText path', async () => {
  const fixture = loadFixture({ callWordAI: false });
  assert.equal(fixture.context.getSentenceTranslations, fixture.originalSentenceTranslation);
  const [word] = await fixture.context.extractUnknownWords('worked well');
  const card = await fixture.context.createWordItem(word);
  card.querySelector('.word-explosion-tts-button').dispatch('click');
  assert.deepEqual(fixture.spoken, ['worked']);
  assert.deepEqual(await fixture.context.getSentenceTranslations(), ['整句 AI']);
});

test('explicit Latin hyphen compounds become one card and one Quick Context lookup unit', async () => {
  const sentence = 'A well-known out-of-sample peer-on-peer test.';
  const fixture = loadFixture();
  const words = await fixture.context.extractUnknownWords(sentence);
  assert.deepEqual(
    words.map(item => item.word).filter(word => word.includes('-')),
    ['well-known', 'out-of-sample', 'peer-on-peer'],
  );
  assert.equal(words.some(item => ['well', 'known', 'out', 'of', 'sample', 'peer', 'on'].includes(item.wordLower)), false);
  for (const word of words.filter(item => item.word.includes('-'))) await fixture.context.createWordItem(word);
  await tick();
  const compounds = fixture.requests
    .filter(request => request.action === 'lookupQuickContext' && request.surface.includes('-'))
    .map(request => request.surface);
  assert.deepEqual(compounds, ['well-known', 'out-of-sample', 'peer-on-peer']);
});

test('a hyphenated card paints the terminal AI fallback after Quick Context fails', async () => {
  const fixture = loadFixture({
    quickResult: message => ({ requestToken: message.requestToken, status: 'ERROR' }),
  });
  const words = await fixture.context.extractUnknownWords('A five-factor model.');
  const compound = words.find(item => item.word === 'five-factor');
  const card = await fixture.context.createWordItem(compound);
  await tick();

  assert.deepEqual(fixture.aiCalls.filter(call => call.word.includes('-')), [{
    word: 'five-factor', sentence: 'A five-factor model.',
  }]);
  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, 'AI:five-factor');
});

test('a card starts the shared terminal AI fallback when the upstream producer has not registered yet', async () => {
  const fixture = loadFixture({
    callWordAI: false,
    quickResult: message => ({ requestToken: message.requestToken, status: 'ERROR' }),
  });
  const words = await fixture.context.extractUnknownWords('A five-factor model.');
  const compound = words.find(item => item.word === 'five-factor');
  const card = await fixture.context.createWordItem(compound);
  await tick();
  await tick();

  assert.deepEqual(fixture.aiCalls, [{ word: 'five-factor', sentence: 'A five-factor model.' }]);
  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, 'AI:five-factor');
});

test('a late fire-and-forget upstream producer joins the card-created terminal fallback', async () => {
  const fixture = loadFixture({
    callWordAI: 'delayed',
    quickResult: message => ({ requestToken: message.requestToken, status: 'ERROR' }),
  });
  const words = await fixture.context.extractUnknownWords('A five-factor model.');
  const compound = words.find(item => item.word === 'five-factor');
  const card = await fixture.context.createWordItem(compound);
  await tick();
  await tick();
  await tick();

  assert.equal(fixture.aiCalls.filter(call => call.word === 'five-factor').length, 1);
  assert.deepEqual(
    fixture.producerResults.find(item => item.word === 'five-factor'),
    { word: 'five-factor', value: 'AI:five-factor' },
  );
  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, 'AI:five-factor');
});

test('a disabled upstream AI setting never becomes a Word Explosion fallback request', async () => {
  const fixture = loadFixture({
    callWordAI: false,
    aiEnabled: false,
    quickResult: message => ({ requestToken: message.requestToken, status: 'ERROR' }),
  });
  const [word] = await fixture.context.extractUnknownWords('Neither works.');
  const card = await fixture.context.createWordItem(word);
  await tick();
  await tick();

  assert.equal(fixture.aiCalls.length, 0);
  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, '暂无释义');
});

test('Quick Context work is bounded to four concurrent requests', async () => {
  let active = 0;
  let peak = 0;
  const gates = [];
  const fixture = loadFixture({
    callWordAI: false,
    quickResult(message) {
      active++;
      peak = Math.max(peak, active);
      const gate = deferred();
      gates.push({ gate, message });
      return gate.promise.finally(() => { active--; });
    },
  });
  const words = await fixture.context.extractUnknownWords('one two three four five six');
  const cards = await Promise.all(words.map(word => fixture.context.createWordItem(word)));
  await tick();
  assert.equal(peak, 4);
  assert.equal(gates.length, 4);
  for (const { gate, message } of gates.splice(0)) {
    gate.resolve({ requestToken: message.requestToken, status: 'HIT', contextualMeaning: message.surface });
  }
  await tick();
  await tick();
  assert.equal(gates.length, 2);
  for (const { gate, message } of gates.splice(0)) {
    gate.resolve({ requestToken: message.requestToken, status: 'HIT', contextualMeaning: message.surface });
  }
  await tick();
  assert.equal(fixture.requests.filter(request => request.action === 'lookupQuickContext').length, 6);
  assert.equal(cards.length, 6);
});

test('closing the panel invalidates late visual writes', async () => {
  const gate = deferred();
  const fixture = loadFixture({ quickResult: () => gate.promise, callWordAI: false });
  const [word] = await fixture.context.extractUnknownWords('worked');
  const card = await fixture.context.createWordItem(word);
  await tick();
  fixture.context.hideWordExplosion();
  const request = fixture.requests.find(item => item.action === 'lookupQuickContext');
  gate.resolve({ requestToken: request.requestToken, status: 'HIT', contextualMeaning: '已完成' });
  await tick();
  assert.equal(card.querySelector('.word-explosion-word-translation').textContent, '加载中...');
});

test('closing the panel does not turn stale Quick Context work into an AI database write', async () => {
  const gate = deferred();
  const fixture = loadFixture({ quickResult: () => gate.promise });
  const extraction = fixture.context.extractUnknownWords('worked');
  await tick();
  fixture.context.hideWordExplosion();
  const request = fixture.requests.find(item => item.action === 'lookupQuickContext');
  gate.resolve({ requestToken: request.requestToken, status: 'HIT', contextualMeaning: '工作过的' });
  await extraction;
  assert.equal(fixture.aiCalls.length, 0);
});

test('runtime load and cleanup order install the adapter after lookup UI and remove it first', () => {
  const main = fs.readFileSync(MAIN_PATH, 'utf8');
  const bridge = fs.readFileSync(BRIDGE_PATH, 'utf8');
  const lookupIndex = main.indexOf('loadAdapterScript(context, "lookup_ui.js")');
  const explosionIndex = main.indexOf('loadAdapterScript(context, "word_explosion_bridge.js")');
  const initIndex = main.indexOf('initWordExplosionSystem');
  assert.ok(lookupIndex >= 0 && explosionIndex > lookupIndex && initIndex > explosionIndex);
  assert.ok(
    bridge.indexOf('__LINGKUMA_ZOTERO_WORD_EXPLOSION__?.cleanup')
      < bridge.indexOf('__LINGKUMA_ZOTERO_LOOKUP_UI__?.cleanup'),
  );
});
