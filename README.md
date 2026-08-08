# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | [日本語](README_ja.md) | [한국어](README_ko.md)

## Other Port

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
- [LingKuma](https://github.com/lingkuma/LingKuma)

**See it. Click it. Learn it.**

LingKuma — *let knowledge spread beyond the barriers of language* — is a translation and language-learning tool designed around reading.

You shouldn't have to wait until you have "learned" a language before you can start reading papers, books, and documents in that language.

When you encounter a word you don't know, **click it**.  
When a sentence is difficult to understand, **click it**.

LingKuma helps you read content in languages you are still learning while naturally expanding your vocabulary, becoming more familiar with grammar and expressions, and improving your understanding of the language.

> **Enjoy reading first — and learn a new language along the way.**

## What can LingKuma do?

- Click a word to see its meaning
- Translate and analyze complete sentences
- Listen to word pronunciation with TTS
- Learn vocabulary while reading
- Get AI-assisted grammar and contextual explanations
- Translate between multiple languages
- Use light and dark themes
- Keep the original LingKuma-style interface inside Zotero

An unofficial Zotero desktop port of **LingKuma 1.1.0**. It brings LingKuma's highlighting, word lookup, translation / AI, sentence analysis, vocabulary, TTS, and light/dark themes into Zotero's PDF and EPUB reading environment.

> **Zotero port published / maintained by [`white-ink-cell`](https://github.com/white-ink-cell)**  
> This repository is not an official release of LingKuma or Zotero. The original LingKuma authorship, copyright, and licenses remain unchanged. `white-ink-cell` refers only to the maintainer and publisher of this Zotero port.

## Screenshots

Light theme with English → Chinese translation:

<img src="docs/images/zotero-light-chinese.png" alt="LingKuma for Zotero light theme with Chinese translation" width="900">

Dark theme with English → Russian translation:

<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero dark theme with Russian translation" width="900">

## Main Changes

This port focuses on four compatibility changes.

### 1. Zotero Runtime Adaptation

A Zotero compatibility layer is added around LingKuma so browser-extension features can run inside Zotero's reader environment while keeping the original LingKuma behavior and code structure as intact as possible.

### 2. Sentence Selection Improvements

PDF.js can split one visual sentence into many positioned text fragments, and some punctuation or layout patterns can cause incomplete sentence selection. This port adds sentence-boundary and PDF text-reconstruction rules so sentence translation and Word Explosion can capture the full sentence more reliably.

### 3. Frosted-Glass Compatibility

LingKuma's original liquid-glass effect relies on Chromium-specific rendering that is not fully supported by Zotero's Gecko-based reader. This port keeps the original UI and theme behavior while using a readable Zotero-compatible frosted-glass fallback.

### 4. Multilingual Translation Support

Some original AI prompts and language-handling logic were designed with Chinese as the default target language. This port adds source-language detection and target-language handling so translation, AI explanations, TTS metadata, and related language output can follow the user's selected languages.

## Installation

1. Download `lingkuma-zotero-1.0.1.xpi` from **GitHub Releases**.
2. Open **Zotero → Tools → Plugins**.
3. Use **Install Add-on From File** (or drag the `.xpi` into the Plugins window).
4. Select the downloaded `.xpi` file.
5. Restart Zotero.

> Do not install GitHub's automatically generated source-code ZIP as the Zotero plugin. Use the `.xpi` release file.

## Supported Environment

- Zotero 9.x
- PDF and EPUB reader integration
- Windows / macOS / Linux

## Settings

The settings interface is integrated into Zotero. It includes language and AI settings, vocabulary management, TTS options, appearance controls, and optional WebDAV backup / restore.

## Data and Privacy

LingKuma for Zotero stores its local state in the Zotero data directory. Translation, AI, remote TTS, and WebDAV features may send the text or data required for the selected service. The plugin does not intentionally upload an entire PDF or EPUB file for ordinary word or sentence translation.

## Upstream Project and Attribution

- Original project: **LingKuma**
- Upstream version: **LingKuma 1.1.0**
- Zotero port maintained / published by: **white-ink-cell**

The goal is to port LingKuma to Zotero. Apart from compatibility work required by Zotero, the original project's core features, UI, assets, and design are kept as close to upstream as possible.

See [`UPSTREAM.md`](UPSTREAM.md) for details.

## License

The original LingKuma authorship, copyright, and license remain unchanged. The Zotero adapter / compatibility layer is covered by [`LICENSE-ADAPTER.txt`](LICENSE-ADAPTER.txt). Upstream LingKuma licensing is preserved in [`LICENSE-LINGKUMA.txt`](LICENSE-LINGKUMA.txt), and bundled third-party notices are in [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).
