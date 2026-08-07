# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | **日本語** | [한국어](README_ko.md)

**LingKuma 1.1.0** を Zotero で利用できるようにした非公式デスクトップ移植版です。LingKuma のハイライト、単語検索、翻訳 / AI、文単位の解析、語彙管理、TTS、ライト / ダークテーマを Zotero の PDF / EPUB リーダーで利用できます。

> **Zotero 移植版の公開 / メンテナンス：[`white-ink-cell`](https://github.com/white-ink-cell)**  
> このリポジトリは LingKuma または Zotero の公式版ではありません。LingKuma 原プロジェクトの作者表記、著作権、ライセンスは変更していません。`white-ink-cell` は、この Zotero 移植版の公開者・メンテナであることのみを示します。

## スクリーンショット

ライトテーマ、英語 → 中国語翻訳：

<img src="docs/images/zotero-light-chinese.png" alt="LingKuma for Zotero ライトテーマ 中国語翻訳" width="900">

ダークテーマ、英語 → ロシア語翻訳：

<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero ダークテーマ ロシア語翻訳" width="900">

## 主な変更点

この移植版では、主に次の 4 点を Zotero 向けに調整しています。

### 1. Zotero 実行環境への対応

LingKuma の外側に Zotero 用の互換レイヤーを追加し、ブラウザー拡張環境に依存していた機能を Zotero リーダー内で動作させます。可能な限り LingKuma 本来の機能とコード構造を維持しています。

### 2. 文選択の改善

PDF.js は視覚上の一文を複数の位置指定テキスト断片に分割するため、句読点やレイアウトによって文が途中で切れる場合があります。この移植版では文境界判定と PDF テキスト再構築ルールを追加し、文翻訳と Word Explosion が完全な文をより確実に取得できるようにしています。

### 3. すりガラス効果への対応

LingKuma の元の液体ガラス表現は Chromium 固有の描画機能に依存しています。Zotero のリーダーは Gecko ベースのため、この移植版では元の UI とテーマロジックを維持しながら、安定して表示できるすりガラス表現を互換方式として使用します。

### 4. 多言語翻訳への対応

元の一部 AI Prompt と言語処理は、中国語を既定の翻訳先として設計されています。この移植版では入力言語の識別と翻訳先言語の処理を追加し、翻訳、AI 解説、TTS の言語情報などがユーザーの選択した言語に従うようにしています。

## インストール

1. **GitHub Releases** から `lingkuma-zotero-1.0.1.xpi` をダウンロードします。
2. **Zotero → Tools → Plugins** を開きます。
3. **Install Add-on From File** を選択するか、`.xpi` をプラグイン画面へドラッグします。
4. ダウンロードした `.xpi` を選択します。
5. Zotero を再起動します。

> GitHub が自動生成するソースコード ZIP はプラグイン本体ではありません。Releases の `.xpi` を使用してください。

## 対応環境

- Zotero 9.x
- PDF / EPUB リーダー
- Windows / macOS / Linux

## 設定

設定画面は Zotero に直接統合されており、言語・AI 設定、語彙管理、TTS、表示設定、任意の WebDAV バックアップ / 復元を利用できます。

## データとプライバシー

LingKuma for Zotero のローカル状態は Zotero のデータディレクトリに保存されます。翻訳、AI、リモート TTS、WebDAV を使用する場合、選択した機能に必要なテキストまたはデータが対応サービスへ送信される場合があります。通常の単語・文翻訳で PDF / EPUB 全体を意図的にアップロードすることはありません。

## 上流プロジェクトとクレジット

- 元プロジェクト：**LingKuma**
- 上流バージョン：**LingKuma 1.1.0**
- Zotero 移植版のメンテナンス / 公開：**white-ink-cell**

このプロジェクトの目的は LingKuma を Zotero に移植することです。Zotero で必要となる互換対応を除き、元プロジェクトの主要機能、UI、リソース、設計は可能な限り上流版を維持しています。

詳細は [`UPSTREAM_ja.md`](UPSTREAM_ja.md) を参照してください。

## ライセンス

LingKuma 原プロジェクトの作者表記、著作権、ライセンスは変更していません。Zotero アダプター / 互換レイヤーは [`LICENSE-ADAPTER.txt`](LICENSE-ADAPTER.txt)、LingKuma 上流ライセンスは [`LICENSE-LINGKUMA.txt`](LICENSE-LINGKUMA.txt)、第三者リソースの通知は [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt) を参照してください。

## その他の移植版

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
