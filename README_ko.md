# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | [日本語](README_ja.md) | [한국어](README_ko.md)

**See it. Click it. Learn it.**  
**모르는 부분은 클릭하세요.**

[LingKuma 원본 프로젝트](https://github.com/lingkuma/LingKuma) · [LingKuma Wiki](https://docs.lingkuma.org) · [LingKuma 웹사이트](https://lingkuma.org/) · [Calibre 포트](https://github.com/white-ink-cell/lingkuma-calibre)

LingKuma — 언어의 장벽을 넘어 지식이 퍼질 수 있도록 — 는 독서를 중심으로 설계된 번역 및 언어 학습 도구입니다.

어떤 언어를 완전히 "배운" 뒤에야 그 언어로 된 논문, 책, 문서를 읽기 시작할 필요는 없습니다.

모르는 단어를 만나면 **클릭하세요**.  
이해하기 어려운 문장을 만나면 **클릭하세요**.

LingKuma는 아직 배우고 있는 언어로 된 콘텐츠를 읽을 수 있도록 도와줍니다. 독서를 즐기는 과정에서 자연스럽게 어휘를 늘리고, 문법과 표현에 익숙해지며, 해당 언어에 대한 이해도를 높일 수 있습니다.

> **먼저 독서를 즐기고, 그 과정에서 새로운 언어를 배워 보세요.**

## LingKuma로 무엇을 할 수 있나요?

- 단어를 클릭하여 뜻 확인
- 전체 문장 번역 및 분석
- **Dictionary + Quick Context + AI Detail**을 이용한 더 빠르고 정확한 단어 조회
- 사전 실제 녹음 음성으로 단어 발음을 듣고, 미국식 / 영국식 발음을 각각 선택
- 읽으면서 어휘, 뜻, 개인 학습 기록 저장
- AI를 활용한 문법, 문맥, 어려운 문장 설명
- Word Explosion으로 현재 문장의 여러 단어 빠르게 확인
- 사용자 지정 버튼으로 외부 사전, 검색 엔진, Wikipedia 같은 백과사전 열기
- Bionic Reading, Reading Ruler, POS Highlight
- 선택적 WebDAV 학습 데이터 백업 / 복원
- 라이트 / 다크 테마

더 자세한 사용법과 플랫폼 문서는 [LingKuma Wiki](https://docs.lingkuma.org)를 참고하세요.

## 스크린샷

라이트 테마, 영어 → 중국어 번역:

<img src="docs/images/lingkuma-zotero-word-lookup-light.png" alt="LingKuma for Zotero light theme with Chinese translation" width="900">

다크 테마, 영어 → 중국어 번역:

<img src="docs/images/lingkuma-zotero-word-lookup-dark.png" alt="LingKuma for Zotero dark theme with Chinese translation" width="900">

다크 테마, 영어 → 러시아어 번역:

<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero dark theme with Russian translation" width="900">

## Zotero 포팅 버전

이 프로젝트는 오픈 소스 LingKuma 프로젝트의 비공식 Zotero 포팅 버전입니다.

Zotero 포팅 버전에는 다음과 같은 대응이 포함됩니다:

- 최신 Zotero 10 지원 및 Zotero 9 호환성 유지
- PDF / EPUB 읽기 환경에서 문장 선택 개선
- 더 완전한 문장 경계 처리와 줄바꿈 복원
- 명시적인 영어 하이픈 복합어 인식
- Dictionary + Quick Context 기반 빠른 단어 조회
- Zotero와 호환되는 반투명 유리 효과
- Zotero 내장 PDF / EPUB 읽기 환경과 통합
- Zotero 안의 LingKuma 전용 설정 페이지

## v1.1.0 주요 업데이트

### Zotero 10 호환성

이전 LingKuma for Zotero 빌드는 더 오래된 Zotero 플러그인 환경을 기준으로 만들어져 현재 Zotero에서 정상적으로 설치되거나 동작하지 않을 수 있습니다.

이번 릴리스는 **Zotero 10.0.x**에 맞게 갱신되었으며 **Zotero 9.x** 호환성도 유지합니다.

포트에 포함된 LingKuma upstream도 이전 기준에서 **LingKuma 1.1.1**로 갱신했습니다.

### 더 빠른 조회: Dictionary + Quick Context + AI

이전 버전은 일반적인 단어 뜻도 AI에 많이 의존했기 때문에 간단한 조회에서도 생성 대기 시간이 생길 수 있었고, 형용사와 뒤의 명사를 모두 같은 전체 구로 설명하는 식의 과도한 결과가 나올 때도 있었습니다.

이제 역할을 세 층으로 나눕니다:

1. **Dictionary** — 기본 의미, 품사, 형태 정보, IPA, 발음 메타데이터 같은 안정적인 어휘 정보.
2. **Quick Context** — **현재 문장 전체**를 사용하는 빠른 비생성형 문맥 번역.
3. **AI Detail** — 문법, 복잡한 용법, 문장 분석, 더 깊은 설명.

따라서 일반적인 단어 조회가 AI 생성 속도에 크게 의존하지 않으면서도, AI는 더 깊은 이해에 계속 활용됩니다.

### Word Explosion 속도 개선

Word Explosion의 각 단어 짧은 뜻은 정상 경로에서 단어마다 AI 응답을 기다리지 않고 Quick Context를 사용합니다.

전체 문장 번역과 더 깊은 AI 분석은 계속 사용할 수 있습니다.

### 문장 선택 및 경계 처리 개선

이전 Zotero 포트에서 검증된 수정 사항을 유지하면서 다음을 개선합니다:

- PDF의 위치 기반 텍스트에서 문장 재구성;
- 반쪽 문장 또는 잘못된 문장 넘김 감소;
- 약어, 이니셜, 소수점, 따옴표, 괄호, 콜론, 세미콜론의 보수적 처리;
- PDF / EPUB 레이아웃 줄바꿈으로 생긴 명백한 하이픈 분할 복원.

### 하이픈 복합어 지원

다음과 같은 표현을 여러 개의 서로 다른 단어로 분리하지 않고 하나의 조회 / 학습 단위로 처리할 수 있습니다:

- `well-known`
- `out-of-sample`
- `peer-on-peer`

반면 `inter-` + 줄바꿈 + `national`처럼 레이아웃 때문에 나뉜 경우는 별도로 처리하며, 명확할 때만 `international`로 보수적으로 복원합니다.

### 발음 개선: 사전 녹음 + IPA + 미국식 / 영국식

영어 발음은 TTS만 사용하던 방식에서 **사전의 실제 녹음 음성을 우선하는 방식**으로 개선되었습니다:

- 신뢰할 수 있는 데이터가 있을 때 실제 표면형의 IPA 표시;
- 미국식 / 영국식 발음을 별도로 표시하고 각각 독립적으로 재생;
- 사전 녹음이 있으면 우선 사용;
- 실제 단어 형태의 녹음이 없을 때 TTS 사용.

상단 단어 발음 버튼은:

- 미국식만 있음 → 미국식;
- 영국식만 있음 → 영국식;
- 둘 다 있음 → **미국식을 기본값**으로 사용;
- 둘 다 없음 → TTS 폴백.

`books`, `worked`, `studies`, `working` 같은 활용형에서 특히 유용합니다.

### 읽기 및 학습 기능 유지

Zotero에서 적용 가능한 LingKuma의 읽기 워크플로를 계속 유지합니다:

- 어휘 상태와 저장한 뜻;
- 예문 및 학습 기록;
- AI 문장 분석과 더 깊은 단어 설명;
- Bionic Reading;
- Reading Ruler;
- POS Highlight;
- 사용자 지정 외부 검색 / 사전 / 백과사전 버튼;
- 로컬 어휘 관리;
- WebDAV 백업 / 복원;
- EPUB 텍스트 복원 옵션;
- Zotero 호환 테마 및 팝업 동작.

## 현재 언어 범위

LingKuma 자체는 다국어 도구이지만, 이번에 추가된 **로컬 사전 가속은 현재 주로 영어 원문에 초점을 맞추고 있습니다**.

이번 릴리스에서는:

- 포함된 로컬 사전이 **영어 → 중국어 간체**;
- Quick Context는 번역 서비스가 지원하는 경우 사용자가 설정한 대상 언어를 따를 수 있음;
- 다른 원문 언어용 로컬 사전 팩은 아직 포함하지 않음.

따라서 이번 릴리스에서 가장 큰 속도 및 어휘 안정성 향상은 **영어 원문 읽기**에서 나타납니다. 이후 업데이트에서 더 많은 언어 조합으로 확장할 예정입니다.

## 설치

1. GitHub Releases에서 `lingkuma-zotero-1.1.0.xpi`를 다운로드합니다.
2. **Zotero → 도구 → 플러그인**을 엽니다.
3. **파일에서 애드온 설치**를 선택합니다 (`.xpi`를 직접 드래그해도 됩니다).
4. 다운로드한 `.xpi` 파일을 선택합니다.
5. Zotero가 요청하면 다시 시작합니다.

> GitHub가 자동으로 생성하는 Source code ZIP을 Zotero 플러그인으로 설치하지 마세요. Release에 포함된 `.xpi` 파일을 사용하세요.

## 다른 버전

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
- [LingKuma](https://github.com/lingkuma/LingKuma)

## 지원 환경

- Zotero 9.x
- Zotero 10.0.x
- PDF / EPUB 리더 통합
- 주요 데스크톱 대상: Windows / macOS
- Linux: 최선 지원, 정식 릴리스 테스트 대상은 아님

## 설정

설정 인터페이스는 Zotero에 통합되어 있습니다.

**편집 → 설정 → LingKuma for Zotero**에서 열 수 있습니다.

언어 / 번역, AI Provider / 프롬프트, 어휘 관리, Dictionary, TTS, 팝업 및 읽기 보조 기능, 선택적 WebDAV 백업 / 복원 등을 설정할 수 있습니다.

## 개인정보 보호

LingKuma for Zotero는 로컬 상태를 Zotero 데이터 디렉터리에 저장합니다.

## 원본 프로젝트 및 저작자 표시

- 원본 프로젝트: **[LingKuma](https://github.com/lingkuma/LingKuma)**
- LingKuma Wiki: **[docs.lingkuma.org](https://docs.lingkuma.org)**
- 원본 버전: **LingKuma 1.1.1**
- Zotero 포팅 버전 유지보수 및 배포: **white-ink-cell**

이 저장소는 LingKuma의 비공식 Zotero 포팅 버전입니다.

원본 프로젝트의 핵심 기능, 인터페이스, 리소스 및 디자인을 가능한 한 유지하면서 Zotero 읽기 환경에 맞게 조정합니다. Zotero 전용 변경 사항은 실행 환경 호환성, 문장 선택, Dictionary / Quick Context, 발음, 복합어 처리, 반투명 유리 호환성 및 다국어 번역 지원에 중점을 둡니다.

자세한 내용은 `UPSTREAM.md`를 참조하세요.

## 사전 데이터

포함된 영어 사전은 **English Wiktionary** 기여자 데이터를 **Wiktextract**로 추출하고 **Kaikki.org**가 배포한 데이터를 기반으로 생성했습니다.

사전 텍스트 데이터는 **CC BY-SA 4.0**으로 배포됩니다. 원격 Wikimedia Commons 발음 파일은 각 원본 페이지에 표시된 개별 라이선스를 따릅니다.

자세한 내용은 `licenses/ENGLISH-WIKTIONARY-DATA-NOTICE.txt`와 `THIRD-PARTY-NOTICES.txt`를 참고하세요.

## 라이선스

원본 LingKuma의 저작자 표시, 저작권 및 라이선스는 변경되지 않습니다.

Zotero 어댑터 및 호환성 레이어에는 `LICENSE-ADAPTER.txt`의 라이선스가 적용됩니다. 원본 LingKuma 라이선스는 `LICENSE-LINGKUMA.txt`에 보존되어 있으며, 포함된 타사 라이선스 및 고지는 `THIRD-PARTY-NOTICES.txt`에 기록되어 있습니다.
