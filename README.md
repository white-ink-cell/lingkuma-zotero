# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | [日本語](README_ja.md) | [한국어](README_ko.md)

**See it. Click it. Learn it.**  
**If you don't understand it, click it.**

[Original LingKuma](https://github.com/lingkuma/LingKuma) · [LingKuma Wiki](https://docs.lingkuma.org) · [LingKuma website](https://lingkuma.org/) · [Calibre port](https://github.com/white-ink-cell/lingkuma-calibre)

LingKuma — let knowledge spread beyond the barriers of language — is a translation and language-learning tool designed around reading.

You shouldn't have to wait until you have "learned" a language before you can start reading papers, books, and documents in that language.

When you encounter a word you don't know, **click it**.  
When a sentence is difficult to understand, **click it**.

LingKuma helps you read content in languages you are still learning while naturally expanding your vocabulary, becoming more familiar with grammar and expressions, and improving your understanding of the language.

> **Enjoy reading first — and learn a new language along the way.**

## What can LingKuma do?

- Click a word to see its meaning
- Translate and analyze complete sentences
- Use **Dictionary + Quick Context + AI Detail** for faster, more accurate word lookup
- Listen to word pronunciation using recorded dictionary audio, with separate US and UK pronunciation options
- Learn vocabulary while reading and keep personal meanings / notes
- Use AI-assisted grammar, context, and sentence explanations
- Use Word Explosion to inspect multiple words in the current sentence
- Open external dictionaries, search engines, or encyclopedias such as Wikipedia with custom buttons
- Use Bionic Reading, Reading Ruler, and POS Highlight
- Back up / restore learning data with optional WebDAV
- Use light and dark themes

For broader LingKuma usage guides and platform documentation, see the [LingKuma Wiki](https://docs.lingkuma.org).

## Screenshots

Light theme with English → Chinese translation:

<img src="docs/images/lingkuma-zotero-word-lookup-light.png" alt="LingKuma for Zotero light theme with Chinese translation" width="900">

Dark theme with English → Chinese translation:

<img src="docs/images/lingkuma-zotero-word-lookup-dark.png" alt="LingKuma for Zotero dark theme with Chinese translation" width="900">

Dark theme with English → Russian translation:

<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero dark theme with Russian translation" width="900">

## Zotero Port

This is an unofficial Zotero port of the open-source LingKuma project.

The Zotero port adds:

- Support for current Zotero 10 releases while retaining Zotero 9 compatibility
- Improved sentence selection for PDF / EPUB reading
- Better sentence recognition and line-break repair
- Explicit English hyphenated-compound recognition
- Faster lookup with Dictionary + Quick Context
- Zotero-compatible frosted-glass effects
- Integration with Zotero's built-in PDF / EPUB reading environment
- A native LingKuma settings page inside Zotero

## What's new in v1.1.0?

### Zotero 10 compatibility

Older LingKuma for Zotero builds were designed around earlier Zotero plugin APIs and may no longer install or work correctly on current Zotero releases.

This release updates the adapter for **Zotero 10.0.x** while retaining compatibility with **Zotero 9.x**.

The bundled LingKuma upstream has also been updated from the older port baseline to **LingKuma 1.1.1**.

### Faster lookup: Dictionary + Quick Context + AI

Previous versions depended much more heavily on AI for ordinary word meanings. That could make simple lookup slower and could occasionally produce over-broad explanations — for example, an adjective and the noun next to it might both be explained as the same whole phrase.

The new lookup flow separates the job into three layers:

1. **Dictionary** — fast lexical facts such as basic meanings, part of speech, morphology, IPA, and pronunciation metadata.
2. **Quick Context** — fast, non-generative contextual translation using the **full current sentence**, so the selected word is interpreted in context rather than in isolation.
3. **AI Detail** — deeper grammar, usage, sentence analysis, and follow-up explanation.

This reduces ordinary lookup latency and improves the reliability of basic lexical information without removing LingKuma's AI capabilities.

### Faster Word Explosion

Word Explosion no longer needs to wait for a separate AI request for every visible word in the normal path.

Its per-word glosses now use Quick Context, while full-sentence translation and deeper AI analysis remain available separately.

### Better sentence selection

This release keeps and extends the sentence-selection work from the earlier Zotero port:

- improved reconstruction of positioned PDF text;
- fewer half-sentence and accidental cross-sentence selections;
- conservative handling of abbreviations, initials, decimals, quotes, brackets, colons, and semicolons;
- repair of obvious layout-induced line-break hyphenation.

### Hyphenated words and compounds

Explicit Latin hyphenated compounds can now be treated as one lookup and learning unit instead of being split into unrelated tokens.

Examples:

- `well-known`
- `out-of-sample`
- `peer-on-peer`

Layout-only line breaks remain a separate case. For example, an obvious `inter-` + line break + `national` can be conservatively repaired as `international`.

### Pronunciation upgrade

English pronunciation has been upgraded from a TTS-only experience to a **dictionary-first pronunciation path**:

- reliable surface-form IPA is shown when available;
- US and UK pronunciation are displayed separately and can be played independently;
- recorded dictionary audio is preferred when available;
- when the exact surface form has no recording, TTS is used.

For the main word pronunciation button:

- only US recording available → play US;
- only UK recording available → play UK;
- both available → **US is the default**;
- neither available → fall back to TTS.

This is particularly useful for inflected forms such as `books`, `worked`, `studies`, and `working`.

### Reading and learning features retained

The port continues to preserve or expose the applicable LingKuma reading workflow, including:

- vocabulary status and saved meanings;
- example records and learning data;
- AI sentence analysis and deeper word explanation;
- Bionic Reading;
- Reading Ruler;
- POS Highlight;
- custom external search / dictionary / encyclopedia buttons;
- local vocabulary management;
- WebDAV backup / restore;
- EPUB text-repair options;
- Zotero-compatible theme and popup behaviour.

## Current language scope

LingKuma itself remains multilingual, but the **new bundled local dictionary acceleration is currently focused on English source text**.

In this release:

- the bundled local lexical dictionary is **English → Simplified Chinese**;
- Quick Context can follow the configured target language where the translation service supports it;
- equivalent local dictionary packs for other source languages are not bundled yet.

As a result, the largest speed and accuracy improvement in this release is for **English-source reading**. Expanding the dictionary-accelerated workflow to more language combinations is planned for a future update.

## Installation

1. Download `lingkuma-zotero-1.1.0.xpi` from **GitHub Releases**.
2. Open **Zotero → Tools → Plugins**.
3. Use **Install Add-on From File** (or drag the `.xpi` into the Plugins window).
4. Select the downloaded `.xpi` file.
5. Restart Zotero if requested.

> Do not install GitHub's automatically generated source-code ZIP as the Zotero plugin. Use the `.xpi` release file.

## Other Versions

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
- [LingKuma](https://github.com/lingkuma/LingKuma)

## Supported Environment

- Zotero 9.x
- Zotero 10.0.x
- PDF and EPUB reader integration
- Primary desktop targets: Windows and macOS
- Linux: best-effort compatibility, not a formal release-test target

## Settings

The settings interface is integrated into Zotero.

Open **Edit → Settings → LingKuma for Zotero**.

It includes language and translation settings, AI provider / prompt settings, vocabulary management, dictionary options, TTS options, popup and reading-assistance controls, and optional WebDAV backup / restore.

## Privacy

LingKuma for Zotero stores its local state in the Zotero data directory.

## Upstream Project and Attribution

- Original project: **[LingKuma](https://github.com/lingkuma/LingKuma)**
- LingKuma Wiki: **[docs.lingkuma.org](https://docs.lingkuma.org)**
- Upstream version: **LingKuma 1.1.1**
- Zotero port maintained and published by: **white-ink-cell**

This repository provides an unofficial Zotero port of LingKuma.

The port adapts LingKuma to Zotero's reading environment while preserving the original project's core features, interface, assets, and overall design as closely as possible. Zotero-specific changes focus on runtime compatibility, sentence selection, dictionary / Quick Context integration, pronunciation, compound-word handling, frosted-glass compatibility, and multilingual translation support.

See `UPSTREAM.md` for more details.

## Dictionary data

The bundled English dictionary is derived from **English Wiktionary** contributor data extracted through **Wiktextract** and distributed by **Kaikki.org**.

Dictionary text data is distributed under **CC BY-SA 4.0**. Remote Wikimedia Commons pronunciation files keep the individual licenses shown on their source pages.

See `licenses/ENGLISH-WIKTIONARY-DATA-NOTICE.txt` and `THIRD-PARTY-NOTICES.txt` for details.

## License

The original LingKuma authorship, copyright, and licenses remain unchanged.

The Zotero adapter and compatibility layer are covered by `LICENSE-ADAPTER.txt`. The original LingKuma license is preserved in `LICENSE-LINGKUMA.txt`, and bundled third-party licenses and notices are documented in `THIRD-PARTY-NOTICES.txt`.
