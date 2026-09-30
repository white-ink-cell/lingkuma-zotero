import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XHTML_PATH = path.join(ROOT, 'ui', 'prefs.xhtml');
export const MATRIX_PATH = path.join(ROOT, 'docs', 'G-004-ZOTERO-SETTINGS-COVERAGE.csv');

export const CLASSIFICATIONS = new Set([
  'EXPOSED_AND_WORKING',
  'BROWSER_ONLY_NA',
  'HOST_INAPPLICABLE_NA',
  'INTENTIONALLY_DISABLED',
  'OPTIONAL_SHALLOW_DEFERRED',
]);

const stateContext = vm.createContext({ structuredClone, setTimeout, clearTimeout, URL });
stateContext.globalThis = stateContext;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'adapter', 'state.js'), 'utf8'), stateContext);
const PORT_DEFAULTS = stateContext.LK_DEFAULT_STORAGE;

// Independently transcribed from the frozen 1.1.1 popup/options controls and
// initialization tables. Overrides name every known host-default adaptation so
// the matrix never mislabels a Zotero default as the upstream default.
const UPSTREAM_METADATA = Object.freeze({
  interfaceLanguage: 'upstream default=zh; values=zh|zh_TW|en|de|fr|es|ja|ko|ru|it',
  enablePlugin: 'upstream default=false; Zotero default=true (PORT-ADAPT: reader feature is enabled after installation)',
  wordHighlightFloatingButtonScope: 'upstream default=page; values=page|global; Zotero default=global (PORT-ADAPT: reader-wide host control)',
  highlightJapaneseEnabled: 'upstream default=true; Zotero default=false (preserved desktop migration choice)',
  highlightKoreanEnabled: 'upstream default=true; Zotero default=false (preserved desktop migration choice)',
  autoLoadKuromojiForJapanese: 'upstream default=true; Zotero default=false (PORT-ADAPT: avoid eager tokenizer load)',
  bionicFontFamily: "upstream default=auto; values=auto|'LXGWWenKai', serif|'Fanwood', serif|Arial, sans-serif|'Times New Roman', serif|'Courier New', monospace|Georgia, serif|Verdana, sans-serif|'Trebuchet MS', sans-serif|'Segoe UI', sans-serif|'Open Sans', sans-serif|Roboto, sans-serif|'Helvetica Neue', Helvetica, sans-serif",
  'rulerSettings.widthMode': 'upstream default=auto; values=auto|screen|custom',
  posHighlightLanguage: 'upstream default=english; values=auto|german|english; Zotero default=german (preserved desktop migration choice)',
  posHighlightVerbBackgroundEnabled: 'upstream default=false; Zotero default=true (preserved desktop migration choice)',
  posHighlightPrepositionBackgroundEnabled: 'upstream default=false; Zotero default=true (preserved desktop migration choice)',
  posHighlightVerbUnderlineStyle: 'upstream default=wavy; values=wavy|solid|dotted|dashed',
  posHighlightPrepositionUnderlineStyle: 'upstream default=solid; values=solid|wavy|dotted|dashed',
  posHighlightVerbUnderlinePosition: 'upstream default=bottom; values=bottom|top',
  posHighlightPrepositionUnderlinePosition: 'upstream default=bottom; values=bottom|top',
  'translationConfig.targetLanguage': 'upstream default=zh-CN; values=current upstream translation target list',
  'translationConfig.timeoutSeconds': 'PORT_EXTENSION default=15; type=number;min=3;max=60',
  autoAddAITranslations: 'upstream default=false; Zotero default=true (preserved desktop product choice)',
  'ttsConfig.wordTTSProvider': 'upstream default=edge; upstream values=local|edge|custom|custom2|minimaxi|gpt|supertone; Zotero default=edge and exposed values=local|edge|custom|custom2 (PORT-ADAPT: runtime-backed providers only)',
  'ttsConfig.sentenceTTSProvider': 'upstream default=edge; upstream values=local|edge|minimaxi|gpt|supertone|custom|custom2; Zotero default=edge and exposed values=local|edge|custom|custom2 (PORT-ADAPT: runtime-backed providers only)',
  'customApiProfiles.profiles[*].enablePolling': 'upstream profile default=false; migrated Zotero default profile=true (PORT-ADAPT: global polling remains opt-in)',
  wordExplosionTriggerMode: 'upstream default=click; values=click|hover',
  wordExplosionPositionMode: 'upstream default=auto; values=auto|manual',
  wordExplosionFontSize: 'upstream default=14; values=10|11|12|13|14|15|16|17|18|20',
  wordExplosionWordsLayout: 'upstream default=triple-column; values=single-column|double-column|triple-column',
  wordExplosionTranslationCount: 'upstream default=all; values=1|2|3|all',
  explosionSentenceTranslationCount: 'upstream default=1; values=1|2',
  wordExplosionLayout: 'upstream default=vertical; values=vertical|horizontal',
  wordExplosionUnderlineStyle: 'upstream default=solid; values=solid|wavy|dotted',
  wordExplosionUnderlinePosition: 'upstream default=bottom; values=bottom|top|both',
  tooltipThemeMode: 'upstream default=auto; values=auto|light|dark',
  'tooltipBackground.defaultType': 'upstream default=svg; upstream values=image|svg|video|specific; Zotero exposed value=svg only (PORT-ADAPT: complete packaged resource closure)',
  tooltipGap: 'upstream default=0; range=0..200',
  selectionPopupGap: 'upstream default=10; range=0..200',
  devicePixelRatio: 'upstream default=window.devicePixelRatio or 1; range=0.5..4; step=0.1',
  glassEffectType: 'upstream default=rough; upstream values=liquid|rough|fluted|tiled|pixel|mosaic|fractal|rgb-split|ellipses|bulge|flip; Zotero values=none|rough|liquid-compatible',
  analysisGlassEnabled: 'upstream default=true; Zotero default=false (PORT-ADAPT: Gecko compatibility)',
  customCapsules: 'upstream default=Google and Google Image capsule buttons; Zotero default=empty list (PORT-ADAPT: no browser-sidebar default actions)',
  epubSoftHyphenCleanup: 'old Zotero reader default=true; boolean',
  epubHyphenRepair: 'old Zotero reader default=true; boolean',
});

const getPortDefault = key => {
  if (key.startsWith('customApiProfiles.profiles[*].')) {
    const field = key.slice('customApiProfiles.profiles[*].'.length);
    const defaults = { name: 'Default', apiBaseURL: '', apiModel: '', apiTemperature: 1, apiKey: '', enablePolling: true, excludeTemperature: false, customRequestBody: '' };
    return defaults[field];
  }
  let value = PORT_DEFAULTS;
  for (const part of key.split('.')) value = value?.[part];
  if (value === undefined && /Prompt$/.test(key)) return '';
  return value;
};

const displayDefault = value => {
  if (value === '') return 'empty';
  if (value === undefined) return 'source-defined';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const clean = value => String(value ?? '').replace(/[\r\n,]+/g, ' ').trim();
const row = (id, source, control, range, applicable, zotero, storage, consumer, classification) => ({
  id, upstreamSource: source, upstreamControl: control, upstreamDefaultRange: range,
  applicableToZotero: String(applicable), zoteroControl: zotero, storageStateKey: storage,
  runtimeConsumer: consumer, classification,
});

const sourceFor = key => {
  if (key === 'translationConfig.timeoutSeconds') return 'PORT_EXTENSION;adapter/lookup.js';
  if (key === 'epubSoftHyphenCleanup' || key === 'epubHyphenRepair') return 'OLD_ZOTERO_REFERENCE;adapter/sentence_patch.js';
  if (key === 'webdavConfig.filename') return 'PORT_EXTENSION';
  if (key.startsWith('aiConfig.') || key.startsWith('customApiProfiles.') || key.startsWith('webdavConfig.')) return 'src/options/options.html;src/options/options.js';
  if (/Prompt/.test(key)) return 'src/options/options.html;src/options/options.js';
  if (key.startsWith('posHighlight')) return 'src/popup/popup.html;src/plugin/pos-highlight.js';
  if (key.startsWith('bionic')) return 'src/popup/popup.html;src/plugin/bionic.js';
  if (key === 'readingRuler' || key.startsWith('rulerSettings.')) return 'src/popup/popup.html;src/plugin/readingRuler.js';
  if (key.startsWith('ttsConfig.') || /TTS/.test(key)) return 'src/popup/popup.html;src/plugin/tts.js';
  return 'src/popup/popup.html;src/options/options.html';
};

const consumerFor = key => {
  if (key === 'translationConfig.timeoutSeconds') return 'adapter/lookup.js keyless Microsoft Edge request timeout';
  if (key === 'epubSoftHyphenCleanup' || key === 'epubHyphenRepair') return 'adapter/sentence_patch.js HTML/converted-EPUB extraction';
  if (key.startsWith('posHighlight')) return 'upstream/src/plugin/pos-highlight.js';
  if (key.startsWith('bionic')) return 'upstream/src/plugin/bionic.js';
  if (key === 'readingRuler' || key.startsWith('rulerSettings.')) return 'upstream/src/plugin/readingRuler.js';
  if (key.startsWith('webdavConfig.')) return 'ui/prefs.js WebDAV actions;adapter/state.js learning-data boundary';
  if (key.startsWith('aiConfig.') || key.startsWith('customApiProfiles.')) return 'adapter/state.js getEffectiveAIConfig/makeAIRequest';
  if (key.startsWith('ttsConfig.') || /TTS/.test(key)) return 'upstream/src/plugin/tts.js;adapter/main.js playAudioMessage';
  if (key.startsWith('wordStatusKeys.') || /Key$/.test(key)) return 'upstream/src/service/a4_tooltip_new.js keyboard handlers';
  if (key.startsWith('wordExplosion') || key.startsWith('explosion') || key === 'showKnownSentenceAnimation') return 'upstream/src/service/a7_words_boom.js';
  if (key.startsWith('posHighlight')) return 'upstream/src/plugin/pos-highlight.js';
  if (/Theme|Glass|tooltipBackground|devicePixelRatio/.test(key)) return 'upstream/src/service/a4_tooltip_new.js theme renderer';
  if (/Prompt|autoRequestAI|autoAddAITranslations/.test(key)) return 'upstream/src/service/a3_aiFragen.js;adapter/state.js';
  if (/highlight|Highlight|Kuromoji|Japanese|Korean|Chinese|Alphabetic/.test(key)) return 'upstream/src/service/a1_loadKnowWords.js;upstream/src/service/a2_hightlight.js';
  return 'upstream reader scripts through adapter/bridge.js storage view';
};

const rangeForTag = (key, tag) => {
  if (UPSTREAM_METADATA[key]) return UPSTREAM_METADATA[key];
  if (/Prompt/.test(key)) return 'upstream storage default=empty; runtime default=bundled prompt; free text';
  const parts = [];
  for (const attr of ['type', 'min', 'max', 'step', 'maxlength', 'pattern']) {
    const match = tag.match(new RegExp(`${attr}=["']([^"']*)["']`, 'i'));
    if (match) parts.push(`${attr}=${match[1]}`);
  }
  return `upstream default=${displayDefault(getPortDefault(key))}; ${parts.join(';') || 'free text/select values in frozen source'}`;
};

const currentRows = () => {
  const xhtml = fs.readFileSync(XHTML_PATH, 'utf8');
  const rows = [];
  const seen = new Set();
  let exposedIndex = 0;
    const add = (key, control, range) => {
    if (seen.has(key)) return;
    seen.add(key);
    const id = key === 'translationConfig.timeoutSeconds'
      ? 'P001'
      : `E${String(++exposedIndex).padStart(3, '0')}`;
    rows.push(row(id, sourceFor(key), key, range, true, control, key, consumerFor(key), 'EXPOSED_AND_WORKING'));
  };
  for (const tag of xhtml.match(/<html:(?:input|select|textarea)\b[^>]*>/g) || []) {
    const direct = tag.match(/data-lk-key=["']([^"']+)["']/);
      if (direct) add(direct[1], `data-lk-key=${direct[1]}`, rangeForTag(direct[1], tag));
    const object = tag.match(/data-lk-object=["']([^"']+)["']/);
    const subkey = tag.match(/data-lk-subkey=["']([^"']+)["']/);
    if (object && subkey) {
      const key = `${object[1]}.${subkey[1]}`;
        add(key, `data-lk-object=${object[1]};data-lk-subkey=${subkey[1]}`, rangeForTag(key, tag));
    }
    const profile = tag.match(/data-lk-profile-field=["']([^"']+)["']/);
    if (profile) {
      const key = `customApiProfiles.profiles[*].${profile[1]}`;
        add(key, `data-lk-profile-field=${profile[1]}`, rangeForTag(key, tag));
    }
    const special = tag.match(/data-lk-special=["']tooltipBackgroundEnabled["']/);
      if (special) add('tooltipBackground.enabled', 'data-lk-special=tooltipBackgroundEnabled', rangeForTag('tooltipBackground.enabled', tag));
    const backgroundType = tag.match(/data-lk-special=["']tooltipBackgroundDefaultType["']/);
      if (backgroundType) add('tooltipBackground.defaultType', 'data-lk-special=tooltipBackgroundDefaultType', rangeForTag('tooltipBackground.defaultType', tag));
  }
  add('customApiProfiles.activeProfileId', 'id=lk-ai-profile-select', 'one of configured profile IDs');
  add('import.language', 'id=lk-import-language', 'en|de|fr|es|it|ja|ko|ru|custom ISO 639-1');
  add('import.status', 'id=lk-import-status', '0..5');
  add('import.mode', 'id=lk-import-mode', 'merge|replace');
  return rows;
};

const unsupportedRows = () => {
  const rows = [];
  const add = (...args) => rows.push(row(...args));
  const browser = [
    ['B001','src/popup/popup.js','Website blacklist','empty','pluginBlacklistWebsites','a1/a5/a7 URL matcher'],
    ['B002','src/popup/popup.js','Per-tab/page overrides','object','wordHighlightPageTabOverrides','browser tab IDs'],
    ['B003','src/plugin/bionic.js','Bionic website blacklist','empty','bionicBlacklistWebsites','bionic URL matcher'],
    ['B004','src/plugin/bionic.js','Bionic forced-day websites','URL patterns','bionicDefaultDayWebsites','bionic theme URL matcher'],
    ['B005','src/plugin/bionic.js','Bionic forced-night websites','URL patterns','bionicDefaultNightWebsites','bionic theme URL matcher'],
    ['B006','src/plugin/readingRuler.js','Reading Ruler website blacklist','empty','readingRulerBlacklistWebsites','ruler URL matcher'],
    ['B007','src/options/options.html','Browser Side Panel master','false','sidePanelBtn','browser side-panel surface'],
    ['B008','src/popup/popup.js','Browser Side Panel shortcut','r','sidePanelKey','browser side-panel surface'],
    ['B009','src/options/options.html','Sidebar AI prompt','text','aiConfig.sidebarAIPrompt','a3 side-panel analysis'],
    ['B010','src/popup/popup.js','YouTube caption fixer','false','youtubeCaptionFix','YouTube content module'],
    ['B011','src/popup/popup.js','YouTube comma sentencing','false','youtubeCommaSentencing','YouTube content module'],
    ['B012','src/popup/popup.js','YouTube Bionic Reading','true','youtubeBionicReading','YouTube content module'],
    ['B013','src/popup/popup.js','YouTube subtitle font size','24','youtubeFontSize','YouTube content module'],
    ['B014','src/popup/popup.js','YouTube subtitle font family','Fanwood','youtubeFontFamily','YouTube content module'],
    ['B015','src/options/options.html','YouTube caption AI prompt','text','aiConfig.aiYoutubeCaptionPrompt','YouTube processing path'],
    ['B016','src/popup/popup.js','LingQ website blocker','false','lingqBlocker','LingQ site utility'],
    ['B017','src/plugin/tts.js','Orion/iOS TTS path','false','useOrionTTS','Orion mobile Safari compatibility'],
    ['B018','src/options/options.html;background.js','Hosted cloud account lifecycle','credentials and tokens','cloudConfig.auth','hosted account API'],
    ['B019','src/options/options.html;background.js','Hosted Cloud DB master','false','cloudConfig.cloudDbEnabled','hosted cloud DB lifecycle'],
    ['B020','src/options/options.html;background.js','Hosted cloud dual-write','true','cloudConfig.cloudDualWrite','browser cloud dual-write'],
    ['B021','src/options/options.html','Commercial AI channel','channel enum','aiConfig.aiChannel','account/subscription services'],
    ['B022','src/popup/popup.html;src/service/a2_hightlight.js','Highlight forced-day websites','URL patterns','highlightDefaultDayWebsites','browser website-theme matcher'],
    ['B023','src/popup/popup.html;src/service/a2_hightlight.js','Highlight forced-night websites','URL patterns','highlightDefaultNightWebsites','browser website-theme matcher'],
  ];
  for (const [id, source, control, range, storage, consumer] of browser) add(id, source, control, range, false, 'none', storage, consumer, 'BROWSER_ONLY_NA');
  const host = [
    ['H001','src/plugin/clipSubtitles.js','Clipboard Subtitles','false','clipSubtitles','browser clipboard/offscreen overlay'],
    ['H002','src/options/epubSplitter','EPUB Splitter','file operation','operation.epubSplitter','browser conversion tool'],
    ['H003','src/options/epubToTelegraph','EPUB to Telegra.ph','file/network operation','operation.epubToTelegraph','browser publisher'],
    ['H004','src/options/romanClean','EPUB RomanClean','file operation','operation.romanClean','browser conversion tool'],
  ];
  for (const [id, source, control, range, storage, consumer] of host) add(id, source, control, range, false, 'none', storage, consumer, 'HOST_INAPPLICABLE_NA');

  const disabled = [];
  const pushFields = (prefix, source, consumer, fields) => {
    for (const [name, range] of fields) disabled.push([`${prefix}-${name}`, source, name, range, name, consumer]);
  };
  pushFields('I-EDGE','src/options/options.html;src/plugin/tts.js','browser Edge TTS provider branch', [
    ['ttsConfig.edgeTTSAutoVoice','boolean'],['ttsConfig.edgeTTSVoice','voice ID'],['ttsConfig.edgeTTSRate','number'],['ttsConfig.edgeTTSVolume','number'],['ttsConfig.edgeTTSPitch','number'],
  ]);
  pushFields('I-GPT','src/options/options.html;src/plugin/tts.js','browser GPT TTS HTTP/audio branch', [
    ['gptTTSBaseURL','URL'],['gptTTSApiKey','secret'],['gptTTSModel','model'],['gptTTSVoice','voice'],['gptTTSResponseFormat','format'],['gptTTSSpeed','number'],['gptTTSInstructions','text'],
  ]);
  pushFields('I-MINIMAX','src/options/options.html;src/plugin/tts.js','browser MiniMaxi HTTP/audio branch', [
    ['aiConfig.minimaxiBaseURL','URL'],['aiConfig.minimaxiGroupId','ID'],['aiConfig.minimaxiApiKey','secret'],['aiConfig.minimaxiVoiceId','voice'],['aiConfig.minimaxiModel','model'],['aiConfig.minimaxiSpeed','number'],
  ]);
  pushFields('I-SUPERTONE','src/options/options.html;src/plugin/tts.js','browser Supertone HTTP/audio branch', [
    ['aiConfig.supertoneBaseURL','URL'],['aiConfig.supertoneAPIKey','secret'],['aiConfig.supertoneVoiceId','voice'],['aiConfig.supertoneModel','model'],['aiConfig.supertoneLanguage','language'],['aiConfig.supertoneStyle','style'],['aiConfig.supertoneOutputFormat','format'],['aiConfig.supertoneSpeed','number'],['aiConfig.supertoneMode','mode'],
  ]);
  disabled.push(
    ['I-CLOUD-selfHosted','src/options/options.html;background.js','cloudConfig.selfHosted','false','cloudConfig.selfHosted','full authenticated cloud lifecycle'],
    ['I-CLOUD-serverURL','src/options/options.html;background.js','cloudConfig.serverURL','URL','cloudConfig.serverURL','full authenticated cloud lifecycle'],
    ['I-ASSET-background','src/options/options.html','Custom tooltip background media','file/IndexedDB/object URL','tooltipBackground.useCustom','browser asset persistence'],
    ['I-ASSET-specific-background','src/options/options.html;src/service/a4_tooltip_new.js','Specific bundled tooltip background','packaged resource path','tooltipBackground.specificBgPath','browser asset picker and incomplete packaged image/video resource sets'],
    ['I-ASSET-animation','src/options/options.html;src/service/a7_words_boom.js','Custom animation file/config','50..500 pixels and sources','knownSentenceAnimation','browser asset persistence'],
    ['I-TTS-notebook','src/options/options.html','audioUrlNotebook','empty text','ttsConfig.audioUrlNotebook','no current upstream runtime consumer'],
  );
  for (const [id, source, control, range, storage, consumer] of disabled) add(id, source, control, range, true, 'none', storage, consumer, 'INTENTIONALLY_DISABLED');

  const optional = [
    ['O001','thanoxReadingEnabled','false'],['O002','thanoxProcessingOpacity','0..100 default 50'],['O003','thanoxCompletedOpacity','0..100 default 10'],['O004','thanoxWordSpeed','milliseconds default 1000'],['O005','thanoxFragmentEffect','true'],['O006','thanoxFragmentCount','integer default 8'],['O007','thanoxFragmentDuration','milliseconds default 2000'],
    ['O008','enableWaifu','false'],['O009','waifuUrl','URL'],['O010','waifuPosition','enum'],['O011','waifuRelativePosition','enum'],['O012','waifuSize','number/object'],['O013','waifuMinimized','boolean'],
  ];
  for (const [id, key, range] of optional) {
    const waifu = key.toLowerCase().includes('waifu');
    add(id, waifu ? 'src/plugin/waifu/waifu.js' : 'src/plugin/bionic.js', key, range, true, 'none', key, waifu ? 'remote iframe/CSP subsystem' : 'Thanox progressive-reading subsystem', 'OPTIONAL_SHALLOW_DEFERRED');
  }
  return rows;
};

const actionRows = () => {
  const actions = [
    ['A001','src/options/options.html;src/options/options.js','Vocabulary browse/filter/edit/delete','data-lk-page=word-list','action.vocabularyManager','ui/prefs.js renderWordList/updateWord/deleteWord'],
    ['A002','src/options/options.html;src/options/options.js','Learning statistics','data-lk-page=statistics','action.learningStatistics','ui/prefs.js renderStatistics'],
    ['A003','src/options/options.html;src/options/options.js','Import vocabulary','data-lk-action=import-words','action.importWords','ui/prefs.js importWords;adapter/state.js importLingKuma'],
    ['A004','src/options/options.html;src/options/options.js','Export learning-data backup','data-lk-action=copy-learning-backup','action.copyLearningBackup','ui/prefs.js copyBackup;adapter/state.js exportData'],
    ['A005','src/options/options.html;src/options/options.js','Restore learning data by merge','data-lk-action=restore-merge','action.restoreMerge','ui/prefs.js restoreBackup(true)'],
    ['A006','src/options/options.html;src/options/options.js','Restore learning data by replace','data-lk-action=restore-replace','action.restoreReplace','ui/prefs.js restoreBackup(false)'],
    ['A007','src/options/options.html;src/options/options.js','Clear vocabulary database','data-lk-action=clear-words','action.clearWords','ui/prefs.js clearWords'],
    ['A008','src/options/options.html;src/options/options.js','Trim stored example sentences','data-lk-action=trim-sentences','action.trimSentences','ui/prefs.js trimSentences'],
    ['A009','src/options/options.html;src/options/options.js','Test WebDAV connection','data-lk-action=webdav-test','action.webdavTest','ui/prefs.js webdavTest'],
    ['A010','src/options/options.html;src/options/options.js','Upload learning data to WebDAV','data-lk-action=webdav-upload','action.webdavUpload','ui/prefs.js webdavUpload'],
    ['A011','src/options/options.html;src/options/options.js','Download and merge WebDAV learning data','data-lk-action=webdav-download-merge','action.webdavDownloadMerge','ui/prefs.js webdavDownload(true)'],
    ['A012','src/options/options.html;src/options/options.js','Download and replace WebDAV learning data','data-lk-action=webdav-download-replace','action.webdavDownloadReplace','ui/prefs.js webdavDownload(false)'],
    ['A013','src/options/options.html;src/options/options.js','Add API profile','data-lk-action=ai-profile-add','action.aiProfileAdd','ui/prefs.js addAIProfile(false)'],
    ['A014','src/options/options.html;src/options/options.js','Copy API profile','data-lk-action=ai-profile-copy','action.aiProfileCopy','ui/prefs.js addAIProfile(true)'],
    ['A015','src/options/options.html;src/options/options.js','Delete API profile','data-lk-action=ai-profile-delete','action.aiProfileDelete','ui/prefs.js deleteAIProfile'],
    ['A016','src/options/options.html;src/plugin/tts.js','Test local TTS','data-lk-action=test-local-tts','action.testLocalTTS','ui/prefs.js testLocalTTS'],
    ['A017','PORT_EXTENSION','Select default dictionary','data-lk-action=dictionary-default','action.dictionaryDefault','ui/prefs.js selectDictionaryMode;adapter/lookup.js'],
    ['A018','PORT_EXTENSION','Select custom local dictionary','data-lk-action=dictionary-custom','action.dictionaryCustom','ui/prefs.js selectDictionaryMode;adapter/lookup.js'],
    ['A019','PORT_EXTENSION','Import validated lkdict','data-lk-action=dictionary-import','action.dictionaryImport','ui/prefs.js importDictionary;adapter/lookup.js'],
    ['A020','PORT_EXTENSION','Refresh dictionary status','data-lk-action=dictionary-refresh','action.dictionaryRefresh','ui/prefs.js refreshDictionaryStatus'],
  ];
  return actions.map(([id, source, control, zotero, storage, consumer]) => row(
    id, source, control, 'operation', true, zotero, storage, consumer, 'EXPOSED_AND_WORKING',
  ));
};

export const buildRows = () => [...currentRows(), ...actionRows(), ...unsupportedRows()];

export const renderCSV = rows => {
  const fields = ['id','upstreamSource','upstreamControl','upstreamDefaultRange','applicableToZotero','zoteroControl','storageStateKey','runtimeConsumer','classification'];
  return `${fields.join(',')}\n${rows.map(item => fields.map(field => clean(item[field])).join(',')).join('\n')}\n`;
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  fs.mkdirSync(path.dirname(MATRIX_PATH), { recursive: true });
  fs.writeFileSync(MATRIX_PATH, renderCSV(buildRows()), 'utf8');
}
