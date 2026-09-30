import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildRows, CLASSIFICATIONS, MATRIX_PATH, renderCSV } from './generate_settings_coverage.mjs';

// Independent frozen-1.1.1 audit inventory. This list is deliberately not
// derived from ui/prefs.xhtml or the matrix generator: an omitted Zotero
// control must fail here instead of lowering a self-generated row count.
const FROZEN_UPSTREAM_REQUIRED_KEYS = new Set([
  'interfaceLanguage','enablePlugin','wordHighlightFloatingButtonEnabled','wordHighlightFloatingButtonScope',
  'highlightAlphabeticEnabled','highlightChineseEnabled','highlightJapaneseEnabled','highlightKoreanEnabled',
  'autoDetectJapaneseKanji','autoLoadKuromojiForJapanese','useKuromojiTokenizer',
  'wordExplosionEnabled','showExplosionSentence','autoRequestAITranslations','autoRequestAITranslations2',
  'autoAddAITranslationsFromUnknown','autoAddAITranslations','autoAddExampleSentences','autoAddSentencesLimit',
  'clickOnlyTooltip','autoExpandTooltip','autoCloseTooltip','autoRefreshTooltip','defaultExpandTooltip',
  'defaultExpandSententsTooltip','defaultExpandCapsule','preferPopupAbove','selectionPopupPreferDown',
  'tooltipGap','selectionPopupGap','devicePixelRatio','translationConfig.targetLanguage',
  'wordExplosionTriggerMode','wordExplosionPositionMode','wordExplosionFontSize','wordExplosionMaxWidth',
  'wordExplosionPreferUp','wordExplosionLayout','wordExplosionWordsLayout','wordExplosionTranslationCount',
  'explosionSentenceTranslationCount','wordExplosionHighlightSentence','wordExplosionHighlightColor',
  'wordExplosionHighlightOpacity','wordExplosionUnderlineEnabled','wordExplosionUnderlineStyle',
  'wordExplosionUnderlinePosition','wordExplosionUnderlineColor','wordExplosionUnderlineOpacity',
  'wordExplosionUnderlineThickness','explosionPriorityMode','explosionHighlightWithTTS',
  'explosionHighlightNoTTS','explosionTTSOnly','explosionHighlightSpeed','showKnownSentenceAnimation',
  'bionicEnabled','bionicFontFamily','bionicFontSize','readingRuler','rulerSettings.isInverted',
  'rulerSettings.widthMode','rulerSettings.customWidth','rulerSettings.height','rulerSettings.opacity','rulerSettings.color',
  'posHighlightEnabled','posHighlightLanguage','sentenceTTSAutoDetectLanguage','enableAutoWordTTS',
  'enableWordTTS','enableSentenceTTS','ttsConfig.wordTTSProvider','ttsConfig.sentenceTTSProvider',
  'ttsConfig.localTTSVoice','ttsConfig.localTTSRate','ttsConfig.localTTSPitch',
  'ttsConfig.wordAudioUrlTemplate','ttsConfig.wordAudioUrlTemplate2','ttsConfig.audioUrlNotebook',
  'aiConfig.enableApiPolling','customApiProfiles.activeProfileId',
  'aiPrompt','aiPrompt2','aiLanguageDetectionPrompt','aiTagAnalysisPrompt','aiSentenceTranslationPrompt','aiAnalysisPrompt',
  'tooltipThemeMode','tooltipBackground.enabled','tooltipBackground.defaultType','tooltipBackground.useCustom','tooltipBackground.specificBgPath','liquidGlassEnabled','analysisGlassEnabled',
  'glassEffectType','customCapsules','webdavConfig.url','webdavConfig.username','webdavConfig.password',
  'import.language','import.status','import.mode',
  'pluginBlacklistWebsites','highlightDefaultDayWebsites','highlightDefaultNightWebsites','wordHighlightPageTabOverrides',
  'bionicBlacklistWebsites','bionicDefaultDayWebsites','bionicDefaultNightWebsites','readingRulerBlacklistWebsites',
  'sidePanelBtn','sidePanelKey','aiConfig.sidebarAIPrompt','youtubeCaptionFix','youtubeCommaSentencing',
  'youtubeBionicReading','youtubeFontSize','youtubeFontFamily','aiConfig.aiYoutubeCaptionPrompt','lingqBlocker',
  'useOrionTTS','cloudConfig.auth','cloudConfig.cloudDbEnabled','cloudConfig.cloudDualWrite','cloudConfig.selfHosted',
  'cloudConfig.serverURL','aiConfig.aiChannel','clipSubtitles','operation.epubSplitter','operation.epubToTelegraph',
  'operation.romanClean','knownSentenceAnimation','enableWaifu','waifuUrl','waifuPosition','waifuRelativePosition',
  'waifuSize','waifuMinimized',
  ...['name','apiBaseURL','apiModel','apiTemperature','apiKey','enablePolling','excludeTemperature','customRequestBody']
    .map(field => `customApiProfiles.profiles[*].${field}`),
  ...['0','1','2','3','4','5','toggle','addAITranslation','closeTooltip'].map(field => `wordStatusKeys.${field}`),
  ...['wordQueryKey','copySentenceKey','analysisWindowKey','sentenceExplosionKey'],
  ...['Verb','Preposition'].flatMap(part => [
    'Enabled','BackgroundEnabled','BackgroundColor','BackgroundOpacity','UnderlineEnabled',
    'UnderlineStyle','UnderlineColor','UnderlineThickness','UnderlinePosition',
  ].map(field => `posHighlight${part}${field}`)),
  ...['edgeTTSAutoVoice','edgeTTSVoice','edgeTTSRate','edgeTTSVolume','edgeTTSPitch'].map(field => `ttsConfig.${field}`),
  ...['gptTTSBaseURL','gptTTSApiKey','gptTTSModel','gptTTSVoice','gptTTSResponseFormat','gptTTSSpeed','gptTTSInstructions'],
  ...['minimaxiBaseURL','minimaxiGroupId','minimaxiApiKey','minimaxiVoiceId','minimaxiModel','minimaxiSpeed'].map(field => `aiConfig.${field}`),
  ...['supertoneBaseURL','supertoneAPIKey','supertoneVoiceId','supertoneModel','supertoneLanguage','supertoneStyle','supertoneOutputFormat','supertoneSpeed','supertoneMode'].map(field => `aiConfig.${field}`),
  ...['thanoxReadingEnabled','thanoxProcessingOpacity','thanoxCompletedOpacity','thanoxWordSpeed','thanoxFragmentEffect','thanoxFragmentCount','thanoxFragmentDuration'],
  ...['action.vocabularyManager','action.learningStatistics','action.importWords','action.copyLearningBackup',
    'action.restoreMerge','action.restoreReplace','action.clearWords','action.trimSentences','action.webdavTest',
    'action.webdavUpload','action.webdavDownloadMerge','action.webdavDownloadReplace','action.aiProfileAdd',
    'action.aiProfileCopy','action.aiProfileDelete','action.testLocalTTS'],
]);

test('G-004 settings coverage matrix is current complete and uses only frozen classifications', () => {
  const rows = buildRows();
  const persisted = fs.readFileSync(MATRIX_PATH, 'utf8');
  assert.equal(persisted, renderCSV(rows));
  assert.equal(new Set(rows.map(item => item.id)).size, rows.length);
  assert.equal(new Set(rows.map(item => item.storageStateKey)).size, rows.length);
  assert.ok(rows.length >= 220, `expected at least 220 control-level rows; got ${rows.length}`);
  for (const item of rows) {
    assert.equal(CLASSIFICATIONS.has(item.classification), true, `${item.id}: ${item.classification}`);
    for (const field of ['upstreamSource','upstreamControl','upstreamDefaultRange','applicableToZotero','zoteroControl','storageStateKey','runtimeConsumer']) {
      assert.ok(String(item[field]).trim(), `${item.id}.${field}`);
    }
  }
});

test('every independently inventoried frozen-upstream setting maps exactly once', () => {
  const rows = buildRows();
  const counts = new Map();
  for (const row of rows) counts.set(row.storageStateKey, (counts.get(row.storageStateKey) || 0) + 1);
  for (const key of FROZEN_UPSTREAM_REQUIRED_KEYS) assert.equal(counts.get(key), 1, key);
});

test('applicable upstream data operations and port dictionary actions remain wired', () => {
  const xhtml = fs.readFileSync(new URL('../ui/prefs.xhtml', import.meta.url), 'utf8');
  const rows = buildRows();
  const actionRows = new Map(rows.filter(item => item.storageStateKey.startsWith('action.')).map(item => [item.zoteroControl, item]));
  for (const action of [
    'import-words','copy-learning-backup','restore-merge','restore-replace','clear-words','trim-sentences',
    'webdav-test','webdav-upload','webdav-download-merge','webdav-download-replace',
    'ai-profile-add','ai-profile-copy','ai-profile-delete','test-local-tts',
    'dictionary-default','dictionary-custom','dictionary-import','dictionary-refresh',
  ]) {
    const selector = `data-lk-action=${action}`;
    assert.match(xhtml, new RegExp(`data-lk-action=["']${action}["']`), action);
    assert.ok(actionRows.has(selector), selector);
  }
});

test('every native persisted binding has exactly one working matrix row', () => {
  const xhtml = fs.readFileSync(new URL('../ui/prefs.xhtml', import.meta.url), 'utf8');
  const rows = buildRows();
  const exposed = new Map(rows.filter(item => item.classification === 'EXPOSED_AND_WORKING').map(item => [item.storageStateKey, item]));
  const keys = new Set();
  for (const match of xhtml.matchAll(/data-lk-key=["']([^"']+)["']/g)) keys.add(match[1]);
  for (const tag of xhtml.match(/<html:(?:input|select|textarea)\b[^>]*>/g) || []) {
    const object = tag.match(/data-lk-object=["']([^"']+)["']/);
    const subkey = tag.match(/data-lk-subkey=["']([^"']+)["']/);
    if (object && subkey) keys.add(`${object[1]}.${subkey[1]}`);
    const profile = tag.match(/data-lk-profile-field=["']([^"']+)["']/);
    if (profile) keys.add(`customApiProfiles.profiles[*].${profile[1]}`);
    if (/data-lk-special=["']tooltipBackgroundEnabled["']/.test(tag)) keys.add('tooltipBackground.enabled');
    if (/data-lk-special=["']tooltipBackgroundDefaultType["']/.test(tag)) keys.add('tooltipBackground.defaultType');
  }
  for (const key of keys) assert.ok(exposed.has(key), key);
  assert.equal([...exposed.keys()].filter(key => keys.has(key)).length, keys.size);
});

test('browser-only and unsupported controls remain absent from the native page', () => {
  const xhtml = fs.readFileSync(new URL('../ui/prefs.xhtml', import.meta.url), 'utf8');
  for (const item of buildRows().filter(row => row.classification !== 'EXPOSED_AND_WORKING')) {
    assert.doesNotMatch(xhtml, new RegExp(`data-lk-(?:key|subkey)=["']${item.storageStateKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`), item.storageStateKey);
  }
});

test('frozen upstream color-opacity controls cannot disappear from the matrix', () => {
  const rows = new Map(buildRows().map(item => [item.storageStateKey, item]));
  for (const key of [
    'posHighlightVerbBackgroundOpacity', 'posHighlightPrepositionBackgroundOpacity',
    'wordExplosionHighlightOpacity', 'wordExplosionUnderlineOpacity',
  ]) {
    assert.equal(rows.get(key)?.classification, 'EXPOSED_AND_WORKING', key);
    assert.match(rows.get(key)?.upstreamDefaultRange || '', /upstream default=(?:25|50); type=range;min=0;max=100;step=1/, key);
  }
});

test('upstream defaults remain distinct from intentional Zotero adaptations', () => {
  const rows = new Map(buildRows().map(item => [item.storageStateKey, item.upstreamDefaultRange]));
  assert.match(rows.get('wordHighlightFloatingButtonScope'), /upstream default=page.*Zotero default=global/);
  assert.match(rows.get('autoAddAITranslations'), /upstream default=false.*Zotero default=true/);
  assert.match(rows.get('ttsConfig.wordTTSProvider'), /upstream default=edge.*Zotero default=edge.*exposed values=local\|edge\|custom\|custom2/);
  assert.match(rows.get('ttsConfig.sentenceTTSProvider'), /upstream default=edge.*Zotero default=edge.*exposed values=local\|edge\|custom\|custom2/);
  assert.match(rows.get('customCapsules'), /upstream default=Google.*Zotero default=empty/);
});
