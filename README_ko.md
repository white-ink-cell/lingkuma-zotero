# LingKuma for Zotero

[English](README.md) | [简体中文](README_zh.md) | [日本語](README_ja.md) | [한국어](README_ko.md)

**See it. Click it. Learn it.**

LingKuma — *언어의 장벽을 넘어 지식이 퍼질 수 있도록* — 는 독서를 중심으로 설계된 번역 및 언어 학습 도구입니다.

어떤 언어를 완전히 "배운" 뒤에야 그 언어로 된 논문, 책, 문서를 읽기 시작할 필요는 없습니다.

모르는 단어를 만나면 **클릭하세요**.  
이해하기 어려운 문장을 만나면 **클릭하세요**.

LingKuma는 아직 배우고 있는 언어로 된 콘텐츠를 읽을 수 있도록 도와줍니다. 독서를 즐기는 과정에서 자연스럽게 어휘를 늘리고, 문법과 표현에 익숙해지며, 해당 언어에 대한 이해도를 높일 수 있습니다.

> **먼저 독서를 즐기고, 그 과정에서 새로운 언어를 배워 보세요.**

## LingKuma로 무엇을 할 수 있나요?

- 단어를 클릭하여 뜻 확인
- 전체 문장 번역 및 분석
- TTS를 이용한 단어 발음 듣기
- 독서하면서 어휘 학습
- AI를 활용한 문법 및 문맥 설명
- 여러 언어 간 번역
- 라이트 및 다크 테마 지원
- Zotero 안에서도 기존 LingKuma 스타일의 인터페이스 유지

## 스크린샷

라이트 테마, 영어 → 중국어 번역:

<img src="docs/images/zotero-light-chinese.png" alt="LingKuma for Zotero 라이트 테마 중국어 번역" width="900">

다크 테마, 영어 → 러시아어 번역:

<img src="docs/images/zotero-dark-russian.png" alt="LingKuma for Zotero 다크 테마 러시아어 번역" width="900">

## Zotero 포팅 버전

이 프로젝트는 오픈 소스 LingKuma 프로젝트의 비공식 Zotero 포팅 버전입니다.

Zotero 포팅 버전에는 다음과 같은 기능이 추가되었습니다:

- Zotero 실행 환경 대응
- PDF 읽기 환경에서 문장 선택 개선
- 다양한 언어의 문장 인식 개선
- Zotero와 호환되는 반투명 유리 효과
- 다국어 번역 및 AI 출력 지원
- Zotero 내장 PDF 읽기 환경과의 통합

## 설치

1. **GitHub Releases**에서 `lingkuma-zotero-1.0.1.xpi`를 다운로드합니다.
2. **Zotero → 도구 → 플러그인**을 엽니다.
3. **파일에서 애드온 설치**를 선택합니다 (`.xpi` 파일을 플러그인 창으로 직접 드래그해도 됩니다).
4. 다운로드한 `.xpi` 파일을 선택합니다.
5. Zotero를 다시 시작합니다.

> GitHub가 자동으로 생성하는 소스 코드 ZIP을 Zotero 플러그인으로 설치하지 마세요. Release에 제공되는 `.xpi` 파일을 사용하세요.

## 다른 버전

- [LingKuma for Calibre](https://github.com/white-ink-cell/lingkuma-calibre)
- [LingKuma](https://github.com/lingkuma/LingKuma)

## 지원 환경

- Zotero 9.x
- PDF 및 EPUB 리더 통합
- Windows / macOS / Linux

## 설정

설정 인터페이스는 Zotero에 통합되어 있습니다. 언어 및 AI 설정, 어휘 관리, TTS 옵션, 외관 설정, 선택적 WebDAV 백업 / 복원 기능을 제공합니다.

## 개인정보 보호

LingKuma for Zotero는 로컬 상태를 Zotero 데이터 디렉터리에 저장합니다. 번역, AI, 원격 TTS 및 WebDAV 기능을 사용할 경우 선택한 서비스를 이용하는 데 필요한 텍스트나 데이터가 전송될 수 있습니다. 일반적인 단어 또는 문장 번역을 위해 PDF나 EPUB 파일 전체를 의도적으로 업로드하지 않습니다.

## 원본 프로젝트 및 저작자 표시

- 원본 프로젝트: **LingKuma**
- 원본 버전: **LingKuma 1.1.0**
- Zotero 포팅 버전 유지보수 및 배포: **white-ink-cell**

이 저장소는 LingKuma의 비공식 Zotero 포팅 버전을 제공합니다.

이 포팅 버전은 LingKuma를 Zotero의 읽기 환경에 맞게 조정하면서 원본 프로젝트의 핵심 기능, 인터페이스, 리소스 및 전체적인 디자인을 가능한 한 그대로 유지합니다. Zotero에 특화된 변경 사항은 주로 실행 환경 호환성, 문장 선택, 반투명 유리 효과 및 다국어 번역 지원에 중점을 둡니다.

자세한 내용은 `UPSTREAM.md`를 참조하세요.

## 라이선스

원본 LingKuma의 저작자 표시, 저작권 및 라이선스는 변경되지 않습니다.

Zotero 어댑터 및 호환성 레이어에는 `LICENSE-ADAPTER.txt`의 라이선스가 적용됩니다. 원본 LingKuma 라이선스는 `LICENSE-LINGKUMA.txt`에 보존되어 있으며, 포함된 타사 라이선스 및 고지는 `THIRD-PARTY-NOTICES.txt`에 기록되어 있습니다.
