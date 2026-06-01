# 공통 기능 명세

## 목적

ResearchAI 전체에서 공통으로 적용되는 인증, 권한, API 통신, 큐 이벤트, 반응형 레이아웃, 오류 처리 기준을 정의한다.

## 주요 화면

| 경로 | 설명 |
|------|------|
| `/login` | 로그인, 회원가입 |
| `/main` | 로그인 후 기본 진입 |
| `/settings/*` | 설정 및 관리자 기능 |

## 인증

### 기능 요구

- 사용자는 회원가입과 로그인을 할 수 있다.
- 로그인 성공 시 JWT를 localStorage와 cookie에 저장한다.
- JWT는 보호 API 호출 시 `Authorization: Bearer <token>`으로 전달한다.
- 토큰이 갱신되면 응답 header `X-New-Token`을 받아 저장한다.
- 로그인하지 않은 사용자는 `X-Anon-Id`로 일부 기능을 사용할 수 있다.

### 권한

| 역할 | 권한 |
|------|------|
| `visitor` | 기본 사용자 기능 |
| `admin` | 파이프라인 테스트, AI 호출 로그 등 관리자 화면 |

## API 통신

### 기능 요구

- FE는 `FE/app/lib/api/base.ts`의 `apiFetch`를 통해 API를 호출한다.
- 기본 API base는 개발 환경에서 `http://localhost:3001/api`다.
- API 응답이 `{ isSuccess: true, result }` envelope이면 `result`를 반환한다.
- JSON이 아닌 오류 응답은 사용자가 이해할 수 있는 오류 메시지로 변환한다.

## 큐 이벤트

### 기능 요구

- 전역 큐 상태는 SSE로 수신한다.
- 큐 작업은 `pending`, `running`, `done`, `error`, `stopped` 상태를 가진다.
- FE는 큐 상태를 QueueWidget, PipelineTerminal, 각 기능 화면에 반영한다.
- 사용자는 실행 중인 작업을 취소할 수 있어야 한다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/queue/events` | 전역 큐 SSE |
| `GET` | `/api/queue/status` | 큐 요약 상태 |
| `GET` | `/api/queue/jobs` | 큐 작업 목록 |

## 반응형 UX

### 데스크탑

- 좌측 Sidebar와 페이지 콘텐츠 영역으로 구성한다.
- 세션 목록, 주요 메뉴, 설정 메뉴에 빠르게 접근할 수 있어야 한다.

### 모바일

- MobileHeader와 BottomNav를 사용한다.
- 세션 목록은 drawer/sheet 형태로 표시한다.
- 상세 패널은 슬라이드 인 패널로 표시한다.

## 공통 예외/빈 상태

- 네트워크 오류 시 현재 화면이 깨지지 않고 오류 메시지를 표시한다.
- 데이터가 없을 때는 빈 목록 상태와 주요 행동 버튼을 제공한다.
- 권한이 없을 때는 로그인 또는 권한 부족 상태를 표시한다.
