import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XHTML = fs.readFileSync(path.join(ROOT, 'ui', 'prefs.xhtml'), 'utf8');
const PREFS_SOURCE = fs.readFileSync(path.join(ROOT, 'ui', 'prefs.js'), 'utf8');

const loadPrefs = () => {
  const statusNode = { textContent: '', dataset: {} };
  const context = vm.createContext({
    window: {},
    document: {
      getElementById(id) { return id === 'lk-dictionary-status' ? statusNode : null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
    },
    navigator: {},
    NodeFilter: { SHOW_TEXT: 4 },
    Zotero: { locale: 'en-US' },
    URL,
  });
  vm.runInContext(PREFS_SOURCE, context, { filename: 'ui/prefs.js' });
  return { prefs: context.window.LingKumaZoteroPrefs, statusNode };
};

test('native preferences expose one Dictionary page with default, custom, import, refresh, and public status controls', () => {
  assert.match(XHTML, /data-lk-page="dictionary"/);
  assert.match(XHTML, /data-lk-page-panel="dictionary"/);
  for (const action of ['dictionary-default', 'dictionary-custom', 'dictionary-import', 'dictionary-refresh']) {
    assert.match(XHTML, new RegExp(`data-lk-action=["']${action}["']`), action);
  }
  assert.match(XHTML, /id="lk-dictionary-status"/);
  assert.doesNotMatch(XHTML, /custom-selected\.lkdict|dictionaryDir|dataRoot/);
});

test('dictionary actions use the host lookup service, persist mode changes, and render only public status', async () => {
  const { prefs, statusNode } = loadPrefs();
  const calls = [];
  const plugin = {
    lookup: {
      selectDictionary(mode) { calls.push(['select', mode]); },
      async getDictionaryStatus() {
        calls.push(['status']);
        return {
          mode: 'custom', status: 'READY', dictionaryID: 'custom-en-zh',
          sourceLanguage: 'en', targetLanguage: 'zh-CN', path: 'D:/private/custom-selected.lkdict',
        };
      },
    },
    state: { async save() { calls.push(['save']); } },
  };
  prefs.plugin = () => plugin;
  prefs.status = () => {};

  await prefs.selectDictionaryMode('custom');

  assert.deepEqual(calls, [['select', 'custom'], ['save'], ['status']]);
  assert.match(statusNode.textContent, /CUSTOM.*READY.*custom-en-zh.*en.*zh-CN/i);
  assert.doesNotMatch(statusNode.textContent, /D:\/|custom-selected\.lkdict/);
});

test('custom import accepts one picked .lkdict through the host service and refreshes status', async () => {
  const { prefs } = loadPrefs();
  const calls = [];
  const plugin = {
    lookup: {
      async importCustomDictionary(filePath) { calls.push(['import', filePath]); },
      async getDictionaryStatus() { calls.push(['status']); return { mode: 'custom', status: 'READY' }; },
    },
    state: { async save() { calls.push(['save']); } },
  };
  prefs.plugin = () => plugin;
  prefs.pickDictionaryFile = async () => 'D:/chosen/reader.lkdict';
  prefs.status = () => {};

  await prefs.importDictionary();

  assert.deepEqual(calls, [
    ['import', 'D:/chosen/reader.lkdict'],
    ['save'],
    ['status'],
  ]);
  assert.match(PREFS_SOURCE, /@mozilla\.org\/filepicker;1/);
  assert.match(PREFS_SOURCE, /appendFilter\([^)]*\.lkdict/);
  assert.match(PREFS_SOURCE, /picker\.file\.path/);
});
test('all localized READMEs document the bundled default .lkdict and attribution boundary', () => {
  for (const name of ['README.md', 'README_zh.md', 'README_ja.md', 'README_ko.md']) {
    const readme = fs.readFileSync(path.join(ROOT, name), 'utf8');
    assert.match(readme, /\.lkdict/i, name);
    assert.match(readme, /G-004/i, name);
    assert.match(readme, /Default Dictionary/i, name);
    assert.match(readme, /Wiktionary|Wiktextract|Kaikki/i, name);
    assert.match(readme, /CC BY-SA 4\.0/i, name);
    assert.match(readme, /ENGLISH-WIKTIONARY-DATA-NOTICE\.txt/i, name);
    assert.doesNotMatch(readme, /example\.invalid/i, name);
  }
});
test('Word Explosion remains upstream because its independent UI/state flow is not a shallow lookup seam', () => {
  const source = fs.readFileSync(path.join(ROOT, 'upstream', 'src', 'service', 'a7_words_boom.js'), 'utf8');
  assert.match(source, /async function extractUnknownWords\(/);
  assert.match(source, /async function triggerWordQuery\(/);
  assert.match(source, /async function renderWordExplosionContent\(/);
  assert.match(source, /async function createWordItem\(/);
  assert.match(source, /async function getWordTranslations\(/);
  assert.doesNotMatch(source, /lookupDictionary|lookupQuickContext|__LINGKUMA_LOOKUP_RENDER__/);
});
