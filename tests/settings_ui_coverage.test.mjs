import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XHTML = fs.readFileSync(path.join(ROOT, 'ui', 'prefs.xhtml'), 'utf8');
const BOOTSTRAP = fs.readFileSync(path.join(ROOT, 'bootstrap.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(ROOT, 'adapter', 'main.js'), 'utf8');

test('Zotero exposes exactly one LingKuma settings surface', () => {
  assert.equal((BOOTSTRAP.match(/PreferencePanes\.register\s*\(/g) || []).length, 1);
  assert.match(BOOTSTRAP, /src:\s*rootURI \+ "ui\/prefs\.xhtml"/);
  assert.equal((XHTML.match(/id="lingkuma-zotero-prefs-root"/g) || []).length, 1);
  assert.doesNotMatch(MAIN, /open(?:Settings|Preferences)|menuitem[^\n]*(?:Settings|设置)/i);
  assert.doesNotMatch(XHTML, /<(?:html:)?iframe\b|data-lk-action="open-(?:settings|preferences)"/i);
});

test('native preferences omit browser-only, disabled, and host-inapplicable controls', () => {
  for (const key of [
    'cloudDbEnabled',
    'cloudDualWrite',
    'cloudSelfHosted',
    'cloudServerUrl',
    'sidebarAIPrompt',
    'edgeTTSAutoVoice',
    'edgeTTSVoice',
    'edgeTTSRate',
    'edgeTTSVolume',
    'edgeTTSPitch',
    'gptTTSBaseURL',
    'gptTTSApiKey',
    'gptTTSModel',
    'gptTTSVoice',
    'gptTTSResponseFormat',
    'gptTTSSpeed',
    'gptTTSInstructions',
  ]) {
    assert.doesNotMatch(XHTML, new RegExp(`data-lk-key=["']${key}["']`), key);
  }
  assert.doesNotMatch(XHTML, /data-lk-action="copy-settings-backup"/);
  assert.doesNotMatch(XHTML, /data-lk-action="open-afdian"/);
  assert.doesNotMatch(XHTML, /<html:option value="gpt">/);
});


test('native preferences expose the required reader feature controls', () => {
  const directKeys = [
    'wordHighlightFloatingButtonScope',
    'autoDetectJapaneseKanji',
    'useKuromojiTokenizer',
    'autoLoadKuromojiForJapanese',
    'bionicEnabled',
    'bionicFontFamily',
    'bionicFontSize',
    'posHighlightEnabled',
    'posHighlightLanguage',
    'posHighlightVerbBackgroundOpacity',
    'posHighlightPrepositionBackgroundOpacity',
    'sentenceTTSAutoDetectLanguage',
    'enableAutoWordTTS',
  ];
  for (const part of ['Verb', 'Preposition']) {
    for (const suffix of [
      'Enabled', 'BackgroundEnabled', 'BackgroundColor', 'UnderlineEnabled',
      'UnderlineStyle', 'UnderlineColor', 'UnderlineThickness', 'UnderlinePosition',
    ]) directKeys.push(`posHighlight${part}${suffix}`);
  }
  for (const key of directKeys) {
    assert.match(XHTML, new RegExp(`data-lk-key=["']${key}["']`), key);
  }
  for (const subkey of ['height', 'color', 'opacity', 'isInverted', 'widthMode', 'customWidth']) {
    assert.match(
      XHTML,
      new RegExp(`data-lk-object=["']rulerSettings["'][^>]*data-lk-subkey=["']${subkey}["']`),
      `rulerSettings.${subkey}`,
    );
  }
});


test('native TTS controls write the upstream nested ttsConfig interface', () => {
  for (const subkey of [
    'wordTTSProvider', 'sentenceTTSProvider', 'localTTSVoice', 'localTTSRate',
    'localTTSPitch', 'wordAudioUrlTemplate', 'wordAudioUrlTemplate2',
  ]) {
    assert.match(
      XHTML,
      new RegExp(`data-lk-object=["']ttsConfig["'][^>]*data-lk-subkey=["']${subkey}["']`),
      `ttsConfig.${subkey}`,
    );
    assert.doesNotMatch(XHTML, new RegExp(`data-lk-key=["']${subkey}["']`), subkey);
  }
  assert.equal((XHTML.match(/<html:option value="custom2">/g) || []).length, 2);
  assert.equal((XHTML.match(/<html:option value="edge">/g) || []).length, 2);
});


test('native preferences expose remaining applicable upstream settings', () => {
  const directKeys = [
    'autoAddAITranslations', 'autoAddExampleSentences', 'autoAddSentencesLimit',
    'defaultExpandTooltip', 'defaultExpandSententsTooltip', 'wordExplosionLayout',
    'wordExplosionUnderlineEnabled', 'wordExplosionUnderlineStyle',
    'wordExplosionUnderlinePosition', 'wordExplosionUnderlineColor',
    'wordExplosionUnderlineThickness', 'explosionPriorityMode',
    'explosionHighlightWithTTS', 'explosionHighlightNoTTS', 'explosionTTSOnly',
    'explosionHighlightSpeed', 'showKnownSentenceAnimation', 'wordQueryKey',
    'copySentenceKey', 'analysisWindowKey', 'sentenceExplosionKey',
  ];
  for (const key of directKeys) {
    assert.match(XHTML, new RegExp(`data-lk-key=["']${key}["']`), key);
  }
  for (const subkey of ['0', '1', '2', '3', '4', '5', 'toggle', 'addAITranslation', 'closeTooltip']) {
    assert.match(
      XHTML,
      new RegExp(`data-lk-object=["']wordStatusKeys["'][^>]*data-lk-subkey=["']${subkey}["']`),
      `wordStatusKeys.${subkey}`,
    );
  }
  assert.doesNotMatch(XHTML, /data-lk-key="sidePanelKey"/);
  assert.match(XHTML, /Alphabetic word highlight \/ 字母语言单词高亮[\s\S]{0,300}data-lk-key="highlightAlphabeticEnabled"/);
});

test('native UI exposes only working AI configuration and learning-data backup copy', () => {
  assert.doesNotMatch(XHTML, /data-lk-subkey=["']aiChannel["']/);
  assert.doesNotMatch(XHTML, /data-lk-action=["']copy-full-backup["']/);
  assert.match(XHTML, /data-lk-action=["']copy-learning-backup["']/);
  assert.match(XHTML, /Learning data backup/);
  assert.doesNotMatch(XHTML, /Vocabulary &amp; settings backup|all Zotero adapter settings/i);
});

test('native preferences disclose keyless Quick Context without credential controls', () => {
  assert.match(XHTML, /Microsoft Edge Translator/);
  assert.match(XHTML, /requires no account or API key/);
  assert.match(XHTML, /data-lk-object="translationConfig"[^>]*data-lk-subkey="timeoutSeconds"/);
  assert.doesNotMatch(XHTML, /data-lk-subkey="(?:provider|microsoftKey|microsoftRegion|microsoftEndpoint)"/);
  assert.equal((XHTML.match(/PreferencePanes\.register\s*\(/g) || []).length, 0);
});

test('native AI configuration preserves the applicable upstream profile controls', () => {
  assert.match(XHTML, /id="lk-ai-profile-select"/);
  for (const action of ['ai-profile-add', 'ai-profile-copy', 'ai-profile-delete']) {
    assert.match(XHTML, new RegExp(`data-lk-action=["']${action}["']`), action);
  }
  for (const field of [
    'name', 'apiBaseURL', 'apiKey', 'apiModel', 'apiTemperature',
    'enablePolling', 'excludeTemperature', 'customRequestBody',
  ]) {
    assert.match(XHTML, new RegExp(`data-lk-profile-field=["']${field}["']`), field);
  }
  assert.match(XHTML, /data-lk-object="aiConfig"[^>]*data-lk-subkey="enableApiPolling"/);
});

test('native controls preserve upstream ranges and import semantics', () => {
  assert.match(XHTML, /max="999"[^>]*data-lk-key="autoAddSentencesLimit"|data-lk-key="autoAddSentencesLimit"[^>]*max="999"/);
  assert.match(XHTML, /min="20"[^>]*max="200000"[^>]*data-lk-key="wordExplosionMaxWidth"|data-lk-key="wordExplosionMaxWidth"[^>]*min="20"[^>]*max="200000"/);
  assert.match(XHTML, /id="lk-import-language"/);
  assert.match(XHTML, /id="lk-import-custom-language"/);
  for (const status of ['0', '1', '2', '3', '4', '5']) {
    assert.match(XHTML, new RegExp(`<html:option value=["']${status}["']`), `import status ${status}`);
  }
});

test('custom capsule editor documents the upstream container and button shape', () => {
  assert.match(XHTML, /placeholder='\[\{&quot;buttons&quot;:/);
  assert.match(XHTML, /&quot;openMethod&quot;:&quot;newTab&quot;/);
});

test('known-sentence animation is exposed only with its complete upstream resource closure', () => {
  assert.match(XHTML, /data-lk-key="showKnownSentenceAnimation"/);
  for (const relative of [
    'src/service/image/lottie/tgs-balloon.html',
    'src/service/image/lottie/tgs-balloon.js',
    'src/service/image/lottie/气球.tgs',
    'src/service/image/lottie/气球子图.tgs',
    'src/utils/tgs-player.min.js',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, 'upstream', ...relative.split('/'))), true, relative);
  }
});

test('tooltip background exposes only the fully packaged SVG resource set', () => {
  assert.match(XHTML, /data-lk-special="tooltipBackgroundDefaultType"/);
  assert.match(XHTML, /<html:option value="svg">/);
  assert.doesNotMatch(XHTML, /<html:option value="(?:image|video|specific)">/);
  const resources = fs.readFileSync(path.join(ROOT, 'adapter', 'resources.js'), 'utf8');
  for (let index = 1; index <= 33; index += 1) {
    assert.equal(resources.includes(`"src/service/image/tg/pattern-${index}.svg"`), true, `pattern-${index}.svg`);
  }
  assert.equal(resources.includes('"src/service/videos/kawai.mp4"'), false);
});

test('EPUB reader-time repair controls are reachable and are not browser conversion tools', () => {
  assert.match(XHTML, /data-lk-page=["']epub["']/);
  assert.match(XHTML, /data-lk-page-panel=["']epub["']/);
  assert.match(XHTML, /data-lk-key=["']epubSoftHyphenCleanup["']/);
  assert.match(XHTML, /data-lk-key=["']epubHyphenRepair["']/);
  assert.doesNotMatch(XHTML, /epubSplitter|epubToTelegraph|romanClean/);
});

test('upstream color-opacity controls preserve the 0-100 range', () => {
  for (const key of [
    'posHighlightVerbBackgroundOpacity', 'posHighlightPrepositionBackgroundOpacity',
    'wordExplosionHighlightOpacity', 'wordExplosionUnderlineOpacity',
  ]) {
    assert.match(
      XHTML,
      new RegExp(`min=["']0["'][^>]*max=["']100["'][^>]*data-lk-key=["']${key}["']|data-lk-key=["']${key}["'][^>]*min=["']0["'][^>]*max=["']100["']`),
      key,
    );
  }
});
