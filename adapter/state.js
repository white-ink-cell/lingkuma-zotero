/*
 * LingKuma for Zotero — platform state adapter
 *
 * The language-learning/highlighting/tooltip scripts in upstream/ are copied
 * from LingKuma commit ef15914a85166c24ae6db1b7d98773127dcaf4a4.
 * This file replaces the browser extension's Chrome storage, IndexedDB and
 * background-service plumbing with Zotero-local persistence.
 */

const LK_DEFAULT_STORAGE = Object.freeze({
  enablePlugin: true,
  wordHighlightFloatingButtonEnabled: true,
  wordHighlightFloatingButtonScope: "global",
  wordHighlightFloatingButtonPosition: null,
  highlightPageThemeOverrides: {},
  wordHighlightPageTabOverrides: {},
  pluginBlacklistWebsites: "",
  highlightAlphabeticEnabled: true,
  highlightChineseEnabled: false,
  highlightJapaneseEnabled: false,
  highlightKoreanEnabled: false,
  autoDetectJapaneseKanji: true,
  useKuromojiTokenizer: false,
  autoLoadKuromojiForJapanese: false,
  // Match LingKuma browser defaults. These switches control whether the
  // blue/orange Chinese meaning capsules are actually populated. Omitting
  // them makes the upstream tooltip render only its placeholder faces.
  autoRequestAITranslations: true,
  autoRequestAITranslations2: true,
  autoAddAITranslations: true,
  autoAddAITranslationsFromUnknown: true,
  autoAddExampleSentences: false,
  autoAddSentencesLimit: 1,
  clickOnlyTooltip: true,
  autoExpandTooltip: false,
  autoCloseTooltip: false,
  autoRefreshTooltip: false,
  defaultExpandTooltip: false,
  defaultExpandSententsTooltip: true,
  defaultExpandCapsule: true,
  preferPopupAbove: false,
  selectionPopupPreferDown: false,
  tooltipGap: 0,
  selectionPopupGap: 10,
  // Match LingKuma browser defaults: clicking a highlighted word opens both
  // the word tooltip and the sentence translation / word-explosion panel.
  wordExplosionEnabled: true,
  wordExplosionTriggerMode: "click",
  wordExplosionPositionMode: "auto",
  wordExplosionFontSize: 14,
  wordExplosionMaxWidth: 772,
  wordExplosionPreferUp: true,
  wordExplosionLayout: "vertical",
  wordExplosionWordsLayout: "triple-column",
  wordExplosionTranslationCount: "all",
  explosionSentenceTranslationCount: 1,
  wordExplosionHighlightSentence: true,
  wordExplosionHighlightColor: "#955FBD40",
  wordExplosionHighlightOpacity: 25,
  wordExplosionUnderlineEnabled: false,
  wordExplosionUnderlineStyle: "solid",
  wordExplosionUnderlinePosition: "bottom",
  wordExplosionUnderlineColor: "#955FBD80",
  wordExplosionUnderlineOpacity: 50,
  wordExplosionUnderlineThickness: 3,
  explosionPriorityMode: false,
  explosionHighlightWithTTS: false,
  explosionHighlightNoTTS: false,
  explosionTTSOnly: false,
  explosionHighlightSpeed: 100,
  showKnownSentenceAnimation: true,
  showExplosionSentence: false,
  liquidGlassEnabled: false,
  analysisGlassEnabled: false,
  tooltipThemeMode: "auto",
  tooltipBackground: { enabled: true, useCustom: false, defaultType: "svg" },
  enableWaifu: false,
  bionicEnabled: false,
  bionicFontFamily: "auto",
  bionicFontSize: 16,
  thanoxReadingEnabled: false,
  readingRuler: false,
  rulerSettings: { height: 24, color: "#6f6f6f", opacity: 0.3, isInverted: false, widthMode: "auto", customWidth: 200 },
  posHighlightEnabled: false,
  posHighlightLanguage: "german",
  posHighlightVerbEnabled: true,
  posHighlightVerbBackgroundEnabled: true,
  posHighlightVerbBackgroundColor: "#FF6B6B40",
  posHighlightVerbBackgroundOpacity: 25,
  posHighlightVerbUnderlineEnabled: true,
  posHighlightVerbUnderlineStyle: "wavy",
  posHighlightVerbUnderlineColor: "#FF6B6B",
  posHighlightVerbUnderlineThickness: 2,
  posHighlightVerbUnderlinePosition: "bottom",
  posHighlightPrepositionEnabled: true,
  posHighlightPrepositionBackgroundEnabled: true,
  posHighlightPrepositionBackgroundColor: "#f2935440",
  posHighlightPrepositionBackgroundOpacity: 25,
  posHighlightPrepositionUnderlineEnabled: true,
  posHighlightPrepositionUnderlineStyle: "solid",
  posHighlightPrepositionUnderlineColor: "#f29354",
  posHighlightPrepositionUnderlineThickness: 2,
  posHighlightPrepositionUnderlinePosition: "bottom",
  sidePanelBtn: false,
  useOrionTTS: false,
  cloudConfig: { cloudDbEnabled: false, cloudDualWrite: false },
  cloudDbEnabled: false,
  cloudDualWrite: false,
  cloudSelfHosted: false,
  cloudServerUrl: "",
  webdavConfig: { url: "", username: "", password: "", filename: "lingkuma-zotero-backup.json" },
  settingsPanelTheme: "light",
  ttsConfig: {
    wordTTSProvider: "edge", sentenceTTSProvider: "edge", localTTSVoice: "",
    localTTSRate: 1, localTTSPitch: 1, edgeTTSAutoVoice: true, edgeTTSVoice: "",
    edgeTTSRate: 0, edgeTTSVolume: 0, edgeTTSPitch: 0,
    wordAudioUrlTemplate: "", wordAudioUrlTemplate2: "", audioUrlNotebook: ""
  },
  wordTTSProvider: "edge",
  sentenceTTSProvider: "edge",
  enableWordTTS: true,
  enableSentenceTTS: true,
  sentenceTTSAutoDetectLanguage: true,
  enableAutoWordTTS: false,
  localTTSVoice: "",
  localTTSRate: 1,
  localTTSPitch: 1,
  edgeTTSAutoVoice: true,
  edgeTTSVoice: "",
  edgeTTSRate: 0,
  edgeTTSVolume: 0,
  edgeTTSPitch: 0,
  gptTTSBaseURL: "",
  gptTTSApiKey: "",
  gptTTSModel: "gpt-4o-mini-tts",
  gptTTSVoice: "alloy",
  gptTTSResponseFormat: "mp3",
  gptTTSSpeed: 1,
  gptTTSInstructions: "",
  wordAudioUrlTemplate: "",
  wordAudioUrlTemplate2: "",
  wordQueryKey: "q",
  copySentenceKey: "w",
  analysisWindowKey: "e",
  sentenceExplosionKey: "t",
  wordStatusKeys: {
    0: "`", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5",
    toggle: " ", addAITranslation: "tab", closeTooltip: "capslock"
  },
  devicePixelRatio: 1,
  // The browser build defaults to Rough. "none" makes the upstream liquid
  // class transparent while creating no actual filter layer.
  glassEffectType: "rough",
  customCapsules: [],
  epubSoftHyphenCleanup: true,
  epubHyphenRepair: true,
  interfaceLanguage: "auto",
  translationConfig: {
    targetLanguage: "zh-CN",
    provider: "microsoft-edge",
    timeoutSeconds: 15
  },
  aiConfig: {
    aiChannel: "diy",
    apiBaseURL: "",
    apiModel: "",
    apiKey: "",
    apiTemperature: 1,
    enableApiPolling: false
  },
  customApiProfiles: { profiles: [], activeProfileId: null }
});

function lkClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function lkOpacityPercentFromColor(value) {
  const match = String(value || "").match(/^#[0-9a-f]{6}([0-9a-f]{2})$/i);
  return match ? Math.round((parseInt(match[1], 16) / 255) * 100) : null;
}

function lkNormalizeWord(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s.,;:!?()[\]{}“”‘’\"']+|[\s.,;:!?()[\]{}“”‘’\"']+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function lkNormalizeStatus(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.max(0, Math.min(5, Math.round(n))));
}

function lkFreshRecord(word, originalWord = word) {
  return {
    word,
    term: String(originalWord || word),
    status: "0",
    language: "auto",
    translations: [],
    tags: [],
    sentences: [],
    statusHistory: {},
    isCustom: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function lkNormalizeRecord(word, raw = {}) {
  const rec = { ...lkFreshRecord(word, raw.term || raw.word || word), ...(raw || {}) };
  rec.word = word;
  rec.term = String(rec.term || raw.word || word);
  rec.status = lkNormalizeStatus(rec.status);
  rec.language = rec.language || "auto";
  rec.translations = Array.isArray(rec.translations) ? rec.translations.filter(Boolean).map(String) : [];
  rec.tags = Array.isArray(rec.tags) ? rec.tags.filter(Boolean).map(String) : [];
  rec.sentences = Array.isArray(rec.sentences)
    ? rec.sentences.map(item => {
        if (typeof item === "string") return { sentence: item, translation: "", url: "" };
        return {
          sentence: String(item?.sentence || ""),
          translation: String(item?.translation || ""),
          url: String(item?.url || "")
        };
      }).filter(item => item.sentence)
    : [];
  rec.statusHistory = rec.statusHistory && typeof rec.statusHistory === "object" ? rec.statusHistory : {};
  rec.isCustom = rec.isCustom === true;
  rec.updatedAt = rec.updatedAt || new Date().toISOString();
  return rec;
}

function lkMergeRecords(localRaw, remoteRaw, word) {
  const local = lkNormalizeRecord(word, localRaw || {});
  const remote = lkNormalizeRecord(word, remoteRaw || {});
  const newer = new Date(remote.updatedAt || 0) > new Date(local.updatedAt || 0) ? remote : local;
  const localStatus = Number(local.status);
  const remoteStatus = Number(remote.status);
  const hasMasteryConflict = (localStatus >= 4) !== (remoteStatus >= 4);
  return lkNormalizeRecord(word, {
    ...local,
    ...newer,
    status: hasMasteryConflict ? String(Math.min(localStatus, remoteStatus)) : newer.status,
    translations: Array.from(new Set([...(local.translations || []), ...(remote.translations || [])])),
    tags: Array.from(new Set([...(local.tags || []), ...(remote.tags || [])])),
    sentences: Array.from(
      new Map(
        [...(local.sentences || []), ...(remote.sentences || [])]
          .filter(item => item?.sentence)
          .map(item => [String(item.sentence), item])
      ).values()
    ),
    statusHistory: { ...(local.statusHistory || {}), ...(remote.statusHistory || {}) },
    isCustom: local.isCustom || remote.isCustom,
    updatedAt: newer.updatedAt || new Date().toISOString()
  });
}

class LingKumaStateAdapter {
  constructor({ pluginID, version }) {
    this.pluginID = pluginID;
    this.version = version;
    this.storage = lkClone(LK_DEFAULT_STORAGE);
    this.words = {};
    this.storageListeners = new Set();
    this.aiPollingIndex = 0;
    this.saveTimer = null;
    this.saveTail = Promise.resolve();
    this.loaded = false;
    this.statePath = null;
    this.stateWriteBlocked = false;
    this.recoveryPath = null;
    this.fallbackPref = "extensions.lingkumaZotero.state";
    this.adapterSchemaVersion = 10;
    this.translationCache = new Map();
  }

  debug(message) {
    try { Zotero.debug(`[LingKuma State] ${message}`); } catch (_) {}
  }

  async _preserveMalformedStateFile(parseError) {
    if (!this.statePath) return false;
    try {
      if (!(await IOUtils.exists(this.statePath))) return false;
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const recoveryPath = `${this.statePath}.recovery-${stamp}`;
      await IOUtils.copy(this.statePath, recoveryPath, { noOverwrite: true });
      this.recoveryPath = recoveryPath;
      this.debug(`malformed state preserved before recovery: ${recoveryPath}`);
      return true;
    } catch (copyError) {
      // Never overwrite the only recoverable copy if the safety copy failed.
      this.stateWriteBlocked = true;
      this.debug(`malformed state recovery copy failed; state.json writes blocked: ${copyError?.message || copyError}`);
      try { Zotero.logError(copyError); } catch (_) {}
      if (parseError) {
        try { Zotero.logError(parseError); } catch (_) {}
      }
      return false;
    }
  }

  async load() {
    let parsed = null;
    try {
      const dir = PathUtils.join(Zotero.DataDirectory.dir, "lingkuma-zotero");
      this.statePath = PathUtils.join(dir, "state.json");
      await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
      if (await IOUtils.exists(this.statePath)) {
        try {
          const raw = await Zotero.File.getContentsAsync(this.statePath);
          parsed = JSON.parse(raw);
        } catch (error) {
          try { Zotero.logError(error); } catch (_) {}
          await this._preserveMalformedStateFile(error);
        }
      }
    } catch (error) {
      try { Zotero.logError(error); } catch (_) {}
    }

    if (!parsed) {
      try {
        const raw = Zotero.Prefs.get(this.fallbackPref, true);
        if (raw) parsed = JSON.parse(raw);
      } catch (_) {}
    }

    if (parsed && typeof parsed === "object") {
      const storedStorage = parsed.storage && typeof parsed.storage === "object" ? parsed.storage : {};
      this.storage = { ...lkClone(LK_DEFAULT_STORAGE), ...storedStorage };
      for (const [colorKey, opacityKey] of [
        ["wordExplosionHighlightColor", "wordExplosionHighlightOpacity"],
        ["wordExplosionUnderlineColor", "wordExplosionUnderlineOpacity"],
        ["posHighlightVerbBackgroundColor", "posHighlightVerbBackgroundOpacity"],
        ["posHighlightPrepositionBackgroundColor", "posHighlightPrepositionBackgroundOpacity"],
      ]) {
        if (Object.prototype.hasOwnProperty.call(storedStorage, opacityKey)) continue;
        const derived = lkOpacityPercentFromColor(storedStorage[colorKey]);
        if (derived !== null) this.storage[opacityKey] = derived;
      }
      this.storage.aiConfig = { ...lkClone(LK_DEFAULT_STORAGE.aiConfig), ...(this.storage.aiConfig || {}) };
      this.storage.customApiProfiles = this._normalizeAIProfiles(
        this.storage.customApiProfiles,
        this.storage.aiConfig,
      );
      const storedTranslation = this.storage.translationConfig && typeof this.storage.translationConfig === "object"
        ? this.storage.translationConfig
        : {};
      this.storage.translationConfig = {
        targetLanguage: storedTranslation.targetLanguage || LK_DEFAULT_STORAGE.translationConfig.targetLanguage,
        provider: "microsoft-edge",
        timeoutSeconds: storedTranslation.timeoutSeconds ?? LK_DEFAULT_STORAGE.translationConfig.timeoutSeconds,
      };
      this.storage.rulerSettings = { ...lkClone(LK_DEFAULT_STORAGE.rulerSettings), ...(this.storage.rulerSettings || {}) };
      this.storage.wordStatusKeys = { ...lkClone(LK_DEFAULT_STORAGE.wordStatusKeys), ...(this.storage.wordStatusKeys || {}) };
      const storedTTSConfig = parsed.storage?.ttsConfig && typeof parsed.storage.ttsConfig === "object"
        ? parsed.storage.ttsConfig
        : {};
      this.storage.ttsConfig = { ...lkClone(LK_DEFAULT_STORAGE.ttsConfig), ...storedTTSConfig };
      for (const key of Object.keys(LK_DEFAULT_STORAGE.ttsConfig)) {
        if (!Object.prototype.hasOwnProperty.call(storedTTSConfig, key)
          && Object.prototype.hasOwnProperty.call(parsed.storage || {}, key)) {
          if (["wordTTSProvider", "sentenceTTSProvider"].includes(key)
            && !["local", "edge", "custom", "custom2"].includes(parsed.storage[key])) continue;
          this.storage.ttsConfig[key] = lkClone(parsed.storage[key]);
        }
      }

      // 0.3.0-0.3.2 omitted these upstream AI request/save controls from Zotero
      // preferences. Migrate only adapter states written before schema 3: the
      // controls were not user-editable there, while current profiles preserve
      // every explicit choice, including disabling automatic AI1 persistence.
      const storedSchema = Number(parsed.adapterSchemaVersion || parsed.version || 0);
      if (storedSchema < 3) {
        this.storage.autoRequestAITranslations = true;
        this.storage.autoRequestAITranslations2 = true;
        this.storage.autoAddAITranslations = true;
        this.storage.autoAddAITranslationsFromUnknown = true;
        this.storage.autoAddExampleSentences = false;
        this.storage.autoAddSentencesLimit = 1;
        this.storage.defaultExpandSententsTooltip = true;
        this.storage.defaultExpandCapsule = true;
      }
      // 0.3.0-0.3.3 did not expose the browser floating controls and
      // accidentally disabled LingKuma's sentence translation / word-explosion
      // panel. These values were not user-configurable in those builds, so the
      // migration can safely restore the upstream defaults.
      if (storedSchema < 4) {
        this.storage.wordHighlightFloatingButtonEnabled = true;
        this.storage.wordHighlightFloatingButtonScope = "global";
        this.storage.highlightPageThemeOverrides ||= {};
        this.storage.wordExplosionEnabled = true;
        this.storage.wordExplosionTriggerMode = "click";
        this.storage.wordExplosionPositionMode = "auto";
        this.storage.wordExplosionFontSize = 14;
        this.storage.wordExplosionMaxWidth = 772;
        this.storage.wordExplosionPreferUp = true;
        this.storage.wordExplosionLayout = "vertical";
        this.storage.wordExplosionWordsLayout = "triple-column";
        this.storage.wordExplosionTranslationCount = "all";
        this.storage.explosionSentenceTranslationCount = 1;
        this.storage.wordExplosionHighlightSentence = true;
        this.storage.wordExplosionHighlightColor = "#955FBD40";
        this.storage.wordExplosionUnderlineEnabled = false;
        this.storage.wordExplosionUnderlineStyle = "solid";
        this.storage.wordExplosionUnderlinePosition = "bottom";
        this.storage.wordExplosionUnderlineColor = "#955FBD80";
        this.storage.wordExplosionUnderlineThickness = 3;
        this.storage.showExplosionSentence = false;
      }
      // 0.4.2-0.4.4 could leave the sentence panel disabled in persisted
      // state, and the upstream pointer listener can lose its click race inside
      // Zotero's PDF iframe. Restore the browser-default sentence learning
      // controls once; the new adapter fallback still respects later user
      // changes made in the 0.4.5 settings page.
      if (storedSchema < 6) {
        this.storage.wordExplosionEnabled = true;
        this.storage.wordExplosionTriggerMode = "click";
        this.storage.wordExplosionHighlightSentence = true;
        this.storage.wordExplosionPositionMode = "auto";
      }
      // Zotero runs on Gecko. The upstream Chromium SVG-backdrop liquid
      // path is not supported here, and old adapter builds also defaulted the
      // material to "none", leaving only a nearly transparent tooltip shell.
      // Migrate that invalid combination to the upstream Rough material. The
      // reader itself uses a Gecko-compatible frosted-glass fallback.
      if (storedSchema < 7 && this.storage.glassEffectType === "none") {
        this.storage.glassEffectType = "rough";
      }
      // 0.4.5-0.4.7 could leave malformed page-theme values in persisted
      // state. Normalize only malformed values; explicit true/false choices
      // remain untouched. Runtime/theme ownership stays with upstream.
      if (storedSchema < 8) {
        this.storage.wordHighlightFloatingButtonScope = "global";
        const overrides = this.storage.highlightPageThemeOverrides;
        if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
          this.storage.highlightPageThemeOverrides = {};
        } else {
          for (const [key, value] of Object.entries(overrides)) {
            if (typeof value === "boolean") continue;
            if (value && typeof value.isDark === "boolean") overrides[key] = value.isDark;
            else delete overrides[key];
          }
        }
      }
      // Preserve explicit fixed tooltip themes from older profiles. Only values
      // outside the upstream auto/light/dark contract need migration.
      if (storedSchema < 9) {
        const tooltipThemeMode = typeof this.storage.tooltipThemeMode === "string"
          ? this.storage.tooltipThemeMode.trim().toLowerCase()
          : "auto";
        this.storage.tooltipThemeMode = ["auto", "light", "dark"].includes(tooltipThemeMode)
          ? tooltipThemeMode
          : "auto";
      }
      this.words = {};
      for (const [key, rawRecord] of Object.entries(parsed.words || {})) {
        const word = lkNormalizeWord(key || rawRecord?.word || rawRecord?.term);
        if (word) this.words[word] = lkNormalizeRecord(word, rawRecord);
      }
    }

    // Keep the in-memory shape identical for first-run and migrated installs.
    // This is intentionally done after every load path, including no state file.
    this.storage.customApiProfiles = this._normalizeAIProfiles(
      this.storage.customApiProfiles,
      this.storage.aiConfig,
    );
    this.loaded = true;
    this.debug(`loaded ${Object.keys(this.words).length} words; AI meanings: first=${this.storage.autoRequestAITranslations === true}, second=${this.storage.autoRequestAITranslations2 === true}; floating=${this.storage.wordHighlightFloatingButtonEnabled !== false}; sentencePanel=${this.storage.wordExplosionEnabled !== false}`);
    if (parsed && Number(parsed.adapterSchemaVersion || parsed.version || 0) < this.adapterSchemaVersion) {
      this.scheduleSave();
    }
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save().catch(error => Zotero.logError(error)), 250);
  }

  async save() {
    if (!this.loaded) return this.saveTail;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const payload = JSON.stringify({
      format: "lingkuma-zotero-state",
      version: 10,
      adapterSchemaVersion: this.adapterSchemaVersion,
      pluginVersion: this.version,
      savedAt: new Date().toISOString(),
      storage: this.storage,
      words: this.words
    });
    const pending = this.saveTail.then(() => this._writeStatePayload(payload));
    this.saveTail = pending.catch(() => {});
    return pending;
  }

  async _writeStatePayload(payload) {
    try {
      if (this.statePath && !this.stateWriteBlocked) {
        await Zotero.File.putContentsAsync(this.statePath, payload);
        return;
      }
      if (this.stateWriteBlocked) {
        this.debug('state.json write skipped because malformed-state recovery copy did not succeed');
      }
    } catch (error) {
      try { Zotero.logError(error); } catch (_) {}
    }
    try { Zotero.Prefs.set(this.fallbackPref, payload, true); } catch (_) {}
  }

  addStorageListener(listener) {
    if (typeof listener === "function") this.storageListeners.add(listener);
  }

  removeStorageListener(listener) {
    this.storageListeners.delete(listener);
  }

  _emitStorageChanges(changes) {
    for (const listener of Array.from(this.storageListeners)) {
      try { listener(lkClone(changes), "local"); } catch (error) { try { Zotero.logError(error); } catch (_) {} }
    }
  }

  storageGet(keys) {
    if (keys === null || keys === undefined) return lkClone(this.storage);
    if (typeof keys === "string") return { [keys]: lkClone(this.storage[keys]) };
    if (Array.isArray(keys)) {
      const result = {};
      for (const key of keys) result[key] = lkClone(this.storage[key]);
      return result;
    }
    if (typeof keys === "object") {
      const result = {};
      for (const [key, defaultValue] of Object.entries(keys)) {
        result[key] = this.storage[key] === undefined ? lkClone(defaultValue) : lkClone(this.storage[key]);
      }
      return result;
    }
    return {};
  }

  storageSet(values) {
    const changes = {};
    for (const [key, value] of Object.entries(values || {})) {
      const oldValue = lkClone(this.storage[key]);
      this.storage[key] = lkClone(value);
      changes[key] = { oldValue, newValue: lkClone(value) };
    }
    if (Object.keys(changes).length) {
      this.scheduleSave();
      this._emitStorageChanges(changes);
    }
  }

  storageRemove(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    for (const key of list) {
      if (Object.prototype.hasOwnProperty.call(this.storage, key)) {
        changes[key] = { oldValue: lkClone(this.storage[key]), newValue: undefined };
        delete this.storage[key];
      }
    }
    if (Object.keys(changes).length) {
      this.scheduleSave();
      this._emitStorageChanges(changes);
    }
  }

  storageClear() {
    // Native Zotero settings "restore defaults" keeps the exact 0.4.11
    // behavior. WebExtension clear uses the separate method below.
    const changes = {};
    for (const [key, value] of Object.entries(this.storage)) {
      changes[key] = { oldValue: lkClone(value), newValue: undefined };
    }
    this.storage = lkClone(LK_DEFAULT_STORAGE);
    this.scheduleSave();
    this._emitStorageChanges(changes);
  }

  storageClearWebExtension() {
    const changes = {};
    for (const [key, value] of Object.entries(this.storage)) {
      changes[key] = { oldValue: lkClone(value), newValue: undefined };
    }
    this.storage = {};
    this.scheduleSave();
    if (Object.keys(changes).length) this._emitStorageChanges(changes);
  }

  getWord(word, create = false, originalWord = word) {
    const key = lkNormalizeWord(word);
    if (!key) return null;
    if (!this.words[key] && create) this.words[key] = lkFreshRecord(key, originalWord);
    return this.words[key] || null;
  }

  _normalizeTargetLanguage(value) {
    const raw = String(value || "zh-CN").trim().replace(/_/g, "-");
    const lower = raw.toLowerCase();
    if (["zh", "zh-cn", "zh-hans", "chinese", "中文", "simplified chinese", "简体中文", "簡體中文"].includes(lower)) return "zh-CN";
    if (["zh-tw", "zh-hant", "zh-hk", "traditional chinese", "繁體中文", "繁体中文"].includes(lower)) return "zh-TW";
    return raw || "zh-CN";
  }

  getTargetLanguage() {
    return this._normalizeTargetLanguage(this.storage.translationConfig?.targetLanguage || "zh-CN");
  }

  _isLegacyChineseTarget(target = this.getTargetLanguage()) {
    return this._normalizeTargetLanguage(target).toLowerCase() === "zh-cn";
  }

  _recordForTarget(rawRecord, target = this.getTargetLanguage()) {
    const record = lkClone(rawRecord || {});
    if (!record || typeof record !== "object") return {};
    const normalizedTarget = this._normalizeTargetLanguage(target);
    if (!this._isLegacyChineseTarget(normalizedTarget)) {
      const byTarget = record.translationsByTarget && typeof record.translationsByTarget === "object"
        ? record.translationsByTarget
        : {};
      record.translations = Array.isArray(byTarget[normalizedTarget]) ? lkClone(byTarget[normalizedTarget]) : [];
    }
    return record;
  }

  getWordDetails(word, target = null) {
    const key = lkNormalizeWord(word);
    return this._recordForTarget(this.words[key] || {}, target || this.getTargetLanguage());
  }

  getAllWordDetails(target = null) {
    const resolved = target || this.getTargetLanguage();
    const out = {};
    for (const [word, record] of Object.entries(this.words)) out[word] = this._recordForTarget(record, resolved);
    return out;
  }

  getAllWordDetailsRaw() {
    return lkClone(this.words);
  }

  getAllWordStatusMap() {
    const statusMap = {};
    for (const [word, record] of Object.entries(this.words)) {
      statusMap[word] = { word: record.term || word, status: lkNormalizeStatus(record.status), isCustom: record.isCustom === true };
    }
    return statusMap;
  }

  batchGetWordStatus(words) {
    const statusMap = {};
    for (const rawWord of words || []) {
      const word = lkNormalizeWord(rawWord);
      const record = this.words[word];
      if (record) statusMap[word] = { word: record.term || rawWord, status: lkNormalizeStatus(record.status), isCustom: record.isCustom === true };
    }
    return statusMap;
  }

  updateWordStatus(word, status, language, isCustom) {
    const key = lkNormalizeWord(word);
    if (!key) return null;
    const record = this.getWord(key, true, word);
    const normalized = lkNormalizeStatus(status);
    record.status = normalized;
    if (language) record.language = language;
    if (isCustom !== undefined) record.isCustom = isCustom === true;
    record.statusHistory ||= {};
    record.statusHistory[normalized] = new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return lkClone(record);
  }

  updateWordLanguage(word, languageOrDetails) {
    const key = lkNormalizeWord(word);
    if (!key) return null;
    const record = this.getWord(key, true, word);
    if (typeof languageOrDetails === "string") {
      record.language = languageOrDetails;
    } else if (languageOrDetails && typeof languageOrDetails === "object") {
      const incoming = lkClone(languageOrDetails);
      // Some upstream update paths send a whole word-details object. Keep the
      // visible translations in the selected target-language bucket instead
      // of accidentally overwriting the legacy Simplified-Chinese array.
      if (Array.isArray(incoming.translations) && !this._isLegacyChineseTarget()) {
        record.translationsByTarget ||= {};
        record.translationsByTarget[this.getTargetLanguage()] = lkClone(incoming.translations);
        delete incoming.translations;
      }
      Object.assign(record, incoming);
    }
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return this._recordForTarget(record, this.getTargetLanguage());
  }

  addTranslation(word, translation, target = null) {
    const record = this.getWord(word, true, word);
    const value = String(translation || "").trim();
    if (!value) return;
    const resolved = this._normalizeTargetLanguage(target || this.getTargetLanguage());
    if (this._isLegacyChineseTarget(resolved)) {
      if (!record.translations.includes(value)) record.translations.push(value);
    } else {
      record.translationsByTarget ||= {};
      const list = Array.isArray(record.translationsByTarget[resolved]) ? record.translationsByTarget[resolved] : [];
      if (!list.includes(value)) list.push(value);
      record.translationsByTarget[resolved] = list;
    }
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  removeTranslation(word, translation, target = null) {
    const record = this.getWord(word, false);
    if (!record) return;
    const resolved = this._normalizeTargetLanguage(target || this.getTargetLanguage());
    if (this._isLegacyChineseTarget(resolved)) {
      record.translations = record.translations.filter(item => item !== translation);
    } else if (record.translationsByTarget && typeof record.translationsByTarget === "object") {
      const list = Array.isArray(record.translationsByTarget[resolved]) ? record.translationsByTarget[resolved] : [];
      record.translationsByTarget[resolved] = list.filter(item => item !== translation);
    }
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  addTag(word, tag) {
    const record = this.getWord(word, true, word);
    const value = String(tag || "").trim();
    if (value && !record.tags.includes(value)) record.tags.push(value);
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  removeTag(word, tag) {
    const record = this.getWord(word, false);
    if (!record) return;
    record.tags = record.tags.filter(item => item !== tag);
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  addSentence(word, sentence, translation = "", url = "") {
    const record = this.getWord(word, true, word);
    const text = String(sentence || "").trim();
    if (text && !record.sentences.some(item => item.sentence === text)) {
      record.sentences.push({ sentence: text, translation: String(translation || ""), url: String(url || "") });
    }
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  removeSentence(word, sentence) {
    const record = this.getWord(word, false);
    if (!record) return;
    record.sentences = record.sentences.filter(item => item.sentence !== sentence);
    record.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  deleteWord(word) {
    const key = lkNormalizeWord(word);
    if (key && this.words[key]) {
      delete this.words[key];
      this.scheduleSave();
    }
  }

  getKnownWordsByStatus(statuses) {
    const wanted = new Set((statuses || []).map(lkNormalizeStatus));
    const words = [];
    const details = [];
    for (const record of Object.values(this.words)) {
      if (!wanted.size || wanted.has(lkNormalizeStatus(record.status))) {
        words.push(record.term || record.word);
        details.push(lkClone(record));
      }
    }
    return { words, details };
  }

  getCustomWords() {
    return Object.values(this.words).filter(record => record.isCustom === true).map(lkClone);
  }

  clearWords() {
    this.words = {};
    this.scheduleSave();
  }

  restoreWords(rawData, merge = false) {
    const source = rawData?.words && typeof rawData.words === "object" ? rawData.words : rawData;
    if (!source || typeof source !== "object") throw new Error("无法识别词汇数据格式");
    if (!merge) this.words = {};
    let count = 0;
    for (const [key, raw] of Object.entries(source)) {
      const word = lkNormalizeWord(key || raw?.word || raw?.term);
      if (!word || !raw || typeof raw !== "object") continue;
      this.words[word] = merge && this.words[word]
        ? lkMergeRecords(this.words[word], raw, word)
        : lkNormalizeRecord(word, raw);
      count++;
    }
    this.scheduleSave();
    return count;
  }

  importLingKuma(rawData, merge = true) {
    const parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
    if (!parsed || typeof parsed !== "object") throw new Error("JSON 内容无效");
    const candidates = parsed.words || parsed.wordDetails || parsed.vocabulary || parsed.data || parsed;
    if (Array.isArray(candidates)) {
      const map = {};
      for (const item of candidates) {
        if (typeof item === "string") map[item] = { word: item, term: item, status: "5" };
        else if (item && typeof item === "object") {
          const word = item.word || item.term || item.value;
          if (word) map[word] = item;
        }
      }
      return this.restoreWords(map, merge);
    }
    if (candidates && typeof candidates === "object") return this.restoreWords(candidates, merge);
    throw new Error("未找到可导入的词汇记录");
  }

  exportData() {
    return {
      format: "lingkuma-zotero-export",
      version: 10,
      adapterSchemaVersion: this.adapterSchemaVersion,
      exportedAt: new Date().toISOString(),
      words: lkClone(this.words)
    };
  }

  _decodeBase64(value) {
    const win = Zotero.getMainWindow?.();
    if (win?.atob) return win.atob(value);
    if (typeof atob === "function") return atob(value);
    throw new Error("当前环境不支持 Base64 解码");
  }

  getDefaultAIConfigs() {
    // Copied from LingKuma background.js applyDefaultConfig(). These keys are
    // intentionally present in the public MIT-licensed upstream repository.
    const encoded = [
      "YmFlMjdlNDQyODgyNGZlOGExNjFlZTc0ZDYyZWIzM2YubW5uOEVoNEplVG9kcmY0bg==",
      "ODUwZTNlMmEzYmVkNDg2N2I2MGIzZWI2NmUyMDAyNjMuYWhSOGhxYkJvaG1wRG81eg==",
      "MGZmMDYwNTZlODhhNGNlMmI1ZTA4NzIxZTNjNGNkNmQuMnV0djhRaDVlZU1jcnJHcA==",
      "YzZhYzJlYjllMTJiNGJiNWEwZDczYzliNzZkODEzNzAuRnpITlNoZnFteEx4MHV4WA==",
      "ZjAwMmZlNTUzNGQ4NDYxNWEyM2VjOTlhODM1ZDZiM2UuR2h1NVRrSmVDS0xiSGhMZA=="
    ];
    return encoded.map(key => ({
      apiBaseURL: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      apiModel: "GLM-4-Flash",
      apiKey: this._decodeBase64(key),
      source: "LingKuma built-in free BigModel pool"
    }));
  }

  getEffectiveAIConfig({ advancePolling = false } = {}) {
    const ai = this.storage.aiConfig || {};
    const profiles = this._normalizeAIProfiles(this.storage.customApiProfiles, ai);
    this.storage.customApiProfiles = profiles;
    let profile = profiles.profiles.find(item => item.id === profiles.activeProfileId) || null;
    if (ai.enableApiPolling === true) {
      const enabled = profiles.profiles.filter(item => item.enablePolling === true && item.apiBaseURL);
      if (enabled.length) {
        profile = enabled[this.aiPollingIndex % enabled.length];
        if (advancePolling) this.aiPollingIndex = (this.aiPollingIndex + 1) % enabled.length;
      }
    }
    if (String(profile?.apiBaseURL || '').trim()) {
      return {
        apiBaseURL: String(profile.apiBaseURL).trim(),
        apiModel: String(profile.apiModel || '').trim(),
        apiKey: String(profile.apiKey || '').trim(),
        temperature: profile.apiTemperature === undefined ? 1 : Number(profile.apiTemperature),
        excludeTemperature: profile.excludeTemperature === true,
        customRequestBody: String(profile.customRequestBody || ''),
        source: "custom"
      };
    }
    if (String(ai.apiBaseURL || "").trim()) {
      return {
        apiBaseURL: String(ai.apiBaseURL).trim(),
        apiModel: String(ai.apiModel || "").trim(),
        apiKey: String(ai.apiKey || "").trim(),
        temperature: ai.apiTemperature === undefined ? 1 : Number(ai.apiTemperature),
        source: "custom"
      };
    }
    const defaults = this.getDefaultAIConfigs();
    return { ...defaults[0], temperature: 1 };
  }

  _normalizeAIProfile(raw, index = 0) {
    const profile = raw && typeof raw === "object" ? raw : {};
    const numericTemperature = Number(profile.apiTemperature);
    return {
      id: String(profile.id || `profile-${index + 1}`).slice(0, 128),
      name: String(profile.name || `Profile ${index + 1}`).slice(0, 100),
      apiBaseURL: String(profile.apiBaseURL || "").slice(0, 2048),
      apiKey: String(profile.apiKey || "").slice(0, 8192),
      apiModel: String(profile.apiModel || "").slice(0, 512),
      apiTemperature: Number.isFinite(numericTemperature) ? Math.max(0, Math.min(2, numericTemperature)) : 1,
      enablePolling: profile.enablePolling === true,
      excludeTemperature: profile.excludeTemperature === true,
      customRequestBody: String(profile.customRequestBody || "").slice(0, 32768)
    };
  }

  _normalizeAIProfiles(raw, legacyAI = {}) {
    const container = raw && typeof raw === "object" ? raw : {};
    let profiles = Array.isArray(container.profiles)
      ? container.profiles.slice(0, 20).map((profile, index) => this._normalizeAIProfile(profile, index))
      : [];
    if (!profiles.length) {
      profiles = [this._normalizeAIProfile({
        id: "default",
        name: "Default",
        apiBaseURL: legacyAI?.apiBaseURL,
        apiKey: legacyAI?.apiKey,
        apiModel: legacyAI?.apiModel,
        apiTemperature: legacyAI?.apiTemperature,
        enablePolling: true
      })];
    }
    const unique = [];
    const seen = new Set();
    for (const profile of profiles) {
      let id = profile.id;
      let suffix = 2;
      while (seen.has(id)) id = `${profile.id}-${suffix++}`;
      seen.add(id);
      unique.push({ ...profile, id });
    }
    const requestedActive = String(container.activeProfileId || "");
    const activeProfileId = unique.some(profile => profile.id === requestedActive)
      ? requestedActive
      : unique[0].id;
    return { profiles: unique, activeProfileId };
  }

  _parseCustomRequestBody(text) {
    const result = Object.create(null);
    const forbidden = new Set(["__proto__", "prototype", "constructor", "messages", "model", "stream", "temperature"]);
    for (const line of String(text || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
      const separator = line.indexOf("=");
      const key = separator > 0 ? line.slice(0, separator).trim() : "";
      const encoded = separator > 0 ? line.slice(separator + 1).trim() : "";
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || forbidden.has(key)) {
        throw new Error(`Invalid custom request body key: ${key || line}`);
      }
      try {
        result[key] = JSON.parse(encoded);
      } catch (_) {
        throw new Error(`Invalid custom request body value for ${key}`);
      }
    }
    return result;
  }

  _getPromptOverrides() {
    const promptKeys = [
      "aiPrompt", "aiPrompt2", "aiLanguageDetectionPrompt", "aiTagAnalysisPrompt",
      "aiSentenceTranslationPrompt", "aiAnalysisPrompt", "sidebarAIPrompt"
    ];
    const promptOverrides = {};
    for (const key of promptKeys) {
      const value = this.storage[key];
      if (value !== undefined && value !== null && String(value).trim()) promptOverrides[key] = value;
    }
    return promptOverrides;
  }

  getAIConfigForStorage() {
    // Upstream a3 reads custom prompts through chrome.storage.local.get('aiConfig').
    // Older Zotero preference panes persisted those fields at top level. Merge
    // them only in the emulated browser view, without rewriting state format.
    return { ...lkClone(this.storage.aiConfig || {}), ...lkClone(this._getPromptOverrides()) };
  }

  getAIConfigForContent() {
    const ai = this.getAIConfigForStorage();
    const effective = this.getEffectiveAIConfig();
    return {
      ...lkClone(ai),
      apiBaseURL: effective.apiBaseURL,
      apiModel: effective.apiModel,
      apiKey: effective.apiKey,
      apiTemperature: effective.temperature,
      usingLingKumaFreeAI: effective.source !== "custom"
    };
  }

  _extractAIContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map(item => typeof item === "string" ? item : item?.text || "").join("");
    }
    if (typeof data?.output_text === "string") return data.output_text;
    if (Array.isArray(data?.output)) {
      for (const out of data.output) {
        for (const part of out?.content || []) {
          if (part?.text) return part.text;
        }
      }
    }
    return "";
  }

  async _postAI(config, requestData, signal = null) {
    let url = String(config.apiBaseURL || "").replace(/\/+$/, "");
    let parsedURL;
    try { parsedURL = new URL(url); }
    catch (_) { throw new Error("AI service URL is invalid"); }
    if (!["http:", "https:"].includes(parsedURL.protocol)) throw new Error("AI service URL must use HTTP or HTTPS");
    if (!url) throw new Error("AI 服务地址为空");
    if (!/\/(chat\/completions|responses)$/i.test(url)) url += "/chat/completions";
    const body = {
      model: requestData.model || config.apiModel || "GLM-4-Flash",
      messages: requestData.messages || [],
      stream: false,
      temperature: config.temperature ?? requestData.temperature ?? 1
    };
    if (config.excludeTemperature) delete body.temperature;
    Object.assign(body, this._parseCustomRequestBody(config.customRequestBody));
    const headers = { "Content-Type": "application/json" };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    if (signal?.aborted) throw new Error("AI request cancelled");
    let cancelRequest = null;
    const cancel = () => {
      try { cancelRequest?.(); } catch (_) {}
    };
    signal?.addEventListener("abort", cancel, { once: true });
    let xhr;
    try {
      xhr = await Zotero.HTTP.request("POST", url, {
        headers,
        body: JSON.stringify(body),
        responseType: "json",
        timeout: 60000,
        cancellerReceiver(callback) {
          cancelRequest = callback;
          if (signal?.aborted) cancel();
        }
      });
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    let data = xhr?.response;
    if (!data || typeof data !== "object") {
      const raw = xhr?.responseText || "{}";
      data = JSON.parse(raw);
    }
    if (data?.error) throw new Error(data.error.message || JSON.stringify(data.error));
    if (!this._extractAIContent(data)) throw new Error("AI 服务没有返回可识别的内容");
    return data;
  }

  _targetLanguageName(target) {
    const value = this._normalizeTargetLanguage(target || this.getTargetLanguage());
    const names = {
      "zh-cn": "Simplified Chinese", "zh-tw": "Traditional Chinese",
      "en": "English", "de": "German", "fr": "French", "es": "Spanish",
      "ja": "Japanese", "ko": "Korean", "ru": "Russian", "it": "Italian", "pt": "Portuguese"
    };
    return names[value.toLowerCase()] || value;
  }

  _sourceLanguageName(word, sentence = "") {
    const sample = `${word || ""} ${sentence || ""}`;
    if (/[\u3040-\u30ff]/.test(sample)) return "Japanese";
    if (/[\uac00-\ud7af]/.test(sample)) return "Korean";
    if (/[\u4e00-\u9fff]/.test(sample)) return "Chinese";
    if (/[\u0400-\u04ff]/.test(sample)) return "Russian or another Cyrillic-script language";
    return "the source language used in the sentence";
  }

  _promptText(requestData) {
    return (requestData?.messages || [])
      .filter(item => item && typeof item === "object")
      .map(item => String(item.content || ""))
      .join("\n");
  }

  _plainTranslationRequest(requestData) {
    const prompt = this._promptText(requestData);
    const normalized = prompt.replace(/\s+/g, " ");
    const word = String(requestData?.word || "").trim();
    const sentence = String(requestData?.sentence || "").trim();
    const customWord = String(this.storage.aiPrompt || this.storage.aiConfig?.aiPrompt || "").trim();
    const customSentence = String(this.storage.aiSentenceTranslationPrompt || this.storage.aiConfig?.aiSentenceTranslationPrompt || "").trim();

    const isSentenceRequest = sentence && (
      prompt.includes("请将句子") ||
      (prompt.includes("翻译为中文") && prompt.includes("只返回翻译结果"))
    );
    if (isSentenceRequest) {
      // User-defined prompts are authoritative. Automatic target-language
      // routing only replaces LingKuma's own Chinese-centric defaults.
      if (customSentence) return null;
      return { kind: "sentence", text: sentence, emphasizeWord: prompt.includes("Markdown加粗") ? word : "" };
    }

    const isWordRequest = word && (
      ((prompt.includes("你是翻译专家") || prompt.includes("只输出翻译结果")) && (prompt.includes("禁止输出分析") || prompt.includes("独立单词"))) ||
      (normalized.includes("翻译") && (normalized.includes("不要解释") || normalized.includes("只返回") || normalized.includes("只输出")))
    );
    if (isWordRequest) {
      if (customWord) return null;
      return { kind: "word", text: word };
    }
    return null;
  }

  _retargetPlainAIRequest(requestData, plain, explicitTarget = null) {
    const target = this._normalizeTargetLanguage(explicitTarget || this.getTargetLanguage());
    const language = this._targetLanguageName(target);
    const out = lkClone(requestData || {});
    const sentence = String(requestData?.sentence || "").trim();
    let user = "";
    if (plain.kind === "sentence") {
      const emphasis = plain.emphasizeWord
        ? ` If the source word/expression "${plain.emphasizeWord}" has a clear corresponding span in the translation, wrap only that corresponding target-language span in Markdown bold (**...**).`
        : "";
      user = `Translate the following sentence into natural ${language} (${target}). Return only the translation, with no explanation.${emphasis}\n\n${plain.text}`;
    } else {
      const context = sentence ? `\nContext sentence: ${sentence}` : "";
      if (target.toLowerCase() === "zh-cn") {
        user = `Translate the word or short expression "${plain.text}" into ${language} (${target}) according to context. Return only one concise translation, with no explanation.${context}`;
      } else {
        user = `Translate the word or short expression "${plain.text}" into natural ${language} (${target}) as it is used in context. Preserve the contextual grammatical meaning, but do not mechanically copy source-language morphology or invent an unnatural calque. Return only one concise, dictionary-quality target-language equivalent, with no explanation.${context}`;
      }
    }
    out.messages = [
      { role: "system", content: "You are a precise translation engine. Return only the requested translation." },
      { role: "user", content: user }
    ];
    out._skipLanguageRetarget = true;
    return out;
  }

  _contextExplanationRequest(requestData) {
    const custom = String(this.storage.aiPrompt2 || this.storage.aiConfig?.aiPrompt2 || "").trim();
    if (custom) return null;
    const word = String(requestData?.word || "").trim();
    const sentence = String(requestData?.sentence || "").trim();
    if (!word || !sentence) return null;
    const prompt = this._promptText(requestData);
    const markers = ["语法解析专家", "具体语法作用", "形变规则", "返回20字左右精要解析", "待解析词"];
    return markers.filter(marker => prompt.includes(marker)).length >= 3 ? { word, sentence } : null;
  }

  _retargetContextExplanationRequest(requestData, item) {
    const target = this.getTargetLanguage();
    if (target.toLowerCase() === "zh-cn") return requestData;
    const language = this._targetLanguageName(target);
    const out = lkClone(requestData || {});
    out.messages = [
      { role: "system", content: `You are a concise language-learning grammar assistant. Answer in ${language} (${target}).` },
      { role: "user", content: `Analyze the word or expression "${item.word}" in the following sentence. Briefly explain its grammatical role and, when relevant, its inflection, conjugation, or morphological form. Respond ONLY in concise natural ${language} (${target}), in about one short sentence. Do not translate the whole sentence and do not add headings.\n\nSentence: ${item.sentence}\nWord: ${item.word}` }
    ];
    out._skipLanguageRetarget = true;
    return out;
  }

  _tagAnalysisRequest(requestData) {
    const custom = String(this.storage.aiTagAnalysisPrompt || this.storage.aiConfig?.aiTagAnalysisPrompt || "").trim();
    if (custom) return null;
    const word = String(requestData?.word || "").trim();
    const sentence = String(requestData?.sentence || "").trim();
    if (!word || !sentence) return null;
    const prompt = this._promptText(requestData);
    const markers = ["词性(pos)", "性别(gender)", "复数形式(plural)", "变位(conjugation)", "仅返回JSON"];
    return markers.filter(marker => prompt.includes(marker)).length >= 4 ? { word, sentence } : null;
  }

  _retargetTagAnalysisRequest(requestData, item) {
    const sourceName = this._sourceLanguageName(item.word, item.sentence);
    const out = lkClone(requestData || {});
    out.messages = [
      { role: "system", content: "You are a precise multilingual grammar tagger. Keep technical keys in the required LingKuma format. Any extra human-readable tag labels and values must use the SAME language as the SOURCE text. Output strict JSON only." },
      { role: "user", content: `Analyze the SOURCE word/expression "${item.word}" as used in the SOURCE sentence below. The source appears to be ${sourceName}. Do not analyze the translated equivalent. Return ONLY one JSON object, without markdown. Use these exact technical keys when applicable: "pos", "gender", "plural", "conjugation". Use compact LingKuma POS codes such as n, v, adj, adv, pron, prep, det, conj, interj, num, aux, part. For a category that does not grammatically apply, return null. In particular, Chinese verbs do not conjugate, so "conjugation" must be null for Chinese source words. For Japanese verbs, conjugation should be the dictionary form; for English/German/etc. verbs, use the ordinary lemma/base form. Any EXTRA human-readable keys and their values must be written naturally in the SAME language as the SOURCE sentence and word, not in the translation target language. Do not transliterate a Chinese word into pinyin as a conjugation.

Source sentence: ${item.sentence}
Source word: ${item.word}` }
    ];
    out._skipLanguageRetarget = true;
    return out;
  }

  _openAITextResponse(text) {
    return {
      id: "lingkuma-zotero-translation",
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content: String(text || "") }, finish_reason: "stop" }]
    };
  }

  async translateText(text, source = "auto", target = null) {
    const input = String(text || "").trim();
    if (!input) return "";
    const resolved = this._normalizeTargetLanguage(target || this.getTargetLanguage());
    const cacheKey = `${String(source || "auto")}\u0000${resolved}\u0000${input}`;
    if (this.translationCache.has(cacheKey)) return this.translationCache.get(cacheKey);
    const language = this._targetLanguageName(resolved);
    const request = {
      messages: [
        { role: "system", content: "You are a precise translation engine. Return only the requested translation." },
        { role: "user", content: `Translate the following text into natural ${language} (${resolved}). Return only the translation, with no explanation.\n\n${input}` }
      ],
      temperature: 0.2,
      _skipLanguageRetarget: true
    };
    const data = await this.makeAIRequest(request);
    const translated = String(this._extractAIContent(data) || "").trim();
    if (translated) this.translationCache.set(cacheKey, translated);
    return translated;
  }

  async makeAIRequest(requestData, { signal = null } = {}) {
    let routedRequest = requestData || {};
    if (!routedRequest._skipLanguageRetarget) {
      const plain = this._plainTranslationRequest(routedRequest);
      if (plain) routedRequest = this._retargetPlainAIRequest(routedRequest, plain);
      else {
        const contextual = this._contextExplanationRequest(routedRequest);
        if (contextual) routedRequest = this._retargetContextExplanationRequest(routedRequest, contextual);
        else {
          const tagAnalysis = this._tagAnalysisRequest(routedRequest);
          if (tagAnalysis) routedRequest = this._retargetTagAnalysisRequest(routedRequest, tagAnalysis);
        }
      }
    }
    const custom = this.getEffectiveAIConfig({ advancePolling: true });
    if (custom.source === "custom") return this._postAI(custom, routedRequest, signal);

    const configs = this.getDefaultAIConfigs();
    const offset = Math.floor(Math.random() * configs.length);
    let lastError = null;
    for (let i = 0; i < configs.length; i++) {
      const config = { ...configs[(offset + i) % configs.length], temperature: 1 };
      try {
        return await this._postAI(config, routedRequest, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
        this.debug(`free AI key ${i + 1}/${configs.length} failed: ${error?.message || error}`);
      }
    }
    throw new Error(`LingKuma 内置免费 AI 当前不可用：${lastError?.message || "所有公共密钥均请求失败"}`);
  }
}

this.LingKumaStateAdapter = LingKumaStateAdapter;
this.LK_DEFAULT_STORAGE = LK_DEFAULT_STORAGE;
this.lkNormalizeWord = lkNormalizeWord;
