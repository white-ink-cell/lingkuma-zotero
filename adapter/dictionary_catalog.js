/*
 * Default dictionary release catalog.
 *
 * G-004 bundles one verified English-to-Simplified-Chinese asset for the
 * unpublished test XPI. A formal release may later replace bundledPath with
 * a real immutable HTTPS release URL without changing lookup semantics.
 */
this.LK_DICTIONARY_CATALOG = Object.freeze([Object.freeze({
  active: true,
  pronunciationSource: true,
  dictionaryID: "kaikki-en-zh-cn-2026-09-02",
  sourceLanguage: "en",
  targetLanguage: "zh-CN",
  bundledPath: "assets/dictionaries/kaikki-en-zh-cn-2026-09.lkdict",
  sha256: "17b2869b9e4a8e323e95645db266f0393a05954847d0a07718d3a6546ef05690",
  size: 65585152
})]);
