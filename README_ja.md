# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | [日本語](README_ja.md) | [한국어](README_ko.md)

**See it. Click it. Learn it.**

LingKuma —— *言語の壁を越えて、知識を広げるために* —— は、読書を中心に設計された翻訳・語学学習ツールです。

ある言語を「学び終える」まで、その言語の論文や本、文書を読むのを待つ必要はありません。

知らない単語に出会ったら、**クリック**。  
理解しにくい文に出会ったら、**クリック**。

LingKuma は、まだ学習途中の言語で書かれたコンテンツを読むことをサポートします。読書を楽しみながら自然に語彙を増やし、文法や表現に慣れ、その言語への理解を深めることができます。

> **まず読書を楽しみ、その過程で新しい言語を学ぶ。**

## LingKuma でできること

- 単語をクリックして意味を確認
- 文全体の翻訳と分析
- TTS による単語の発音
- 読書をしながら語彙を学習
- AI による文法と文脈の説明
- 複数言語間の翻訳
- ライトテーマとダークテーマ
- Zotero 内でも LingKuma 本来のスタイルを維持したインターフェース

## スクリーンショット

ライトテーマ、英語 → 中国語翻訳：

<img src="docs/images/zotero-light-chinese.png" alt="LingKuma for Zotero light theme with Chinese translation" width="900">

ダークテーマ、英語 → ロシア語翻訳：
<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero dark theme with Russian translation" width="900">

## Zotero 移植版

これはオープンソースプロジェクト LingKuma の非公式 Zotero 移植版です。

Zotero 移植版では、以下の対応を追加しています：

- Zotero 実行環境への対応
- PDF 閲覧時の文選択を改善
- 複数言語における文認識を改善
- Zotero に対応したすりガラス効果
- 多言語翻訳および AI 出力への対応
- Zotero 内蔵 PDF 閲覧環境との統合

## インストール

1. **GitHub Releases** から `lingkuma-zotero-1.0.1.xpi` をダウンロードします。
2. **Zotero → ツール → プラグイン** を開きます。
3. **ファイルからアドオンをインストール** を使用します（`.xpi` をプラグインウィンドウへ直接ドラッグすることもできます）。
4. ダウンロードした `.xpi` ファイルを選択します。
5. Zotero を再起動します。

> GitHub が自動生成するソースコード ZIP を Zotero プラグインとしてインストールしないでください。Release に含まれる `.xpi` ファイルを使用してください。

## その他のバージョン

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
- [LingKuma](https://github.com/lingkuma/LingKuma)

## 対応環境

- Zotero 9.x
- PDF および EPUB リーダーとの統合
- Windows / macOS / Linux

## 設定

設定画面は Zotero に統合されています。言語と AI の設定、語彙管理、TTS オプション、外観設定、オプションの WebDAV バックアップ / 復元機能を利用できます。

## プライバシー

LingKuma for Zotero はローカルの状態を Zotero のデータディレクトリに保存します。翻訳、AI、リモート TTS、WebDAV の各機能では、選択したサービスを利用するために必要なテキストまたはデータが送信される場合があります。通常の単語翻訳や文翻訳のために、PDF または EPUB ファイル全体を意図的にアップロードすることはありません。

## 上流プロジェクトとクレジット

- オリジナルプロジェクト：**LingKuma**
- 上流バージョン：**LingKuma 1.1.0**
- Zotero 移植版のメンテナンスおよび公開：**white-ink-cell**

このリポジトリは LingKuma の非公式 Zotero 移植版を提供します。

この移植版では、LingKuma を Zotero の読書環境に適応させながら、オリジナルプロジェクトの主要機能、インターフェース、アセット、全体的なデザインを可能な限り維持しています。Zotero 向けの変更は、主に実行環境の互換性、文選択、すりガラス効果、多言語翻訳への対応に重点を置いています。

詳細については `UPSTREAM.md` を参照してください。

## ライセンス

オリジナル LingKuma の作者表記、著作権、ライセンスは変更されていません。

Zotero アダプターおよび互換レイヤーには `LICENSE-ADAPTER.txt` のライセンスが適用されます。オリジナル LingKuma のライセンスは `LICENSE-LINGKUMA.txt` に保持されており、同梱されているサードパーティのライセンスおよび通知は `THIRD-PARTY-NOTICES.txt` に記載されています。
