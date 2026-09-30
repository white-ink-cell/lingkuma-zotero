import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD_SHA256 = 'a'.repeat(64);
const OTHER_SHA256 = 'b'.repeat(64);

const loadLookup = () => {
  const context = vm.createContext({ console, Error, JSON, Object, Map, Set, Promise, AbortController, URL });
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8'),
    context,
    { filename: 'adapter/lookup.js' },
  );
  return context.LingKumaLookupService;
};

const makeHarness = ({ catalog = [], files = {}, dictionaries = {}, downloads = {}, bundles = {}, makeDirectory = async () => {}, copyFile = null, copyBundled = null, moveFile = null, queryFile = null, cacheDBs = [] } = {}) => {
  const LingKumaLookupService = loadLookup();
  const disk = new Map(Object.entries(files).map(([name, value]) => [name, String(value)]));
  const dbMetadata = new Map(Object.entries(dictionaries));
  const calls = { downloads: [], downloadSignals: [], bundleCopies: [], moves: [], copies: [], removes: [], dbSQL: [], dbPaths: [], cacheCloses: 0 };
  const storage = {};
  const state = {
    storageGet(defaults) {
      return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [
        key,
        Object.prototype.hasOwnProperty.call(storage, key) ? structuredClone(storage[key]) : structuredClone(value),
      ]));
    },
    storageSet(values) { Object.assign(storage, structuredClone(values)); },
    exportData() { return { format: 'lingkuma-zotero-export', words: { study: { status: '2' } } }; },
  };
  const normalize = value => String(value).replaceAll('\\', '/');
  const file = {
    async exists(name) { return disk.has(normalize(name)); },
    async stat(name) {
      name = normalize(name);
      if (!disk.has(name)) throw new Error(`missing stat input: ${name}`);
      return { type: 'regular', size: Buffer.byteLength(disk.get(name)), lastModified: 1, creationTime: 1 };
    },
    async makeDirectory(name) { return makeDirectory(normalize(name)); },
    async copy(source, destination) {
      source = normalize(source); destination = normalize(destination);
      calls.copies.push([source, destination]);
      if (copyFile) await copyFile(source, destination);
      if (!disk.has(source)) throw new Error(`missing source: ${source}`);
      disk.set(destination, disk.get(source));
      if (dbMetadata.has(source)) dbMetadata.set(destination, structuredClone(dbMetadata.get(source)));
    },
    async move(source, destination) {
      source = normalize(source); destination = normalize(destination);
      if (!disk.has(source)) throw new Error(`missing source: ${source}`);
      calls.moves.push([source, destination]);
      if (moveFile) await moveFile(source, destination);
      disk.set(destination, disk.get(source));
      disk.delete(source);
      if (dbMetadata.has(source)) {
        dbMetadata.set(destination, dbMetadata.get(source));
        dbMetadata.delete(source);
      }
    },
    async remove(name) {
      name = normalize(name); calls.removes.push(name); disk.delete(name); dbMetadata.delete(name);
    },
    async write(name, bytes) { disk.set(normalize(name), Buffer.from(bytes).toString('utf8')); },
  };
  const dbFactory = name => {
    name = normalize(name);
    if (name.endsWith('/lookup-cache.sqlite')) {
      if (cacheDBs.length) return cacheDBs.shift();
      return {
        async valueQueryAsync(sql) { calls.dbSQL.push(sql); return null; },
        async queryAsync(sql) {
          calls.dbSQL.push(sql);
          if (/PRAGMA table_info\(lookup_cache\)/i.test(sql)) {
            return [
              { name: 'dictionary_identity', pk: 1 },
              { name: 'source_language', pk: 2 },
              { name: 'target_language', pk: 3 },
              { name: 'normalized_term', pk: 4 },
              { name: 'result_json', pk: 0 },
            ];
          }
          return [];
        },
        async executeTransaction(fn) { return fn(); },
        async closeDatabase() { calls.cacheCloses++; },
      };
    }
    calls.dbPaths.push(name);
    const metadata = dbMetadata.get(name);
    if (!metadata) throw new Error(`not a dictionary: ${name}`);
    return {
      async valueQueryAsync(sql) {
        calls.dbSQL.push(sql);
        if (/quick_check/i.test(sql)) return metadata.quickCheck ?? 'ok';
        if (/COUNT\(\*\).*sqlite_master.*table/i.test(sql)) return metadata.hasTables === false ? 0 : 2;
        if (/COUNT\(\*\).*sqlite_master.*index/i.test(sql)) {
          if (/tbl_name\s*=\s*'entries'/i.test(sql) && metadata.indexTable && metadata.indexTable !== 'entries') return 0;
          return metadata.hasIndex === false ? 0 : 1;
        }
        if (/meanings_json/i.test(sql)) return metadata.sampleMeanings ?? '["meaning"]';
        return null;
      },
      async queryAsync(sql, params) {
        calls.dbSQL.push(sql);
        if (/SELECT key, value FROM metadata/i.test(sql)) {
          return Object.entries(metadata.values || {}).map(([key, value]) => ({ key, value: String(value) }));
        }
        if (/PRAGMA table_info\(metadata\)/i.test(sql)) {
          return (metadata.metadataColumns || ['key', 'value']).map((name, cid) => ({ cid, name }));
        }
        if (/PRAGMA table_info\(entries\)/i.test(sql)) {
          return (metadata.entryColumns || [
            'headword_norm', 'headword', 'meanings_json', 'pos_json', 'ipa', 'audio_json', 'lemma', 'forms_json',
          ]).map((name, cid) => ({ cid, name }));
        }
        if (/PRAGMA index_info\('entries_headword_norm'\)/i.test(sql)) {
          return (metadata.indexColumns || ['headword_norm']).map((name, seqno) => ({ seqno, name }));
        }
        if (/FROM entries WHERE headword_norm = \?/i.test(sql)) {
          if (queryFile) await queryFile(name, params?.[0]);
          return structuredClone(metadata.rows?.[params?.[0]] || []);
        }
        return [];
      },
      async executeTransaction(fn) { return fn(); },
      async closeDatabase() {},
    };
  };
  const dependencies = {
    dataRoot: '/profile/lingkuma-zotero',
    join: (...parts) => normalize(parts.join('/')),
    file,
    dbFactory,
    async sha256File(name) {
      const value = disk.get(normalize(name));
      if (value === undefined) throw new Error('missing hash input');
      return value === 'tampered' ? 'c'.repeat(64) : PAYLOAD_SHA256;
    },
    async download(url, signal) {
      calls.downloads.push(url);
      calls.downloadSignals.push(signal);
      let value = downloads[url];
      if (typeof value === 'function') value = await value();
      else value = await value;
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error(`unexpected URL: ${url}`);
      return Buffer.from(value);
    },
    async copyBundledToFile(relativePath, destination, signal) {
      relativePath = normalize(relativePath); destination = normalize(destination);
      calls.bundleCopies.push([relativePath, destination]);
      if (copyBundled) await copyBundled(relativePath, destination, signal);
      if (signal?.aborted) throw new Error('bundled copy aborted');
      if (!(relativePath in bundles)) throw new Error(`unexpected bundle path: ${relativePath}`);
      disk.set(destination, String(bundles[relativePath]));
    },
    now: () => '2026-09-29T00:00:00.000Z',
  };
  const service = new LingKumaLookupService({ state, catalog, dependencies });
  return { service, state, storage, disk, dbMetadata, calls };
};

const validMetadata = (overrides = {}) => ({
  format: 'lingkuma-dictionary',
  schemaVersion: '1',
  dictionaryID: 'en-zh-test',
  sourceLanguage: 'en',
  targetLanguage: 'zh-CN',
  entryCount: '1',
  dataSourceName: 'Fixture',
  dataSourceURL: 'https://source.example/',
  dataSourceSnapshot: '2026-09-01',
  dataLicense: 'CC BY-SA 4.0',
  attribution: 'Fixture authors',
  ...overrides,
});

test('default catalog is exact-pair only and an absent pair never starts a download', async () => {
  const { service, calls } = makeHarness({ catalog: [{
    dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict', sha256: PAYLOAD_SHA256, size: 7,
  }] });
  await service.init();

  const status = await service.ensureDefaultDictionary('de', 'zh-CN');

  assert.equal(status.status, 'UNAVAILABLE');
  assert.equal(status.reason, 'NO_CATALOG_PAIR');
  assert.deepEqual(calls.downloads, []);
});

test('verified default download validates the staged database before atomic activation', async () => {
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  const staged = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict.part';
  const final = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict';
  const { service, disk, dbMetadata, calls } = makeHarness({
    catalog: [{ dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN', url, sha256: PAYLOAD_SHA256, size: 7 }],
    downloads: { [url]: 'payload' },
  });
  dbMetadata.set(staged, { values: validMetadata() });
  await service.init();

  const status = await service.ensureDefaultDictionary('en', 'zh-CN');

  assert.equal(status.status, 'READY');
  assert.equal(status.dictionaryID, 'en-zh-test');
  assert.equal(disk.get(final), 'payload');
  assert.equal(disk.has(staged), false);
  assert.deepEqual(calls.moves, [[staged, final]]);
});

test('verified bundled default is seeded locally without a network request', async () => {
  const bundledPath = 'assets/dictionaries/kaikki-en-zh-cn-2026-09.lkdict';
  const staged = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict.part';
  const final = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict';
  const { service, disk, dbMetadata, calls } = makeHarness({
    catalog: [{
      dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN',
      bundledPath, sha256: PAYLOAD_SHA256, size: 7,
    }],
    bundles: { [bundledPath]: 'payload' },
  });
  dbMetadata.set(staged, { values: validMetadata() });
  await service.init();

  const status = await service.ensureDefaultDictionary('en', 'zh-CN');

  assert.equal(status.status, 'READY');
  assert.equal(disk.get(final), 'payload');
  assert.deepEqual(calls.bundleCopies, [[bundledPath, staged]]);
  assert.deepEqual(calls.downloads, []);
});

test('bundled default size mismatch is rejected before activation', async () => {
  const bundledPath = 'assets/dictionaries/kaikki-en-zh-cn-2026-09.lkdict';
  const staged = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict.part';
  const final = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict';
  const { service, disk, dbMetadata, calls } = makeHarness({
    catalog: [{
      dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN',
      bundledPath, sha256: PAYLOAD_SHA256, size: 8,
    }],
    bundles: { [bundledPath]: 'payload' },
  });
  dbMetadata.set(staged, { values: validMetadata() });
  await service.init();

  const status = await service.ensureDefaultDictionary('en', 'zh-CN');

  assert.equal(status.status, 'ERROR');
  assert.equal(status.reason, 'SIZE_MISMATCH');
  assert.equal(disk.has(final), false);
  assert.deepEqual(calls.moves, []);
});

test('SHA mismatch removes only the staged file and preserves an installed dictionary', async () => {
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  const final = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict';
  const staged = `${final}.part`;
  const { service, disk, dbMetadata, calls } = makeHarness({
    catalog: [{ dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN', url, sha256: OTHER_SHA256, size: 7 }],
    files: { [final]: 'old-valid' },
    dictionaries: { [final]: { values: validMetadata() } },
    downloads: { [url]: 'tampered' },
  });
  dbMetadata.set(staged, { values: validMetadata() });
  await service.init();

  const status = await service.ensureDefaultDictionary('en', 'zh-CN', { refresh: true });

  assert.equal(status.status, 'ERROR');
  assert.equal(status.reason, 'SHA256_MISMATCH');
  assert.equal(disk.get(final), 'old-valid');
  assert.equal(disk.has(staged), false);
  assert.deepEqual(calls.moves, []);
});

test('interrupted download is contained and leaves the previous active file intact', async () => {
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  const final = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict';
  const { service, disk } = makeHarness({
    catalog: [{ dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN', url, sha256: OTHER_SHA256, size: 7 }],
    files: { [final]: 'old-valid' },
    dictionaries: { [final]: { values: validMetadata() } },
    downloads: { [url]: new Error('network interrupted') },
  });
  await service.init();

  const status = await service.ensureDefaultDictionary('en', 'zh-CN', { refresh: true });

  assert.equal(status.status, 'ERROR');
  assert.equal(status.reason, 'DOWNLOAD_FAILED');
  assert.equal(disk.get(final), 'old-valid');
  assert.equal(disk.has(`${final}.part`), false);
});

test('custom import replaces atomically only after validation and never persists source paths', async () => {
  const custom = '/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict';
  const staged = `${custom}.part`;
  const source = '/chosen/new.lkdict';
  const badSource = '/chosen/bad.lkdict';
  const { service, storage, disk, dbMetadata } = makeHarness({
    files: { [custom]: 'old-custom', [source]: 'new-custom', [badSource]: 'bad-custom' },
    dictionaries: {
      [custom]: { values: validMetadata({ dictionaryID: 'old-custom' }) },
      [source]: { values: validMetadata({ dictionaryID: 'new-custom' }) },
      [badSource]: { values: validMetadata({ dictionaryID: 'bad-custom', format: 'wrong' }) },
    },
  });
  await service.init();
  await service.importCustomDictionary(source);

  assert.equal(disk.get(custom), 'new-custom');
  assert.equal(storage.dictionaryConfig.mode, 'custom');
  assert.equal(storage.dictionaryConfig.custom.dictionaryID, 'new-custom');
  assert.equal(JSON.stringify(storage).includes('/chosen/'), false);

  await assert.rejects(service.importCustomDictionary(badSource), /format/i);
  assert.equal(disk.get(custom), 'new-custom');
  assert.equal(disk.has(staged), false);
  assert.equal(storage.dictionaryConfig.custom.dictionaryID, 'new-custom');
});

test('reader pair ensure keeps a valid selected custom dictionary authoritative', async () => {
  const custom = '/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict';
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  const { service, storage, calls } = makeHarness({
    catalog: [{ dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN', url, sha256: PAYLOAD_SHA256, size: 7 }],
    files: { [custom]: 'custom-payload' },
    dictionaries: { [custom]: { values: validMetadata({ dictionaryID: 'custom-en-zh' }) } },
    downloads: { [url]: 'payload' },
  });
  storage.dictionaryConfig = {
    mode: 'custom',
    custom: { dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN', sha256: PAYLOAD_SHA256 },
  };
  await service.init();

  const status = await service.ensureApplicableDefaultDictionary('en', 'zh-CN');

  assert.equal(status.mode, 'custom');
  assert.equal(status.status, 'READY');
  assert.deepEqual(calls.downloads, []);
});

test('reader pair ensure downloads the default only when selected custom is unusable', async () => {
  const staged = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict.part';
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  const { service, storage, calls } = makeHarness({
    catalog: [{ dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN', url, sha256: PAYLOAD_SHA256, size: 7 }],
    dictionaries: { [staged]: { values: validMetadata() } },
    downloads: { [url]: 'payload' },
  });
  storage.dictionaryConfig = {
    mode: 'custom',
    custom: { dictionaryID: 'missing-custom', sourceLanguage: 'en', targetLanguage: 'zh-CN' },
  };
  await service.init();

  const status = await service.ensureApplicableDefaultDictionary('en', 'zh-CN');

  assert.equal(status.mode, 'default');
  assert.equal(status.status, 'READY');
  assert.deepEqual(calls.downloads, [url]);
  assert.equal(storage.dictionaryConfig.mode, 'custom');
});
test('missing selected custom dictionary reports safe default fallback without erasing selection', async () => {
  const { service, storage } = makeHarness({ catalog: [{
    dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict', sha256: PAYLOAD_SHA256, size: 7,
  }] });
  storage.dictionaryConfig = {
    mode: 'custom',
    custom: { dictionaryID: 'custom-en-zh', sourceLanguage: 'en', targetLanguage: 'zh-CN' },
  };
  await service.init();

  const status = await service.getDictionaryStatus({ sourceLanguage: 'en', targetLanguage: 'zh-CN' });

  assert.equal(status.mode, 'custom');
  assert.equal(status.status, 'UNUSABLE');
  assert.equal(status.fallback, 'default');
  assert.equal(storage.dictionaryConfig.mode, 'custom');
  assert.equal(JSON.stringify(status).includes('/profile/'), false);
});

test('lookup cache is a separate rebuildable database and learning export stays dictionary-free', async () => {
  const { service, state, calls } = makeHarness();
  await service.init();

  assert.ok(calls.dbSQL.some(sql => /CREATE TABLE IF NOT EXISTS lookup_cache/i.test(sql)));
  assert.deepEqual(state.exportData(), {
    format: 'lingkuma-zotero-export',
    words: { study: { status: '2' } },
  });
  assert.equal(JSON.stringify(state.exportData()).includes('dictionaryConfig'), false);
  assert.equal(JSON.stringify(state.exportData()).includes('.lkdict'), false);
});
test('concurrent ensure calls share one default download and one activation', async () => {
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  const staged = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict.part';
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { service, dbMetadata, calls } = makeHarness({
    catalog: [{ dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN', url, sha256: PAYLOAD_SHA256, size: 7 }],
    downloads: { [url]: () => gate },
  });
  dbMetadata.set(staged, { values: validMetadata() });
  await service.init();

  const first = service.ensureDefaultDictionary('en', 'zh-CN');
  const second = service.ensureDefaultDictionary('EN', 'zh_cn');
  await Promise.resolve();
  release('payload');
  const [firstStatus, secondStatus] = await Promise.all([first, second]);

  assert.equal(firstStatus.status, 'READY');
  assert.equal(secondStatus.status, 'READY');
  assert.equal(calls.downloads.length, 1);
  assert.equal(calls.moves.length, 1);
});

test('shutdown aborts an owned download, waits for it, and closes the cache database', async () => {
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { service, calls } = makeHarness({
    catalog: [{ dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN', url, sha256: PAYLOAD_SHA256, size: 7 }],
    downloads: { [url]: () => gate },
  });
  await service.init();
  const pendingEnsure = service.ensureDefaultDictionary('en', 'zh-CN');
  for (let attempt = 0; attempt < 10 && calls.downloadSignals.length === 0; attempt++) {
    await Promise.resolve();
  }

  const pendingShutdown = service.shutdown();
  assert.equal(calls.downloadSignals.length, 1);
  assert.equal(calls.downloadSignals[0].aborted, true);
  await Promise.resolve();
  release('payload');
  const [status] = await Promise.all([pendingEnsure, pendingShutdown]);

  assert.equal(status.status, 'ERROR');
  assert.equal(status.reason, 'CANCELLED');
  assert.equal(calls.cacheCloses, 1);
});
test('shutdown racing a pending init cannot resurrect the cache or initialized state', async () => {
  let releaseDirectory;
  const directoryGate = new Promise(resolve => { releaseDirectory = resolve; });
  const { service, calls } = makeHarness({ makeDirectory: () => directoryGate });

  const pendingInit = service.init();
  const pendingShutdown = service.shutdown();
  releaseDirectory();
  await Promise.all([pendingInit, pendingShutdown]);

  assert.equal(service.initialized, false);
  assert.equal(service.cacheDB, null);
  assert.equal(calls.cacheCloses, 0);
});
test('production downloader streams to the staged file through Zotero cancellation API', () => {
  const source = fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8');
  const downloader = source.match(/async downloadToFile\([\s\S]*?\n    },\n    async copyBundledToFile\(/)?.[0] || '';

  assert.match(downloader, /Zotero\.HTTP\.download\(/);
  assert.match(downloader, /cancellerReceiver/);
  assert.match(downloader, /signal\?\.addEventListener\("abort"/);
  assert.doesNotMatch(downloader, /Zotero\.HTTP\.request\(/);
});
test('production bundled seeder streams from the plugin root into the staged file', () => {
  const lookupSource = fs.readFileSync(path.join(ROOT, 'adapter', 'lookup.js'), 'utf8');
  const mainSource = fs.readFileSync(path.join(ROOT, 'adapter', 'main.js'), 'utf8');

  assert.match(lookupSource, /Zotero\.File\.download\(rootURI \+ relativePath, path\)/);
  assert.match(mainSource, /new LingKumaLookupService\(\{ state: this\.state, rootURI \}\)/);
});
test('production dictionary catalog exposes only the verified bundled default asset', () => {
  const context = vm.createContext({ Object });
  const catalogPath = path.join(ROOT, 'adapter', 'dictionary_catalog.js');
  const source = fs.readFileSync(catalogPath, 'utf8');
  vm.runInContext(source, context, { filename: catalogPath });

  assert.deepEqual(JSON.parse(JSON.stringify(context.LK_DICTIONARY_CATALOG)), [{
    active: true,
    pronunciationSource: true,
    dictionaryID: 'kaikki-en-zh-cn-2026-09-02',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    bundledPath: 'assets/dictionaries/kaikki-en-zh-cn-2026-09.lkdict',
    sha256: '17b2869b9e4a8e323e95645db266f0393a05954847d0a07718d3a6546ef05690',
    size: 65585152,
  }]);
  assert.doesNotMatch(source, /example\.invalid|localhost|\/raw\/|\/main\//i);
});
test('corrupt plugin-owned cache is removed with sidecars and rebuilt without blocking startup', async () => {
  let badClosed = 0;
  const badCache = {
    async queryAsync() { throw new Error('database disk image is malformed'); },
    async closeDatabase() { badClosed++; },
  };
  const goodCache = {
    async queryAsync(sql) {
      if (/PRAGMA table_info\(lookup_cache\)/i.test(sql)) {
        return [
          { name: 'dictionary_identity', pk: 1 },
          { name: 'source_language', pk: 2 },
          { name: 'target_language', pk: 3 },
          { name: 'normalized_term', pk: 4 },
          { name: 'result_json', pk: 0 },
        ];
      }
    },
    async closeDatabase() {},
  };
  const { service, calls } = makeHarness({ cacheDBs: [badCache, goodCache] });

  await service.init();

  assert.equal(service.initialized, true);
  assert.equal(service.cacheDB, goodCache);
  assert.equal(badClosed, 1);
  assert.deepEqual(calls.removes, [
    '/profile/lingkuma-zotero/lookup-cache.sqlite',
    '/profile/lingkuma-zotero/lookup-cache.sqlite-wal',
    '/profile/lingkuma-zotero/lookup-cache.sqlite-shm',
  ]);
});

test('dictionary validation rejects a correctly named index built on the wrong column', async () => {
  const source = '/chosen/wrong-index.lkdict';
  const { service } = makeHarness({
    files: { [source]: 'wrong-index' },
    dictionaries: { [source]: { values: validMetadata(), indexColumns: ['headword'] } },
  });
  await service.init();

  await assert.rejects(service.importCustomDictionary(source), /index|schema/i);
});

test('custom imports are ordered and cannot race through the shared staging path', async () => {
  const first = '/chosen/first.lkdict';
  const second = '/chosen/second.lkdict';
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const { service, storage, disk, calls } = makeHarness({
    files: { [first]: 'first-custom', [second]: 'second-custom' },
    dictionaries: {
      [first]: { values: validMetadata({ dictionaryID: 'first-custom' }) },
      [second]: { values: validMetadata({ dictionaryID: 'second-custom' }) },
    },
    copyFile: source => source === first ? firstGate : undefined,
  });
  await service.init();

  const firstImport = service.importCustomDictionary(first);
  const secondImport = service.importCustomDictionary(second);
  for (let attempt = 0; attempt < 10 && calls.copies.length === 0; attempt++) await Promise.resolve();
  assert.equal(calls.copies.length, 1);
  releaseFirst();
  await Promise.all([firstImport, secondImport]);

  assert.equal(disk.get('/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict'), 'second-custom');
  assert.equal(storage.dictionaryConfig.custom.dictionaryID, 'second-custom');
  assert.deepEqual(calls.copies.map(([source]) => source), [first, second]);
});

test('shutdown waits for an active custom import and prevents post-stop activation', async () => {
  const source = '/chosen/slow.lkdict';
  let releaseCopy;
  const copyGate = new Promise(resolve => { releaseCopy = resolve; });
  const { service, storage, calls } = makeHarness({
    files: { [source]: 'slow-custom' },
    dictionaries: { [source]: { values: validMetadata({ dictionaryID: 'slow-custom' }) } },
    copyFile: () => copyGate,
  });
  await service.init();
  const pendingImport = service.importCustomDictionary(source);
  for (let attempt = 0; attempt < 10 && calls.copies.length === 0; attempt++) await Promise.resolve();
  let shutdownDone = false;
  const pendingShutdown = service.shutdown().then(() => { shutdownDone = true; });
  await Promise.resolve();

  assert.equal(shutdownDone, false);
  releaseCopy();
  await assert.rejects(pendingImport, /cancel|stopp/i);
  await pendingShutdown;
  assert.equal(storage.dictionaryConfig, undefined);
});

test('shutdown during custom activation commits matching file metadata before completing', async () => {
  const custom = '/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict';
  const source = '/chosen/replacement.lkdict';
  let releaseMove;
  let signalMoveStarted;
  const moveGate = new Promise(resolve => { releaseMove = resolve; });
  const moveStarted = new Promise(resolve => { signalMoveStarted = resolve; });
  const { service, storage, disk } = makeHarness({
    files: { [custom]: 'old-custom', [source]: 'replacement-custom' },
    dictionaries: {
      [custom]: { values: validMetadata({ dictionaryID: 'old-custom' }) },
      [source]: { values: validMetadata({ dictionaryID: 'replacement-custom' }) },
    },
    moveFile: () => {
      signalMoveStarted();
      return moveGate;
    },
  });
  storage.dictionaryConfig = {
    mode: 'custom',
    custom: { dictionaryID: 'old-custom', sourceLanguage: 'en', targetLanguage: 'zh-CN' },
  };
  await service.init();

  const pendingImport = service.importCustomDictionary(source);
  await moveStarted;
  let shutdownDone = false;
  const pendingShutdown = service.shutdown().then(() => { shutdownDone = true; });
  await Promise.resolve();
  assert.equal(shutdownDone, false);

  releaseMove();
  const result = await pendingImport;
  await pendingShutdown;

  assert.equal(result.status, 'READY');
  assert.equal(disk.get(custom), 'replacement-custom');
  assert.equal(storage.dictionaryConfig.custom.dictionaryID, 'replacement-custom');
});

test('lookup waits for custom activation and reads only the replacement dictionary identity', async () => {
  const custom = '/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict';
  const source = '/chosen/replacement-lookup.lkdict';
  let releaseMove;
  let signalMoveStarted;
  const moveGate = new Promise(resolve => { releaseMove = resolve; });
  const moveStarted = new Promise(resolve => { signalMoveStarted = resolve; });
  const row = meaning => [{
    headword: 'study', lemma: '', meanings_json: JSON.stringify([meaning]),
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }];
  const { service, storage } = makeHarness({
    files: { [custom]: 'old-custom', [source]: 'replacement-custom' },
    dictionaries: {
      [custom]: { values: validMetadata({ dictionaryID: 'old-custom' }), rows: { study: row('old') } },
      [source]: { values: validMetadata({ dictionaryID: 'replacement-custom' }), rows: { study: row('new') } },
    },
    moveFile: () => {
      signalMoveStarted();
      return moveGate;
    },
  });
  storage.dictionaryConfig = {
    mode: 'custom',
    custom: { dictionaryID: 'old-custom', sourceLanguage: 'en', targetLanguage: 'zh-CN' },
  };
  await service.init();

  const pendingImport = service.importCustomDictionary(source);
  await moveStarted;
  let lookupDone = false;
  const pendingLookup = service.lookupDictionary({
    requestToken: 'replacement-lookup', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  }).then(result => { lookupDone = true; return result; });
  await Promise.resolve();
  assert.equal(lookupDone, false);

  releaseMove();
  await pendingImport;
  const result = await pendingLookup;
  assert.equal(result.status, 'HIT');
  assert.equal(result.entry.meanings[0], 'new');
});
test('custom failure fallback cannot deadlock with default activation', async () => {
  const custom = '/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict';
  const final = '/profile/lingkuma-zotero/dictionaries/en-zh-test.lkdict';
  const staged = `${final}.part`;
  const url = 'https://github.com/lingkuma/lingkuma-zotero/releases/download/dictionaries-v1/en-zh.lkdict';
  let releaseQuery;
  let signalQueryStarted;
  const queryGate = new Promise(resolve => { releaseQuery = resolve; });
  const queryStarted = new Promise(resolve => { signalQueryStarted = resolve; });
  const row = meaning => [{
    headword: 'study', lemma: '', meanings_json: JSON.stringify([meaning]),
    pos_json: '["v"]', ipa: '', audio_json: '', forms_json: '[]',
  }];
  let diskRef;
  const harness = makeHarness({
    catalog: [{
      dictionaryID: 'en-zh-test', sourceLanguage: 'en', targetLanguage: 'zh-CN',
      url, sha256: PAYLOAD_SHA256, size: 7,
    }],
    files: { [custom]: 'old-custom' },
    dictionaries: {
      [custom]: { values: validMetadata({ dictionaryID: 'old-custom' }), rows: { study: row('old') } },
    },
    downloads: { [url]: 'payload' },
    queryFile: async name => {
      if (name !== custom) return;
      signalQueryStarted();
      await queryGate;
      if (!diskRef.has(custom)) throw new Error('custom disappeared');
    },
  });
  const { service, storage, disk, dbMetadata, calls } = harness;
  diskRef = disk;
  dbMetadata.set(staged, { values: validMetadata(), rows: { study: row('new-default') } });
  storage.dictionaryConfig = {
    mode: 'custom',
    custom: { dictionaryID: 'old-custom', sourceLanguage: 'en', targetLanguage: 'zh-CN' },
  };
  await service.init();

  let lookupDone = false;
  let ensureDone = false;
  const pendingLookup = service.lookupDictionary({
    requestToken: 'deadlock-proof', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  }).then(result => { lookupDone = true; return result; });
  await queryStarted;
  const pendingEnsure = service.ensureDefaultDictionary('en', 'zh-CN', { refresh: true })
    .then(result => { ensureDone = true; return result; });
  for (let attempt = 0; attempt < 20 && calls.downloads.length === 0; attempt++) await Promise.resolve();
  disk.delete(custom);
  dbMetadata.delete(custom);
  releaseQuery();
  const settled = await Promise.race([
    Promise.all([pendingLookup, pendingEnsure]),
    new Promise(resolve => setTimeout(() => resolve(null), 100)),
  ]);

  assert.notEqual(settled, null);
  assert.equal(ensureDone, true);
  assert.equal(lookupDone, true);
  const [lookup, ensured] = settled;
  assert.equal(ensured.status, 'READY');
  assert.equal(lookup.status, 'UNAVAILABLE');
  const retry = await service.lookupDictionary({
    requestToken: 'deadlock-retry', surface: 'study', sourceLanguage: 'en', targetLanguage: 'zh-CN',
  });
  assert.equal(retry.status, 'HIT');
  assert.equal(retry.entry.meanings[0], 'new-default');
});
test('dictionary validation rejects a same-named index owned by another table', async () => {
  const source = '/chosen/wrong-index-table.lkdict';
  const { service } = makeHarness({
    files: { [source]: 'wrong-index-table' },
    dictionaries: { [source]: { values: validMetadata(), indexTable: 'other_entries' } },
  });
  await service.init();

  await assert.rejects(service.importCustomDictionary(source), /index|schema/i);
});

test('an incompatible cache schema is removed and rebuilt during init', async () => {
  let badClosed = 0;
  const badSchemaCache = {
    async queryAsync(sql) {
      if (/PRAGMA table_info\(lookup_cache\)/i.test(sql)) {
        return [{ name: 'dictionary_identity', pk: 0 }];
      }
    },
    async closeDatabase() { badClosed++; },
  };
  const goodCache = {
    async queryAsync(sql) {
      if (/PRAGMA table_info\(lookup_cache\)/i.test(sql)) {
        return [
          { name: 'dictionary_identity', pk: 1 },
          { name: 'source_language', pk: 2 },
          { name: 'target_language', pk: 3 },
          { name: 'normalized_term', pk: 4 },
          { name: 'result_json', pk: 0 },
        ];
      }
    },
    async closeDatabase() {},
  };
  const { service, calls } = makeHarness({ cacheDBs: [badSchemaCache, goodCache] });

  await service.init();

  assert.equal(service.cacheDB, goodCache);
  assert.equal(badClosed, 1);
  assert.deepEqual(calls.removes.slice(-3), [
    '/profile/lingkuma-zotero/lookup-cache.sqlite',
    '/profile/lingkuma-zotero/lookup-cache.sqlite-wal',
    '/profile/lingkuma-zotero/lookup-cache.sqlite-shm',
  ]);
});

test('init validates catalog contracts and the selected custom file without guessing a pair', async () => {
  const custom = '/profile/lingkuma-zotero/dictionaries/custom-selected.lkdict';
  const invalidCatalog = [{
    dictionaryID: 'draft', sourceLanguage: 'en', targetLanguage: 'zh-CN',
    url: 'https://example.invalid/draft.lkdict', sha256: PAYLOAD_SHA256, size: 1,
  }];
  const invalid = makeHarness({ catalog: invalidCatalog });
  await assert.rejects(invalid.service.init(), /catalog|url|immutable/i);

  for (const catalog of [
    [{ dictionaryID: 'bad-path', sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: '../escape.lkdict', sha256: PAYLOAD_SHA256, size: 1 }],
    [{ dictionaryID: 'noncanonical-path', sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: ' assets/dictionaries/a.lkdict', sha256: PAYLOAD_SHA256, size: 1 }],
    [{ dictionaryID: 'two-sources', sourceLanguage: 'en', targetLanguage: 'zh-CN', bundledPath: 'assets/dictionaries/a.lkdict', url: 'https://github.com/owner/repo/releases/download/v1/a.lkdict', sha256: PAYLOAD_SHA256, size: 1 }],
  ]) {
    await assert.rejects(makeHarness({ catalog }).service.init(), /catalog|bundled|source/i);
  }

  const selected = makeHarness({
    files: { [custom]: 'selected-custom' },
    dictionaries: { [custom]: { values: validMetadata({ dictionaryID: 'selected-custom' }) } },
  });
  selected.storage.dictionaryConfig = {
    mode: 'custom',
    custom: { dictionaryID: 'selected-custom', sourceLanguage: 'en', targetLanguage: 'zh-CN' },
  };
  await selected.service.init();

  assert.ok(selected.calls.dbPaths.includes(custom));
  assert.equal(selected.service.customRuntimeStatus.status, 'READY');
});
