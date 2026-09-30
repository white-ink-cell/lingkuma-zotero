/* LingKuma Zotero: contextual Word Explosion gloss adapter. */
(() => {
  'use strict';
  if (!globalThis.__LINGKUMA_ZOTERO_READER__) return;
  if (globalThis.__LINGKUMA_ZOTERO_WORD_EXPLOSION__?.installed) return;

  const lookup = globalThis.__LINGKUMA_ZOTERO_LOOKUP_UI__;
  const originalExtract = globalThis.extractUnknownWords;
  const originalCreate = globalThis.createWordItem;
  const originalWordAI = globalThis.fetchAIWordTranslation;
  const originalHide = globalThis.hideWordExplosion;
  if (!lookup?.installed || typeof originalExtract !== 'function' || typeof originalCreate !== 'function') return;

  const MAX_CONCURRENT = 4;
  const pending = [];
  const requests = new Map();
  const fallbacks = new Map();
  let running = 0;
  let nextToken = 0;
  let generation = 0;
  let activeSentence = '';
  let cleaned = false;

  const sendMessage = message => Promise.resolve(globalThis.chrome.runtime.sendMessage(message));
  const storageGet = keys => Promise.resolve(globalThis.chrome.storage.local.get(keys));

  function pump() {
    while (!cleaned && running < MAX_CONCURRENT && pending.length) {
      const job = pending.shift();
      running++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
        running--;
        pump();
      });
    }
  }

  function enqueue(task) {
    return new Promise((resolve, reject) => {
      pending.push({ task, resolve, reject });
      pump();
    });
  }

  function surfaceStart(sentence, surface) {
    const source = String(sentence || '');
    const unit = String(surface || '');
    return source.toLocaleLowerCase().indexOf(unit.toLocaleLowerCase());
  }

  function requestKey(surface, sentence) {
    const normalizedSurface = String(surface || '').trim();
    const normalizedSentence = String(sentence || '').trim();
    return JSON.stringify([normalizedSentence, normalizedSurface, surfaceStart(normalizedSentence, normalizedSurface)]);
  }

  function quickContext(surface, sentence) {
    const normalizedSurface = String(surface || '').trim();
    const normalizedSentence = String(sentence || '').trim();
    const start = surfaceStart(normalizedSentence, normalizedSurface);
    const key = requestKey(normalizedSurface, normalizedSentence);
    const existing = requests.get(key);
    if (existing) return existing;

    const owner = generation;
    const request = (async () => {
      let stored;
      try { stored = await storageGet('translationConfig'); }
      catch (_) { return { status: 'ERROR' }; }
      if (cleaned || owner !== generation || activeSentence !== normalizedSentence) return { status: 'STALE' };
      const sourceLanguage = String(lookup.inferSourceLanguage?.(
        normalizedSurface,
        normalizedSentence,
        '',
        globalThis.document?.documentElement || null,
      ) || '').trim();
      const targetLanguage = String(stored?.translationConfig?.targetLanguage || '').trim();
      if (!sourceLanguage || !targetLanguage) return { status: 'MISS' };
      return enqueue(async () => {
        if (cleaned || owner !== generation || activeSentence !== normalizedSentence) return { status: 'STALE' };
        const requestToken = `lk-explosion-${++nextToken}`;
        try {
          const result = await sendMessage({
            action: 'lookupQuickContext',
            requestToken,
            surface: normalizedSurface,
            sentence: normalizedSentence,
            ...(start < 0 ? {} : { surfaceStart: start }),
            sourceLanguage,
            targetLanguage,
          });
          if (cleaned || owner !== generation || activeSentence !== normalizedSentence) return { status: 'STALE' };
          if (result?.requestToken !== requestToken) return { status: 'ERROR' };
          return result;
        } catch (_) {
          return { status: 'ERROR' };
        }
      });
    })();
    requests.set(key, request);
    return request;
  }

  function mergedSegments(input, segments) {
    const compounds = lookup.explicitCompoundRanges?.(input) || [];
    if (!compounds.length) return segments;
    const result = [];
    for (const segment of segments) {
      const start = Number(segment.index);
      const end = start + String(segment.segment || '').length;
      const compound = compounds.find(item => {
        const compoundEnd = item.surfaceStart + item.surface.length;
        return start < compoundEnd && end > item.surfaceStart;
      });
      if (!compound) {
        result.push(segment);
      } else if (start === compound.surfaceStart) {
        result.push({
          segment: compound.surface,
          index: compound.surfaceStart,
          input: String(input),
          isWordLike: true,
        });
      }
    }
    return result;
  }

  function withCompoundSegmenter(callback) {
    const nativeIntl = globalThis.Intl;
    const NativeSegmenter = nativeIntl?.Segmenter;
    if (typeof NativeSegmenter !== 'function') return callback();
    const scopedIntl = Object.create(nativeIntl);
    class CompoundSegmenter {
      constructor(locales, options) {
        this.segmenter = new NativeSegmenter(locales, options);
        this.wordGranularity = options?.granularity === 'word';
      }
      segment(input) {
        const segments = Array.from(this.segmenter.segment(input));
        return this.wordGranularity ? mergedSegments(String(input), segments) : segments;
      }
      resolvedOptions() { return this.segmenter.resolvedOptions(); }
    }
    Object.defineProperty(scopedIntl, 'Segmenter', { value: CompoundSegmenter });
    globalThis.Intl = scopedIntl;
    try { return callback(); }
    finally { globalThis.Intl = nativeIntl; }
  }

  function extractWithCompounds(sentence) {
    const normalizedSentence = String(sentence || '').trim();
    if (normalizedSentence !== activeSentence) {
      generation++;
      activeSentence = normalizedSentence;
      requests.clear();
      fallbacks.clear();
    }
    return withCompoundSegmenter(() => originalExtract.apply(this, arguments));
  }

  function wordAIThroughQuickContext(word, sentence) {
    const normalizedSentence = String(sentence || '').trim();
    if (cleaned || !normalizedSentence || normalizedSentence !== activeSentence) {
      return typeof originalWordAI === 'function' ? originalWordAI.apply(this, arguments) : null;
    }
    const key = requestKey(word, normalizedSentence);
    const existing = fallbacks.get(key);
    if (existing) return existing;
    const receiver = this;
    const args = arguments;
    const request = (async () => {
      const result = await quickContext(word, normalizedSentence);
      if (result?.status === 'HIT' && String(result.contextualMeaning || '').trim()) {
        return String(result.contextualMeaning).trim();
      }
      if (result?.status === 'STALE' || cleaned || normalizedSentence !== activeSentence) return null;
      if (typeof originalWordAI === 'function') return originalWordAI.apply(receiver, args);
      return null;
    })();
    fallbacks.set(key, request);
    return request;
  }

  async function terminalFallback(word, sentence, receiver) {
    const normalizedSentence = String(sentence || '').trim();
    const owner = generation;
    const key = requestKey(word, normalizedSentence);
    const existing = fallbacks.get(key);
    if (existing) return existing;
    let stored;
    try { stored = await storageGet({ autoRequestAITranslations: false }); }
    catch (_) { return null; }
    if (cleaned || owner !== generation || activeSentence !== normalizedSentence) return null;
    if (stored?.autoRequestAITranslations !== true) return null;
    const registered = fallbacks.get(key);
    if (registered) return registered;
    return wordAIThroughQuickContext.call(receiver, word, normalizedSentence);
  }

  function glossContainer(card) {
    let container = card?.querySelector?.('.word-explosion-word-translations');
    if (container) return container;
    container = card?.querySelector?.('.word-explosion-word-loading');
    if (container) {
      container.className = 'word-explosion-word-translations';
      return container;
    }
    container = globalThis.document.createElement('div');
    container.className = 'word-explosion-word-translations';
    card?.appendChild?.(container);
    return container;
  }

  async function createWithContext(wordInfo) {
    const card = await originalCreate.apply(this, arguments);
    const sentence = activeSentence;
    const owner = generation;
    const historical = Array.isArray(wordInfo?.details?.translations)
      ? wordInfo.details.translations.filter(value => String(value || '').trim())
      : [];
    const container = glossContainer(card);
    const row = globalThis.document.createElement('div');
    row.className = 'word-explosion-word-translation';
    row.textContent = '加载中...';
    container.replaceChildren(row);
    const paintTerminalFallback = () => {
      terminalFallback(wordInfo?.word, sentence, this).then(value => {
        if (cleaned || owner !== generation || activeSentence !== sentence || card?.isConnected === false) return;
        row.textContent = String(value || '').trim() || '暂无释义';
      }).catch(() => {
        if (!cleaned && owner === generation && activeSentence === sentence && card?.isConnected !== false) {
          row.textContent = '暂无释义';
        }
      });
    };
    quickContext(wordInfo?.word, sentence).then(result => {
      if (cleaned || owner !== generation || activeSentence !== sentence || card?.isConnected === false) return;
      const contextual = result?.status === 'HIT' ? String(result.contextualMeaning || '').trim() : '';
      if (contextual || historical[0]) {
        row.textContent = contextual || historical[0];
        return;
      }
      paintTerminalFallback();
    }).catch(() => {
      if (!cleaned && owner === generation && activeSentence === sentence && card?.isConnected !== false) {
        if (historical[0]) row.textContent = historical[0];
        else paintTerminalFallback();
      }
    });
    return card;
  }

  function hideWithInvalidation() {
    generation++;
    activeSentence = '';
    requests.clear();
    fallbacks.clear();
    return originalHide?.apply(this, arguments);
  }

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    generation++;
    activeSentence = '';
    requests.clear();
    fallbacks.clear();
    while (pending.length) pending.shift().resolve({ status: 'STALE' });
    if (globalThis.extractUnknownWords === extractWithCompounds) globalThis.extractUnknownWords = originalExtract;
    if (globalThis.createWordItem === createWithContext) globalThis.createWordItem = originalCreate;
    if (globalThis.fetchAIWordTranslation === wordAIThroughQuickContext) globalThis.fetchAIWordTranslation = originalWordAI;
    if (globalThis.hideWordExplosion === hideWithInvalidation) globalThis.hideWordExplosion = originalHide;
  }

  globalThis.extractUnknownWords = extractWithCompounds;
  globalThis.createWordItem = createWithContext;
  if (typeof originalWordAI === 'function') globalThis.fetchAIWordTranslation = wordAIThroughQuickContext;
  if (typeof originalHide === 'function') globalThis.hideWordExplosion = hideWithInvalidation;
  globalThis.__LINGKUMA_ZOTERO_WORD_EXPLOSION__ = Object.freeze({
    installed: true,
    version: '1.0.0',
    maxConcurrent: MAX_CONCURRENT,
    cleanup,
  });
})();
