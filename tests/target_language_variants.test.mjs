import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'adapter', 'state.js');
const SENTENCE = 'We discuss why generalized linear models are less suitable for interactions.';
const WORD = 'interactions';

const defaultSentenceRequest = () => ({
  word: WORD,
  sentence: SENTENCE,
  messages: [{
    role: 'user',
    content: `请将句子: ${SENTENCE}翻译为中文，并将句子中单词"${WORD}"对应的中文的部分用Markdown加粗显示。只返回翻译结果，不要额外说明。`,
  }],
});

const captureSentenceRequest = async (target, customPrompt = '') => {
  const context = vm.createContext({
    structuredClone,
    setTimeout,
    clearTimeout,
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), context, { filename: STATE_PATH });
  const state = new context.LingKumaStateAdapter({
    pluginID: 'lingkuma-zotero@white-ink-cell',
    version: '1.0.1',
  });
  state.storage.translationConfig.targetLanguage = target;
  if (customPrompt) {
    state.storage.aiSentenceTranslationPrompt = customPrompt;
  }
  state.getEffectiveAIConfig = () => ({ source: 'custom' });
  let captured = null;
  state._postAI = async (_config, outbound) => {
    captured = structuredClone(outbound);
    return { choices: [{ message: { role: 'assistant', content: 'captured' } }] };
  };

  const request = defaultSentenceRequest();
  if (customPrompt) {
    request.messages = [{ role: 'user', content: customPrompt }];
  }
  await state.makeAIRequest(request);
  return captured;
};

test('generic Chinese sentence target explicitly requests Simplified Chinese', async () => {
  const outbound = await captureSentenceRequest('中文');
  const prompt = outbound.messages.map(message => message.content).join('\n');

  assert.match(prompt, /Simplified Chinese \(zh-CN\)/);
  assert.doesNotMatch(prompt, /natural 中文 \(中文\)/);
});

test('explicit Simplified Chinese targets remain Simplified', async () => {
  for (const target of ['zh-CN', 'zh_Hans', 'Simplified Chinese', '简体中文']) {
    const outbound = await captureSentenceRequest(target);
    const prompt = outbound.messages.map(message => message.content).join('\n');

    assert.match(prompt, /Simplified Chinese \(zh-CN\)/, target);
    assert.doesNotMatch(prompt, /Traditional Chinese/, target);
  }
});
test('explicit Traditional Chinese targets remain Traditional', async () => {
  for (const target of ['zh-TW', 'zh_Hant', 'zh-HK', 'Traditional Chinese', '繁體中文']) {
    const outbound = await captureSentenceRequest(target);
    const prompt = outbound.messages.map(message => message.content).join('\n');

    assert.match(prompt, /Traditional Chinese \(zh-TW\)/, target);
    assert.doesNotMatch(prompt, /Simplified Chinese/, target);
  }
});
test('generic Chinese display-name targets explicitly request Simplified Chinese', async () => {
  for (const target of ['zh', 'Chinese']) {
    const outbound = await captureSentenceRequest(target);
    const prompt = outbound.messages.map(message => message.content).join('\n');

    assert.match(prompt, /Simplified Chinese \(zh-CN\)/, target);
  }
});

test('non-Chinese targets remain unchanged', async () => {
  for (const [target, expected] of [
    ['ja', 'Japanese (ja)'],
    ['ko', 'Korean (ko)'],
    ['en', 'English (en)'],
    ['de', 'German (de)'],
  ]) {
    const outbound = await captureSentenceRequest(target);
    const prompt = outbound.messages.map(message => message.content).join('\n');

    assert.match(prompt, new RegExp(`natural ${expected.replace(/[()]/g, '\\$&')}`), target);
  }
});

test('custom sentence prompt remains authoritative', async () => {
  const customPrompt = `Translate ${SENTENCE} using my explicit house style for ${WORD}.`;
  const outbound = await captureSentenceRequest('zh', customPrompt);

  assert.deepEqual(outbound.messages, [{ role: 'user', content: customPrompt }]);
});
