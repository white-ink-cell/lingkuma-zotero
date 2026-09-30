import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'adapter', 'main.js'), 'utf8');

const REQUIRED_ORDER = [
  'src/utils/highlight_floating_button.js',
  'src/service/a1_loadKnowWords.js',
  'src/service/jp/kuromoji.js',
  'src/service/a2_hightlight.js',
  'src/utils/sentenseOoOo.js',
  'src/plugin/bionic.js',
  'src/utils/liquid-glass.js',
  'src/plugin/readingRuler.js',
  'src/plugin/min/compromise.js',
  'src/plugin/min/de-compromise.min.js',
  'src/utils/language-detector/eld.extrasmall.global.js',
  'src/plugin/pos-highlight.js',
  'src/service/a3_aiFragen.js',
];

const DICTIONARIES = [
  'base.dat.gz.dict',
  'cc.dat.gz.dict',
  'check.dat.gz.dict',
  'tid.dat.gz.dict',
  'tid_map.dat.gz.dict',
  'tid_pos.dat.gz.dict',
  'unk.dat.gz.dict',
  'unk_char.dat.gz.dict',
  'unk_compat.dat.gz.dict',
  'unk_invoke.dat.gz.dict',
  'unk_map.dat.gz.dict',
  'unk_pos.dat.gz.dict',
];

test('required desktop reader modules are reachable in dependency order with exact Kuromoji data', () => {
  let previous = -1;
  for (const script of REQUIRED_ORDER) {
    const index = MAIN.indexOf(`"${script}"`);
    assert.ok(index > previous, `${script} must load after the preceding dependency`);
    previous = index;
  }
  assert.doesNotMatch(MAIN, /clipSubtitles|clipboard[-_]?subtitles/i);

  const directory = path.join(ROOT, 'upstream', 'src', 'service', 'jp', 'dict');
  const actual = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter(name => fs.statSync(path.join(directory, name)).isFile()).sort()
    : [];
  assert.deepEqual(actual, [...DICTIONARIES].sort());
});


test('required desktop reader features default off and preserve explicit enablement', () => {
  const context = vm.createContext({ structuredClone, setTimeout, clearTimeout });
  context.globalThis = context;
  const statePath = path.join(ROOT, 'adapter', 'state.js');
  vm.runInContext(fs.readFileSync(statePath, 'utf8'), context, { filename: statePath });
  const state = new context.LingKumaStateAdapter({ pluginID: 'test', version: 'test' });
  const keys = ['bionicEnabled', 'readingRuler', 'posHighlightEnabled'];

  assert.deepEqual(Object.fromEntries(keys.map(key => [key, state.storageGet(key)[key]])), {
    bionicEnabled: false,
    readingRuler: false,
    posHighlightEnabled: false,
  });

  state.storageSet(Object.fromEntries(keys.map(key => [key, true])));
  assert.deepEqual(Object.fromEntries(keys.map(key => [key, state.storageGet(key)[key]])), {
    bionicEnabled: true,
    readingRuler: true,
    posHighlightEnabled: true,
  });
  if (state.saveTimer) clearTimeout(state.saveTimer);
});

test('alphabetic highlight runtime consumer preserves explicit false', () => {
  const source = fs.readFileSync(path.join(ROOT, 'upstream', 'src', 'service', 'a2_hightlight.js'), 'utf8');
  assert.match(source, /this\.highlightAlphabeticEnabled\s*=\s*result\.highlightAlphabeticEnabled\s*!==\s*false/);
  assert.match(source, /if\s*\(this\.highlightAlphabeticEnabled\)/);
});
