/* LingKuma Zotero: thin dynamic lookup-row adapter. */
(() => {
  'use strict';
  if (!globalThis.__LINGKUMA_ZOTERO_READER__) return;
  if (globalThis.__LINGKUMA_ZOTERO_LOOKUP_UI__?.installed) return;

  const listStates = new WeakMap();
  const tooltipStates = new WeakMap();
  const renderAttempts = new WeakMap();
  const pendingTooltipAudio = new WeakMap();
  const pendingAudioAttempts = new Set();
  const suppressedRows = new Set();
  const capture = globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__;
  const originalShowTooltip = typeof globalThis.showEnhancedTooltipForWord === 'function'
    ? globalThis.showEnhancedTooltipForWord
    : null;
  const originalGetSentenceForWord = typeof globalThis.getSentenceForWord === 'function'
    ? globalThis.getSentenceForWord
    : null;
  const originalPlayText = typeof globalThis.playText === 'function' ? globalThis.playText : null;
  const originalAI2 = typeof globalThis.fetchAIWordTranslation2 === 'function'
    ? globalThis.fetchAIWordTranslation2
    : null;
  const pendingAI2 = new Map();
  let nextToken = 0;
  let activeTooltipContext = null;
  let observedRoot = null;
  let rootObserver = null;
  let removeCaptureListener = null;
  let syncScheduled = false;
  let cleaned = false;
  let lifecycleGeneration = 0;
  let capturedSentenceOccurrence = null;
  const storageGet = keys => Promise.resolve(globalThis.chrome.storage.local.get(keys));
  const sendMessage = message => Promise.resolve(globalThis.chrome.runtime.sendMessage(message));

  function sourceLanguage(surface, sentence, supplied, root) {
    const explicit = String(supplied || '').trim();
    if (explicit) return explicit;
    try {
      return String(globalThis.__LINGKUMA_ZOTERO_LANGUAGE_BRIDGE__?.inferSourceLanguage?.(surface, sentence, root) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function pronunciationRecords(entry) {
    const records = Array.isArray(entry?.pronunciations)
      ? entry.pronunciations.filter(record => record && typeof record === 'object' && String(record.ipa || '').trim())
      : [];
    const regional = records.filter(record => record.region === 'US' || record.region === 'UK');
    if (regional.length) return regional;
    if (records.length) return records.slice(0, 1);
    const ipa = String(entry?.ipa || '').trim();
    return ipa ? [{ ipa, region: '' }] : [];
  }

  function pronunciationLabel(record) {
    const region = record.region && record.region !== 'Other' ? `${record.region} ` : '';
    return `${region}${String(record.ipa || '').trim()}`;
  }

  function regionalLanguage(region, source) {
    if (region === 'US') return 'en-US';
    if (region === 'UK') return 'en-GB';
    return String(source || '').trim() || 'en';
  }

  function regionalEdgeVoice(language) {
    const normalized = String(language || '').toLowerCase();
    if (normalized === 'en-gb') return 'en-GB-SoniaNeural';
    if (normalized.startsWith('zh')) return 'zh-CN-XiaoxiaoNeural';
    if (normalized.startsWith('de')) return 'de-DE-AmalaNeural';
    if (normalized.startsWith('ja')) return 'ja-JP-NanamiNeural';
    if (normalized.startsWith('ru')) return 'ru-RU-DmitryNeural';
    if (normalized.startsWith('fr')) return 'fr-FR-VivienneMultilingualNeural';
    if (normalized.startsWith('es')) return 'es-ES-ElviraNeural';
    return 'en-US-AriaNeural';
  }

  function defaultPronunciationRegion(source) {
    return String(source || '').toLowerCase().startsWith('en') ? 'US' : '';
  }

  function googleSpeechURL(text, language) {
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(language)}&client=tw-ob`;
  }

  async function playPronunciationFallback(state, record, report = () => {}) {
    if (!state.wordTTSEnabled) {
      report('TTS disabled');
      return;
    }
    const language = regionalLanguage(record.region, state.sourceLanguage);
    try {
      await sendMessage({
        action: 'playAudio',
        audioType: 'playEdgeTTS',
        text: state.surface,
        lang: language,
        voice: regionalEdgeVoice(language),
      });
      report('Edge TTS');
      return;
    } catch (_) {}
    try {
      await sendMessage({ action: 'playAudio', url: googleSpeechURL(state.surface, language) });
      report('Google pronunciation');
      return;
    } catch (_) {}
    try {
      await sendMessage({
        action: 'playAudio',
        audioType: 'playLocal',
        text: state.surface,
        lang: language,
      });
      report('Local TTS');
    } catch (_) {
      report('Unavailable');
    }
  }

  function playPronunciation(state, record, report = () => {}) {
    const fallback = () => playPronunciationFallback(state, record, report);
    const url = String(record.url || '').trim();
    if (!url.startsWith('https://')) {
      fallback();
      return;
    }
    sendMessage({ action: 'playAudio', url })
      .then(() => report('Dictionary audio'))
      .catch(fallback);
  }

  function defaultDictionaryAudio(entry) {
    const records = Array.isArray(entry?.pronunciations) ? entry.pronunciations : [];
    const priority = { US: 0, UK: 1, Other: 2 };
    const ordered = records.map((record, index) => ({ record, index }))
      .sort((left, right) => (
        (priority[String(left.record?.region || '')] ?? 3)
        - (priority[String(right.record?.region || '')] ?? 3)
        || left.index - right.index
      ));
    for (const { record } of ordered) {
      const url = String(record?.url || '').trim();
      if (url.startsWith('https://')) return url;
    }
    if (!records.length) {
      const legacyURL = String(entry?.audio?.url || '').trim();
      if (legacyURL.startsWith('https://')) return legacyURL;
    }
    return '';
  }

  function withRecordedPronunciation(aiResult, recordedResult) {
    if (aiResult?.status !== 'HIT' || recordedResult?.status !== 'HIT') return aiResult;
    const recorded = Array.isArray(recordedResult.entry?.pronunciations)
      ? recordedResult.entry.pronunciations
      : [];
    const pronunciations = Array.isArray(aiResult.entry?.pronunciations)
      ? aiResult.entry.pronunciations.map(record => {
        const match = recorded.find(candidate => (
          candidate?.region === record?.region
          && String(candidate?.url || '').startsWith('https://')
        ));
        if (!match) return record;
        const merged = { ...record, url: match.url };
        for (const key of ['license', 'sourceURL']) {
          if (match[key]) merged[key] = match[key];
        }
        return merged;
      })
      : [];
    return { ...aiResult, entry: { ...aiResult.entry, pronunciations } };
  }

  function createRow(source, text, state) {
    const row = document.createElement('div');
    row.className = `translation-item lk-lookup-row lk-lookup-${source}`;
    row.dataset.lookupSource = source;
    row.dataset.lookupValue = text;
    if (source === 'pronunciation') {
      for (const record of pronunciationRecords(state.pronunciation?.entry)) {
        const control = document.createElement('button');
        control.className = 'lk-pronunciation-control';
        control.dataset.region = String(record.region || 'Other');
        control.type = 'button';
        control.textContent = `${pronunciationLabel(record)} 🔊`;
        const label = record.region || 'Pronunciation';
        const report = source => {
          control.dataset.playbackSource = source;
          control.title = `${label} pronunciation — source: ${source}`;
        };
        control.title = `${label} pronunciation — click to resolve source`;
        control.style.cursor = 'pointer';
        control.style.marginRight = '8px';
        control.style.padding = '0';
        control.style.border = '0';
        control.style.background = 'transparent';
        control.style.color = 'inherit';
        control.style.font = 'inherit';
        control.addEventListener('mousedown', event => {
          event.preventDefault();
          event.stopPropagation();
          report('Resolving…');
          playPronunciation(state, record, report);
        });
        row.appendChild(control);
      }
      return row;
    }
    row.textContent = text;
    return row;
  }

  function hasClass(element, className) {
    return String(element?.className || '').split(/\s+/).includes(className);
  }

  function pronunciationText(entry) {
    return pronunciationRecords(entry).map(pronunciationLabel).join(' · ');
  }

  function removeTitlePronunciation(tooltip) {
    const previous = tooltip?.querySelector?.('.lk-dictionary-ipa');
    const previousTitle = previous?.parentNode;
    previous?.remove();
    if (previousTitle?.dataset?.lkLookupIpaOwnsWrap === 'true') {
      previousTitle.style.flexWrap = previousTitle.dataset.lkLookupIpaPreviousFlexWrap || '';
      delete previousTitle.dataset.lkLookupIpaOwnsWrap;
      delete previousTitle.dataset.lkLookupIpaPreviousFlexWrap;
    }
  }

  function suppressOrdinaryUpstreamRows(list) {
    for (const row of Array.from(list.querySelectorAll('.translation-item'))) {
      if (hasClass(row, 'lk-lookup-row') || hasClass(row, 'ai-recommendation-2')) continue;
      if (row.dataset.lkLookupSuppressed !== 'true') {
        row.dataset.lkLookupPreviousDisplay = row.style.display || '';
        row.dataset.lkLookupSuppressed = 'true';
        suppressedRows.add(row);
      }
      row.style.display = 'none';
    }
  }

  function takePendingAudio(tooltip) {
    if (!tooltip) return [];
    const pending = pendingTooltipAudio.get(tooltip) || [];
    pendingTooltipAudio.delete(tooltip);
    return pending;
  }

  function runFallbacks(fallbacks) {
    for (const fallback of fallbacks || []) {
      try { if (typeof fallback === 'function') fallback(); } catch (_) {}
    }
  }

  function playResolvedAudio(state, fallback) {
    if (cleaned || state?.generation !== lifecycleGeneration) return false;
    const url = state?.recordedPronunciation?.status === 'HIT'
      ? defaultDictionaryAudio(state.recordedPronunciation.entry)
      : '';
    if (!url.startsWith('https://')) return false;
    sendMessage({ action: 'playAudio', url }).catch(() => runFallbacks([fallback]));
    return true;
  }

  function flushPendingAudio(state) {
    if (cleaned || state?.generation !== lifecycleGeneration || !state?.audioResolutionComplete || !state.audioFallbacks?.length) return;
    const fallbacks = state.audioFallbacks.splice(0);
    for (const fallback of fallbacks) {
      if (!playResolvedAudio(state, fallback)) runFallbacks([fallback]);
    }
  }

  function playAudio({ tooltip, fallback } = {}) {
    if (cleaned || !tooltip) return false;
    const state = tooltipStates.get(tooltip);
    if (!state) {
      const pending = pendingTooltipAudio.get(tooltip) || [];
      pending.push(fallback);
      pendingTooltipAudio.set(tooltip, pending);
      return true;
    }
    if (!state.audioResolutionComplete) {
      state.audioFallbacks.push(fallback);
      return true;
    }
    return playResolvedAudio(state, fallback);
  }
  function paint(state) {
    if (cleaned || state?.generation !== lifecycleGeneration ||
        listStates.get(state.list) !== state || state.list.isConnected === false) return;
    const desired = [];
    if (state.pronunciation?.status === 'HIT') {
      const pronunciation = pronunciationText(state.pronunciation.entry);
      if (pronunciation) desired.push(['pronunciation', pronunciation]);
    }
    if (state.dictionary?.status === 'HIT') {
      const meanings = Array.isArray(state.dictionary.entry?.meanings)
        ? state.dictionary.entry.meanings.filter(value => typeof value === 'string' && value.trim())
        : [];
      if (meanings.length) desired.push(['dictionary', meanings.join(' · ')]);
    }
    if (state.quick?.status === 'HIT' && typeof state.quick.contextualMeaning === 'string' && state.quick.contextualMeaning.trim()) {
      desired.push(['quick-context', state.quick.contextualMeaning.trim()]);
    }
    const current = Array.from(state.list.querySelectorAll('.lk-lookup-row'));
    const unchanged = current.length === desired.length && current.every((row, index) => (
      row.dataset.lookupSource === desired[index][0]
      && (row.dataset.lookupValue || row.textContent) === desired[index][1]
    ));
    if (!unchanged) {
      for (const row of current) row.remove();
      const reference = state.list.firstChild;
      for (const [source, text] of desired) {
        state.list.insertBefore(createRow(source, text, state), reference);
      }
    }
    removeTitlePronunciation(state.tooltip);
    suppressOrdinaryUpstreamRows(state.list);
  }

  function accept(state, source, result) {
    if (cleaned || state?.generation !== lifecycleGeneration || listStates.get(state.list) !== state) return;
    if (!result || result.requestToken !== state.token) return;
    state[source] = result;
    if (source === 'dictionary') {
      const hasIPA = result.status === 'HIT' && pronunciationRecords(result.entry).length > 0;
      const hasRecordedAudio = result.status === 'HIT' && !!defaultDictionaryAudio(result.entry);
      if (hasRecordedAudio) {
        state.recordedPronunciation = result;
        state.audioResolutionComplete = true;
      }
      if (hasIPA) {
        state.pronunciation = result;
        state.audioResolutionComplete = true;
      } else if (!state.pronunciationRequested && /^en(?:-|$)/i.test(state.sourceLanguage)) {
        state.pronunciationRequested = true;
        sendMessage({
          action: 'lookupPronunciation', requestToken: state.token, surface: state.surface,
          sourceLanguage: state.sourceLanguage,
        }).then(value => accept(state, 'pronunciation', value)).catch(() => {
          accept(state, 'pronunciation', { requestToken: state.token, status: 'ERROR' });
        });
      } else if (!state.pronunciation) {
        state.pronunciation = { requestToken: state.token, status: 'UNAVAILABLE' };
        state.audioResolutionComplete = true;
      }
    } else if (source === 'pronunciation') {
      const hasIPA = result.status === 'HIT' && pronunciationRecords(result.entry).length > 0;
      const hasRecordedAudio = result.status === 'HIT' && !!defaultDictionaryAudio(result.entry);
      if (hasRecordedAudio) state.recordedPronunciation = result;
      state.audioResolutionComplete = true;
      if (!hasIPA && !state.aiPronunciationRequested && /^en(?:-|$)/i.test(state.sourceLanguage)) {
        state.aiPronunciationRequested = true;
        sendMessage({
          action: 'lookupAIPronunciation', requestToken: state.token, surface: state.surface,
          sourceLanguage: state.sourceLanguage,
        }).then(value => accept(state, 'aiPronunciation', value)).catch(() => {
          accept(state, 'aiPronunciation', { requestToken: state.token, status: 'ERROR' });
        });
      }
    } else if (source === 'aiPronunciation') {
      const hasIPA = result.status === 'HIT' && pronunciationRecords(result.entry).length > 0;
      if (hasIPA) state.pronunciation = withRecordedPronunciation(result, state.recordedPronunciation);
    }
    paint(state);
    if (source === 'dictionary' || source === 'pronunciation') flushPendingAudio(state);
  }

  async function render({ translationList, tooltip, surface, sentence, surfaceStart, sourceLanguage: suppliedSource, targetLanguage: suppliedTarget } = {}) {
    if (cleaned || !translationList || typeof translationList.querySelectorAll !== 'function') return null;
    const normalizedSurface = String(surface || '').trim();
    const normalizedSentence = String(sentence || '').trim();
    const normalizedSurfaceStart = Number.isInteger(surfaceStart) && surfaceStart >= 0 ? surfaceStart : null;
    if (!normalizedSurface) return null;
    const attempt = {};
    renderAttempts.set(translationList, attempt);
    let stored;
    try {
      stored = await storageGet(['translationConfig', 'enableWordTTS', 'ttsConfig']);
    } catch (_) {
      if (renderAttempts.get(translationList) === attempt) runFallbacks(takePendingAudio(tooltip));
      return null;
    }
    if (renderAttempts.get(translationList) !== attempt || translationList.isConnected === false) return null;
    const source = sourceLanguage(normalizedSurface, normalizedSentence, suppliedSource, tooltip);
    const target = String(suppliedTarget || stored?.translationConfig?.targetLanguage || '').trim();
    if (!source || !target) {
      runFallbacks(takePendingAudio(tooltip));
      return null;
    }

    const key = JSON.stringify([normalizedSurface, normalizedSentence, normalizedSurfaceStart, source, target]);
    const existing = listStates.get(translationList);
    if (existing?.key === key) {
      existing.tooltip = tooltip || existing.tooltip;
      if (existing.tooltip) {
        tooltipStates.set(existing.tooltip, existing);
        existing.audioFallbacks.push(...takePendingAudio(existing.tooltip));
      }
      paint(existing);
      flushPendingAudio(existing);
      return existing.token;
    }

    const tooltipExisting = tooltip ? tooltipStates.get(tooltip) : null;
    if (tooltipExisting?.key === key && tooltipExisting.list !== translationList) {
      tooltipExisting.list = translationList;
      listStates.set(translationList, tooltipExisting);
      paint(tooltipExisting);
      flushPendingAudio(tooltipExisting);
      return tooltipExisting.token;
    }

    const token = `lk-lookup-${++nextToken}`;
    const state = {
      list: translationList,
      tooltip: tooltip || null,
      key,
      token,
      generation: lifecycleGeneration,
      surface: normalizedSurface,
      sourceLanguage: source,
      wordTTSEnabled: stored?.enableWordTTS !== false,
      wordTTSProvider: String(stored?.ttsConfig?.wordTTSProvider || 'edge'),
      dictionary: null,
      pronunciation: null,
      recordedPronunciation: null,
      pronunciationRequested: false,
      aiPronunciationRequested: false,
      audioResolutionComplete: false,
      quick: null,
      audioFallbacks: takePendingAudio(tooltip),
    };
    listStates.set(translationList, state);
    if (state.tooltip) tooltipStates.set(state.tooltip, state);
    paint(state);

    sendMessage({
      action: 'lookupDictionary', requestToken: token, surface: normalizedSurface,
      sourceLanguage: source, targetLanguage: target,
    }).then(result => accept(state, 'dictionary', result)).catch(() => {});
    if (normalizedSentence) {
      sendMessage({
        action: 'lookupQuickContext', requestToken: token, surface: normalizedSurface,
        sentence: normalizedSentence,
        ...(normalizedSurfaceStart === null ? {} : { surfaceStart: normalizedSurfaceStart }),
        sourceLanguage: source, targetLanguage: target,
      }).then(result => accept(state, 'quick', result)).catch(() => {});
    }
    return token;
  }

  function currentTooltip(root) {
    return root?.querySelector?.('.vocab-tooltip') || null;
  }

  function currentTranslationList(tooltip) {
    return tooltip?.querySelector?.('.translation-list') || null;
  }

  function syncRoot(root = observedRoot) {
    if (cleaned || !root || !activeTooltipContext) return;
    const tooltip = currentTooltip(root);
    const translationList = currentTranslationList(tooltip);
    if (!tooltip || !translationList) return;
    const context = activeTooltipContext;
    Promise.resolve(render({
      translationList,
      tooltip,
      surface: context.surface,
      sentence: context.sentence,
      surfaceStart: context.surfaceStart,
    })).catch(() => {});
  }

  function scheduleRootSync(root = observedRoot) {
    if (cleaned || syncScheduled) return;
    syncScheduled = true;
    Promise.resolve().then(() => {
      syncScheduled = false;
      syncRoot(root);
    });
  }

  function observeRoot(root) {
    if (cleaned || !root || root === observedRoot) return;
    try { rootObserver?.disconnect?.(); } catch (_) {}
    observedRoot = root;
    if (typeof MutationObserver === 'function') {
      rootObserver = new MutationObserver(() => scheduleRootSync(root));
      rootObserver.observe(root, { childList: true, subtree: true });
    }
    scheduleRootSync(root);
  }

  function capturedTooltipRoot() {
    try { return capture?.get?.('lingkuma-tooltip-host') || null; } catch (_) { return null; }
  }

  function explicitCompoundRanges(sentence) {
    const ranges = [];
    const pattern = /[\p{Script=Latin}\p{M}]+(?:[-‐‑][\p{Script=Latin}\p{M}]+)+/gu;
    let match;
    while ((match = pattern.exec(String(sentence || '')))) {
      ranges.push({ surface: match[0], surfaceStart: match.index });
    }
    return ranges;
  }

  function explicitCompoundAt(sentence, surfaceStart, surface) {
    const surfaceEnd = surfaceStart + surface.length;
    if (surfaceStart < 0 || sentence.slice(surfaceStart, surfaceEnd).toLocaleLowerCase() !== surface.toLocaleLowerCase()) {
      return null;
    }
    for (const compound of explicitCompoundRanges(sentence)) {
      const matchEnd = compound.surfaceStart + compound.surface.length;
      if (surfaceStart >= compound.surfaceStart && surfaceEnd <= matchEnd) {
        return compound;
      }
      if (compound.surfaceStart > surfaceStart) break;
    }
    return null;
  }

  function lookupUnitAt(sentence, surfaceStart, surface) {
    const compound = explicitCompoundAt(sentence, surfaceStart, surface);
    if (compound) return compound;
    if (!/^[\p{Script=Latin}\p{M}]+$/u.test(surface)) return null;
    const isLatin = character => /[\p{Script=Latin}\p{M}]/u.test(character || '');
    let start = surfaceStart;
    let end = surfaceStart + surface.length;
    while (start > 0 && isLatin(sentence[start - 1])) start--;
    while (end < sentence.length && isLatin(sentence[end])) end++;
    if (start === surfaceStart && end === surfaceStart + surface.length) return null;
    return { surface: sentence.slice(start, end), surfaceStart: start };
  }

  function getSentenceForWordWithOccurrence(detail) {
    capturedSentenceOccurrence = null;
    const result = originalGetSentenceForWord.apply(this, arguments);
    try {
      const surface = String(detail?.word || '').trim();
      const rawSentence = String(result?.sentence || '');
      const sentence = rawSentence.trim();
      const leadingTrim = rawSentence.length - rawSentence.trimStart().length;
      if (!surface || !sentence) return result;
      let surfaceStart = Number.isInteger(result?.clickedSurfaceStart) && result.clickedSurfaceStart >= 0
        ? result.clickedSurfaceStart
        : null;
      if (surfaceStart === null) {
        const wordRange = detail?.range;
        const sentenceRange = result?.range;
        if (!wordRange || !sentenceRange?.cloneRange) return result;
        const prefix = sentenceRange.cloneRange();
        prefix.setEnd(wordRange.startContainer, wordRange.startOffset);
        surfaceStart = String(prefix.toString()).length - leadingTrim;
      }
      if (sentence.slice(surfaceStart, surfaceStart + surface.length).toLocaleLowerCase() === surface.toLocaleLowerCase()) {
        const lookupUnit = lookupUnitAt(sentence, surfaceStart, surface);
        capturedSentenceOccurrence = {
          clickedSurface: surface,
          surface: lookupUnit?.surface || surface,
          sentence,
          surfaceStart: lookupUnit?.surfaceStart ?? surfaceStart,
        };
      }
    } catch (_) {
      capturedSentenceOccurrence = null;
    }
    return result;
  }

  function syncUpstreamTooltipIdentity(surface) {
    try {
      if (typeof currentTooltipWord !== 'undefined') currentTooltipWord = surface;
    } catch (_) {}
  }

  async function showTooltipWithLookup(...args) {
    const clickedSurface = String(args[4] || args[0] || '').trim();
    const sentence = String(args[1] || '').trim();
    const captured = capturedSentenceOccurrence;
    capturedSentenceOccurrence = null;
    const capturedMatches = captured?.clickedSurface === clickedSurface && captured?.sentence === sentence;
    const inheritedContext = !capturedMatches
      && activeTooltipContext?.sentence === sentence
      && activeTooltipContext?.clickedSurface === clickedSurface
      && activeTooltipContext?.surface !== clickedSurface
        ? activeTooltipContext
        : null;
    const surface = capturedMatches
      ? captured.surface
      : inheritedContext?.surface || clickedSurface;
    const showArgs = [...args];
    if (surface !== clickedSurface) {
      showArgs[0] = surface;
      if (showArgs.length > 4) showArgs[4] = surface;
    }
    const context = inheritedContext || {
      clickedSurface,
      surface,
      sentence,
      surfaceStart: capturedMatches ? captured.surfaceStart : null,
      pendingShows: 0,
      successfulShows: 0,
    };
    context.pendingShows++;
    activeTooltipContext = context;
    syncUpstreamTooltipIdentity(surface);
    try {
      const result = await originalShowTooltip.apply(this, showArgs);
      context.successfulShows++;
      if (activeTooltipContext === context) {
        const root = capturedTooltipRoot();
        if (root) observeRoot(root);
        syncRoot(root);
      }
      return result;
    } catch (error) {
      if (activeTooltipContext === context && context.pendingShows === 1 && !context.successfulShows) {
        activeTooltipContext = null;
      }
      throw error;
    } finally {
      context.pendingShows--;
    }
  }

  function fetchAI2WithSharedPending(word, sentence) {
    const key = JSON.stringify([
      String(word || '').trim().toLocaleLowerCase(),
      String(sentence || '').trim(),
    ]);
    const existing = pendingAI2.get(key);
    if (existing) return existing;
    let request;
    try { request = Promise.resolve(originalAI2.apply(this, arguments)); }
    catch (error) { request = Promise.reject(error); }
    const shared = request.finally(() => {
      if (pendingAI2.get(key) === shared) pendingAI2.delete(key);
    });
    pendingAI2.set(key, shared);
    return shared;
  }

  function playTextWithDictionary(params) {
    const requestedSurface = String(params?.text || '').trim();
    const sentence = String(params?.sentence || '').trim();
    const isWordPlayback = Number(params?.count) === 1;
    if (!requestedSurface || !isWordPlayback) return originalPlayText.apply(this, arguments);

    const callThis = this;
    const tooltip = currentTooltip(capturedTooltipRoot());
    const context = activeTooltipContext;
    const usesActiveCompound = context?.sentence === sentence
      && (context.surface === requestedSurface || context.clickedSurface === requestedSurface);
    const surface = usesActiveCompound ? context.surface : requestedSurface;
    const callArguments = surface === requestedSurface
      ? arguments
      : [{ ...params, text: surface }, ...Array.prototype.slice.call(arguments, 1)];
    if (tooltip && context?.surface === surface && context?.sentence === sentence) {
      const fallback = () => {
        if (!cleaned) {
          const state = tooltipStates.get(tooltip);
          if (state?.wordTTSProvider === 'edge') return playPronunciationFallback(state, {
            region: defaultPronunciationRegion(state.sourceLanguage),
          });
          return originalPlayText.apply(callThis, callArguments);
        }
        return undefined;
      };
      if (playAudio({ tooltip, fallback })) return undefined;
      return fallback();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const attempt = {
        cancel() {
          if (settled) return;
          settled = true;
          pendingAudioAttempts.delete(attempt);
          resolve(undefined);
        },
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        pendingAudioAttempts.delete(attempt);
        if (!callback) {
          resolve(value);
          return;
        }
        try {
          Promise.resolve(callback()).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      };
      const upstreamFallback = () => finish(() => originalPlayText.apply(callThis, callArguments));
      pendingAudioAttempts.add(attempt);
      Promise.resolve().then(async () => {
        let stored;
        try {
          stored = await storageGet(['translationConfig', 'enableWordTTS', 'ttsConfig']);
        } catch (_) {
          upstreamFallback();
          return;
        }
        if (cleaned || settled) return;
        const source = sourceLanguage(surface, sentence, '', globalThis.document?.documentElement || null);
        const target = String(stored?.translationConfig?.targetLanguage || '').trim();
        if (!source) {
          upstreamFallback();
          return;
        }
        const configuredFallback = () => {
          const provider = String(stored?.ttsConfig?.wordTTSProvider || 'edge');
          if (provider !== 'edge') return upstreamFallback();
          return finish(() => playPronunciationFallback({
            surface,
            sourceLanguage: source,
            wordTTSEnabled: stored?.enableWordTTS !== false,
          }, { region: defaultPronunciationRegion(source) }));
        };
        if (!target) return configuredFallback();
        const requestToken = `lk-audio-${++nextToken}`;
        let result;
        try {
          result = await sendMessage({
            action: 'lookupDictionary', requestToken, surface,
            sourceLanguage: source, targetLanguage: target,
          });
        } catch (_) {
          configuredFallback();
          return;
        }
        if (cleaned || settled) return;
        const url = result?.requestToken === requestToken && result?.status === 'HIT'
          ? defaultDictionaryAudio(result.entry)
          : '';
        if (!url.startsWith('https://')) {
          configuredFallback();
          return;
        }
        try {
          await sendMessage({ action: 'playAudio', url });
          if (!cleaned) finish(null, undefined);
        } catch (_) {
          configuredFallback();
        }
      }).catch(upstreamFallback);
    });
  }

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    lifecycleGeneration++;
    try { removeCaptureListener?.(); } catch (_) {}
    removeCaptureListener = null;
    try { rootObserver?.disconnect?.(); } catch (_) {}
    rootObserver = null;
    observedRoot = null;
    activeTooltipContext = null;
    capturedSentenceOccurrence = null;
    for (const attempt of Array.from(pendingAudioAttempts)) attempt.cancel();
    for (const row of Array.from(suppressedRows)) {
      if (row.dataset?.lkLookupSuppressed === 'true') {
        row.style.display = row.dataset.lkLookupPreviousDisplay || '';
        delete row.dataset.lkLookupPreviousDisplay;
        delete row.dataset.lkLookupSuppressed;
      }
      suppressedRows.delete(row);
    }
    if (originalShowTooltip && globalThis.showEnhancedTooltipForWord === showTooltipWithLookup) {
      globalThis.showEnhancedTooltipForWord = originalShowTooltip;
    }
    if (originalGetSentenceForWord && globalThis.getSentenceForWord === getSentenceForWordWithOccurrence) {
      globalThis.getSentenceForWord = originalGetSentenceForWord;
    }
    if (originalPlayText && globalThis.playText === playTextWithDictionary) {
      globalThis.playText = originalPlayText;
    }
    if (originalAI2 && globalThis.fetchAIWordTranslation2 === fetchAI2WithSharedPending) {
      globalThis.fetchAIWordTranslation2 = originalAI2;
    }
    pendingAI2.clear();
  }

  if (originalShowTooltip) globalThis.showEnhancedTooltipForWord = showTooltipWithLookup;
  if (originalGetSentenceForWord) globalThis.getSentenceForWord = getSentenceForWordWithOccurrence;
  if (originalPlayText) globalThis.playText = playTextWithDictionary;
  if (originalAI2) globalThis.fetchAIWordTranslation2 = fetchAI2WithSharedPending;
  if (capture?.onCapture) {
    removeCaptureListener = capture.onCapture((host, root) => {
      if (host?.id === 'lingkuma-tooltip-host') observeRoot(root);
    });
  }
  const initialRoot = capturedTooltipRoot();
  if (initialRoot) observeRoot(initialRoot);

  const api = Object.freeze({
    installed: true,
    version: '1.0.1',
    render,
    cleanup,
    inferSourceLanguage: sourceLanguage,
    explicitCompoundRanges,
  });
  globalThis.__LINGKUMA_ZOTERO_LOOKUP_UI__ = api;
  globalThis.__LINGKUMA_LOOKUP_RENDER__ = input => api.render(input);
  globalThis.__LINGKUMA_LOOKUP_PLAY_AUDIO__ = input => playAudio(input);
})();
