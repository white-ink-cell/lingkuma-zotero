/* LingKuma for Zotero — WebExtension compatibility bridge (Bridge 17)
 *
 * Important design rule:
 * - Upstream LingKuma code runs inside one reader sandbox.
 * - The `chrome`/`browser` objects are created *inside that sandbox*.
 * - Only JSON strings and primitive values cross the Zotero/content boundary.
 *
 * This avoids the cross-compartment wrappers and "can't access dead object"
 * failures caused by cloning a nested privileged object into the reader.
 */

function lkSanitizeCustomCapsules(value) {
  if (!Array.isArray(value)) return [];
  const methods = new Set(["newTab", "iframe", "newWindow", "sidebar"]);
  const containers = [];
  for (const container of value) {
    if (!container || !Array.isArray(container.buttons)) continue;
    const buttons = [];
    for (const button of container.buttons) {
      const name = String(button?.name || "").trim();
      const urlText = String(button?.url || "").trim();
      if (!name || /[<>\"]/.test(name) || !methods.has(button?.openMethod)) continue;
      try {
        const url = new URL(urlText.replace(/{word}|{sentence}/g, "sample"));
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      } catch (_) {
        continue;
      }
      buttons.push({ name, url: urlText, openMethod: button.openMethod });
    }
    if (buttons.length) containers.push({ buttons });
  }
  return containers;
}

const LK_DESKTOP_TTS_PROVIDERS = new Set(["local", "edge", "custom", "custom2"]);

function lkStorageRequestIncludes(keys, key) {
  if (keys === null || keys === undefined) return true;
  if (typeof keys === "string") return keys === key;
  if (Array.isArray(keys)) return keys.includes(key);
  return typeof keys === "object" && Object.prototype.hasOwnProperty.call(keys, key);
}

function lkSanitizeReaderStorageResult(result, keys) {
  if (!result || typeof result !== "object") return result;
  if (lkStorageRequestIncludes(keys, "customCapsules")) {
    result.customCapsules = lkSanitizeCustomCapsules(result.customCapsules);
  }
  if (lkStorageRequestIncludes(keys, "ttsConfig")) {
    const config = result.ttsConfig && typeof result.ttsConfig === "object" ? { ...result.ttsConfig } : {};
    for (const key of ["wordTTSProvider", "sentenceTTSProvider"]) {
      if (!LK_DESKTOP_TTS_PROVIDERS.has(config[key])) config[key] = "edge";
    }
    result.ttsConfig = config;
  }
  if (lkStorageRequestIncludes(keys, "sidePanelBtn")) result.sidePanelBtn = false;
  if (lkStorageRequestIncludes(keys, "sidePanelKey")) result.sidePanelKey = "__disabled__";
  return result;
}

function lkSanitizeReaderStorageChanges(changes) {
  const safeChanges = { ...(changes || {}) };
  for (const key of ["customCapsules", "ttsConfig", "sidePanelBtn", "sidePanelKey"]) {
    if (!safeChanges[key]) continue;
    safeChanges[key] = {
      ...safeChanges[key],
      oldValue: lkSanitizeReaderStorageResult({ [key]: safeChanges[key].oldValue }, [key])[key],
      newValue: lkSanitizeReaderStorageResult({ [key]: safeChanges[key].newValue }, [key])[key]
    };
  }
  return safeChanges;
}

function lkSanitizeDictionaryStatus(value) {
  const source = value && typeof value === "object" ? value : {};
  const result = {};
  for (const key of [
    "mode", "status", "reason", "fallback", "dictionaryID", "sourceLanguage",
    "targetLanguage", "dataSourceName", "dataSourceSnapshot", "dataLicense", "attribution"
  ]) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  const entryCount = Number(source.entryCount);
  if (Number.isFinite(entryCount) && entryCount >= 0) result.entryCount = entryCount;
  return result;
}

function lkSanitizeDictionaryLookup(value, request) {
  const source = value && typeof value === "object" ? value : {};
  const token = String(request.requestToken || "");
  const status = ["HIT", "MISS", "UNAVAILABLE", "ERROR"].includes(source.status)
    ? source.status : "ERROR";
  const result = { requestToken: token, status };
  if (status !== "HIT" || !source.entry || typeof source.entry !== "object") return result;
  const entrySource = source.entry;
  const meanings = [];
  const seenMeanings = new Set();
  for (const item of Array.isArray(entrySource.meanings) ? entrySource.meanings : []) {
    const text = String(item || "").trim();
    if (!text || seenMeanings.has(text)) continue;
    seenMeanings.add(text);
    meanings.push(text);
    if (meanings.length === 3) break;
  }
  const dictionaryForm = String(entrySource.dictionaryForm || "").trim();
  if (!meanings.length || !dictionaryForm) return { requestToken: token, status: "ERROR" };
  const entry = {
    surface: String(request.surface || "").trim(),
    dictionaryForm,
    meanings
  };
  const pos = [];
  const seenPOS = new Set();
  for (const item of Array.isArray(entrySource.pos) ? entrySource.pos : []) {
    const text = String(item || "").trim();
    if (!text || seenPOS.has(text)) continue;
    seenPOS.add(text);
    pos.push(text);
  }
  if (pos.length) entry.pos = pos;
  const ipa = String(entrySource.ipa || "").trim();
  if (ipa) entry.ipa = ipa;
  const pronunciations = [];
  const seenPronunciations = new Map();
  for (const item of Array.isArray(entrySource.pronunciations) ? entrySource.pronunciations : []) {
    if (!item || typeof item !== "object") continue;
    const itemIPA = String(item.ipa || "").trim();
    const region = String(item.region || "").trim();
    if (!["US", "UK", "Other"].includes(region)) continue;
    const pronunciation = { region };
    if (itemIPA) pronunciation.ipa = itemIPA;
    try {
      const url = new URL(String(item.url || ""));
      if (url.protocol === "https:") {
        pronunciation.url = url.href;
        const license = String(item.license || "").trim();
        if (license) pronunciation.license = license;
        try {
          const sourceURL = new URL(String(item.sourceURL || ""));
          if (sourceURL.protocol === "https:") pronunciation.sourceURL = sourceURL.href;
        } catch (_) {}
      }
    } catch (_) {}
    if (!itemIPA && !pronunciation.url) continue;
    const key = itemIPA
      ? `${region}\u0000${itemIPA}`
      : `${region}\u0000\u0000${pronunciation.url || ""}`;
    if (seenPronunciations.has(key)) {
      const existing = pronunciations[seenPronunciations.get(key)];
      if (!existing.url && pronunciation.url) Object.assign(existing, pronunciation);
      continue;
    }
    seenPronunciations.set(key, pronunciations.length);
    pronunciations.push(pronunciation);
    if (pronunciations.length === 3) break;
  }
  if (pronunciations.length) entry.pronunciations = pronunciations;
  if (entrySource.audio && typeof entrySource.audio === "object") {
    try {
      const url = new URL(String(entrySource.audio.url || ""));
      if (url.protocol === "https:") {
        entry.audio = { url: url.href };
        const license = String(entrySource.audio.license || "").trim();
        if (license) entry.audio.license = license;
        const region = String(entrySource.audio.region || "").trim();
        if (["US", "UK", "Other"].includes(region)) entry.audio.region = region;
        try {
          const sourceURL = new URL(String(entrySource.audio.sourceURL || ""));
          if (sourceURL.protocol === "https:") entry.audio.sourceURL = sourceURL.href;
        } catch (_) {}
      }
    } catch (_) {}
  }
  result.entry = entry;
  return result;
}

function lkSanitizePronunciationLookup(value, request) {
  const source = value && typeof value === "object" ? value : {};
  const requestToken = String(request.requestToken || "");
  const status = ["HIT", "MISS", "UNAVAILABLE", "ERROR"].includes(source.status)
    ? source.status : "ERROR";
  const result = { requestToken, status };
  if (status !== "HIT" || !source.entry || typeof source.entry !== "object") return result;
  const entrySource = source.entry;
  const entry = { surface: String(request.surface || "").trim() };
  const ipa = String(entrySource.ipa || "").trim();
  if (ipa) entry.ipa = ipa;
  const pronunciations = [];
  const seen = new Map();
  for (const item of Array.isArray(entrySource.pronunciations) ? entrySource.pronunciations : []) {
    if (!item || typeof item !== "object") continue;
    const itemIPA = String(item.ipa || "").trim();
    const region = String(item.region || "").trim();
    if (!["US", "UK", "Other"].includes(region)) continue;
    const pronunciation = { region };
    if (itemIPA) pronunciation.ipa = itemIPA;
    try {
      const url = new URL(String(item.url || ""));
      if (url.protocol === "https:") {
        pronunciation.url = url.href;
        const license = String(item.license || "").trim();
        if (license) pronunciation.license = license;
        try {
          const sourceURL = new URL(String(item.sourceURL || ""));
          if (sourceURL.protocol === "https:") pronunciation.sourceURL = sourceURL.href;
        } catch (_) {}
      }
    } catch (_) {}
    if (!itemIPA && !pronunciation.url) continue;
    const key = itemIPA
      ? `${region}\u0000${itemIPA}`
      : `${region}\u0000\u0000${pronunciation.url || ""}`;
    if (seen.has(key)) {
      const existing = pronunciations[seen.get(key)];
      if (!existing.url && pronunciation.url) Object.assign(existing, pronunciation);
      continue;
    }
    seen.set(key, pronunciations.length);
    pronunciations.push(pronunciation);
    if (pronunciations.length === 3) break;
  }
  if (pronunciations.length) entry.pronunciations = pronunciations;
  if (entrySource.audio && typeof entrySource.audio === "object") {
    try {
      const url = new URL(String(entrySource.audio.url || ""));
      if (url.protocol === "https:") {
        entry.audio = { url: url.href };
        const license = String(entrySource.audio.license || "").trim();
        if (license) entry.audio.license = license;
        const region = String(entrySource.audio.region || "").trim();
        if (["US", "UK", "Other"].includes(region)) entry.audio.region = region;
        try {
          const sourceURL = new URL(String(entrySource.audio.sourceURL || ""));
          if (sourceURL.protocol === "https:") entry.audio.sourceURL = sourceURL.href;
        } catch (_) {}
      }
    } catch (_) {}
  }
  if (!entry.ipa && !entry.pronunciations && !entry.audio) return { requestToken, status: "ERROR" };
  result.entry = entry;
  return result;
}

function lkSanitizeAIPronunciationLookup(value, request) {
  const source = value && typeof value === "object" ? value : {};
  const requestToken = String(request.requestToken || "");
  const status = ["HIT", "MISS", "UNAVAILABLE", "ERROR"].includes(source.status)
    ? source.status : "ERROR";
  if (status !== "HIT") return { requestToken, status };
  const sourceRecords = Array.isArray(source.entry?.pronunciations)
    ? source.entry.pronunciations
    : [];
  const pronunciations = [];
  for (const region of ["US", "UK"]) {
    const record = sourceRecords.find(item => item && item.region === region);
    const ipa = String(record?.ipa || "").trim();
    const valid = ipa.length <= 160 && (
      /^\/[^/\r\n]{1,156}\/$/u.test(ipa)
      || /^\[[^\]\r\n]{1,156}\]$/u.test(ipa)
    );
    if (!valid) return { requestToken, status: "ERROR" };
    pronunciations.push({ region, ipa });
  }
  return {
    requestToken,
    status: "HIT",
    entry: { surface: String(request.surface || "").trim(), pronunciations }
  };
}

function lkSanitizeQuickContext(value, request) {
  const source = value && typeof value === "object" ? value : {};
  const requestToken = String(request.requestToken || "");
  const status = ["HIT", "MISS", "ERROR"].includes(source.status)
    ? source.status : "ERROR";
  if (status !== "HIT") return { requestToken, status };
  const sentenceTranslation = String(source.sentenceTranslation || "").trim();
  const contextualMeaning = String(source.contextualMeaning || "").trim();
  if (!sentenceTranslation || !contextualMeaning) return { requestToken, status: "ERROR" };
  return { requestToken, status, sentenceTranslation, contextualMeaning };
}
class LingKumaMessageHost {
  constructor({ state, plugin, rootURI, pluginID }) {
    this.state = state;
    this.plugin = plugin;
    this.rootURI = rootURI;
    this.pluginID = pluginID;
    this.contexts = new Set();
    this.nextContextID = 1;
    this.destroyed = false;
    this._storageListener = (changes, area) => {
      // WebExtension storage.onChanged is asynchronous relative to storage.set.
      // Do not let a privileged synchronous state mutation race upstream code.
      const safeChanges = lkSanitizeReaderStorageChanges(changes);
      this._scheduleTask(() => {
        for (const context of Array.from(this.contexts)) {
          if (context.destroyed) continue;
          try { context.dispatchStorageChanged(safeChanges, area); }
          catch (error) { try { Zotero.logError(error); } catch (_) {} }
          if (safeChanges.translationConfig) {
            this.plugin?.ensureDefaultDictionaryForContext(context);
          }
        }
      });
    };
    this.state.addStorageListener(this._storageListener);
  }

  debug(message) {
    try { Zotero.debug(`[LingKuma Bridge 17] ${message}`); } catch (_) {}
  }

  registerContext(context) {
    this.contexts.add(context);
  }

  unregisterContext(context) {
    this.contexts.delete(context);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const context of Array.from(this.contexts)) {
      try { context.destroy(); } catch (_) {}
    }
    this.contexts.clear();
    try { this.state?.removeStorageListener?.(this._storageListener); } catch (_) {}
    this._storageListener = null;
    this.plugin = null;
    this.state = null;
  }

  contextsForTab(tabId) {
    return Array.from(this.contexts).filter(context => context.tabId === tabId && !context.destroyed);
  }

  dispatchToTab(tabId, message) {
    for (const context of this.contextsForTab(tabId)) {
      try { context.dispatchRuntimeMessage(message, { tab: { id: tabId, url: context.url } }); }
      catch (_) {}
    }
  }

  broadcast(message) {
    for (const context of Array.from(this.contexts)) {
      try { context.dispatchRuntimeMessage(message, { id: this.pluginID }); }
      catch (_) {}
    }
  }

  _scheduleTask(fn) {
    try {
      const timer = typeof setTimeout === 'function'
        ? setTimeout
        : Zotero.getMainWindow()?.setTimeout?.bind(Zotero.getMainWindow());
      if (timer) {
        timer(fn, 0);
        return;
      }
    } catch (_) {}
    Promise.resolve().then(fn).catch(error => { try { Zotero.logError(error); } catch (_) {} });
  }

  _highlightPageKey(url, tabId) {
    const raw = String(url || '');
    if (raw) {
      try {
        const parsed = new URL(raw);
        return String(parsed.hostname || parsed.host || parsed.href || '').toLowerCase();
      } catch (_) {
        return raw.toLowerCase();
      }
    }
    return String(tabId || '');
  }

  _normalizeThemeOverride(value) {
    if (typeof value === 'boolean') return value;
    if (value && typeof value.isDark === 'boolean') return value.isDark;
    return null;
  }

  _syncThemeMutationToOriginContext(context, previousOverrides, nextOverrides) {
    if (!context || context.destroyed) return;
    const before = previousOverrides && typeof previousOverrides === 'object' ? previousOverrides : {};
    const after = nextOverrides && typeof nextOverrides === 'object' ? nextOverrides : {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changedKeys = [];
    for (const key of keys) {
      const oldValue = this._normalizeThemeOverride(before[key]);
      const newValue = this._normalizeThemeOverride(after[key]);
      if (oldValue !== newValue) changedKeys.push(key);
    }
    if (!changedKeys.length) return;

    // The upstream floating page-theme button writes exactly one page override.
    // In Zotero the trusted PDF iframe URL used by the sandbox and the logical
    // reader URL used by the host can differ, so matching by hostname alone can
    // miss the mutation. Since this storage.set originated from this context,
    // a single changed override is authoritative for this tab.
    const pageKey = this._highlightPageKey(context.url, context.tabId);
    let isDark = this._normalizeThemeOverride(after[pageKey]);
    if (isDark === null && changedKeys.length === 1) {
      isDark = this._normalizeThemeOverride(after[changedKeys[0]]);
    }
    if (isDark === null) return;

    this.dispatchToTab(context.tabId, { action: 'updateHighlightTheme', isDark });
    const themeMode = this.state.storageGet({ tooltipThemeMode: 'auto' })?.tooltipThemeMode || 'auto';
    if (themeMode === 'auto') {
      // Keep the user's setting as Auto. This message only asks upstream a4/a7
      // to re-evaluate their own existing auto-theme logic after a2 changes.
      this.dispatchToTab(context.tabId, { action: 'updateTooltipThemeMode', mode: 'auto' });
    }
  }

  _getHighlightControlState(sender = {}) {
    const tabId = sender?.tab?.id;
    const values = this.state.storageGet({
      enablePlugin: false,
      wordHighlightFloatingButtonScope: 'global',
      wordHighlightPageTabOverrides: {}
    });
    const scope = values.wordHighlightFloatingButtonScope === 'page' ? 'page' : 'global';
    const globalEnabled = values.enablePlugin !== false;
    const overrides = values.wordHighlightPageTabOverrides || {};
    const pageKey = this._highlightPageKey(sender?.tab?.url, tabId);
    const pageEnabled = Object.prototype.hasOwnProperty.call(overrides, pageKey)
      ? overrides[pageKey] === true
      : overrides[String(tabId || '')] === true;
    return { scope, enabled: scope === 'page' ? pageEnabled : globalEnabled, globalEnabled };
  }

  _setPageHighlight(sender, enabled) {
    const tabId = sender?.tab?.id;
    const values = this.state.storageGet({ wordHighlightPageTabOverrides: {} });
    const overrides = { ...(values.wordHighlightPageTabOverrides || {}) };
    const pageKey = this._highlightPageKey(sender?.tab?.url, tabId);
    delete overrides[String(tabId || '')];
    if (enabled === true) overrides[pageKey] = true;
    else delete overrides[pageKey];
    this.state.storageSet({ wordHighlightPageTabOverrides: overrides });
    if (tabId) this.dispatchToTab(tabId, { action: 'toggleHighlight', enabled: enabled === true });
    return this._getHighlightControlState(sender);
  }

  async handleMessage(message, sender = {}) {
    const action = message?.action;
    const state = this.state;

    switch (action) {
      case "broadcastToggleHighlight":
      case "setGlobalWordHighlight": {
        const enabled = message.enabled !== false;
        state.storageSet({ enablePlugin: enabled });
        this.broadcast({ action: "toggleHighlight", enabled });
        return { success: true, scope: "global", enabled, globalEnabled: enabled };
      }
      case "getWordHighlightControlState":
        return this._getHighlightControlState(sender);
      case "ensureWordHighlightRuntime":
        // Zotero preloads the runtime for each trusted reader context. There is
        // nothing to inject here; report the original control state faithfully.
        return { success: true, ...this._getHighlightControlState(sender) };
      case "toggleWordHighlightFromFloatingButton": {
        const enabled = message.enabled === true;
        const control = this._getHighlightControlState(sender);
        if (control.scope === "page") {
          return { success: true, ...this._setPageHighlight(sender, enabled) };
        }
        state.storageSet({ enablePlugin: enabled });
        this.broadcast({ action: "toggleHighlight", enabled });
        return { success: true, scope: "global", enabled, globalEnabled: enabled };
      }
      case "getWordDetails":
        return { details: state.getWordDetails(message.word) };
      case "getAllWordDetails":
        return { details: state.getAllWordDetails() };
      case "getFilteredWordDetails": {
        const filters = message.filters || {};
        const all = state.getAllWordDetails();
        const details = {};
        for (const [word, record] of Object.entries(all)) {
          if (filters.statuses?.length && !filters.statuses.map(String).includes(String(record.status))) continue;
          if (filters.isCustom !== undefined && record.isCustom !== filters.isCustom) continue;
          details[word] = record;
        }
        return { details };
      }
      case "getWordCount":
        return { count: Object.keys(state.words).length };
      case "batchGetWordStatus":
        return { statusMap: state.batchGetWordStatus(message.words || []) };
      case "getAllWordStatusMap":
        return { statusMap: state.getAllWordStatusMap() };
      case "addTranslation":
        state.addTranslation(message.word, message.translation);
        return { success: true };
      case "removeTranslation":
        state.removeTranslation(message.word, message.translation);
        return { success: true };
      case "addTag":
        state.addTag(message.word, message.tag);
        return { success: true };
      case "removeTag":
        state.removeTag(message.word, message.tag);
        return { success: true };
      case "addSentence":
        state.addSentence(message.word, message.sentence, message.translation, message.url);
        return { success: true };
      case "removeSentence":
        state.removeSentence(message.word, message.sentence);
        return { success: true };
      case "updateWordStatus":
        state.updateWordStatus(message.word, message.status, message.language, message.isCustom);
        return { success: true };
      case "ChangeWordLanguage":
        state.updateWordLanguage(message.word, message.details);
        return { success: true };
      case "updateWordLanguage":
        state.updateWordLanguage(message.word, message.language || message.details);
        return { success: true };
      case "deleteWord":
      case "deleteWordExact":
        state.deleteWord(message.word);
        return { success: true };
      case "getKnownWordsByStatus":
        return state.getKnownWordsByStatus(message.statuses || []);
      case "getCustomWords":
        return { words: state.getCustomWords() };
      case "backupDatabase":
        // Backups must preserve every target-language translation, not only
        // the currently selected display language.
        return { success: true, data: state.getAllWordDetailsRaw() };
      case "clearDatabase":
        state.clearWords();
        return { success: true };
      case "restoreDatabase":
        return { success: true, restored: state.restoreWords(message.data || {}, false) };
      case "mergeDatabase":
        return { success: true, merged: state.restoreWords(message.data || {}, true), skipped: 0 };
      case "lookupDictionary": {
        const request = {
          requestToken: String(message.requestToken || ""),
          surface: String(message.surface || ""),
          sourceLanguage: String(message.sourceLanguage || ""),
          targetLanguage: String(message.targetLanguage || "")
        };
        const result = await this.plugin?.lookup?.lookupDictionary?.(request)
          || { requestToken: request.requestToken, status: "UNAVAILABLE" };
        return lkSanitizeDictionaryLookup(result, request);
      }
      case "lookupPronunciation": {
        const request = {
          requestToken: String(message.requestToken || ""),
          surface: String(message.surface || ""),
          sourceLanguage: String(message.sourceLanguage || "")
        };
        const result = await this.plugin?.lookup?.lookupPronunciation?.(request)
          || { requestToken: request.requestToken, status: "UNAVAILABLE" };
        return lkSanitizePronunciationLookup(result, request);
      }
      case "lookupAIPronunciation": {
        const request = {
          requestToken: String(message.requestToken || ""),
          surface: String(message.surface || ""),
          sourceLanguage: String(message.sourceLanguage || "")
        };
        const result = await this.plugin?.lookup?.lookupAIPronunciation?.(request)
          || { requestToken: request.requestToken, status: "UNAVAILABLE" };
        return lkSanitizeAIPronunciationLookup(result, request);
      }
      case "lookupQuickContext": {
        const request = {
          requestToken: String(message.requestToken || ""),
          surface: String(message.surface || ""),
          sentence: String(message.sentence || ""),
          sourceLanguage: String(message.sourceLanguage || ""),
          targetLanguage: String(message.targetLanguage || "")
        };
        if (Number.isInteger(message.surfaceStart) && message.surfaceStart >= 0) {
          request.surfaceStart = message.surfaceStart;
        }
        const result = await this.plugin?.lookup?.lookupQuickContext?.(request)
          || { requestToken: request.requestToken, status: "ERROR" };
        return lkSanitizeQuickContext(result, request);
      }
      case "getDictionaryStatus": {
        const status = await this.plugin?.lookup?.getDictionaryStatus?.({
          sourceLanguage: String(message.sourceLanguage || ""),
          targetLanguage: String(message.targetLanguage || "")
        }) || { mode: "default", status: "UNAVAILABLE", reason: "LOOKUP_NOT_READY" };
        return lkSanitizeDictionaryStatus(status);
      }
      case "getAIConfig":
        return { config: state.getAIConfigForContent() };
      case "translateText": {
        const translation = await state.translateText(message.text, message.source || "auto", message.target || null);
        return { success: true, translation, target: state._normalizeTargetLanguage(message.target || state.getTargetLanguage()) };
      }
      case "makeAIRequest": {
        const requestData = { ...(message.requestData || {}) };
        const tabId = sender?.tab?.id;
        if (requestData.stream) {
          requestData.stream = false;
          Promise.resolve().then(async () => {
            try {
              const data = await state.makeAIRequest(requestData);
              const content = state._extractAIContent(data);
              if (tabId) {
                this.dispatchToTab(tabId, {
                  action: "streamChunk",
                  data: { content, isFirstChunk: true, isDone: true }
                });
                this.dispatchToTab(tabId, { action: "streamComplete", data: { done: true } });
              }
            } catch (error) {
              if (tabId) this.dispatchToTab(tabId, { action: "streamError", data: { error: error?.message || String(error) } });
            }
          });
          return { success: true, stream: true };
        }
        return await state.makeAIRequest(requestData);
      }
      case "playAudio":
      case "playCustom":
      case "playLocal":
      case "playMinimaxi":
        await this.plugin.playAudioMessage(message, sender);
        return { success: true };
      case "stopAudio":
      case "stopSpecificAudio":
        this.plugin.stopAudio();
        return { success: true };
      case "openSidebar":
      case "showSidebar":
        return { success: false, unsupported: true };
      case "openCustomCapsuleSidebar":
      case "openCustomCapsuleTab":
      case "openCustomCapsuleWindow": {
        let url;
        try { url = new URL(String(message.url || "")); }
        catch (_) { throw new Error("Custom capsule URL must use http or https"); }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Custom capsule URL must use http or https");
        }
        Zotero.launchURL(url.href);
        return { success: true, url: url.href };
      }
      case "refreshAfdianSubscription":
        return { success: true, active: false };
      case "streamUpdate":
      case "customWordUpdated":
      case "clearBackgroundSettingsCache":
      case "toggleLiquidGlass":
      case "updateGlassEffect":
        return { success: true };
      case "updateHighlightTheme": {
        const isDark = message.isDark === true;
        this.broadcast({ action: "updateHighlightTheme", isDark });
        return { success: true, isDark };
      }
      case "updateTooltipThemeMode":
      case "redetectPageLanguage":
      case "reinitializeJapaneseTokenizer":
      case "showWordLimitNotification":
      case "audioPlaybackStarted":
        return { success: true };
      default:
        this.debug(`unhandled message action: ${String(action)}`);
        return {};
    }
  }
}

class LingKumaContentContext {
  constructor({ host, win, reader, tabId, rootURI, pluginID }) {
    this.host = host;
    this.win = win;
    this.reader = reader;
    this.tabId = tabId;
    this.rootURI = rootURI;
    this.pluginID = pluginID;
    this.id = host.nextContextID++;
    this.destroyed = false;
    this.sandbox = null;
    this.url = this._safeURL();
    this.loadedScripts = [];
    this.scriptErrors = [];
    this._unloadHandler = null;
    host.registerContext(this);
  }

  _safeURL() {
    try { return String(this.win.location.href || `file:///zotero-reader/${this.tabId}`); }
    catch (_) { return `file:///zotero-reader/${this.tabId}`; }
  }

  _isAlive() {
    if (this.destroyed || !this.win) return false;
    try { return !!this.win.document?.documentElement && !this.win.closed; }
    catch (_) { return false; }
  }

  _json(value) {
    if (value === undefined) return "null";
    return JSON.stringify(value);
  }

  _eval(source) {
    if (!this.sandbox || this.destroyed) return undefined;
    return Components.utils.evalInSandbox(source, this.sandbox, "latest");
  }

  _resolveHostRequest(requestID, value, error = null) {
    if (!this.sandbox || this.destroyed) return;
    const valueJSON = this._json(value);
    const errorText = error ? (error?.message || String(error)) : "";
    try {
      this._eval(`globalThis.__lkResolveHostRequest(${Number(requestID)}, ${JSON.stringify(valueJSON)}, ${JSON.stringify(errorText)});`);
    } catch (_) {}
  }

  _installExportedHostFunctions(sandbox) {
    const Cu = Components.utils;
    const context = this;
    const exportFn = (name, fn) => Cu.exportFunction(fn, sandbox, { defineAs: name, allowCrossOriginArguments: false });

    exportFn("__lkHostStorageGet", keysJSON => {
      if (!context._isAlive()) throw new Error("LingKuma reader context is no longer available");
      const keys = JSON.parse(String(keysJSON || "null"));
      const result = context.host.state.storageGet(keys);
      const asksForAIConfig = keys === null || keys === undefined || keys === "aiConfig" ||
        (Array.isArray(keys) && keys.includes("aiConfig")) ||
        (keys && typeof keys === "object" && !Array.isArray(keys) && Object.prototype.hasOwnProperty.call(keys, "aiConfig"));
      if (asksForAIConfig && result && typeof result === "object") {
        result.aiConfig = context.host.state.getAIConfigForStorage();
      }
      return JSON.stringify(lkSanitizeReaderStorageResult(result, keys));
    });

    exportFn("__lkHostStorageSet", valuesJSON => {
      if (!context._isAlive()) throw new Error("LingKuma reader context is no longer available");
      const values = JSON.parse(String(valuesJSON || "{}")) || {};
      const previousThemeOverrides = Object.prototype.hasOwnProperty.call(values, 'highlightPageThemeOverrides')
        ? context.host.state.storageGet({ highlightPageThemeOverrides: {} }).highlightPageThemeOverrides || {}
        : null;
      context.host.state.storageSet(values);
      if (previousThemeOverrides !== null) {
        context.host._syncThemeMutationToOriginContext(
          context,
          previousThemeOverrides,
          values.highlightPageThemeOverrides || {}
        );
      }
      return "null";
    });

    exportFn("__lkHostStorageRemove", keysJSON => {
      if (!context._isAlive()) throw new Error("LingKuma reader context is no longer available");
      context.host.state.storageRemove(JSON.parse(String(keysJSON || "null")));
      return "null";
    });

    exportFn("__lkHostStorageClear", () => {
      if (!context._isAlive()) throw new Error("LingKuma reader context is no longer available");
      context.host.state.storageClearWebExtension();
      return "null";
    });

    exportFn("__lkHostSendMessage", (messageJSON, requestID) => {
      if (!context._isAlive()) {
        context._resolveHostRequest(requestID, null, new Error("LingKuma reader context is no longer available"));
        return;
      }
      let message;
      try { message = JSON.parse(String(messageJSON || "{}")); }
      catch (error) {
        context._resolveHostRequest(requestID, null, error);
        return;
      }
      Promise.resolve(context.host.handleMessage(message, {
        tab: { id: context.tabId, url: context.url },
        frameId: context.id
      })).then(result => context._resolveHostRequest(requestID, result, null))
        .catch(error => context._resolveHostRequest(requestID, null, error));
    });

    exportFn("__lkHostDispatchToTab", (tabId, messageJSON, requestID) => {
      try {
        const message = JSON.parse(String(messageJSON || "{}"));
        context.host.dispatchToTab(Number(tabId) || context.tabId, message);
        context._resolveHostRequest(requestID, { success: true }, null);
      } catch (error) {
        context._resolveHostRequest(requestID, null, error);
      }
    });

    exportFn("__lkHostGetURL", path => {
      try { return String(context.host.plugin.getResourceURL(String(path || "")) || ""); }
      catch (_) { return ""; }
    });

    exportFn("__lkHostOpenURL", url => {
      try { if (url) Zotero.launchURL(String(url)); }
      catch (_) {}
    });

    exportFn("__lkHostLog", (level, payloadJSON) => {
      let args = [];
      try { args = JSON.parse(String(payloadJSON || "[]")); } catch (_) {}
      const text = args.map(value => {
        if (typeof value === "string") return value;
        try { return JSON.stringify(value); } catch (_) { return String(value); }
      }).join(" ");
      context.host.debug(`[reader ${context.tabId}/${context.id}] ${String(level || "log")}: ${text}`);
    });

    exportFn("__lkHostContextPageHide", () => {
      try {
        const timer = typeof setTimeout === "function" ? setTimeout : Zotero.getMainWindow()?.setTimeout?.bind(Zotero.getMainWindow());
        timer?.(() => {
          try { context.host.plugin.onContentContextPageHide?.(context); } catch (_) {}
        }, 0);
      } catch (_) {}
    });
  }

  _buildBridgeSource() {
    const rootURI = this.rootURI + "upstream/";
    const pluginID = this.pluginID;
    const pluginVersion = String(this.host?.plugin?.version || '0.5.0');
    const tabId = this.tabId;
    const url = this.url;
    return `
(() => {
  'use strict';
  const ROOT_URI = ${JSON.stringify(rootURI)};
  const PLUGIN_ID = ${JSON.stringify(pluginID)};
  const PLUGIN_VERSION = ${JSON.stringify(pluginVersion)};
  const TAB_ID = ${Number(tabId)};
  const TAB_URL = ${JSON.stringify(url)};
  const pending = new Map();
  let nextRequestID = 1;
  let lastError = null;
  const runtimeListeners = new Set();
  const storageListeners = new Set();

  const parseJSON = (text, fallback = null) => {
    try { return JSON.parse(String(text)); } catch (_) { return fallback; }
  };
  const schedule = fn => Promise.resolve().then(fn);
  const withLastError = (error, callback, value) => {
    lastError = error ? { message: String(error.message || error) } : null;
    try { callback(value); } finally { lastError = null; }
  };
  const callbackOrPromise = (promise, callback) => {
    if (typeof callback === 'function') {
      promise.then(value => schedule(() => withLastError(null, callback, value)))
        .catch(error => schedule(() => withLastError(error, callback, undefined)));
      return undefined;
    }
    return promise;
  };
  const requestHost = message => {
    const requestID = nextRequestID++;
    return new Promise((resolve, reject) => {
      pending.set(requestID, { resolve, reject });
      try { __lkHostSendMessage(JSON.stringify(message || {}), requestID); }
      catch (error) { pending.delete(requestID); reject(error); }
    });
  };

  globalThis.__lkResolveHostRequest = (requestID, valueJSON, errorText) => {
    const request = pending.get(Number(requestID));
    if (!request) return;
    pending.delete(Number(requestID));
    if (errorText) request.reject(new Error(String(errorText)));
    else request.resolve(parseJSON(valueJSON, null));
  };

  const runtime = {
    id: PLUGIN_ID,
    get lastError() { return lastError; },
    getURL(path = '') {
      const normalizedPath = String(path || '').replace(/^\\/+/, '');
      try {
        const mapped = __lkHostGetURL(normalizedPath);
        if (mapped) return String(mapped);
      } catch (error) {
        try { __lkHostLog('warn', JSON.stringify(['resource mapping failed', normalizedPath, String(error?.message || error)])); } catch (_) {}
      }
      return ROOT_URI + normalizedPath;
    },
    getManifest() {
      return { name: 'LingKuma for Zotero', version: PLUGIN_VERSION };
    },
    sendMessage(...args) {
      let message = args[0];
      let callback = args.find(arg => typeof arg === 'function');
      if (typeof message === 'string' && args.length > 1 && typeof args[1] === 'object') message = args[1];
      return callbackOrPromise(requestHost(message || {}), callback);
    },
    openOptionsPage(callback) {
      const p = requestHost({ action: 'openSidebar' });
      return callbackOrPromise(p, callback);
    },
    onMessage: {
      addListener(listener) { if (typeof listener === 'function') runtimeListeners.add(listener); },
      removeListener(listener) { runtimeListeners.delete(listener); },
      hasListener(listener) { return runtimeListeners.has(listener); }
    },
    onConnect: { addListener() {}, removeListener() {}, hasListener() { return false; } }
  };

  const storageLocal = {
    get(keys, callback) {
      let result;
      try { result = parseJSON(__lkHostStorageGet(JSON.stringify(keys === undefined ? null : keys)), {}); }
      catch (error) {
        const p = Promise.reject(error);
        return callbackOrPromise(p, callback);
      }
      return callbackOrPromise(Promise.resolve(result), callback);
    },
    set(values, callback) {
      let p;
      try { __lkHostStorageSet(JSON.stringify(values || {})); p = Promise.resolve(); }
      catch (error) { p = Promise.reject(error); }
      return callbackOrPromise(p, callback);
    },
    remove(keys, callback) {
      let p;
      try { __lkHostStorageRemove(JSON.stringify(keys)); p = Promise.resolve(); }
      catch (error) { p = Promise.reject(error); }
      return callbackOrPromise(p, callback);
    },
    clear(callback) {
      let p;
      try { __lkHostStorageClear(); p = Promise.resolve(); }
      catch (error) { p = Promise.reject(error); }
      return callbackOrPromise(p, callback);
    }
  };

  const storage = {
    local: storageLocal,
    sync: storageLocal,
    session: storageLocal,
    onChanged: {
      addListener(listener) { if (typeof listener === 'function') storageListeners.add(listener); },
      removeListener(listener) { storageListeners.delete(listener); },
      hasListener(listener) { return storageListeners.has(listener); }
    }
  };

  globalThis.__lkDispatchRuntimeMessageJSON = (messageJSON, senderJSON) => {
    const message = parseJSON(messageJSON, {});
    const sender = parseJSON(senderJSON, {});
    for (const listener of Array.from(runtimeListeners)) {
      try {
        listener(message, sender, () => {});
      } catch (error) {
        try { console.error('[LingKuma runtime listener]', error); } catch (_) {}
      }
    }
  };

  globalThis.__lkDispatchStorageChangedJSON = (changesJSON, areaName) => {
    const changes = parseJSON(changesJSON, {});
    for (const listener of Array.from(storageListeners)) {
      try { listener(changes, String(areaName || 'local')); }
      catch (error) { try { console.error('[LingKuma storage listener]', error); } catch (_) {} }
    }
  };

  const tabs = {
    query(_queryInfo, callback) {
      const value = [{ id: TAB_ID, active: true, url: TAB_URL }];
      return callbackOrPromise(Promise.resolve(value), callback);
    },
    get(_tabID, callback) {
      const value = { id: TAB_ID, active: true, url: TAB_URL };
      return callbackOrPromise(Promise.resolve(value), callback);
    },
    sendMessage(tabID, message, callback) {
      const requestID = nextRequestID++;
      const p = new Promise((resolve, reject) => {
        pending.set(requestID, { resolve, reject });
        try { __lkHostDispatchToTab(Number(tabID) || TAB_ID, JSON.stringify(message || {}), requestID); }
        catch (error) { pending.delete(requestID); reject(error); }
      });
      return callbackOrPromise(p, callback);
    },
    create(info, callback) {
      try { if (info && info.url) __lkHostOpenURL(String(info.url)); } catch (_) {}
      const value = { id: Date.now(), url: info && info.url ? String(info.url) : '' };
      return callbackOrPromise(Promise.resolve(value), callback);
    }
  };

  const i18n = {
    getUILanguage() { return (typeof navigator !== 'undefined' && navigator.language) || 'zh-CN'; },
    getMessage(name) { return String(name || ''); },
    detectLanguage(text, callback) {
      const sample = String(text || '');
      const language = /[\\u4e00-\\u9fff]/.test(sample) ? 'zh' : /[\\u3040-\\u30ff]/.test(sample) ? 'ja' : 'en';
      const result = { isReliable: true, languages: [{ language, percentage: 100 }] };
      return callbackOrPromise(Promise.resolve(result), callback);
    }
  };

  const chromeObject = {
    runtime,
    storage,
    tabs,
    i18n,
    extension: { getURL: runtime.getURL },
    tts: {
      speak(text, options = {}, callback) {
        return callbackOrPromise(requestHost({ action: 'playAudio', text: String(text || ''), options }), callback);
      },
      stop() { requestHost({ action: 'stopAudio' }).catch(() => {}); }
    },
    windows: {
      create(info, callback) {
        try { if (info && info.url) __lkHostOpenURL(String(info.url)); } catch (_) {}
        return callbackOrPromise(Promise.resolve({ id: Date.now() }), callback);
      }
    },
    sidePanel: {
      open() { return requestHost({ action: 'openSidebar' }); },
      setPanelBehavior() { return Promise.resolve(); }
    },
    downloads: {
      download(info, callback) {
        try { if (info && info.url) __lkHostOpenURL(String(info.url)); } catch (_) {}
        return callbackOrPromise(Promise.resolve(Date.now()), callback);
      }
    },
    scripting: {
      executeScript() { return Promise.resolve([]); },
      insertCSS() { return Promise.resolve(); }
    }
  };

  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: false });
  Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true, writable: false });
  Object.defineProperty(globalThis, 'chrome', { value: chromeObject, configurable: true, writable: false });
  Object.defineProperty(globalThis, 'browser', { value: chromeObject, configurable: true, writable: false });
  Object.defineProperty(globalThis, '__LINGKUMA_ZOTERO_READER__', { value: true, configurable: true, writable: false });
  Object.defineProperty(globalThis, '__LINGKUMA_ZOTERO_BRIDGE__', {
    value: { build: 'bridge17-thin-adapter-20260808', storage: true, runtime: true, embeddedAssets: true, browserUI: true },
    configurable: true,
    writable: false
  });

  const pageConsole = typeof globalThis.console === 'object' && globalThis.console ? globalThis.console : {};
  for (const level of ['log', 'warn', 'error', 'debug']) {
    if (typeof pageConsole[level] !== 'function') {
      pageConsole[level] = (...args) => {
        try { __lkHostLog(level, JSON.stringify(args)); } catch (_) {}
      };
    }
  }
  Object.defineProperty(globalThis, 'console', { value: pageConsole, configurable: true, writable: true });

  try {
    addEventListener('pagehide', () => {
      try { __lkHostContextPageHide(); } catch (_) {}
    }, { once: true });
  } catch (_) {}
})();
`;
  }

  createSandbox() {
    if (this.sandbox) return this.sandbox;
    if (!this._isAlive()) throw new Error("Reader window is no longer available");

    const Cu = Components.utils;
    const sandbox = new Cu.Sandbox(this.win, {
      sandboxName: `LingKuma Zotero Bridge17 ${this.tabId}/${this.id}`,
      sandboxPrototype: this.win,
      wantXrays: false,
      sameZoneAs: this.win
    });

    this.sandbox = sandbox;
    try {
      this._installExportedHostFunctions(sandbox);
      Cu.evalInSandbox(this._buildBridgeSource(), sandbox, "latest");

      const selfTest = Cu.evalInSandbox(`(() => {
        const checks = {
          windowIsGlobal: window === globalThis,
          chrome: typeof chrome === 'object',
          browserSame: browser === chrome,
          storageGet: typeof chrome?.storage?.local?.get === 'function',
          runtimeSend: typeof chrome?.runtime?.sendMessage === 'function',
          bridgeBuild: globalThis.__LINGKUMA_ZOTERO_BRIDGE__?.build || '',
          embeddedFont: String(chrome.runtime.getURL('src/fonts/Fanwood.otf')).startsWith('data:font/'),
          embeddedBackground: String(chrome.runtime.getURL('src/service/image/tg/pattern-1.svg')).startsWith('data:image/')
        };
        const coreOK = checks.windowIsGlobal && checks.chrome && checks.browserSame && checks.storageGet && checks.runtimeSend;
        if (!coreOK) throw new Error('Bridge 17 core self-test failed: ' + JSON.stringify(checks));
        if (!checks.embeddedFont || !checks.embeddedBackground) {
          try { __lkHostLog('warn', JSON.stringify(['Bridge 17 asset self-test warning', checks])); } catch (_) {}
        }
        return JSON.stringify(checks);
      })()`, sandbox, "latest");
      this.host.debug(`bridge self-test reader ${this.tabId}/${this.id}: ${selfTest}`);
      return sandbox;
    } catch (error) {
      try { Components.utils.nukeSandbox(sandbox); } catch (_) {}
      this.sandbox = null;
      throw error;
    }
  }

  dispatchRuntimeMessage(message, sender = {}) {
    if (!this.sandbox || this.destroyed) return;
    try {
      const messageJSON = JSON.stringify(message || {});
      const senderJSON = JSON.stringify(sender || {});
      this._eval(`globalThis.__lkDispatchRuntimeMessageJSON(${JSON.stringify(messageJSON)}, ${JSON.stringify(senderJSON)});`);
    } catch (_) {}
  }

  dispatchStorageChanged(changes, areaName) {
    if (!this.sandbox || this.destroyed) return;
    try {
      const changesJSON = JSON.stringify(changes || {});
      this._eval(`globalThis.__lkDispatchStorageChangedJSON(${JSON.stringify(changesJSON)}, ${JSON.stringify(String(areaName || "local"))});`);
    } catch (_) {}
  }

  async playEdgeTTS(options) {
    if (!this._isAlive()) throw new Error("LingKuma reader context is no longer available");
    const payload = JSON.stringify(options || {});
    const result = this._eval(`globalThis.__LINGKUMA_ZOTERO_EDGE_TTS__?.play(${payload})`);
    if (!result || typeof result.then !== "function") {
      throw new Error("LingKuma Edge TTS bridge is unavailable");
    }
    return await result;
  }

  stopEdgeTTS() {
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_EDGE_TTS__?.stop()`); } catch (_) {}
  }

  destroy() {
    try { this.dispatchRuntimeMessage({ action: "teardownHighlightRuntime" }); } catch (_) {}
    try { this.dispatchRuntimeMessage({ action: "toggleBionic", isEnabled: false }); } catch (_) {}
    try { this._eval(`document.getElementById("reading-ruler-container")?.remove();`); } catch (_) {}
    try { this.dispatchRuntimeMessage({ action: "togglePosHighlight", enabled: false }); } catch (_) {}
    try { this._eval(`if (typeof clearAllPopupsAndWindows === "function") clearAllPopupsAndWindows();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_WORD_EXPLOSION__?.cleanup?.();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_LOOKUP_UI__?.cleanup?.();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_EDGE_TTS__?.cleanup?.();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_SENTENCE_PANEL_PATCH__?.cleanup?.();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_LANGUAGE_BRIDGE__?.cleanup?.();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_THEME_EVENT_BRIDGE__?.cleanup?.();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_GLASS_FALLBACK__?.cleanup?.();`); } catch (_) {}
    try { this._eval(`globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__?.cleanup?.();`); } catch (_) {}
    if (this.destroyed) return;
    this.destroyed = true;
    this.host.unregisterContext(this);
    try {
      if (this.sandbox) Components.utils.nukeSandbox(this.sandbox);
    } catch (_) {}
    this.sandbox = null;
    this.win = null;
    this.reader = null;
  }
}

this.LingKumaMessageHost = LingKumaMessageHost;
this.LingKumaContentContext = LingKumaContentContext;
