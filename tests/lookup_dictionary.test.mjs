import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUSTOM_PATH = '/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict';

const metadata = {
  format: 'lingkuma-dictionary', schemaVersion: '1', dictionaryID: 'custom-en-zh',
  sourceLanguage: 'en', targetLanguage: 'zh-CN', entryCount: '1',
  dataSourceName: 'Fixture', dataSourceURL: 'https://source.example/',
  dataSourceSnapshot: '2026-09-01', dataLicense: 'CC BY-SA 4.0', attribution: 'Fixture authors',
};

function makeService(rowsByTerm, {
  catalog = [], mode = 'custom', customExists = true, defaultExists = true,
  queryGate = null, downloadGate = null, queryFailures = 0, makeAIRequest = null,
} = {}) {
  const context = vm.createContext({ console, Error, JSON, Object, Map, Set, Promise, AbortController, URL });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'), context);
  const lookupCalls = [];
  const dictionaryDBPaths = [];
  const validationCalls = [];
  const sha256Calls = [];
  const cacheWrites = [];
  const cacheClosed = { value: false };
  const downloads = [];
  let remainingQueryFailures = queryFailures;
  const cacheStore = new Map();
  const files = { customExists, defaultExists, customVersion: 1, defaultVersion: 1 };
  const storage = { dictionaryConfig: { mode, custom: {
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN', sha256: 'a'.repeat(64),
  } } };
  const state = {
    storageGet() { return structuredClone(storage); },
    storageSet(values) { Object.assign(storage, structuredClone(values)); },
  };
  if (makeAIRequest) state.makeAIRequest = makeAIRequest;
  const cacheColumns = [
    { name: 'dictionary_identity', pk: 1 }, { name: 'source_language', pk: 2 },
    { name: 'target_language', pk: 3 }, { name: 'normalized_term', pk: 4 },
    { name: 'result_json', pk: 0 },
  ];
  const dbFactory = dbPath => {
    if (dbPath.endsWith('lookup-cache.sqlite')) {
      return {
        async valueQueryAsync(sql, params) {
          if (/SELECT result_json FROM lookup_cache/i.test(sql)) {
            return cacheStore.get(JSON.stringify(params)) || null;
          }
          return null;
        },
        async queryAsync(sql, params) {
          if (/table_info/i.test(sql)) return cacheColumns;
          if (/INSERT OR REPLACE INTO lookup_cache/i.test(sql)) {
            cacheWrites.push(structuredClone(params));
            cacheStore.set(JSON.stringify(params.slice(0, 4)), params[4]);
          }
          return [];
        },
        async closeDatabase() { cacheClosed.value = true; },
      };
    }
    dictionaryDBPaths.push(dbPath);
    assert.ok(dbPath === CUSTOM_PATH || dbPath.endsWith('/custom-en-zh.lkdict'));
    return {
      async valueQueryAsync(sql) {
        if (/quick_check/i.test(sql)) {
          validationCalls.push(dbPath);
          return 'ok';
        }
        if (/sqlite_master.*table/i.test(sql)) return 2;
        if (/sqlite_master.*index/i.test(sql)) return 1;
        if (/meanings_json/i.test(sql)) return '["fixture"]';
        return null;
      },
      async queryAsync(sql, params) {
        if (/SELECT key, value FROM metadata/i.test(sql)) {
          return Object.entries(metadata).map(([key, value]) => ({ key, value }));
        }
        if (/table_info\(metadata\)/i.test(sql)) return ['key', 'value'].map(name => ({ name }));
        if (/table_info\(entries\)/i.test(sql)) {
          return ['headword_norm', 'headword', 'meanings_json', 'pos_json', 'ipa', 'audio_json', 'lemma', 'forms_json'].map(name => ({ name }));
        }
        if (/index_info/i.test(sql)) return [{ name: 'headword_norm' }];
        if (/FROM entries WHERE headword_norm = \?/i.test(sql)) {
          lookupCalls.push({ sql, params: structuredClone(params) });
          if (queryGate) await queryGate;
          if (remainingQueryFailures > 0) {
            remainingQueryFailures -= 1;
            throw new Error('temporary dictionary failure');
          }
          return structuredClone(rowsByTerm.get(params[0]) || []);
        }
        return [];
      },
      async closeDatabase() {},
    };
  };
  const service = new context.LingKumaLookupService({
    state,
    catalog,
    dependencies: {
      dataRoot: '/profile/lingkuma-zotero',
      join: (...parts) => parts.join('/'),
      file: {
        async exists(filePath) {
          return (files.customExists && filePath === CUSTOM_PATH) ||
            (files.defaultExists && filePath.endsWith('/custom-en-zh.lkdict'));
        },
        async stat(filePath) {
          if (files.customExists && filePath === CUSTOM_PATH) {
            return { type: 'regular', size: 100, lastModified: files.customVersion };
          }
          if (files.defaultExists && filePath.endsWith('/custom-en-zh.lkdict')) {
            return { type: 'regular', size: 100, lastModified: files.defaultVersion };
          }
          throw new Error('missing file');
        },
        async makeDirectory() {}, async remove() {}, async write() {},
      },
      dbFactory,
      async download(url) {
        downloads.push(url);
        if (downloadGate) return downloadGate;
        return Buffer.from('payload');
      },
      async sha256File(filePath) {
        sha256Calls.push(filePath);
        return 'a'.repeat(64);
      },
      now: () => '2026-09-29T00:00:00.000Z',
    },
  });
  return {
    service, lookupCalls, storage, cacheWrites, cacheClosed, downloads, dictionaryDBPaths,
    validationCalls, sha256Calls, files,
  };
}

test('custom lookup queries a whole hyphenated surface and returns the frozen HIT shape', async () => {
  const rows = new Map([['state-of-the-art', [{
    headword: 'state-of-the-art', lemma: '',
    meanings_json: '["尖端", "", "最先进", "尖端", "fourth"]',
    pos_json: '["adj", "adj"]', ipa: '/ˌsteɪt əv ði ˈɑːrt/',
    audio_json: '{"url":"https://audio.example/state.mp3","license":"CC BY-SA 4.0"}',
    forms_json: '[]',
  }]]]);
  const { service, lookupCalls } = makeService(rows);
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'token-1', surface: 'state-of-the-art', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'token-1', status: 'HIT',
    entry: {
      surface: 'state-of-the-art', dictionaryForm: 'state-of-the-art',
      meanings: ['尖端', '最先进', 'fourth'], pos: ['adj'],
      ipa: '/ˌsteɪt əv ði ˈɑːrt/',
      audio: { url: 'https://audio.example/state.mp3', license: 'CC BY-SA 4.0' },
    },
  });
  assert.equal(lookupCalls.length, 1);
  assert.deepEqual(lookupCalls[0].params, ['state-of-the-art']);
  assert.match(lookupCalls[0].sql, /LIMIT 8/i);
});

test('an obvious line-end typesetting split is corrected only after the original MISS', async () => {
  const rows = new Map([['international', [{
    headword: 'international', lemma: '', meanings_json: '["国际的"]',
    pos_json: '["adj"]', ipa: '/lemma-only/', audio_json: '{"url":"https://audio.example/lemma.mp3"}', forms_json: '[]',
  }]]]);
  const { service, lookupCalls } = makeService(rows);
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'token-2', surface: 'inter-\nnational', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.equal(result.entry.surface, 'inter-\nnational');
  assert.equal(result.entry.dictionaryForm, 'international');
  assert.equal(Object.hasOwn(result.entry, 'ipa'), false);
  assert.equal(Object.hasOwn(result.entry, 'audio'), false);
  assert.deepEqual(lookupCalls.map(call => call.params), [['inter-\nnational'], ['international']]);
});
test('correction never crosses a blank line or paragraph boundary', async () => {
  const rows = new Map([['international', [{
    headword: 'international', lemma: '', meanings_json: '["international"]',
    pos_json: '["adj"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, lookupCalls } = makeService(rows);
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'paragraph-boundary', surface: 'inter-\n\nnational',
    sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'MISS');
  assert.deepEqual(lookupCalls.map(call => call.params), [['inter-\n\nnational']]);
});
test('an exact inflected headword keeps its own pronunciation even when it has a lemma', async () => {
  const rows = new Map([['bears', [{
    headword: 'bears', lemma: 'bear', meanings_json: '["\u627f\u53d7"]',
    pos_json: '["v"]', ipa: '/ber/',
    audio_json: '[{"ipa":"/ber/","region":"US","url":"https://audio.example/bears.mp3"}]', forms_json: '[]',
  }]]]);
  const { service } = makeService(rows);
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'surface-pronunciation', surface: 'bears', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.equal(result.entry.dictionaryForm, 'bear');
  assert.equal(result.entry.ipa, '/ber/');
  assert.deepEqual(JSON.parse(JSON.stringify(result.entry.pronunciations)), [{
    ipa: '/ber/', region: 'US', url: 'https://audio.example/bears.mp3',
  }]);
  assert.equal(result.entry.audio.url, 'https://audio.example/bears.mp3');
});
test('default pronunciation lookup is source-bound rather than translation-target-bound', async () => {
  const rows = new Map([['book', [{
    headword: 'book', lemma: '', meanings_json: '["book"]', pos_json: '["noun"]', ipa: '/bʊk/',
    audio_json: JSON.stringify([
      { ipa: '/bʊk/', region: 'US', url: 'https://audio.example/book-us.mp3' },
      { ipa: '/bʊk/', region: 'UK', url: 'https://audio.example/book-uk.mp3' },
    ]), forms_json: '[]',
  }]]]);
  const catalog = [{
    active: true, pronunciationSource: true, dictionaryID: 'custom-en-zh',
    sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: 'assets/dictionaries/custom-en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const { service } = makeService(rows, { mode: 'default', catalog });
  await service.init();

  for (const targetLanguage of ['ja', 'de', 'zh-TW']) {
    const result = await service.lookupPronunciation({
      requestToken: `pron-${targetLanguage}`, surface: 'book', sourceLanguage: 'en', targetLanguage,
    });

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      requestToken: `pron-${targetLanguage}`, status: 'HIT',
      entry: {
        surface: 'book', ipa: '/bʊk/',
        pronunciations: [
          { ipa: '/bʊk/', region: 'US', url: 'https://audio.example/book-us.mp3' },
          { ipa: '/bʊk/', region: 'UK', url: 'https://audio.example/book-uk.mp3' },
        ],
        audio: { url: 'https://audio.example/book-us.mp3', region: 'US' },
      },
    });
    assert.equal(Object.hasOwn(result.entry, 'meanings'), false);
    assert.equal(Object.hasOwn(result.entry, 'dictionaryForm'), false);
  }
});

test('a pronunciation-only entry stays separate from Dictionary meaning lookup', async () => {
  const rows = new Map([['specific', [{
    headword: 'specific', lemma: '', meanings_json: '[]', pos_json: '["adj"]', ipa: '/spɪˈsɪf.ɪk/',
    audio_json: JSON.stringify([
      { region: 'US', url: 'https://audio.example/specific-us.mp3' },
      { ipa: '/spɪˈsɪf.ɪk/', region: 'UK' },
    ]), forms_json: '[]',
  }]]]);
  const catalog = [{
    active: true, pronunciationSource: true, dictionaryID: 'custom-en-zh',
    sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: 'assets/dictionaries/custom-en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const { service } = makeService(rows, { mode: 'default', catalog });
  await service.init();

  const dictionary = await service.lookupDictionary({
    requestToken: 'dict-specific', surface: 'specific', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  const pronunciation = await service.lookupPronunciation({
    requestToken: 'pron-specific', surface: 'specific', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(dictionary)), {
    requestToken: 'dict-specific', status: 'MISS',
  });
  assert.equal(pronunciation.status, 'HIT');
  assert.equal(pronunciation.entry.ipa, '/spɪˈsɪf.ɪk/');
  assert.deepEqual(
    JSON.parse(JSON.stringify(pronunciation.entry.pronunciations)).map(record => record.region),
    ['US', 'UK'],
  );
  assert.equal(Object.hasOwn(pronunciation.entry, 'meanings'), false);
  assert.equal(Object.hasOwn(pronunciation.entry, 'dictionaryForm'), false);
});

test('AI pronunciation is a terminal exact-surface fallback with strict US and UK results', async () => {
  const aiRequests = [];
  const { service } = makeService(new Map(), {
    makeAIRequest: async request => {
      aiRequests.push(structuredClone(request));
      return {
        choices: [{ message: { content: '{"surface":"pricing","ipaUS":"/ˈpraɪsɪŋ/","ipaUK":"/ˈpraɪsɪŋ/"}' } }],
      };
    },
  });
  await service.init();

  const result = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-pricing', surface: 'pricing', sourceLanguage: 'en',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'ai-pron-pricing', status: 'HIT',
    entry: {
      surface: 'pricing', source: 'ai',
      pronunciations: [
        { region: 'US', ipa: '/ˈpraɪsɪŋ/' },
        { region: 'UK', ipa: '/ˈpraɪsɪŋ/' },
      ],
    },
  });
  assert.equal(aiRequests.length, 1);
  assert.match(aiRequests[0].messages[0].content, /IPA/i);
  assert.match(aiRequests[0].messages[1].content, /pricing/);
  assert.equal(aiRequests[0]._skipLanguageRetarget, true);

  const cached = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-pricing-2', surface: 'pricing', sourceLanguage: 'en-US',
  });
  assert.equal(cached.status, 'HIT');
  assert.deepEqual(JSON.parse(JSON.stringify(cached.entry.pronunciations)), [
    { region: 'US', ipa: '/ˈpraɪsɪŋ/' },
    { region: 'UK', ipa: '/ˈpraɪsɪŋ/' },
  ]);
  assert.equal(aiRequests.length, 1);
});

test('AI pronunciation accepts and normalizes one fenced JSON object from the real provider shape', async () => {
  const { service } = makeService(new Map(), {
    makeAIRequest: async () => ({
      choices: [{ message: { content: '```json\n{"surface":"averages","ipaUS":"ˈævərɪdʒɪz","ipaUK":"ˈævərɪdʒɪz"}\n```' } }],
    }),
  });
  await service.init();

  const result = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-fenced', surface: 'averages', sourceLanguage: 'en',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'ai-pron-fenced', status: 'HIT',
    entry: {
      surface: 'averages', source: 'ai',
      pronunciations: [
        { region: 'US', ipa: '/ˈævərɪdʒɪz/' },
        { region: 'UK', ipa: '/ˈævərɪdʒɪz/' },
      ],
    },
  });
});

test('AI pronunciation rejects fenced JSON mixed with prose', async () => {
  const { service } = makeService(new Map(), {
    makeAIRequest: async () => ({
      choices: [{ message: { content: 'Here is the result:\n```json\n{"surface":"averages","ipaUS":"/us/","ipaUK":"/uk/"}\n```' } }],
    }),
  });
  await service.init();

  const result = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-fenced-prose', surface: 'averages', sourceLanguage: 'en',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'ai-pron-fenced-prose', status: 'ERROR',
  });
});

test('AI pronunciation rejects structural markup in bare IPA fields', async () => {
  const { service } = makeService(new Map(), {
    makeAIRequest: async () => ({
      choices: [{ message: { content: '{"surface":"averages","ipaUS":"<img src=x>","ipaUK":"ˈævərɪdʒɪz"}' } }],
    }),
  });
  await service.init();

  const result = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-unsafe-bare', surface: 'averages', sourceLanguage: 'en',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'ai-pron-unsafe-bare', status: 'ERROR',
  });
});

test('AI pronunciation fails closed for mismatched or inapplicable surfaces', async () => {
  let calls = 0;
  const { service } = makeService(new Map(), {
    makeAIRequest: async () => {
      calls += 1;
      return {
        choices: [{ message: { content: '{"surface":"price","ipaUS":"/praɪs/","ipaUK":"/praɪs/"}' } }],
      };
    },
  });
  await service.init();

  const mismatch = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-mismatch', surface: 'pricing', sourceLanguage: 'en',
  });
  const nonEnglish = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-non-en', surface: 'pricing', sourceLanguage: 'de',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(mismatch)), {
    requestToken: 'ai-pron-mismatch', status: 'ERROR',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(nonEnglish)), {
    requestToken: 'ai-pron-non-en', status: 'MISS',
  });
  assert.equal(calls, 1);
});

test('AI pronunciation cache keeps case-distinct exact surfaces separate', async () => {
  const calls = [];
  const { service } = makeService(new Map(), {
    makeAIRequest: async request => {
      calls.push(request.word);
      const ipa = request.word === 'US' ? '/letters/' : '/pronoun/';
      return {
        choices: [{ message: { content: JSON.stringify({
          surface: request.word, ipaUS: ipa, ipaUK: ipa,
        }) } }],
      };
    },
  });
  await service.init();

  const acronym = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-US', surface: 'US', sourceLanguage: 'en',
  });
  const pronoun = await service.lookupAIPronunciation({
    requestToken: 'ai-pron-us', surface: 'us', sourceLanguage: 'en',
  });

  assert.equal(acronym.entry.pronunciations[0].ipa, '/letters/');
  assert.equal(pronoun.entry.pronunciations[0].ipa, '/pronoun/');
  assert.deepEqual(calls, ['US', 'us']);
});

test('first cross-target pronunciation lookup waits for the bundled source to become ready', async () => {
  const rows = new Map([['book', [{
    headword: 'book', lemma: '', meanings_json: '["book"]', pos_json: '["noun"]', ipa: '/bʊk/',
    audio_json: '[]', forms_json: '[]',
  }]]]);
  const catalog = [{
    active: true, pronunciationSource: true, dictionaryID: 'custom-en-zh',
    sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: 'assets/dictionaries/custom-en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const { service, files } = makeService(rows, { mode: 'default', catalog, defaultExists: false });
  await service.init();
  let ensureCalls = 0;
  service.ensureDefaultDictionary = async () => {
    ensureCalls++;
    files.defaultExists = true;
    return { mode: 'default', status: 'READY' };
  };

  const result = await service.lookupPronunciation({
    requestToken: 'pron-first-click', surface: 'book', sourceLanguage: 'en', targetLanguage: 'fr',
  });

  assert.equal(ensureCalls, 1);
  assert.equal(result.status, 'HIT');
  assert.equal(result.entry.ipa, '/bʊk/');
});

test('custom pronunciation lookup never mixes in a default dictionary', async () => {
  const rows = new Map([['book', [{
    headword: 'book', lemma: '', meanings_json: '["book"]', pos_json: '["noun"]', ipa: '',
    audio_json: '[]', forms_json: '[]',
  }]]]);
  const catalog = [{
    active: true, pronunciationSource: true, dictionaryID: 'custom-en-zh',
    sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: 'assets/dictionaries/custom-en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const { service, dictionaryDBPaths } = makeService(rows, { mode: 'custom', catalog });
  await service.init();

  const result = await service.lookupPronunciation({
    requestToken: 'pron-custom-miss', surface: 'book', sourceLanguage: 'en', targetLanguage: 'ja',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requestToken: 'pron-custom-miss', status: 'MISS',
  });
  assert.equal(dictionaryDBPaths.filter(value => value === CUSTOM_PATH).length >= 1, true);
  assert.equal(dictionaryDBPaths.some(value => value.endsWith('/custom-en-zh.lkdict')), false);
});

test('an unusable custom file safely falls back to the default pronunciation source', async () => {
  const rows = new Map([['book', [{
    headword: 'book', lemma: '', meanings_json: '["book"]', pos_json: '["noun"]', ipa: '/bʊk/',
    audio_json: '[]', forms_json: '[]',
  }]]]);
  const catalog = [{
    active: true, pronunciationSource: true, dictionaryID: 'custom-en-zh',
    sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: 'assets/dictionaries/custom-en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const { service, dictionaryDBPaths } = makeService(rows, {
    mode: 'custom', catalog, customExists: false, defaultExists: true,
  });
  await service.init();

  const result = await service.lookupPronunciation({
    requestToken: 'pron-custom-unusable', surface: 'book', sourceLanguage: 'en', targetLanguage: 'de',
  });

  assert.equal(result.status, 'HIT');
  assert.equal(result.entry.ipa, '/bʊk/');
  assert.equal(dictionaryDBPaths.some(value => value.endsWith('/custom-en-zh.lkdict')), true);
});
test('surface audio selects the first valid regional URL and preserves its source attribution', async () => {
  const rows = new Map([['worked', [{
    headword: 'worked', lemma: 'work', meanings_json: '["工作过"]',
    pos_json: '["v"]', ipa: '/wɝkt/',
    audio_json: JSON.stringify([
      { ipa: '/wɝkt/', region: 'US' },
      {
        ipa: '/wɜːkt/', region: 'UK',
        url: 'https://upload.wikimedia.org/wikipedia/commons/worked.ogg',
        sourceURL: 'https://commons.wikimedia.org/wiki/File:worked.ogg',
      },
    ]),
    forms_json: '[]',
  }]]]);
  const { service } = makeService(rows);
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'regional-audio', surface: 'worked', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.deepEqual(JSON.parse(JSON.stringify(result.entry.audio)), {
    url: 'https://upload.wikimedia.org/wikipedia/commons/worked.ogg',
    region: 'UK',
    sourceURL: 'https://commons.wikimedia.org/wiki/File:worked.ogg',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.entry.pronunciations)), [
    { ipa: '/wɝkt/', region: 'US' },
    {
      ipa: '/wɜːkt/', region: 'UK',
      url: 'https://upload.wikimedia.org/wikipedia/commons/worked.ogg',
      sourceURL: 'https://commons.wikimedia.org/wiki/File:worked.ogg',
    },
  ]);
});
test('default surface audio prefers US over UK and preserves audio-only regional records', async () => {
  const rows = new Map([['colour', [{
    headword: 'colour', lemma: '', meanings_json: '["颜色"]',
    pos_json: '["n"]', ipa: '',
    audio_json: JSON.stringify([
      { region: 'UK', url: 'https://audio.example/colour-uk.mp3' },
      { region: 'US', ipa: '/ˈkʌlər/', url: 'https://audio.example/color-us.mp3' },
    ]),
    forms_json: '[]',
  }]]]);
  const { service } = makeService(rows);
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'audio-priority', surface: 'colour', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.deepEqual(JSON.parse(JSON.stringify(result.entry.audio)), {
    url: 'https://audio.example/color-us.mp3', region: 'US',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.entry.pronunciations)), [
    { region: 'UK', url: 'https://audio.example/colour-uk.mp3' },
    { ipa: '/ˈkʌlər/', region: 'US', url: 'https://audio.example/color-us.mp3' },
  ]);
});
test('an installed default dictionary is hash and metadata verified before indexed lookup', async () => {
  const catalog = [{
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["学习"]',
    pos_json: '["v"]', ipa: '/ˈstʌdi/', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, lookupCalls } = makeService(rows, { catalog, mode: 'default' });
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'token-3', surface: 'Study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.equal(result.entry.surface, 'Study');
  assert.equal(result.entry.dictionaryForm, 'study');
  assert.deepEqual(lookupCalls.map(call => call.params), [['study']]);
});
test('an unusable selected custom dictionary safely falls back to the exact default pair', async () => {
  const catalog = [{
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const rows = new Map([['fallback', [{
    headword: 'fallback', lemma: '', meanings_json: '["后备"]',
    pos_json: '["n"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service } = makeService(rows, { catalog, customExists: false });
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'token-4', surface: 'fallback', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.deepEqual(JSON.parse(JSON.stringify(result.entry.meanings)), ['后备']);
});
test('a verified HIT cache reuses entry data but never an old request token or surface', async () => {
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["学习"]',
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, lookupCalls, cacheWrites, validationCalls, sha256Calls } = makeService(rows);
  await service.init();

  const first = await service.lookupDictionary({
    requestToken: 'old-token', surface: 'Study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  const second = await service.lookupDictionary({
    requestToken: 'new-token', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(first.status, 'HIT');
  assert.equal(second.status, 'HIT');
  assert.equal(second.requestToken, 'new-token');
  assert.equal(second.entry.surface, 'study');
  assert.equal(lookupCalls.length, 1);
  assert.equal(cacheWrites.length, 1);
  assert.equal(validationCalls.length, 1);
  assert.equal(sha256Calls.length, 1);
  assert.equal(cacheWrites[0][0].startsWith('custom-en-zh:'), true);
  assert.equal(cacheWrites[0][0].endsWith(':entry-v2'), true);
  assert.equal(cacheWrites[0][1], 'en');
  assert.equal(cacheWrites[0][2], 'zh-cn');
  assert.equal(cacheWrites[0][3], 'study');
  assert.equal(cacheWrites[0][4].includes('old-token'), false);
  assert.equal(cacheWrites[0][4].includes('"surface"'), false);
});
test('shutdown waits for an owned lookup before closing the shared cache', async () => {
  let releaseQuery;
  const queryGate = new Promise(resolve => { releaseQuery = resolve; });
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["学习"]',
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, lookupCalls, cacheClosed } = makeService(rows, { queryGate });
  await service.init();

  const pendingLookup = service.lookupDictionary({
    requestToken: 'token-5', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  while (!lookupCalls.length) await Promise.resolve();
  let shutdownDone = false;
  const pendingShutdown = service.shutdown().then(() => { shutdownDone = true; });
  for (let attempt = 0; attempt < 10 && !shutdownDone; attempt++) await Promise.resolve();

  assert.equal(shutdownDone, false);
  assert.equal(cacheClosed.value, false);
  releaseQuery();
  const [result] = await Promise.all([pendingLookup, pendingShutdown]);

  assert.equal(result.status, 'HIT');
  assert.equal(cacheClosed.value, true);
});
test('a missing default dictionary starts an owned download without delaying UNAVAILABLE', async () => {
  let releaseDownload;
  const downloadGate = new Promise(resolve => { releaseDownload = resolve; });
  const catalog = [{
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const { service, downloads } = makeService(new Map(), {
    catalog, mode: 'default', defaultExists: false, downloadGate,
  });
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'token-6', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  for (let attempt = 0; attempt < 10 && !downloads.length; attempt++) await Promise.resolve();

  try {
    assert.equal(result.requestToken, 'token-6');
    assert.equal(result.status, 'UNAVAILABLE');
    assert.deepEqual(downloads, [catalog[0].url]);
  } finally {
    releaseDownload(Buffer.from('payload'));
    await service.shutdown();
  }
});
test('a valid custom MISS neither splits an ordinary hyphen nor falls back to default', async () => {
  const catalog = [{
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const { service, lookupCalls, downloads, dictionaryDBPaths } = makeService(new Map(), { catalog });
  await service.init();

  const result = await service.lookupDictionary({
    requestToken: 'token-7', surface: 'peer-on-peer', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'MISS');
  assert.deepEqual(lookupCalls.map(call => call.params), [['peer-on-peer']]);
  assert.deepEqual(downloads, []);
  assert.equal(dictionaryDBPaths.every(dbPath => dbPath === CUSTOM_PATH), true);
});
test('a temporary dictionary error is not cached and a later request can retry', async () => {
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["\u5b66\u4e60"]',
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, lookupCalls, cacheWrites } = makeService(rows, { queryFailures: 1 });
  await service.init();

  const first = await service.lookupDictionary({
    requestToken: 'error-token', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  const second = await service.lookupDictionary({
    requestToken: 'retry-token', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(first)), { requestToken: 'error-token', status: 'ERROR' });
  assert.equal(second.status, 'HIT');
  assert.equal(second.requestToken, 'retry-token');
  assert.equal(lookupCalls.length, 2);
  assert.equal(cacheWrites.length, 1);
});
test('deleting a verified custom dictionary invalidates the session record and falls back to default', async () => {
  const catalog = [{
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["study"]',
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, files, dictionaryDBPaths } = makeService(rows, { catalog });
  await service.init();
  await service.lookupDictionary({
    requestToken: 'custom-present', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  files.customExists = false;

  const result = await service.lookupDictionary({
    requestToken: 'custom-deleted', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.equal(dictionaryDBPaths.some(dbPath => dbPath !== CUSTOM_PATH && dbPath.endsWith('/custom-en-zh.lkdict')), true);
});

test('deleting a verified default dictionary invalidates the session record and starts a replacement download', async () => {
  let releaseDownload;
  const downloadGate = new Promise(resolve => { releaseDownload = resolve; });
  const catalog = [{
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["study"]',
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, files, downloads } = makeService(rows, { catalog, mode: 'default', downloadGate });
  await service.init();
  await service.lookupDictionary({
    requestToken: 'default-present', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  files.defaultExists = false;

  const result = await service.lookupDictionary({
    requestToken: 'default-deleted', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  for (let attempt = 0; attempt < 10 && downloads.length === 0; attempt++) await Promise.resolve();

  try {
    assert.equal(result.status, 'UNAVAILABLE');
    assert.deepEqual(downloads, [catalog[0].url]);
  } finally {
    releaseDownload(Buffer.from('payload'));
    await service.shutdown();
  }
});

test('a changed file identity invalidates the session verification before cache reuse', async () => {
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["study"]',
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service, files, validationCalls, sha256Calls } = makeService(rows);
  await service.init();
  await service.lookupDictionary({
    requestToken: 'identity-1', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  files.customVersion += 1;

  const result = await service.lookupDictionary({
    requestToken: 'identity-2', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });

  assert.equal(result.status, 'HIT');
  assert.equal(validationCalls.length, 2);
  assert.equal(sha256Calls.length, 2);
});

test('status without an explicit pair uses the latest exact pair already observed during reader startup', async () => {
  const catalog = [{
    dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict',
    sha256: 'a'.repeat(64), size: 100,
  }];
  const rows = new Map([['study', [{
    headword: 'study', lemma: '', meanings_json: '["study"]',
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }]]]);
  const { service } = makeService(rows, { catalog, mode: 'default' });
  await service.init();
  await service.ensureDefaultDictionary('en', 'zh-CN');

  const status = await service.getDictionaryStatus();

  assert.equal(status.status, 'READY');
  assert.equal(status.sourceLanguage, 'en');
  assert.equal(status.targetLanguage, 'zh-CN');
});
