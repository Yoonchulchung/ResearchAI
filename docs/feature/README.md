# 기능 명세서

작성일: 2026-06-01

이 폴더는 현재 ResearchAI 앱의 기능을 명세한다.

## 문서 목록

| 문서 | 범위 |
|------|------|
| [common/README.md](common/README.md) | 공통 UX, 인증, 권한, API 통신, 큐 이벤트 |
| [dashboard/README.md](dashboard/README.md) | 메인 대시보드, 뉴스/날씨/마켓/검색 진입 |
| [research/README.md](research/README.md) | 리서치 세션, Light/Deep Research, RAG 채팅, 요약 |
| [recruit/README.md](recruit/README.md) | 채용 공고, 이력서, 자기소개서, 문서 파싱, 스펙 관리 |
| [company/README.md](company/README.md) | 기업 목록, 기업 상세, 기업 분석, 기업 정보 보강 |
| [news/README.md](news/README.md) | 뉴스, 논문, 기술 블로그, AI 리더보드 |
| [settings/README.md](settings/README.md) | 설정, API 키, 모델, 사용량, 파이프라인 테스트 |

## 명세 작성 규칙

- 기능의 목적과 사용자를 먼저 적는다.
- 화면 경로와 주요 API를 함께 적는다.
- 정상 플로우, 상태, 예외/빈 상태를 구분한다.
- 구현 세부보다 사용자 관점의 동작을 우선한다.
- 리팩토링 이후에도 유지해야 하는 사용자-facing 계약을 명확히 적는다.

## 현재 주요 사용자 흐름

1. 사용자는 로그인 또는 익명 식별자로 앱에 진입한다.
2. `/main`에서 뉴스, 시장, 날씨, 최근 리서치, 검색 진입점을 본다.
3. `/sessions/new` 또는 검색 입력에서 리서치 주제를 입력한다.
4. Light Research가 태스크 목록을 만들고, 사용자는 세션을 생성한다.
5. Deep Research가 각 태스크를 웹 검색과 AI로 분석한다.
6. 사용자는 세션 상세에서 결과를 읽고, RAG 채팅으로 추가 질문을 한다.
7. 채용/기업 화면에서는 공고 수집, 기업 분석, 이력서/자소서 작성 보조 기능을 사용한다.
8. 설정 화면에서 API 키, 기본 모델, 사용량, 파이프라인 테스트를 관리한다.
