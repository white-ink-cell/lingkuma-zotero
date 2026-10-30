import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const createStateRuntime = () => {
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
  const state = new context.LingKumaStateAdapter({
    pluginID: 'lingkuma-zotero@white-ink-cell',
    version: '1.1.0',
  });
  return { context, state };
};

const createState = () => createStateRuntime().state;

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

const acceptanceFile = process.env.LINGKUMA_JSON_ACCEPTANCE_FILE;

test('a real vocabulary backup imports through whole-file and whole-paste paths', {
  skip: acceptanceFile ? false : 'set LINGKUMA_JSON_ACCEPTANCE_FILE for the local acceptance fixture',
}, async () => {
  const raw = fs.readFileSync(acceptanceFile, 'utf8');
  const source = JSON.parse(raw);
  assert.equal(Object.keys(source).length, 6050);

  const runPublicImportPath = async fileMode => {
    const { context: stateContext, state } = createStateRuntime();
    let saves = 0;
    state.save = async () => { saves++; };

    const nodes = {
      'lk-import-text': { value: fileMode ? '' : raw },
      'lk-import-mode': { value: 'replace' },
      'lk-import-status': { value: '5' },
      'lk-import-language': { value: 'en' },
      'lk-import-custom-language': { value: '' },
    };
    const scans = [];
    const prefsContext = vm.createContext({
      window: {},
      document: { getElementById(id) { return nodes[id] || null; } },
      navigator: {},
      NodeFilter: { SHOW_TEXT: 4 },
      Zotero: { locale: 'en-US' },
    });
    vm.runInContext(read('ui/prefs.js'), prefsContext, { filename: 'ui/prefs.js' });
    const prefs = prefsContext.window.LingKumaZoteroPrefs;
    prefs.state = () => state;
    prefs.plugin = () => ({ scanAllReaders: (...args) => scans.push(args) });
    prefs.refreshWordSummary = () => {};
    prefs.renderWordList = () => {};
    prefs.renderStatistics = () => {};
    prefs.status = () => {};

    if (fileMode) {
      await prefs.readImportFile({
        target: { files: [{ name: path.basename(acceptanceFile), text: async () => raw }] },
      });
      assert.equal(nodes['lk-import-text'].value, raw);
    }
    await prefs.importWords();

    assert.equal(Object.keys(state.words).length, 6050);
    assert.equal(saves, 1);
    assert.deepEqual(scans, [['native-settings-import', true]]);

    vm.runInContext(read('adapter/bridge.js'), stateContext, { filename: 'adapter/bridge.js' });
    const host = new stateContext.LingKumaMessageHost({
      state,
      plugin: {},
      rootURI: 'resource://lingkuma/',
      pluginID: 'lingkuma-zotero@white-ink-cell',
    });
    const probeByStatus = {};
    for (const [word, value] of Object.entries(state.words)) {
      const status = String(value.status ?? '0');
      if (!(status in probeByStatus)) probeByStatus[status] = word;
    }
    assert.deepEqual(Object.keys(probeByStatus).sort(), ['0', '1', '2', '3', '4', '5']);
    const response = await host.handleMessage({
      action: 'batchGetWordStatus',
      words: Object.values(probeByStatus),
    });
    assert.deepEqual(
      Object.fromEntries(Object.values(response.statusMap).map(value => [value.status, true])),
      { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true },
    );
    if (state.saveTimer) clearTimeout(state.saveTimer);
  };

  await runPublicImportPath(true);
  await runPublicImportPath(false);

  const highlight = read('upstream/src/service/a2_hightlight.js');
  assert.match(highlight, /if \(status === "5"\) continue/);
  assert.match(highlight, /\["1", "2", "3", "4"\]\.includes\(status\)[\s\S]{0,120}state" \+ status/);
  assert.match(highlight, /状态0和其他状态都显示为默认蓝色高亮/);
});
