import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const createState = () => {
  const context = vm.createContext({
    structuredClone,
    setTimeout,
    clearTimeout,
    console: { debug() {}, info() {}, warn() {}, error() {}, log() {} },
    Zotero: { Prefs: { get() { return null; }, set() {} }, debug() {}, logError() {} },
  });
  context.globalThis = context;
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'adapter', 'state.js'), 'utf8'),
    context,
    { filename: path.join(ROOT, 'adapter', 'state.js') },
  );
  return new context.LingKumaStateAdapter({
    pluginID: 'lingkuma-zotero@white-ink-cell',
    version: '1.1.0',
  });
};

const record = (word, status) => ({ word, term: word, status });

test('flat vocabulary maps keep words whose names resemble backup metadata', () => {
  const state = createState();
  const words = {
    data: record('data', '1'),
    format: record('format', '2'),
    progress: record('progress', '3'),
    storage: record('storage', '4'),
    words: record('words', '5'),
  };

  assert.equal(state.importLingKuma(JSON.stringify(words), false), 5);
  assert.deepEqual(
    JSON.parse(JSON.stringify(state.batchGetWordStatus(Object.keys(words)))),
    {
      data: { word: 'data', status: '1', isCustom: false },
      format: { word: 'format', status: '2', isCustom: false },
      progress: { word: 'progress', status: '3', isCustom: false },
      storage: { word: 'storage', status: '4', isCustom: false },
      words: { word: 'words', status: '5', isCustom: false },
    },
  );
  if (state.saveTimer) clearTimeout(state.saveTimer);
});

test('supported wrapper fields still unwrap vocabulary collections', () => {
  for (const [field, payload] of [
    ['words', { format: 'lingkuma-zotero-export', words: { alpha: record('alpha', '1') } }],
    ['wordDetails', { wordDetails: { beta: record('beta', '2') } }],
    ['vocabulary', { vocabulary: [record('gamma', '3')] }],
    ['data', { data: { delta: record('delta', '4') } }],
  ]) {
    const state = createState();
    assert.equal(state.importLingKuma(payload, false), 1, field);
    assert.equal(Object.keys(state.words).length, 1, field);
    if (state.saveTimer) clearTimeout(state.saveTimer);
  }
});

test('a malformed recognized export wrapper fails before replacing vocabulary', () => {
  const state = createState();
  state.words.keep = record('keep', '2');

  assert.throws(
    () => state.importLingKuma({ format: 'lingkuma-zotero-export', words: null }, false),
    /词汇数据格式|JSON 内容无效/,
  );
  assert.equal(state.words.keep.status, '2');
});
