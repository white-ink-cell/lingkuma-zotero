# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | [日本語](README_ja.md) | [한국어](README_ko.md)

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

## Screenshots

Light theme with English → Chinese translation:

<img src="docs/images/zotero-light-chinese.png" alt="LingKuma for Zotero light theme with Chinese translation" width="900">

Dark theme with English → Russian translation:

<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero dark theme with Russian translation" width="900">

## Zotero Port

This is an unofficial Zotero port of the open-source LingKuma project.

The Zotero port adds:

- Zotero runtime adaptation
- Improved sentence selection for PDF reading
- Better sentence recognition across different languages
- Zotero-compatible frosted-glass effects
- Multilingual translation and AI output support
- Integration with Zotero's built-in PDF reading environment

## Installation

1. Download `lingkuma-zotero-1.0.1.xpi` from **GitHub Releases**.
2. Open **Zotero → Tools → Plugins**.
3. Use **Install Add-on From File** (or drag the `.xpi` into the Plugins window).
4. Select the downloaded `.xpi` file.
5. Restart Zotero.

> Do not install GitHub's automatically generated source-code ZIP as the Zotero plugin. Use the `.xpi` release file.

## Other Port

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
- [LingKuma](https://github.com/lingkuma/LingKuma)
  
## Supported Environment

- Zotero 9.x
- PDF and EPUB reader integration
- Windows / macOS / Linux

## Settings

The settings interface is integrated into Zotero. It includes language and AI settings, vocabulary management, TTS options, appearance controls, and optional WebDAV backup / restore.

## Privacy

LingKuma for Zotero stores its local state in the Zotero data directory. Translation, AI, remote TTS, and WebDAV features may send the text or data required for the selected service. The plugin does not intentionally upload an entire PDF or EPUB file for ordinary word or sentence translation.

## Upstream Project and Attribution

- Original project: **LingKuma**
- Upstream version: **LingKuma 1.1.0**
- Zotero port maintained and published by: **white-ink-cell**

This repository provides an unofficial Zotero port of LingKuma.

The port adapts LingKuma to Zotero's reading environment while preserving the original project's core features, interface, assets, and overall design as closely as possible. Zotero-specific changes mainly focus on runtime compatibility, sentence selection, frosted-glass effects, and multilingual translation support.

See [`UPSTREAM.md`](UPSTREAM.md) for more details.

## License

The original LingKuma authorship, copyright, and licenses remain unchanged.

The Zotero adapter and compatibility layer are covered by [`LICENSE-ADAPTER.txt`](LICENSE-ADAPTER.txt). The original LingKuma license is preserved in [`LICENSE-LINGKUMA.txt`](LICENSE-LINGKUMA.txt), and bundled third-party licenses and notices are documented in [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).
