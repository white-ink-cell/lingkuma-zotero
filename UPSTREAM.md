# Upstream Project and Porting Notes

[English](UPSTREAM.md) | [简体中文](UPSTREAM_zh.md) | [日本語](UPSTREAM_ja.md) | [한국어](UPSTREAM_ko.md)

This project is an unofficial Zotero port of **LingKuma 1.1.0**.

- Original project: `lingkuma/LingKuma`
- Zotero port maintained / published by: `white-ink-cell`

The original LingKuma authorship, copyright, and third-party licenses remain unchanged. `white-ink-cell` identifies only the maintainer and publisher of this Zotero port.

## Main Porting Work

1. **Zotero runtime adaptation** — adds a compatibility layer around LingKuma so its reader features can run inside Zotero.
2. **Sentence selection improvements** — reconstructs positioned PDF text and improves sentence boundaries so sentence translation and Word Explosion can capture complete sentences more reliably.
3. **Frosted-glass compatibility** — replaces unsupported Chromium liquid-glass rendering with a Gecko-compatible frosted-glass fallback while preserving the original UI/theme logic.
4. **Multilingual translation support** — adapts Chinese-centered default prompts and language metadata so translation and explanations follow the selected source/target languages.

## Principle

The goal is to **port LingKuma to Zotero**. The upstream files and original project attribution are preserved, while Zotero-specific behavior is kept in the adapter layer.
