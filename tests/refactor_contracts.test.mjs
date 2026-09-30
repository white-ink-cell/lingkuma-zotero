import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'adapter', 'state.js');
const UPSTREAM_AI_PATH = path.join(ROOT, 'upstream', 'src', 'service', 'a3_aiFragen.js');

const DEFAULT_DETAIL_PROMPT = `
# 角色
你是一位精通德语 日语 英语的语法解析专家，擅长根据上下文精确判断对应单词的解析精要

# 任务
根据提供的 [句子]，判断 [待解析词] 在该语境下的具体语法作用，形变规则等

# 核心规则
返回20字左右精要解析。

# 输入
句子：'Today we are reading.'
待解析词：'reading'

# 输出格式
直接返回解析内容
`.trim();

const DEFAULT_TAG_PROMPT = (word, sentence) => `
你将要按照下列要求，分析单词在句子中的一些信息，用作某单词的tag，请按照下列要求进行分析：
1. 词性(pos): 在句子中的词性
2. 性别(gender): 如果是名词，返回 der/die/das
3. 复数形式(plural): 如果是名词，返回其复数形式
4. 变位(conjugation): 如果是动词，返回其原形
请分析句子"${sentence}"中的单词"${word}"。返回JSON格式，包含：
仅返回JSON，无需解释，不要加markdown代码块标记。
`.trim();

const loadAdapter = () => {
  const context = vm.createContext({
    structuredClone,
    setTimeout,
    clearTimeout,
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), context, { filename: STATE_PATH });
  return context.LingKumaStateAdapter;
};

const request = (prompt = DEFAULT_DETAIL_PROMPT, word = 'reading', sentence = 'Today we are reading.') => ({
  word,
  sentence,
  messages: [{ role: 'user', content: prompt }],
});

const captureRequest = async ({
  target = 'ja', nestedPrompt = '', topLevelPrompt = '', nestedTagPrompt = '', topLevelTagPrompt = '',
  prompt, word = 'reading', sentence = 'Today we are reading.',
} = {}) => {
  const Adapter = loadAdapter();
  const state = new Adapter({ pluginID: 'lingkuma-zotero@white-ink-cell', version: '1.0.1' });
  state.storage.translationConfig.targetLanguage = target;
  if (nestedPrompt) state.storage.aiConfig.aiPrompt2 = nestedPrompt;
  if (topLevelPrompt) state.storage.aiPrompt2 = topLevelPrompt;
  if (nestedTagPrompt) state.storage.aiConfig.aiTagAnalysisPrompt = nestedTagPrompt;
  if (topLevelTagPrompt) state.storage.aiTagAnalysisPrompt = topLevelTagPrompt;
  state.getEffectiveAIConfig = () => ({ source: 'custom' });
  let captured = null;
  state._postAI = async (_config, outbound) => {
    captured = structuredClone(outbound);
    return { choices: [{ message: { role: 'assistant', content: 'captured' } }] };
  };
  await state.makeAIRequest(request(prompt, word, sentence));
  return captured;
};

test('AI Detail classifier markers still match vendored upstream 1.1.1', () => {
  const source = fs.readFileSync(UPSTREAM_AI_PATH, 'utf8');
  for (const marker of ['语法解析专家', '具体语法作用', '形变规则', '返回20字左右精要解析', '待解析词']) {
    assert.ok(source.includes(marker), marker);
  }
  for (const marker of ['词性(pos)', '性别(gender)', '复数形式(plural)', '变位(conjugation)', '仅返回JSON']) {
    assert.ok(source.includes(marker), marker);
  }
});

test('default AI Detail follows the current Zotero target language', async () => {
  for (const [target, expected] of [['ja', 'Japanese (ja)'], ['ko', 'Korean (ko)']]) {
    const outbound = await captureRequest({ target });
    const combined = outbound.messages.map(message => message.content).join('\n');
    assert.match(combined, new RegExp(expected.replace(/[()]/g, '\\$&')));
    assert.ok(!combined.includes('语法解析专家'));
  }
});

test('explicit nested and top-level aiPrompt2 remain authoritative', async () => {
  const custom = 'Custom 语法解析专家: explain 具体语法作用 and 形变规则 for {word}.';
  const expected = [{ role: 'user', content: custom }];

  const nested = await captureRequest({ target: 'ko', nestedPrompt: custom, prompt: custom });
  assert.deepEqual(nested.messages, expected);

  const topLevel = await captureRequest({ target: 'ko', topLevelPrompt: custom, prompt: custom });
  assert.deepEqual(topLevel.messages, expected);
});

test('zh-CN defaults and unrelated AI requests remain unchanged', async () => {
  const zh = await captureRequest({ target: 'zh-CN' });
  assert.deepEqual(zh.messages, request().messages);

  const freeForm = 'Discuss 具体语法作用 in a free-form answer.';
  const unrelated = await captureRequest({ target: 'ja', prompt: freeForm });
  assert.deepEqual(unrelated.messages, request(freeForm).messages);
});

test('default tag analysis follows source language rather than target language', async () => {
  const cases = [
    ['学习', '我们正在学习语言。', 'Chinese', 'Chinese verbs do not conjugate'],
    ['食べました', '昨日、寿司を食べました。', 'Japanese', 'dictionary form'],
  ];
  for (const [word, sentence, sourceName, sourceRule] of cases) {
    const prompt = DEFAULT_TAG_PROMPT(word, sentence);
    const outbound = await captureRequest({ target: 'ko', prompt, word, sentence });
    const combined = outbound.messages.map(message => message.content).join('\n');
    assert.ok(combined.includes(`source appears to be ${sourceName}`));
    assert.ok(combined.includes(sourceRule));
    assert.ok(combined.includes('SAME language as the SOURCE'));
  }
});

test('explicit nested and top-level tag prompts remain authoritative', async () => {
  const custom = 'Custom 词性(pos), 性别(gender), 复数形式(plural), 变位(conjugation), 仅返回JSON.';
  const expected = [{ role: 'user', content: custom }];
  const nested = await captureRequest({ target: 'ko', nestedTagPrompt: custom, prompt: custom });
  assert.deepEqual(nested.messages, expected);
  const topLevel = await captureRequest({ target: 'ko', topLevelTagPrompt: custom, prompt: custom });
  assert.deepEqual(topLevel.messages, expected);
});

const MAIN_PATH = process.env.LINGKUMA_MAIN_UNDER_TEST || path.join(ROOT, 'adapter', 'main.js');

const loadZoteroPlugin = () => {
  const context = vm.createContext({
    setTimeout,
    clearTimeout,
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
    LK_CONTENT_CSS_TEXT: '',
    LK_RESOURCE_DATA: {},
    LingKumaStateAdapter: class LingKumaStateAdapter {},
    LingKumaLookupService: class LingKumaLookupService { async init() {} async shutdown() {} },
    LingKumaMessageHost: class LingKumaMessageHost {},
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(MAIN_PATH, 'utf8'), context, { filename: MAIN_PATH });
  return context.LingKumaZoteroPlugin;
};

const createPlugin = () => {
  const Plugin = loadZoteroPlugin();
  return new Plugin({ id: 'lingkuma-zotero@white-ink-cell', version: '1.0.1', rootURI: 'resource://lingkuma/' });
};

const readerWindow = ({ href, text = '', selectors = [] }) => {
  const present = new Set(selectors);
  return {
    location: { href },
    frames: [],
    document: {
      documentElement: {},
      body: { innerText: text, textContent: text },
      querySelector(query) {
        return query.split(',').some(selector => present.has(selector.trim())) ? {} : null;
      },
    },
  };
};

test('reader window discovery includes shell and both views exactly once', () => {
  const plugin = createPlugin();
  const primary = readerWindow({ href: 'resource://zotero/pdf/primary.html' });
  const secondary = readerWindow({ href: 'resource://zotero/pdf/secondary.html' });
  const shell = readerWindow({ href: 'resource://zotero/reader/reader.html' });
  shell.frames = [primary, secondary, primary];
  const reader = {
    _iframeWindow: { wrappedJSObject: shell },
    _internalReader: {
      _primaryView: { _iframeWindow: primary },
      _secondaryView: { _iframeWindow: secondary },
    },
  };

  const found = Array.from(plugin.collectReaderWindows(reader));
  assert.equal(found.length, 3);
  assert.equal(found[0], shell);
  assert.equal(found[1], primary);
  assert.equal(found[2], secondary);
});

test('reader injection rejects the shell and accepts PDF and EPUB content', () => {
  const plugin = createPlugin();
  const shell = readerWindow({ href: 'resource://zotero/reader/reader.html', text: 'shell controls only' });
  const pdf = readerWindow({ href: 'resource://zotero/reader/content.html', selectors: ['.textLayer'] });
  const epub = readerWindow({ href: 'resource://zotero/reader/chapter.html', text: 'Readable chapter content '.repeat(3) });

  assert.equal(plugin.isInjectableReaderWindow(shell, { type: 'pdf' }), false);
  assert.equal(plugin.isInjectableReaderWindow(pdf, { type: 'pdf' }), true);
  assert.equal(plugin.isInjectableReaderWindow(epub, { type: 'epub' }), true);
});

test('reader attach and target changes ensure only the content-resolved exact dictionary pair', async () => {
  const plugin = createPlugin();
  const calls = [];
  plugin.state.getTargetLanguage = () => 'zh-TW';
  plugin.lookup.ensureApplicableDefaultDictionary = async (sourceLanguage, targetLanguage) => {
    calls.push([sourceLanguage, targetLanguage]);
  };
  const readerContext = {
    _eval(source) {
      assert.match(source, /inferSourceLanguage/);
      return 'en';
    },
  };

  await plugin.ensureDefaultDictionaryForContext(readerContext);
  assert.deepEqual(calls, [['en', 'zh-TW']]);

  readerContext._eval = () => '';
  await plugin.ensureDefaultDictionaryForContext(readerContext);
  assert.deepEqual(calls, [['en', 'zh-TW']]);

  const main = fs.readFileSync(path.join(ROOT, 'adapter', 'main.js'), 'utf8');
  assert.match(main, /loadAdapterScript\(context, "language_bridge\.js"\)[\s\S]*ensureDefaultDictionaryForContext\(context\)/);
});
test('trusted reader top-level shim is scoped to script load and restores on success', () => {
  const plugin = createPlugin();
  const originalTop = { name: 'reader-shell' };
  const sandbox = vm.createContext({});
  sandbox.window = sandbox;
  const originalDescriptor = { value: originalTop, configurable: true, enumerable: true, writable: false };
  Object.defineProperty(sandbox, 'top', originalDescriptor);
  const context = {
    createSandbox: () => sandbox,
    _eval: source => vm.runInContext(source, sandbox),
  };
  plugin.loadUpstreamScript = (_context, file) => {
    assert.equal(vm.runInContext('top === window', sandbox), true);
    assert.equal(file, 'src/utils/highlight_floating_button.js');
    return 'loaded';
  };

  assert.equal(plugin.loadTrustedReaderTopLevelScript(context, 'src/utils/highlight_floating_button.js'), 'loaded');
  const restored = Object.getOwnPropertyDescriptor(sandbox, 'top');
  assert.deepEqual(restored, originalDescriptor);
  assert.equal(Object.hasOwn(sandbox, '__LINGKUMA_ZOTERO_PREVIOUS_TOP__'), false);
});

test('trusted reader top-level shim restores the descriptor when script loading throws', () => {
  const plugin = createPlugin();
  const originalTop = { name: 'reader-shell' };
  const sandbox = vm.createContext({});
  sandbox.window = sandbox;
  const originalDescriptor = { value: originalTop, configurable: true, enumerable: false, writable: false };
  Object.defineProperty(sandbox, 'top', originalDescriptor);
  const context = {
    createSandbox: () => sandbox,
    _eval: source => vm.runInContext(source, sandbox),
  };
  plugin.loadUpstreamScript = () => {
    assert.equal(vm.runInContext('top === window', sandbox), true);
    throw new Error('synthetic load failure');
  };

  assert.throws(
    () => plugin.loadTrustedReaderTopLevelScript(context, 'src/utils/highlight_floating_button.js'),
    /synthetic load failure/,
  );
  const restored = Object.getOwnPropertyDescriptor(sandbox, 'top');
  assert.deepEqual(restored, originalDescriptor);
  assert.equal(Object.hasOwn(sandbox, '__LINGKUMA_ZOTERO_PREVIOUS_TOP__'), false);
});

test('only the floating-button script uses the trusted top-level loader', () => {
  const source = fs.readFileSync(MAIN_PATH, 'utf8');
  const route = source.match(/const loaded = file === "([^"]+)"\s+\? this\.loadTrustedReaderTopLevelScript\(context, file\)\s+: this\.loadUpstreamScript\(context, file\)/);
  assert.ok(route, 'trusted-loader routing contract is present');
  assert.equal(route[1], 'src/utils/highlight_floating_button.js');
  assert.equal(source.match(/loadTrustedReaderTopLevelScript\(context, file\)/g)?.length, 1);
  assert.equal(source.match(/loadTrustedReaderTopLevelScript\s*\(/g)?.length, 2);
});

const LANGUAGE_BRIDGE_PATH = path.join(ROOT, 'adapter', 'language_bridge.js');

const loadLanguageBridge = ({ pageText = '', withRoot = false } = {}) => {
  const sent = [];
  const storageListeners = new Set();
  const captureRoots = new Map();
  const observers = [];
  let captureRemoved = false;
  const root = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  if (withRoot) captureRoots.set('lingkuma-tooltip-host', root);

  const originalFetch = async () => 'en';
  const runtime = {
    sendMessage(message, callback) {
      sent.push(structuredClone(message));
      callback?.({});
    },
  };
  const originalSendMessage = runtime.sendMessage;
  const context = vm.createContext({
    console: { info() {}, warn() {}, error() {} },
    queueMicrotask: callback => callback(),
    Node: { TEXT_NODE: 3 },
    MutationObserver: class MutationObserver {
      constructor() {
        this.disconnected = false;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    document: {
      body: { innerText: pageText, textContent: pageText },
      createTextNode: value => ({ nodeType: 3, nodeValue: value }),
    },
    __LINGKUMA_ZOTERO_READER__: true,
    __LINGKUMA_ZOTERO_SHADOW_CAPTURE__: {
      get: id => captureRoots.get(id) || null,
      onCapture: () => () => { captureRemoved = true; },
    },
    highlightManager: { wordDetailsFromDB: {} },
    fetchLanguageDetection: originalFetch,
    chrome: {
      runtime,
      storage: {
        local: {
          get(_key, callback) {
            callback({ translationConfig: { targetLanguage: 'en' } });
          },
        },
        onChanged: {
          addListener(listener) { storageListeners.add(listener); },
          removeListener(listener) { storageListeners.delete(listener); },
        },
      },
    },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(LANGUAGE_BRIDGE_PATH, 'utf8'), context, { filename: LANGUAGE_BRIDGE_PATH });
  return {
    context,
    sent,
    storageListeners,
    captureRoots,
    observers,
    originalFetch,
    originalSendMessage,
    wasCaptureRemoved: () => captureRemoved,
  };
};

test('language bridge repairs only conflicting TTS metadata and preserves matching variants', () => {
  const { context, sent } = loadLanguageBridge();
  const cases = [
    ['学习', 'en', 'zh'],
    ['食べる', 'en', 'ja'],
    ['공부', 'en', 'ko'],
    ['учиться', 'en', 'ru'],
    ['学习', 'zh-TW', 'zh-TW'],
    ['wash', 'de-DE', 'de-DE'],
  ];

  for (const [text, lang, expected] of cases) {
    context.chrome.runtime.sendMessage({ action: 'playTTS', text, lang });
    const outbound = sent.filter(message => message.action === 'playTTS').at(-1);
    assert.equal(outbound.lang, expected, `${text}: ${lang}`);
  }
});

test('language bridge detects strong source scripts and persists the repair', async () => {
  const { context, sent } = loadLanguageBridge();
  assert.equal(await context.fetchLanguageDetection('учиться', ''), 'ru');
  assert.ok(sent.some(message =>
    message.action === 'updateWordLanguage' &&
    message.word === 'учиться' &&
    message.language === 'ru'
  ));
  assert.equal(await context.fetchLanguageDetection('wash', ''), 'en');
});

test('language bridge localizes source-language tags and hides empty or inapplicable fields', () => {
  const { context } = loadLanguageBridge();
  const bridge = context.__LINGKUMA_ZOTERO_LANGUAGE_BRIDGE__;

  assert.deepEqual(
    structuredClone(bridge.localizeTag('pos: n', 'ja', 'en')),
    { display: 'Part of speech: noun', hide: false, kind: 'pos' },
  );
  assert.equal(bridge.localizeTag('gender: der', 'en', 'zh-CN').hide, true);
  assert.equal(bridge.localizeTag('plural: []', 'en', 'de').hide, true);
  assert.match(bridge.localizeTag('pos: v', 'en', 'de').display, /Wortart: Verb/);
});

test('language bridge cleanup restores wrappers, listeners, observers, and capture hooks', () => {
  const fixture = loadLanguageBridge({ withRoot: true });
  const { context } = fixture;
  assert.notEqual(context.fetchLanguageDetection, fixture.originalFetch);
  assert.notEqual(context.chrome.runtime.sendMessage, fixture.originalSendMessage);
  assert.equal(fixture.storageListeners.size, 1);
  assert.equal(fixture.observers.length, 1);

  context.__LINGKUMA_ZOTERO_LANGUAGE_BRIDGE__.cleanup();

  assert.equal(context.fetchLanguageDetection, fixture.originalFetch);
  assert.equal(context.chrome.runtime.sendMessage, fixture.originalSendMessage);
  assert.equal(fixture.storageListeners.size, 0);
  assert.equal(fixture.wasCaptureRemoved(), true);
  assert.ok(fixture.observers.every(observer => observer.disconnected));
  assert.doesNotThrow(() => context.__LINGKUMA_ZOTERO_LANGUAGE_BRIDGE__.cleanup());
});
