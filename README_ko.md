# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | [日本語](README_ja.md) | **한국어**

오픈소스 프로젝트 **LingKuma 1.1.1**을 Zotero에서 사용할 수 있도록 만든 비공식 데스크톱 포팅 버전입니다. LingKuma의 하이라이트, 단어 조회, 번역 / AI, 문장 분석, 단어장, TTS, 라이트 / 다크 테마 기능을 Zotero PDF / EPUB 리더에서 사용할 수 있습니다.

> **Zotero 포팅 버전 배포 / 유지보수: [`white-ink-cell`](https://github.com/white-ink-cell)**  
> 이 저장소는 LingKuma 또는 Zotero의 공식 버전이 아닙니다. LingKuma 원 프로젝트의 저자 표기, 저작권 및 라이선스는 변경하지 않습니다. `white-ink-cell`은 이 Zotero 포팅 버전의 배포자 및 유지보수자임을 나타낼 뿐입니다.

## 스크린샷

라이트 테마, 영어 → 중국어 번역:

<img src="docs/images/zotero-light-chinese.png" alt="LingKuma for Zotero 라이트 테마 중국어 번역" width="900">

다크 테마, 영어 → 러시아어 번역:

<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero 다크 테마 러시아어 번역" width="900">

## 주요 변경 사항

이 포팅 버전은 주로 다음 네 가지 호환성 작업을 포함합니다.

### 1. Zotero 실행 환경 대응

LingKuma 외부에 Zotero 호환 레이어를 추가하여 브라우저 확장 환경에 의존하던 기능을 Zotero 리더에서 실행할 수 있도록 했습니다. 가능한 한 LingKuma의 기존 기능과 코드 구조를 유지합니다.

### 2. 문장 선택 개선

PDF.js는 화면에 보이는 한 문장을 여러 위치 지정 텍스트 조각으로 나누며, 문장부호나 레이아웃 때문에 문장이 일부만 선택될 수 있습니다. 이 포팅 버전은 문장 경계 판정 및 PDF 텍스트 재구성 규칙을 추가하여 문장 번역과 Word Explosion이 완전한 문장을 더 안정적으로 가져오도록 했습니다.

### 3. 반투명 유리 효과 호환

LingKuma의 원래 리퀴드 글라스 효과는 Chromium 전용 렌더링 기능에 의존합니다. Zotero 리더는 Gecko 기반이므로, 이 포팅 버전은 기존 UI와 테마 로직을 유지하면서 안정적으로 표시되는 반투명 유리 효과를 호환 방식으로 사용합니다.

### 4. 다국어 번역 지원

원본의 일부 AI Prompt와 언어 처리 로직은 중국어를 기본 대상 언어로 사용하도록 설계되어 있습니다. 이 포팅 버전은 원문 언어 감지와 대상 언어 처리를 추가하여 번역, AI 설명, TTS 언어 정보 등이 사용자가 선택한 언어를 따르도록 했습니다.

## 설치

1. **GitHub Releases**에서 `lingkuma-zotero-1.0.1.xpi`를 다운로드합니다.
2. **Zotero → Tools → Plugins**를 엽니다.
3. **Install Add-on From File**을 선택하거나 `.xpi`를 플러그인 창으로 드래그합니다.
4. 다운로드한 `.xpi` 파일을 선택합니다.
5. Zotero를 다시 시작합니다.

> GitHub가 자동 생성한 소스 코드 ZIP을 Zotero 플러그인으로 설치하지 마세요. Releases의 `.xpi` 파일을 사용하세요.

## 지원 환경

- Zotero 10.0.x
- PDF / EPUB 리더
- Windows / macOS / Linux

## 설정

설정 화면은 Zotero에 직접 통합되어 있으며 언어 및 AI 설정, 단어장 관리, TTS, 화면 표시, 선택적 WebDAV 백업 / 복원을 제공합니다.

## 사전 데이터와 선택적 사용자 사전 가져오기

G-004 비공개 테스트 패키지에는 검증된 영어 → 중국어 간체 기본 `.lkdict`가 포함됩니다. LingKuma가 이를 Zotero 데이터 디렉터리로 자동 복사하고 검증하므로 일반 사용자는 다운로드하거나 수동으로 가져올 필요가 없습니다. **Zotero → Settings → LingKuma → Dictionary**에서 사용자 `.lkdict`를 선택적으로 가져올 수 있으며, **Default Dictionary**로 돌아가도 가져온 파일은 삭제되지 않습니다. 이 번들 테스트 자산은 사전의 정식 공개나 업데이트 피드를 보장하지 않습니다.

번들 자산은 English Wiktionary 데이터를 Wiktextract/Kaikki로 가공한 CC BY-SA 4.0 파생물입니다. 데이터 스냅샷, 저작자 표시 및 라이선스 세부 정보는 `licenses/ENGLISH-WIKTIONARY-DATA-NOTICE.txt`를 참조하세요. 사전 파일은 LingKuma 학습 데이터 백업에 포함되지 않습니다.
## 데이터 및 개인정보 보호

LingKuma for Zotero의 로컬 상태는 Zotero 데이터 디렉터리에 저장됩니다. 번역, AI, 원격 TTS 또는 WebDAV를 사용할 경우 선택한 기능에 필요한 텍스트나 데이터가 해당 서비스로 전송될 수 있습니다. 일반 단어 및 문장 번역에서 PDF / EPUB 전체 파일을 의도적으로 업로드하지 않습니다.

Quick Context는 조회 대상을 문장 안에 표시한 현재 전체 문장을 Microsoft Edge의 키 없는 웹 번역 엔드포인트로 전송합니다. 계정이나 API 키가 필요 없고 AI를 호출하지 않습니다. 이 엔드포인트는 계약형 API가 아닌 웹 서비스이므로 사용할 수 없게 되면 Quick Context만 독립적으로 실패하며 Dictionary 또는 AI를 대체하지 않습니다.

## 업스트림 프로젝트 및 저작자 표기

- 원 프로젝트: **LingKuma**
- 업스트림 버전: **LingKuma 1.1.1**
- Zotero 포팅 버전 유지보수 / 배포: **white-ink-cell**

이 프로젝트의 목적은 LingKuma를 Zotero로 포팅하는 것입니다. Zotero 환경에 필요한 호환 작업을 제외하고 원 프로젝트의 핵심 기능, UI, 리소스 및 설계는 가능한 한 업스트림과 동일하게 유지합니다.

자세한 내용은 [`UPSTREAM_ko.md`](UPSTREAM_ko.md)를 참조하세요.

## 라이선스

LingKuma 원 프로젝트의 저자 표기, 저작권 및 라이선스는 변경하지 않습니다. Zotero 어댑터 / 호환 레이어는 [`LICENSE-ADAPTER.txt`](LICENSE-ADAPTER.txt), LingKuma 업스트림 라이선스는 [`LICENSE-LINGKUMA.txt`](LICENSE-LINGKUMA.txt), 제3자 리소스 고지는 [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt)를 참조하세요.

## 다른 포팅 버전

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
