import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const loadState = async writes => {
  const context = vm.createContext({
    structuredClone,
    setTimeout,
    clearTimeout,
    PathUtils: { join: (...parts) => parts.join('/') },
    IOUtils: {
      async makeDirectory() {},
      async exists() { return true; },
    },
    Zotero: {
      DataDirectory: { dir: '/zotero-data' },
      File: {
        async getContentsAsync() {
          return JSON.stringify({ adapterSchemaVersion: 10, storage: {}, words: {} });
        },
        putContentsAsync(_path, payload) {
          let release;
          const pending = new Promise(resolve => { release = resolve; });
          writes.push({ payload, release });
          return pending;
        },
      },
      Prefs: { get() { return null; }, set() {} },
      debug() {},
      logError() {},
    },
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'state.js'), 'utf8'), context);
  const state = new context.LingKumaStateAdapter({
    pluginID: 'lingkuma-zotero@white-ink-cell',
    version: '1.0.1',
  });
  await state.load();
  return state;
};

test('state snapshots are written in call order and the later save waits on the same barrier', async () => {
  const writes = [];
  const state = await loadState(writes);

  state.addTranslation('study', '学习', 'zh-CN');
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  const older = state.save();
  for (let i = 0; i < 10 && writes.length < 1; i++) await Promise.resolve();

  state.addTranslation('study', '研究', 'zh-CN');
  state.addTranslation('study', '研究', 'zh-CN');
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  let newerDone = false;
  const newer = state.save().then(() => { newerDone = true; });
  await Promise.resolve();
  const writesBeforeOlderCompletes = writes.length;
  const newerDoneBeforeOlderCompletes = newerDone;

  writes[0].release();
  for (let i = 0; i < 10 && writes.length < 2; i++) await Promise.resolve();
  if (writes[1]) writes[1].release();
  await Promise.all([older, newer]);

  assert.equal(writesBeforeOlderCompletes, 1);
  assert.equal(newerDoneBeforeOlderCompletes, false);
  assert.deepEqual(JSON.parse(writes[1].payload).words.study.translations, ['学习', '研究']);
});
