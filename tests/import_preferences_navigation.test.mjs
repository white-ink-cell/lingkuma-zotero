import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('bootstrap stores the registered preference pane ID on the plugin instance', () => {
  assert.match(
    read('bootstrap.js'),
    /instance\.preferencePaneID\s*=\s*await Zotero\.PreferencePanes\.register\s*\(/,
  );
});

test('the existing native import page keeps whole-file and unlimited textarea inputs on one import path', () => {
  const xhtml = read('ui/prefs.xhtml');
  const prefs = read('ui/prefs.js');
  assert.match(xhtml, /<html:input id="lk-import-file" type="file" accept="\.json,\.txt,\.csv"\/>/);
  assert.match(xhtml, /<html:textarea id="lk-import-text"(?![^>]*maxlength=)[^>]*><\/html:textarea>/);
  assert.match(prefs, /const text = await file\.text\(\);[\s\S]{0,160}lk-import-text[^\n]*\.value = text/);
  const importMethod = prefs.slice(prefs.indexOf('async importWords()'), prefs.indexOf('async copyText('));
  assert.match(importMethod, /lk-import-text/);
  assert.match(importMethod, /importLingKuma\(parsed, mode === "merge"\)/);
});

test('the vocabulary import choice opens the existing preference import action without a prompt', async () => {
  const opened = [];
  class StateAdapter { constructor() { this.words = {}; } }
  class LookupService {}
  class MessageHost { constructor() { this.contexts = new Set(); } }
  const context = vm.createContext({
    LK_CONTENT_CSS_TEXT: '',
    LK_RESOURCE_DATA: {},
    LingKumaStateAdapter: StateAdapter,
    LingKumaLookupService: LookupService,
    LingKumaMessageHost: MessageHost,
    Services: {
      prompt: {
        BUTTON_POS_0: 1,
        BUTTON_POS_1: 2,
        BUTTON_POS_2: 4,
        BUTTON_TITLE_IS_STRING: 1,
        confirmEx() { return 0; },
        prompt() { throw new Error('single-line import prompt must not be used'); },
      },
    },
    Zotero: {
      debug() {},
      logError() {},
      Utilities: { Internal: { openPreferences(...args) { opened.push(args); } } },
      getMainWindow() { return {}; },
    },
    setTimeout,
    clearTimeout,
    Error,
  });
  vm.runInContext(read('adapter/main.js'), context, { filename: 'adapter/main.js' });
  const plugin = new context.LingKumaZoteroPlugin({
    id: 'lingkuma-zotero@white-ink-cell',
    version: '1.1.0',
    rootURI: 'resource://lingkuma/',
  });
  plugin.preferencePaneID = 'lingkuma-zotero-preferences';

  await plugin.openVocabularyManager({});

  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [[
    'lingkuma-zotero-preferences',
    { action: 'import' },
  ]]);
});

test('the preference pane consumes import actions on first and repeated navigation', () => {
  const documentHandlers = new Map();
  const rootHandlers = new Map();
  let pendingAction = 'import';
  const context = vm.createContext({
    window: {
      Zotero_Preferences: {
        consumePendingAction() {
          const action = pendingAction;
          pendingAction = null;
          return action;
        },
      },
    },
    document: {
      addEventListener(type, handler, capture) { documentHandlers.set(type, { handler, capture }); },
      removeEventListener(type, handler, capture) {
        const current = documentHandlers.get(type);
        if (current?.handler === handler && current.capture === capture) documentHandlers.delete(type);
      },
      getElementById(id) {
        if (id !== 'lingkuma-zotero-prefs-root') return null;
        return { addEventListener(type, handler) { rootHandlers.set(type, handler); } };
      },
    },
    navigator: {},
    NodeFilter: { SHOW_TEXT: 4 },
    Zotero: { locale: 'en-US' },
  });
  vm.runInContext(read('ui/prefs.js'), context, { filename: 'ui/prefs.js' });
  const prefs = context.window.LingKumaZoteroPrefs;
  const pages = [];
  prefs.showPage = page => pages.push(page);

  prefs.bindPreferenceActions();
  assert.deepEqual(pages, ['import']);
  assert.equal(documentHandlers.get('action').capture, true);

  pendingAction = 'import';
  documentHandlers.get('action').handler();
  assert.deepEqual(pages, ['import', 'import']);

  rootHandlers.get('unload')();
  assert.equal(documentHandlers.has('action'), false);
});
