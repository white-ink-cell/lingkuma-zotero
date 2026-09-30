/* LingKuma for Zotero - host-owned dictionary storage and lifecycle. */

const LK_DICTIONARY_CONFIG_DEFAULT = Object.freeze({ mode: "default", custom: null });
const LK_DICTIONARY_REQUIRED_METADATA = Object.freeze([
  "format", "schemaVersion", "dictionaryID", "sourceLanguage", "targetLanguage",
  "entryCount", "dataSourceName", "dataSourceURL", "dataSourceSnapshot",
  "dataLicense", "attribution"
]);
const LK_DICTIONARY_METADATA_COLUMNS = Object.freeze(["key", "value"]);
const LK_DICTIONARY_ENTRY_COLUMNS = Object.freeze([
  "headword_norm", "headword", "meanings_json", "pos_json", "ipa",
  "audio_json", "lemma", "forms_json"
]);
const LK_LOOKUP_CACHE_RECORD_VERSION = "entry-v2";

function lkLookupClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function lkLookupLanguage(value) {
  return String(value || "").trim().replace(/_/g, "-").toLowerCase();
}

function lkLookupSafeID(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
    throw new Error("Dictionary ID contains unsafe characters");
  }
  return id;
}

function lkLookupError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function lkLookupHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function lkLookupTerm(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function lkLookupJSONStrings(value, limit) {
  let parsed;
  try { parsed = JSON.parse(String(value || "")); } catch (_) { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const result = [];
  for (const item of parsed) {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function lkLookupAudioRecord(record) {
  if (!record || typeof record !== "object") return null;
  let url;
  try { url = new URL(String(record.url || "")); } catch (_) { return null; }
  if (url.protocol !== "https:") return null;
  const audio = { url: url.href };
  const license = String(record.license || "").trim();
  if (license) audio.license = license;
  const region = String(record.region || "").trim();
  if (["US", "UK", "Other"].includes(region)) audio.region = region;
  try {
    const sourceURL = new URL(String(record.sourceURL || ""));
    if (sourceURL.protocol === "https:") audio.sourceURL = sourceURL.href;
  } catch (_) {}
  return audio;
}

function lkLookupAudio(value) {
  let parsed;
  try { parsed = JSON.parse(String(value || "")); } catch (_) { return null; }
  const records = Array.isArray(parsed) ? parsed : [parsed];
  const priority = { US: 0, UK: 1, Other: 2 };
  const ordered = records.map((record, index) => ({ record, index }))
    .sort((left, right) => (
      (priority[String(left.record?.region || "")] ?? 3)
      - (priority[String(right.record?.region || "")] ?? 3)
      || left.index - right.index
    ));
  for (const { record } of ordered) {
    const audio = lkLookupAudioRecord(record);
    if (audio) return audio;
  }
  return null;
}

function lkLookupPronunciations(value) {
  let parsed;
  try { parsed = JSON.parse(String(value || "")); } catch (_) { return []; }
  if (!Array.isArray(parsed)) parsed = parsed && typeof parsed === "object" ? [parsed] : [];
  const result = [];
  const seen = new Map();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const ipa = String(item.ipa || "").trim();
    const rawRegion = String(item.region || "").trim();
    const region = ["US", "UK", "Other"].includes(rawRegion) ? rawRegion : "";
    const audio = lkLookupAudioRecord(item);
    if (!ipa && (!audio || !region)) continue;
    const key = ipa ? `${region}\u0000${ipa}` : `${region}\u0000\u0000${audio?.url || ""}`;
    const record = {};
    if (ipa) record.ipa = ipa;
    if (region) record.region = region;
    if (audio) {
      record.url = audio.url;
      if (audio.license) record.license = audio.license;
      if (audio.sourceURL) record.sourceURL = audio.sourceURL;
    }
    if (seen.has(key)) {
      const existing = result[seen.get(key)];
      if (!existing.url && record.url) Object.assign(existing, record);
      continue;
    }
    seen.set(key, result.length);
    result.push(record);
    if (result.length === 3) break;
  }
  return result;
}

function lkLookupCorrection(surface, normalizedTerm) {
  if (String(surface).includes("\u00ad")) {
    const candidate = lkLookupTerm(String(surface).replace(/\u00ad/g, ""));
    return candidate && candidate !== normalizedTerm ? candidate : null;
  }
  if (/[A-Za-z]-[ \t]*\r?\n[ \t]*[a-z]/.test(String(surface))) {
    const candidate = lkLookupTerm(String(surface).replace(/([A-Za-z])-[ \t]*\r?\n[ \t]*(?=[a-z])/g, "$1"));
    return candidate && candidate !== normalizedTerm ? candidate : null;
  }
  return null;
}

function lkLookupCachedEntry(value, surface) {
  let parsed;
  try { parsed = JSON.parse(String(value || "")); } catch (_) { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const meanings = lkLookupJSONStrings(JSON.stringify(parsed.meanings), 3);
  if (!meanings.length) return null;
  const dictionaryForm = String(parsed.dictionaryForm || "").trim();
  if (!dictionaryForm) return null;
  const entry = { surface, dictionaryForm, meanings };
  const pos = lkLookupJSONStrings(JSON.stringify(parsed.pos), 16);
  if (pos.length) entry.pos = pos;
  const ipa = String(parsed.ipa || "").trim();
  if (ipa) entry.ipa = ipa;
  const pronunciations = lkLookupPronunciations(JSON.stringify(parsed.pronunciations));
  if (pronunciations.length) entry.pronunciations = pronunciations;
  const audio = lkLookupAudio(JSON.stringify(parsed.audio));
  if (audio) entry.audio = audio;
  return entry;
}

function lkLookupMicrosoftLanguage(value) {
  const language = lkLookupLanguage(value);
  if (["zh", "zh-cn", "zh-hans"].includes(language)) return "zh-Hans";
  if (["zh-tw", "zh-hant"].includes(language)) return "zh-Hant";
  return String(value || "").trim();
}

function lkLookupMicrosoftEdgeURL(sourceLanguage, targetLanguage) {
  const url = new URL("https://edge.microsoft.com/translate/translatetext");
  if (lkLookupLanguage(sourceLanguage) !== "auto") {
    url.searchParams.set("from", lkLookupMicrosoftLanguage(sourceLanguage));
  }
  url.searchParams.set("to", lkLookupMicrosoftLanguage(targetLanguage));
  url.searchParams.set("isEnterpriseClient", "false");
  url.searchParams.set("textType", "html");
  return url;
}

function lkLookupEscapeHTML(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lkLookupWordCharacter(value) {
  return typeof value === "string" && value !== "" && /[\p{L}\p{N}_]/u.test(value);
}

function lkLookupSurfaceStart(sentence, surface, preferredStart = null) {
  const source = String(sentence || "");
  const token = String(surface || "");
  if (!token) return -1;
  const sourceLower = source.toLocaleLowerCase();
  const tokenLower = token.toLocaleLowerCase();
  const isValid = start => {
    if (!Number.isInteger(start) || start < 0 || start + token.length > source.length) return false;
    if (source.slice(start, start + token.length).toLocaleLowerCase() !== tokenLower) return false;
    const before = start > 0 ? source[start - 1] : "";
    const after = start + token.length < source.length ? source[start + token.length] : "";
    if (lkLookupWordCharacter(token[0]) && lkLookupWordCharacter(before)) return false;
    if (lkLookupWordCharacter(token[token.length - 1]) && lkLookupWordCharacter(after)) return false;
    return true;
  };
  if (isValid(preferredStart)) return preferredStart;
  let start = sourceLower.indexOf(tokenLower);
  while (start >= 0) {
    if (isValid(start)) return start;
    start = sourceLower.indexOf(tokenLower, start + 1);
  }
  return -1;
}

function lkLookupMarkedSentence(sentence, surface, preferredStart = null) {
  const source = String(sentence || "");
  const token = String(surface || "");
  const start = lkLookupSurfaceStart(source, token, preferredStart);
  if (start < 0) throw new Error("Quick Context lookup unit is absent from its sentence");
  return lkLookupEscapeHTML(source.slice(0, start)) +
    `<b>${lkLookupEscapeHTML(source.slice(start, start + token.length))}</b>` +
    lkLookupEscapeHTML(source.slice(start + token.length));
}

function lkLookupDecodeHTML(value) {
  return String(value).replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|lt|gt|quot|apos);/gi, entity => {
    const decimal = /^&#(\d+);$/i.exec(entity);
    if (decimal) return String.fromCodePoint(Number(decimal[1]));
    const hex = /^&#x([0-9a-f]+);$/i.exec(entity);
    if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
    return ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'" })[entity.toLowerCase()] || entity;
  });
}

function lkLookupMicrosoftEdgeResult(payload, targetLanguage) {
  if (!Array.isArray(payload) || payload.length !== 1) return null;
  const translations = payload[0]?.translations;
  if (!Array.isArray(translations) || translations.length !== 1 || typeof translations[0]?.text !== "string") return null;
  if (lkLookupLanguage(translations[0].to) !== lkLookupLanguage(lkLookupMicrosoftLanguage(targetLanguage))) return null;
  const translated = translations[0].text;
  const opening = /<b\s*>/gi;
  const closing = /<\/b\s*>/gi;
  const openings = Array.from(translated.matchAll(opening));
  const closings = Array.from(translated.matchAll(closing));
  if (openings.length !== 1 || closings.length !== 1) return null;
  const open = openings[0];
  const close = closings[0];
  if (close.index < open.index + open[0].length) return null;
  const before = translated.slice(0, open.index);
  const marked = translated.slice(open.index + open[0].length, close.index);
  const after = translated.slice(close.index + close[0].length);
  if (/<[^>]*>/.test(before + marked + after)) return null;
  const sentenceTranslation = lkLookupDecodeHTML(before + marked + after).trim();
  const contextualMeaning = lkLookupDecodeHTML(marked).trim();
  if (!sentenceTranslation || !contextualMeaning) return null;
  return { sentenceTranslation, contextualMeaning };
}

function lkLookupEnglishPronunciationSurface(value, sourceLanguage) {
  const surface = String(value || "").trim();
  if (!/^en(?:-|$)/i.test(String(sourceLanguage || "").trim())) return "";
  if (!surface || surface.length > 128) return "";
  return /^[\p{Script=Latin}\p{M}]+(?:['’.-][\p{Script=Latin}\p{M}]+)*$/u.test(surface)
    ? surface : "";
}

function lkLookupAIPronunciationResult(data, surface, extractContent = null) {
  let content = "";
  try {
    content = typeof extractContent === "function"
      ? String(extractContent(data) || "")
      : String(data?.choices?.[0]?.message?.content || "");
  } catch (_) {
    return null;
  }
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/iu);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (_) { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed).sort();
  if (keys.length !== 3 || keys[0] !== "ipaUK" || keys[1] !== "ipaUS" || keys[2] !== "surface") return null;
  if (String(parsed.surface || "").trim() !== surface) return null;
  const validIPA = value => {
    const ipa = String(value || "").trim();
    const slashIPA = /^\/[^/\r\n]{1,156}\/$/u.test(ipa);
    const bracketIPA = /^\[[^\]\r\n]{1,156}\]$/u.test(ipa);
    if (slashIPA || bracketIPA) return ipa;
    const bareIPA = /^[\p{L}\p{M}\p{N}\p{Zs}.ˈˌ'’():‿͜͡-]{1,156}$/u.test(ipa);
    return bareIPA ? `/${ipa}/` : "";
  };
  const ipaUS = validIPA(parsed.ipaUS);
  const ipaUK = validIPA(parsed.ipaUK);
  if (!ipaUS || !ipaUK) return null;
  return [
    { region: "US", ipa: ipaUS },
    { region: "UK", ipa: ipaUK }
  ];
}

function lkLookupDefaultDependencies(rootURI = "", state = null) {
  if (typeof Zotero === "undefined" || typeof PathUtils === "undefined" || typeof IOUtils === "undefined") {
    return {};
  }
  const mainWindow = Zotero.getMainWindow?.();
  const webCrypto = globalThis.crypto || mainWindow?.crypto;
  return {
    dataRoot: PathUtils.join(Zotero.DataDirectory.dir, "lingkuma-zotero"),
    join: (...parts) => PathUtils.join(...parts),
    file: {
      exists: path => IOUtils.exists(path),
      stat: path => IOUtils.stat(path),
      makeDirectory: path => IOUtils.makeDirectory(path, { createAncestors: true, ignoreExisting: true }),
      copy: (source, destination) => IOUtils.copy(source, destination, { noOverwrite: false }),
      move: (source, destination) => IOUtils.move(source, destination, { noOverwrite: false }),
      remove: path => IOUtils.remove(path, { ignoreAbsent: true }),
      write: (path, bytes) => IOUtils.write(path, bytes, { mode: "overwrite" })
    },
    dbFactory: path => new Zotero.DBConnection(path),
    async sha256File(path) {
      if (!webCrypto?.subtle) throw new Error("SHA-256 is unavailable in this Zotero runtime");
      const bytes = await IOUtils.read(path);
      return lkLookupHex(await webCrypto.subtle.digest("SHA-256", bytes));
    },
    async downloadToFile(url, path, signal) {
      let cancelRequest = null;
      const cancel = () => {
        try { cancelRequest?.(); } catch (_) {}
      };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        await Zotero.HTTP.download(url, path, {
          timeout: 60000,
          errorDelayMax: 0,
          cancellerReceiver(callback) {
            cancelRequest = callback;
            if (signal?.aborted) cancel();
          }
        });
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    },
    async copyBundledToFile(relativePath, path, signal) {
      if (signal?.aborted) throw lkLookupError("CANCELLED", "Bundled dictionary copy was cancelled");
      if (!rootURI) throw new Error("Plugin root URI is unavailable");
      await Zotero.File.download(rootURI + relativePath, path);
      if (signal?.aborted) throw lkLookupError("CANCELLED", "Bundled dictionary copy was cancelled");
    },
    async translateQuickContext({ surface, sentence, surfaceStart, sourceLanguage, targetLanguage, signal }) {
      const config = state?.storageGet?.({ translationConfig: {} })?.translationConfig || {};
      const url = lkLookupMicrosoftEdgeURL(sourceLanguage, targetLanguage);
      const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json; charset=UTF-8"
      };
      const rawTimeout = Number(config.timeoutSeconds);
      const timeout = Number.isFinite(rawTimeout) ? Math.max(3000, Math.min(60000, rawTimeout * 1000)) : 15000;
      if (signal?.aborted) throw lkLookupError("CANCELLED", "Quick Context translation was cancelled");
      const markedSentence = lkLookupMarkedSentence(sentence, surface, surfaceStart);
      let cancelRequest = null;
      const cancel = () => {
        try { cancelRequest?.(); } catch (_) {}
      };
      signal?.addEventListener("abort", cancel, { once: true });
      let xhr;
      try {
        xhr = await Zotero.HTTP.request("POST", url.href, {
          headers,
          body: JSON.stringify([markedSentence]),
          responseType: "json",
          timeout,
          errorDelayMax: 0,
          cancellerReceiver(callback) {
            cancelRequest = callback;
            if (signal?.aborted) cancel();
          }
        });
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
      let payload = xhr?.response;
      if (!Array.isArray(payload)) payload = JSON.parse(String(xhr?.responseText || "null"));
      const result = lkLookupMicrosoftEdgeResult(payload, targetLanguage);
      if (!result) throw new Error("Microsoft Edge Translator returned an invalid marked-sentence result");
      return result;
    },
    now: () => new Date().toISOString()
  };
}

function lkLookupQuickContextResult(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("sentenceTranslation") || !keys.includes("contextualMeaning")) return null;
  if (typeof data.sentenceTranslation !== "string" || typeof data.contextualMeaning !== "string") return null;
  const sentenceTranslation = data.sentenceTranslation.trim();
  const contextualMeaning = data.contextualMeaning.trim();
  if (!sentenceTranslation || !contextualMeaning) return null;
  return { sentenceTranslation, contextualMeaning };
}
class LingKumaLookupService {
  constructor({ state, catalog = null, dependencies = null, rootURI = "" } = {}) {
    if (!state) throw new Error("LingKuma lookup requires the existing state adapter");
    this.state = state;
    this.catalog = Array.isArray(catalog)
      ? catalog.map(lkLookupClone)
      : Array.from(typeof LK_DICTIONARY_CATALOG === "object" ? LK_DICTIONARY_CATALOG : [], lkLookupClone);
    this.dependencies = { ...lkLookupDefaultDependencies(rootURI, state), ...(dependencies || {}) };
    this.dataRoot = this.dependencies.dataRoot;
    this.dictionaryDir = this.dependencies.join(this.dataRoot, "dictionaries");
    this.customPath = this.dependencies.join(this.dictionaryDir, "custom-selected.lkdict");
    this.cachePath = this.dependencies.join(this.dataRoot, "lookup-cache.sqlite");
    this.cacheDB = null;
    this.initialized = false;
    this._initPromise = null;
    this.stopped = false;
    this.generation = 0;
    this.downloads = new Map();
    this.abortControllers = new Set();
    this.lookupTasks = new Set();
    this.dictionaryVerifications = new Map();
    this.dictionaryActivations = new Map();
    this.dictionaryReaders = new Map();
    this.aiPronunciationCache = new Map();
    this._importTail = Promise.resolve();
    this.customRuntimeStatus = null;
    this.latestExactPair = null;
  }

  async init() {
    if (this.initialized) return;
    if (this._initPromise) return this._initPromise;
    this.stopped = false;
    const generation = ++this.generation;
    const pending = this._init(generation);
    this._initPromise = pending;
    try { return await pending; }
    finally { if (this._initPromise === pending) this._initPromise = null; }
  }

  async _init(generation) {
    this._validateCatalog();
    await this.dependencies.file.makeDirectory(this.dictionaryDir);
    if (this.stopped || generation !== this.generation) return;
    this.cacheDB = await this._openCacheWithRecovery(generation);
    if (this.stopped || generation !== this.generation) {
      const cacheDB = this.cacheDB;
      this.cacheDB = null;
      try { await cacheDB?.closeDatabase?.(); } catch (_) {}
      return;
    }
    await this._validateSelectedCustom();
    if (this.stopped || generation !== this.generation) return;
    this.initialized = true;
  }

  _validateCatalog() {
    const ids = new Set();
    const pairs = new Set();
    const pronunciationSources = new Set();
    for (const entry of this.catalog) {
      if (!entry || entry.active === false) continue;
      let dictionaryID;
      try { dictionaryID = lkLookupSafeID(entry.dictionaryID); }
      catch (_) { throw lkLookupError("INVALID_CATALOG", "Catalog dictionary ID is invalid"); }
      const source = lkLookupLanguage(entry.sourceLanguage);
      const target = lkLookupLanguage(entry.targetLanguage);
      const url = String(entry.url || "").trim();
      const bundledPath = String(entry.bundledPath || "").trim();
      const sha256 = String(entry.sha256 || "").trim().toLowerCase();
      let parsedURL;
      if (url) {
        try { parsedURL = new URL(url); } catch (_) {}
      }
      const movingReference = /\/(?:raw|main)(?:\/|$)/i.test(parsedURL?.pathname || "");
      const validRemote = Boolean(parsedURL && parsedURL.protocol === "https:" &&
        !/^(?:example\.invalid|localhost)$/i.test(parsedURL.hostname) && !movingReference && entry.url === url);
      const validBundled = entry.bundledPath === bundledPath &&
        /^assets\/dictionaries\/[A-Za-z0-9][A-Za-z0-9._-]*\.lkdict$/.test(bundledPath);
      if (!source || !target || validRemote === validBundled ||
          !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(entry.size) || entry.size < 1) {
        throw lkLookupError("INVALID_CATALOG", "Catalog requires exactly one safe bundled path or immutable HTTPS URL plus pair, size, and SHA-256");
      }
      const pair = `${source}\u0000${target}`;
      if (ids.has(dictionaryID) || pairs.has(pair)) {
        throw lkLookupError("INVALID_CATALOG", "Catalog dictionary IDs and language pairs must be unique");
      }
      if (entry.pronunciationSource === true) {
        if (pronunciationSources.has(source)) {
          throw lkLookupError("INVALID_CATALOG", "Catalog pronunciation sources must be unique per source language");
        }
        pronunciationSources.add(source);
      }
      ids.add(dictionaryID);
      pairs.add(pair);
    }
  }

  async _openCache(generation) {
    const cacheDB = this.dependencies.dbFactory(this.cachePath);
    try {
      await cacheDB.queryAsync(`CREATE TABLE IF NOT EXISTS lookup_cache (
        dictionary_identity TEXT NOT NULL,
        source_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        normalized_term TEXT NOT NULL,
        result_json TEXT NOT NULL,
        PRIMARY KEY (dictionary_identity, source_language, target_language, normalized_term)
      )`);
      const cacheColumns = await cacheDB.queryAsync("PRAGMA table_info(lookup_cache)");
      const expectedCacheColumns = new Map([
        ["dictionary_identity", 1],
        ["source_language", 2],
        ["target_language", 3],
        ["normalized_term", 4],
        ["result_json", 0]
      ]);
      if (cacheColumns.length !== expectedCacheColumns.size ||
          cacheColumns.some(row => expectedCacheColumns.get(String(row.name || "")) !== Number(row.pk))) {
        throw lkLookupError("INVALID_CACHE_SCHEMA", "Lookup cache schema is incompatible");
      }
      if (this.stopped || generation !== this.generation) {
        await cacheDB.closeDatabase?.();
        return null;
      }
      return cacheDB;
    } catch (error) {
      try { await cacheDB.closeDatabase?.(); } catch (_) {}
      throw error;
    }
  }

  async _openCacheWithRecovery(generation) {
    try {
      return await this._openCache(generation);
    } catch (_) {
      for (const path of [this.cachePath, `${this.cachePath}-wal`, `${this.cachePath}-shm`]) {
        try { await this.dependencies.file.remove(path); } catch (_) {}
      }
      if (this.stopped || generation !== this.generation) return null;
      try {
        return await this._openCache(generation);
      } catch (error) {
        try { this.dependencies.logError?.(error); } catch (_) {}
        return null;
      }
    }
  }

  async _validateSelectedCustom() {
    this.customRuntimeStatus = null;
    const config = this._config();
    if (config.mode !== "custom") return;
    try {
      const verified = await this._verifiedDictionary(
        this.customPath, config.custom, config.custom?.sha256
      );
      this.customRuntimeStatus = {
        mode: "custom", status: "READY", ...this._publicMetadata(verified.metadata)
      };
    } catch (error) {
      this.customRuntimeStatus = {
        mode: "custom", status: "UNUSABLE", reason: error?.code || "VALIDATION_FAILED",
        fallback: "default", dictionaryID: config.custom?.dictionaryID || null,
        sourceLanguage: config.custom?.sourceLanguage || "",
        targetLanguage: config.custom?.targetLanguage || ""
      };
    }
  }

  async shutdown() {
    if (this.stopped && !this._initPromise && !this.initialized) return;
    this.stopped = true;
    this.generation++;
    for (const controller of this.abortControllers) {
      try { controller.abort(); } catch (_) {}
    }
    this.abortControllers.clear();
    try { await this._initPromise; } catch (_) {}
    await Promise.allSettled(Array.from(this.downloads.values()));
    this.downloads.clear();
    try { await this._importTail; } catch (_) {}
    await Promise.allSettled(Array.from(this.lookupTasks));
    this.lookupTasks.clear();
    this.dictionaryVerifications.clear();
    this.dictionaryActivations.clear();
    this.dictionaryReaders.clear();
    this.aiPronunciationCache.clear();
    const cacheDB = this.cacheDB;
    this.cacheDB = null;
    this.initialized = false;
    try { await cacheDB?.closeDatabase?.(); } catch (_) {}
  }

  _config() {
    const config = this.state.storageGet({ dictionaryConfig: LK_DICTIONARY_CONFIG_DEFAULT })?.dictionaryConfig;
    if (!config || typeof config !== "object") return lkLookupClone(LK_DICTIONARY_CONFIG_DEFAULT);
    return {
      mode: config.mode === "custom" ? "custom" : "default",
      custom: config.custom && typeof config.custom === "object" ? lkLookupClone(config.custom) : null
    };
  }

  _rememberExactPair(sourceLanguage, targetLanguage) {
    const source = String(sourceLanguage || "").trim();
    const target = String(targetLanguage || "").trim();
    if (lkLookupLanguage(source) && lkLookupLanguage(target)) {
      this.latestExactPair = { sourceLanguage: source, targetLanguage: target };
    }
  }

  _catalogEntry(sourceLanguage, targetLanguage) {
    const source = lkLookupLanguage(sourceLanguage);
    const target = lkLookupLanguage(targetLanguage);
    return this.catalog.find(entry => entry && entry.active !== false &&
      lkLookupLanguage(entry.sourceLanguage) === source &&
      lkLookupLanguage(entry.targetLanguage) === target) || null;
  }

  _pronunciationCatalogEntry(sourceLanguage) {
    const source = lkLookupLanguage(sourceLanguage);
    const candidates = this.catalog.filter(entry => entry && entry.active !== false &&
      lkLookupLanguage(entry.sourceLanguage) === source);
    return candidates.find(entry => entry.pronunciationSource === true)
      || (candidates.length === 1 ? candidates[0] : null);
  }

  _defaultPath(entry) {
    return this.dependencies.join(this.dictionaryDir, `${lkLookupSafeID(entry.dictionaryID)}.lkdict`);
  }

  _publicMetadata(metadata) {
    return {
      dictionaryID: metadata.dictionaryID,
      sourceLanguage: metadata.sourceLanguage,
      targetLanguage: metadata.targetLanguage,
      entryCount: Number(metadata.entryCount) || 0,
      dataSourceName: metadata.dataSourceName,
      dataSourceSnapshot: metadata.dataSourceSnapshot,
      dataLicense: metadata.dataLicense,
      attribution: metadata.attribution
    };
  }

  async _validateDictionary(path, expected = null) {
    if (!(await this.dependencies.file.exists(path))) {
      throw lkLookupError("MISSING_DICTIONARY", "Dictionary file is missing");
    }
    let db = null;
    try {
      db = this.dependencies.dbFactory(path);
      const quickCheck = await db.valueQueryAsync("PRAGMA quick_check");
      if (String(quickCheck || "").toLowerCase() !== "ok") {
        throw lkLookupError("INVALID_DATABASE", "Dictionary quick_check failed");
      }
      const rows = await db.queryAsync("SELECT key, value FROM metadata");
      const metadata = Object.fromEntries((rows || []).map(row => [String(row.key), String(row.value)]));
      for (const key of LK_DICTIONARY_REQUIRED_METADATA) {
        if (!String(metadata[key] || "").trim()) {
          throw lkLookupError("INVALID_METADATA", `Dictionary metadata is missing ${key}`);
        }
      }
      if (metadata.format !== "lingkuma-dictionary") {
        throw lkLookupError("INVALID_FORMAT", "Dictionary format is not lingkuma-dictionary");
      }
      if (String(metadata.schemaVersion) !== "1") {
        throw lkLookupError("UNSUPPORTED_SCHEMA", "Dictionary schema version is unsupported");
      }
      if (!Number.isInteger(Number(metadata.entryCount)) || Number(metadata.entryCount) < 1) {
        throw lkLookupError("INVALID_METADATA", "Dictionary entryCount must be positive");
      }
      if (expected?.dictionaryID && metadata.dictionaryID !== expected.dictionaryID) {
        throw lkLookupError("IDENTITY_MISMATCH", "Dictionary identity does not match the catalog");
      }
      if (expected?.sourceLanguage && lkLookupLanguage(metadata.sourceLanguage) !== lkLookupLanguage(expected.sourceLanguage)) {
        throw lkLookupError("PAIR_MISMATCH", "Dictionary source language does not match");
      }
      if (expected?.targetLanguage && lkLookupLanguage(metadata.targetLanguage) !== lkLookupLanguage(expected.targetLanguage)) {
        throw lkLookupError("PAIR_MISMATCH", "Dictionary target language does not match");
      }
      const tableCount = Number(await db.valueQueryAsync(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('metadata', 'entries')"
      ));
      if (tableCount !== 2) throw lkLookupError("INVALID_SCHEMA", "Dictionary required tables are missing");
      const indexCount = Number(await db.valueQueryAsync(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'entries_headword_norm' AND tbl_name = 'entries'"
      ));
      if (indexCount !== 1) throw lkLookupError("INVALID_SCHEMA", "Dictionary lookup index is missing");
      const metadataColumns = new Set((await db.queryAsync("PRAGMA table_info(metadata)"))
        .map(row => String(row.name || "")));
      const entryColumns = new Set((await db.queryAsync("PRAGMA table_info(entries)"))
        .map(row => String(row.name || "")));
      if (LK_DICTIONARY_METADATA_COLUMNS.some(name => !metadataColumns.has(name)) ||
          LK_DICTIONARY_ENTRY_COLUMNS.some(name => !entryColumns.has(name))) {
        throw lkLookupError("INVALID_SCHEMA", "Dictionary schema is missing required columns");
      }
      const indexColumns = (await db.queryAsync("PRAGMA index_info('entries_headword_norm')"))
        .map(row => String(row.name || ""));
      if (indexColumns.length !== 1 || indexColumns[0] !== "headword_norm") {
        throw lkLookupError("INVALID_SCHEMA", "Dictionary lookup index targets the wrong column");
      }
      const sample = await db.valueQueryAsync(
        "SELECT meanings_json FROM entries WHERE length(trim(headword)) > 0 AND length(trim(meanings_json)) > 2 LIMIT 1"
      );
      let meanings = null;
      try { meanings = JSON.parse(String(sample || "")); } catch (_) {}
      if (!Array.isArray(meanings) || !meanings.some(value => String(value || "").trim())) {
        throw lkLookupError("INVALID_ENTRIES", "Dictionary contains no usable entry");
      }
      return metadata;
    } finally {
      try { await db?.closeDatabase?.(); } catch (_) {}
    }
  }

  _assertVerifiedDictionary(record, expected, expectedHash) {
    const metadata = record.metadata;
    const hash = String(expectedHash || "").trim().toLowerCase();
    if (hash && record.contentHash !== hash) {
      throw lkLookupError("SHA256_MISMATCH", "Dictionary hash mismatch");
    }
    if (Number.isSafeInteger(expected?.size) && Number.isSafeInteger(record.fileSize) &&
        record.fileSize !== expected.size) {
      throw lkLookupError("SIZE_MISMATCH", "Dictionary size mismatch");
    }
    if (expected?.dictionaryID && metadata.dictionaryID !== expected.dictionaryID) {
      throw lkLookupError("IDENTITY_MISMATCH", "Dictionary identity does not match");
    }
    if (expected?.sourceLanguage && lkLookupLanguage(metadata.sourceLanguage) !== lkLookupLanguage(expected.sourceLanguage)) {
      throw lkLookupError("PAIR_MISMATCH", "Dictionary source language does not match");
    }
    if (expected?.targetLanguage && lkLookupLanguage(metadata.targetLanguage) !== lkLookupLanguage(expected.targetLanguage)) {
      throw lkLookupError("PAIR_MISMATCH", "Dictionary target language does not match");
    }
  }

  async _verifiedDictionary(path, expected = null, expectedHash = "") {
    const activation = this.dictionaryActivations.get(path);
    if (activation) await activation;
    for (let attempt = 0; attempt < 2; attempt++) {
      let pending = this.dictionaryVerifications.get(path);
      if (!pending) {
        pending = (async () => {
          const beforeIdentity = await this._dictionaryFileIdentity(path);
          const fileInfo = typeof this.dependencies.file.stat === "function"
            ? await this.dependencies.file.stat(path)
            : null;
          const contentHash = String(await this.dependencies.sha256File(path)).toLowerCase();
          const metadata = await this._validateDictionary(path);
          const fileIdentity = await this._dictionaryFileIdentity(path);
          if (fileIdentity !== beforeIdentity) {
            throw lkLookupError("FILE_CHANGED", "Dictionary changed during validation");
          }
          return { metadata, contentHash, fileIdentity, fileSize: Number(fileInfo?.size) };
        })();
        this.dictionaryVerifications.set(path, pending);
      }
      let record;
      try { record = await pending; }
      catch (error) {
        if (this.dictionaryVerifications.get(path) === pending) this.dictionaryVerifications.delete(path);
        throw error;
      }
      let fileIdentity;
      try { fileIdentity = await this._dictionaryFileIdentity(path); }
      catch (error) {
        if (this.dictionaryVerifications.get(path) === pending) this.dictionaryVerifications.delete(path);
        throw error;
      }
      if (fileIdentity !== record.fileIdentity) {
        if (this.dictionaryVerifications.get(path) === pending) this.dictionaryVerifications.delete(path);
        continue;
      }
      this._assertVerifiedDictionary(record, expected, expectedHash);
      return record;
    }
    throw lkLookupError("FILE_CHANGED", "Dictionary file identity is unstable");
  }

  async _dictionaryFileIdentity(path) {
    if (typeof this.dependencies.file.stat === "function") {
      const info = await this.dependencies.file.stat(path);
      if (info?.type && info.type !== "regular") {
        throw lkLookupError("INVALID_DICTIONARY", "Dictionary path is not a regular file");
      }
      return [info?.type || "regular", info?.size, info?.lastModified, info?.creationTime].join(":");
    }
    if (!(await this.dependencies.file.exists(path))) {
      throw lkLookupError("MISSING_DICTIONARY", "Dictionary file is missing");
    }
    return "exists";
  }

  _rememberVerifiedDictionary(path, metadata, contentHash, fileIdentity) {
    this.dictionaryVerifications.set(path, Promise.resolve({
      metadata: lkLookupClone(metadata),
      contentHash: String(contentHash || "").toLowerCase(),
      fileIdentity
    }));
  }

  _forgetVerifiedDictionary(path) {
    this.dictionaryVerifications.delete(path);
  }

  async _acquireDictionaryReader(path) {
    while (this.dictionaryActivations.has(path)) {
      await this.dictionaryActivations.get(path);
    }
    let releaseLease;
    const lease = new Promise(resolve => { releaseLease = resolve; });
    let readers = this.dictionaryReaders.get(path);
    if (!readers) {
      readers = new Set();
      this.dictionaryReaders.set(path, readers);
    }
    readers.add(lease);
    return () => {
      readers.delete(lease);
      releaseLease();
      if (!readers.size && this.dictionaryReaders.get(path) === readers) {
        this.dictionaryReaders.delete(path);
      }
    };
  }
  async _activateVerifiedDictionary(stagePath, finalPath, verified, commit = null) {
    this._forgetVerifiedDictionary(finalPath);
    const pending = (async () => {
      await Promise.allSettled(Array.from(this.dictionaryReaders.get(finalPath) || []));
      await this.dependencies.file.move(stagePath, finalPath);
      const fileIdentity = await this._dictionaryFileIdentity(finalPath);
      this._rememberVerifiedDictionary(finalPath, verified.metadata, verified.contentHash, fileIdentity);
      commit?.();
    })();
    this.dictionaryActivations.set(finalPath, pending);
    try { await pending; }
    finally {
      if (this.dictionaryActivations.get(finalPath) === pending) this.dictionaryActivations.delete(finalPath);
    }
  }
  async _removeStage(path) {
    try { await this.dependencies.file.remove(path); } catch (_) {}
  }

  _startDefaultDictionaryDownload(sourceLanguage, targetLanguage) {
    if (this.stopped) return;
    this.ensureDefaultDictionary(sourceLanguage, targetLanguage).catch(error => {
      try { this.dependencies.logError?.(error); } catch (_) {}
    });
  }

  async ensureApplicableDefaultDictionary(sourceLanguage, targetLanguage) {
    this._rememberExactPair(sourceLanguage, targetLanguage);
    if (this._config().mode === "custom") {
      const selected = await this.getDictionaryStatus({ sourceLanguage, targetLanguage });
      if (selected.mode === "custom" && selected.status === "READY") return selected;
    }
    return this.ensureDefaultDictionary(sourceLanguage, targetLanguage);
  }
  async ensureDefaultDictionary(sourceLanguage, targetLanguage, { refresh = false } = {}) {
    this._rememberExactPair(sourceLanguage, targetLanguage);
    const entry = this._catalogEntry(sourceLanguage, targetLanguage);
    if (!entry) return {
      mode: "default", status: "UNAVAILABLE", reason: "NO_CATALOG_PAIR",
      sourceLanguage: String(sourceLanguage || ""), targetLanguage: String(targetLanguage || "")
    };
    const key = `${lkLookupLanguage(sourceLanguage)}\u0000${lkLookupLanguage(targetLanguage)}`;
    if (this.downloads.has(key)) return this.downloads.get(key);
    const pending = this._ensureDefaultEntry(entry, { refresh });
    this.downloads.set(key, pending);
    try { return await pending; }
    finally { if (this.downloads.get(key) === pending) this.downloads.delete(key); }
  }

  async _ensureDefaultEntry(entry, { refresh }) {
    const finalPath = this._defaultPath(entry);
    const stagePath = `${finalPath}.part`;
    const expectedHash = String(entry.sha256 || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      return { mode: "default", status: "ERROR", reason: "INVALID_CATALOG", dictionaryID: entry.dictionaryID };
    }
    if (!refresh && await this.dependencies.file.exists(finalPath)) {
      try {
        const verified = await this._verifiedDictionary(finalPath, entry, expectedHash);
        return { mode: "default", status: "READY", ...this._publicMetadata(verified.metadata) };
      } catch (_) {}
    }
    const generation = this.generation;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller) this.abortControllers.add(controller);
    try {
      try {
        if (entry.bundledPath) {
          if (typeof this.dependencies.copyBundledToFile !== "function") {
            throw lkLookupError("BUNDLED_COPY_UNAVAILABLE", "Bundled dictionary copy is unavailable");
          }
          await this.dependencies.copyBundledToFile(entry.bundledPath, stagePath, controller?.signal);
        } else if (typeof this.dependencies.downloadToFile === "function") {
          await this.dependencies.downloadToFile(entry.url, stagePath, controller?.signal);
        } else {
          const bytes = await this.dependencies.download(entry.url, controller?.signal);
          if (this.stopped || generation !== this.generation) {
            return { mode: "default", status: "ERROR", reason: "CANCELLED", dictionaryID: entry.dictionaryID };
          }
          await this.dependencies.file.write(stagePath, bytes);
        }
      } catch (_) {
        return {
          mode: "default",
          status: "ERROR",
          reason: this.stopped || generation !== this.generation
            ? "CANCELLED"
            : (entry.bundledPath ? "SEED_FAILED" : "DOWNLOAD_FAILED"),
          dictionaryID: entry.dictionaryID
        };
      }
      if (this.stopped || generation !== this.generation) {
        return { mode: "default", status: "ERROR", reason: "CANCELLED", dictionaryID: entry.dictionaryID };
      }
      const verified = await this._verifiedDictionary(stagePath, entry, expectedHash);
      const metadata = verified.metadata;
      if (this.stopped || generation !== this.generation) {
        return { mode: "default", status: "ERROR", reason: "CANCELLED", dictionaryID: entry.dictionaryID };
      }
      await this._activateVerifiedDictionary(stagePath, finalPath, verified);
      this._forgetVerifiedDictionary(stagePath);
      return { mode: "default", status: "READY", ...this._publicMetadata(metadata) };
    } catch (error) {
      return {
        mode: "default", status: "ERROR", reason: error?.code || "VALIDATION_FAILED",
        dictionaryID: entry.dictionaryID
      };
    } finally {
      this._forgetVerifiedDictionary(stagePath);
      if (controller) this.abortControllers.delete(controller);
      await this._removeStage(stagePath);
    }
  }

  async importCustomDictionary(sourcePath) {
    const pending = this._importTail.catch(() => {}).then(() => this._importCustomDictionary(sourcePath));
    this._importTail = pending;
    return pending;
  }

  async _importCustomDictionary(sourcePath) {
    if (!String(sourcePath || "").trim()) throw new Error("A dictionary file must be selected");
    if (this.stopped) throw lkLookupError("CANCELLED", "Dictionary import stopped");
    const generation = this.generation;
    const assertActive = () => {
      if (this.stopped || generation !== this.generation) {
        throw lkLookupError("CANCELLED", "Dictionary import cancelled because the service stopped");
      }
    };
    const stagePath = `${this.customPath}.part`;
    await this._removeStage(stagePath);
    try {
      assertActive();
      await this.dependencies.file.copy(sourcePath, stagePath);
      assertActive();
      const verified = await this._verifiedDictionary(stagePath);
      const metadata = verified.metadata;
      assertActive();
      const sha256 = verified.contentHash;
      assertActive();
      const custom = {
        ...this._publicMetadata(metadata),
        sha256,
        importedAt: this.dependencies.now()
      };
      await this._activateVerifiedDictionary(stagePath, this.customPath, verified, () => {
        this.state.storageSet({ dictionaryConfig: { mode: "custom", custom } });
        this.customRuntimeStatus = { mode: "custom", status: "READY", ...custom };
      });
      this._forgetVerifiedDictionary(stagePath);
      return { mode: "custom", status: "READY", ...custom };
    } finally {
      this._forgetVerifiedDictionary(stagePath);
      await this._removeStage(stagePath);
    }
  }

  selectDictionary(mode) {
    if (mode !== "default" && mode !== "custom") throw new Error("Dictionary mode must be default or custom");
    const config = this._config();
    this.state.storageSet({ dictionaryConfig: { ...config, mode } });
    return { mode };
  }

  async lookupDictionary(request = {}) {
    const token = String(request?.requestToken || "");
    this._rememberExactPair(request?.sourceLanguage, request?.targetLanguage);
    if (this.stopped) return { requestToken: token, status: "UNAVAILABLE" };
    const pending = this._lookupDictionary(request);
    this.lookupTasks.add(pending);
    try { return await pending; }
    finally { this.lookupTasks.delete(pending); }
  }

  async lookupPronunciation(request = {}) {
    const token = String(request?.requestToken || "");
    if (this.stopped) return { requestToken: token, status: "UNAVAILABLE" };
    const pending = this._lookupPronunciation(request);
    this.lookupTasks.add(pending);
    try { return await pending; }
    finally { this.lookupTasks.delete(pending); }
  }

  async lookupAIPronunciation(request = {}) {
    const requestToken = String(request?.requestToken || "");
    if (this.stopped) return { requestToken, status: "UNAVAILABLE" };
    const surface = lkLookupEnglishPronunciationSurface(request?.surface, request?.sourceLanguage);
    if (!surface) return { requestToken, status: "MISS" };
    const cacheKey = surface.normalize("NFKC");
    const cached = this.aiPronunciationCache.get(cacheKey);
    if (cached) {
      return {
        requestToken,
        status: "HIT",
        entry: { surface, source: "ai", pronunciations: lkLookupClone(cached) }
      };
    }
    if (typeof this.state.makeAIRequest !== "function") {
      return { requestToken, status: "UNAVAILABLE" };
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller) this.abortControllers.add(controller);
    const pending = this._lookupAIPronunciation({ requestToken, surface, cacheKey }, controller?.signal || null);
    this.lookupTasks.add(pending);
    try { return await pending; }
    finally {
      this.lookupTasks.delete(pending);
      if (controller) this.abortControllers.delete(controller);
    }
  }

  async _lookupAIPronunciation({ requestToken, surface, cacheKey }, signal = null) {
    try {
      const data = await this.state.makeAIRequest({
        word: surface,
        sentence: "",
        messages: [
          {
            role: "system",
            content: "You are an English IPA pronunciation transcription service. Return strict JSON only."
          },
          {
            role: "user",
            content: `Give broadly accepted US and UK English IPA transcriptions for the exact written surface ${JSON.stringify(surface)}. ` +
              `Return exactly {"surface":${JSON.stringify(surface)},"ipaUS":"/.../","ipaUK":"/.../"}. ` +
              "Echo the surface exactly, do not substitute a lemma, and do not add prose or markdown."
          }
        ],
        temperature: 0.1,
        _skipLanguageRetarget: true
      }, { signal });
      if (signal?.aborted || this.stopped) return { requestToken, status: "UNAVAILABLE" };
      const pronunciations = lkLookupAIPronunciationResult(
        data,
        surface,
        typeof this.state._extractAIContent === "function"
          ? value => this.state._extractAIContent(value)
          : null
      );
      if (!pronunciations) return { requestToken, status: "ERROR" };
      this.aiPronunciationCache.set(cacheKey, lkLookupClone(pronunciations));
      return {
        requestToken,
        status: "HIT",
        entry: { surface, source: "ai", pronunciations }
      };
    } catch (_) {
      return { requestToken, status: signal?.aborted || this.stopped ? "UNAVAILABLE" : "ERROR" };
    }
  }

  async _lookupPronunciation(request = {}, forceDefault = false) {
    const requestToken = String(request?.requestToken || "");
    const originalSurface = String(request?.surface || "").trim();
    const normalizedTerm = lkLookupTerm(originalSurface);
    const sourceLanguage = String(request?.sourceLanguage || "").trim();
    if (!normalizedTerm || !lkLookupLanguage(sourceLanguage)) {
      return { requestToken, status: "MISS" };
    }

    const config = this._config();
    let dictionaryPath;
    let expected;
    let expectedHash;
    const selectedCustom = !forceDefault && config.mode === "custom";
    if (selectedCustom) {
      const customActivation = this.dictionaryActivations.get(this.customPath);
      if (customActivation) await customActivation;
      if (lkLookupLanguage(config.custom?.sourceLanguage) !== lkLookupLanguage(sourceLanguage)) {
        return this._lookupPronunciation(request, true);
      }
      dictionaryPath = this.customPath;
      expected = config.custom;
      expectedHash = config.custom?.sha256;
    } else {
      const catalogEntry = this._pronunciationCatalogEntry(sourceLanguage);
      if (!catalogEntry) return { requestToken, status: "UNAVAILABLE" };
      dictionaryPath = this._defaultPath(catalogEntry);
      expected = catalogEntry;
      expectedHash = catalogEntry.sha256;
    }

    try {
      await this._verifiedDictionary(dictionaryPath, expected, expectedHash);
    } catch (_) {
      if (selectedCustom) return this._lookupPronunciation(request, true);
      const ensured = await this.ensureDefaultDictionary(expected.sourceLanguage, expected.targetLanguage);
      if (ensured.status !== "READY") return { requestToken, status: "UNAVAILABLE" };
      try {
        await this._verifiedDictionary(dictionaryPath, expected, expectedHash);
      } catch (_) {
        return { requestToken, status: "UNAVAILABLE" };
      }
    }

    const releaseDictionaryReader = await this._acquireDictionaryReader(dictionaryPath);
    try {
      await this._verifiedDictionary(dictionaryPath, expected, expectedHash);
      const db = this.dependencies.dbFactory(dictionaryPath);
      try {
        const rows = await db.queryAsync(
          "SELECT headword, ipa, audio_json FROM entries WHERE headword_norm = ? LIMIT 8",
          [normalizedTerm]
        );
        let ipa = "";
        let audio = null;
        const pronunciations = [];
        const seenPronunciations = new Map();
        for (const row of rows || []) {
          if (lkLookupTerm(row.headword) !== normalizedTerm) continue;
          if (!ipa) ipa = String(row.ipa || "").trim();
          if (!audio) audio = lkLookupAudio(row.audio_json);
          for (const record of lkLookupPronunciations(row.audio_json)) {
            const key = record.ipa
              ? `${record.region || ""}\u0000${record.ipa}`
              : `${record.region || ""}\u0000\u0000${record.url || ""}`;
            if (seenPronunciations.has(key)) {
              const existing = pronunciations[seenPronunciations.get(key)];
              if (!existing.url && record.url) Object.assign(existing, record);
              continue;
            }
            seenPronunciations.set(key, pronunciations.length);
            pronunciations.push(record);
            if (pronunciations.length === 3) break;
          }
          if (pronunciations.length === 3) break;
        }
        if (!ipa && !pronunciations.length && !audio) return { requestToken, status: "MISS" };
        const entry = { surface: originalSurface };
        if (ipa) entry.ipa = ipa;
        if (pronunciations.length) entry.pronunciations = pronunciations;
        if (audio) entry.audio = audio;
        return { requestToken, status: "HIT", entry };
      } finally {
        try { await db.closeDatabase?.(); } catch (_) {}
      }
    } catch (_) {
      this._forgetVerifiedDictionary(dictionaryPath);
      if (selectedCustom) {
        try {
          await this._verifiedDictionary(dictionaryPath, expected, expectedHash);
        } catch (_) {
          return this._lookupPronunciation(request, true);
        }
      }
      return { requestToken, status: "ERROR" };
    } finally {
      releaseDictionaryReader();
    }
  }

  async lookupQuickContext(request = {}) {
    const token = String(request?.requestToken || "");
    if (this.stopped) return { requestToken: token, status: "ERROR" };
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller) this.abortControllers.add(controller);
    const pending = this._lookupQuickContext(request, controller?.signal || null);
    this.lookupTasks.add(pending);
    try { return await pending; }
    finally {
      this.lookupTasks.delete(pending);
      if (controller) this.abortControllers.delete(controller);
    }
  }

  async _lookupQuickContext(request = {}, signal = null) {
    const requestToken = String(request?.requestToken || "");
    const surface = String(request?.surface || "").trim();
    const sentence = String(request?.sentence || "").trim();
    const surfaceStart = Number.isInteger(request?.surfaceStart) && request.surfaceStart >= 0
      ? request.surfaceStart
      : null;
    const sourceLanguage = String(request?.sourceLanguage || "").trim();
    const targetLanguage = String(request?.targetLanguage || "").trim();
    if (!surface || !sentence || !lkLookupLanguage(sourceLanguage) || !lkLookupLanguage(targetLanguage)) {
      return { requestToken, status: "MISS" };
    }
    let result;
    try {
      result = lkLookupQuickContextResult(await this.dependencies.translateQuickContext({
        surface, sentence, ...(surfaceStart === null ? {} : { surfaceStart }),
        sourceLanguage, targetLanguage, signal
      }));
    } catch (_) {
      return { requestToken, status: "ERROR" };
    }
    if (signal?.aborted || this.stopped || !result) return { requestToken, status: "ERROR" };
    try { this.state.addTranslation(surface, result.contextualMeaning, targetLanguage); }
    catch (error) { try { this.dependencies.logError?.(error); } catch (_) {} }
    return { requestToken, status: "HIT", ...result };
  }
  async _lookupDictionary(request = {}, forceDefault = false) {
    const { requestToken = "", surface = "", sourceLanguage = "", targetLanguage = "" } = request;
    const token = String(requestToken || "");
    const originalSurface = String(surface || "").trim();
    const normalizedTerm = lkLookupTerm(originalSurface);
    if (!normalizedTerm || !lkLookupLanguage(sourceLanguage) || !lkLookupLanguage(targetLanguage)) {
      return { requestToken: token, status: "MISS" };
    }
    if (!forceDefault) {
      const customActivation = this.dictionaryActivations.get(this.customPath);
      if (customActivation) await customActivation;
    }
    const config = this._config();
    let selectedMode = forceDefault ? "default" : config.mode;
    let dictionaryPath = this.customPath;
    let expected = { sourceLanguage, targetLanguage };
    let verifiedDictionary = null;
    const selectDefault = async () => {
      const catalogEntry = this._catalogEntry(sourceLanguage, targetLanguage);
      if (!catalogEntry) return null;
      const path = this._defaultPath(catalogEntry);
      try {
        const verified = await this._verifiedDictionary(path, catalogEntry, catalogEntry.sha256);
        return { path, expected: catalogEntry, verified };
      } catch (_) {
        return null;
      }
    };
    if (selectedMode === "custom") {
      try {
        verifiedDictionary = await this._verifiedDictionary(
          dictionaryPath,
          { dictionaryID: config.custom?.dictionaryID, ...expected },
          config.custom?.sha256
        );
      } catch (_) {
        const fallback = await selectDefault();
        if (!fallback) {
          this._startDefaultDictionaryDownload(sourceLanguage, targetLanguage);
          return { requestToken: token, status: "UNAVAILABLE" };
        }
        selectedMode = "default";
        dictionaryPath = fallback.path;
        expected = fallback.expected;
        verifiedDictionary = fallback.verified;
      }
    } else {
      const selected = await selectDefault();
      if (!selected) {
        this._startDefaultDictionaryDownload(sourceLanguage, targetLanguage);
        return { requestToken: token, status: "UNAVAILABLE" };
      }
      dictionaryPath = selected.path;
      expected = selected.expected;
      verifiedDictionary = selected.verified;
    }
    const releaseDictionaryReader = await this._acquireDictionaryReader(dictionaryPath);
    let lookupError = null;
    try {
      const verificationExpected = selectedMode === "custom"
        ? { dictionaryID: config.custom?.dictionaryID, ...expected }
        : expected;
      verifiedDictionary = await this._verifiedDictionary(
        dictionaryPath,
        verificationExpected,
        selectedMode === "custom" ? config.custom?.sha256 : expected.sha256
      );
      const dictionaryIdentity = String(verifiedDictionary.metadata.dictionaryID) + ":" +
        verifiedDictionary.contentHash + ":" + LK_LOOKUP_CACHE_RECORD_VERSION;
      const cacheParams = [
        dictionaryIdentity,
        lkLookupLanguage(sourceLanguage),
        lkLookupLanguage(targetLanguage),
        normalizedTerm
      ];
      if (this.cacheDB) {
        try {
          const cached = await this.cacheDB.valueQueryAsync(
            "SELECT result_json FROM lookup_cache WHERE dictionary_identity = ? AND source_language = ? AND target_language = ? AND normalized_term = ?",
            cacheParams
          );
          const cachedEntry = lkLookupCachedEntry(cached, originalSurface);
          if (cachedEntry) return { requestToken: token, status: "HIT", entry: cachedEntry };
        } catch (_) {}
      }
      const db = this.dependencies.dbFactory(dictionaryPath);
      try {
        const queryTerm = async (term, includePronunciation) => {
          const rows = await db.queryAsync(
            "SELECT headword, meanings_json, pos_json, ipa, audio_json, lemma, forms_json FROM entries WHERE headword_norm = ? LIMIT 8",
            [term]
          );
          const meanings = [];
          const seenMeanings = new Set();
          const pos = [];
          const seenPOS = new Set();
          let dictionaryForm = "";
          let ipa = "";
          let audio = null;
          const pronunciations = [];
          const seenPronunciations = new Set();
          for (const row of rows || []) {
            const rowHeadword = String(row.headword || "").trim();
            const rowDictionaryForm = String(row.lemma || row.headword || "").trim();
            if (!dictionaryForm) dictionaryForm = rowDictionaryForm;
            for (const meaning of lkLookupJSONStrings(row.meanings_json, 3)) {
              if (!seenMeanings.has(meaning) && meanings.length < 3) {
                seenMeanings.add(meaning);
                meanings.push(meaning);
              }
            }
            for (const value of lkLookupJSONStrings(row.pos_json, 16)) {
              if (!seenPOS.has(value)) {
                seenPOS.add(value);
                pos.push(value);
              }
            }
            const isSurfacePronunciation = includePronunciation && lkLookupTerm(rowHeadword) === term;
            if (isSurfacePronunciation) {
              if (!ipa) ipa = String(row.ipa || "").trim();
              if (!audio) audio = lkLookupAudio(row.audio_json);
              for (const record of lkLookupPronunciations(row.audio_json)) {
                const key = `${record.region || ""}\u0000${record.ipa}`;
                if (seenPronunciations.has(key)) continue;
                seenPronunciations.add(key);
                pronunciations.push(record);
              }
            }
          }
          if (!meanings.length) return null;
          const entry = {
            surface: originalSurface,
            dictionaryForm: dictionaryForm || originalSurface,
            meanings
          };
          if (pos.length) entry.pos = pos;
          if (ipa) entry.ipa = ipa;
          if (pronunciations.length) entry.pronunciations = pronunciations;
          if (audio) entry.audio = audio;
          return entry;
        };
        let entry = await queryTerm(normalizedTerm, true);
        if (!entry) {
          const candidate = lkLookupCorrection(originalSurface, normalizedTerm);
          if (candidate) entry = await queryTerm(candidate, false);
        }
        if (!entry) return { requestToken: token, status: "MISS" };
        if (this.cacheDB) {
          try {
            const cachedEntry = { ...entry };
            delete cachedEntry.surface;
            await this.cacheDB.queryAsync(
              "INSERT OR REPLACE INTO lookup_cache (dictionary_identity, source_language, target_language, normalized_term, result_json) VALUES (?, ?, ?, ?, ?)",
              [...cacheParams, JSON.stringify(cachedEntry)]
            );
          } catch (_) {}
        }
        return { requestToken: token, status: "HIT", entry };
      } finally {
        try { await db.closeDatabase?.(); } catch (_) {}
      }
    } catch (error) {
      lookupError = error;
    } finally {
      releaseDictionaryReader();
    }
    this._forgetVerifiedDictionary(dictionaryPath);
    if (selectedMode === "custom") {
      try {
        await this._verifiedDictionary(
          dictionaryPath,
          { dictionaryID: config.custom?.dictionaryID, ...expected },
          config.custom?.sha256
        );
        return { requestToken: token, status: "ERROR" };
      } catch (_) {
        return this._lookupDictionary(request, true);
      }
    }
    if (lookupError) this._startDefaultDictionaryDownload(sourceLanguage, targetLanguage);
    return { requestToken: token, status: "UNAVAILABLE" };
  }

  async getDictionaryStatus({ sourceLanguage = "", targetLanguage = "" } = {}) {
    if (!sourceLanguage && !targetLanguage && this.latestExactPair) {
      ({ sourceLanguage, targetLanguage } = this.latestExactPair);
    }
    const config = this._config();
    if (config.mode === "custom") {
      try {
        const metadata = await this._validateDictionary(this.customPath, {
          sourceLanguage: sourceLanguage || undefined,
          targetLanguage: targetLanguage || undefined
        });
        return { mode: "custom", status: "READY", ...this._publicMetadata(metadata) };
      } catch (error) {
        this._forgetVerifiedDictionary(this.customPath);
        return {
          mode: "custom", status: "UNUSABLE", reason: error?.code || "VALIDATION_FAILED",
          fallback: "default",
          dictionaryID: config.custom?.dictionaryID || null,
          sourceLanguage: config.custom?.sourceLanguage || sourceLanguage,
          targetLanguage: config.custom?.targetLanguage || targetLanguage
        };
      }
    }
    const entry = this._catalogEntry(sourceLanguage, targetLanguage);
    if (!entry) return {
      mode: "default", status: "UNAVAILABLE", reason: "NO_CATALOG_PAIR",
      sourceLanguage, targetLanguage
    };
    const path = this._defaultPath(entry);
    try {
      const hash = String(await this.dependencies.sha256File(path)).toLowerCase();
      if (hash !== String(entry.sha256).toLowerCase()) throw lkLookupError("SHA256_MISMATCH", "Dictionary hash mismatch");
      const metadata = await this._validateDictionary(path, entry);
      return { mode: "default", status: "READY", ...this._publicMetadata(metadata) };
    } catch (error) {
      this._forgetVerifiedDictionary(path);
      return {
        mode: "default", status: "UNAVAILABLE", reason: error?.code || "NOT_INSTALLED",
        dictionaryID: entry.dictionaryID, sourceLanguage: entry.sourceLanguage, targetLanguage: entry.targetLanguage
      };
    }
  }
}

this.LingKumaLookupService = LingKumaLookupService;
