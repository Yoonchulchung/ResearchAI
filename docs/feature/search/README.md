# 리서치 기능 명세

## 목적

사용자가 주제를 입력하면 시스템이 리서치 태스크를 생성하고, 웹 검색과 AI 분석으로 구조화된 결과를 만든다. 결과는 세션 단위로 저장되고 RAG 채팅과 요약에 활용된다.

## 주요 화면

| 경로 | 설명 |
|------|------|
| `/sessions/new` | 새 리서치 생성 |
| `/sessions/[id]` | 세션 상세, 태스크 결과, 채팅 |
| `/sessions/[id]/detail` | 통합 결과 상세 |

## 핵심 개념

| 개념 | 설명 |
|------|------|
| Session | 하나의 리서치 주제 단위 |
| Session Item | 세션 안의 개별 리서치 태스크 |
| Light Research | 주제에서 태스크 목록을 생성 |
| Deep Research | 태스크별 웹 검색과 AI 분석 |
| Summary | 세션 전체 요약 |
| RAG Chat | 세션 결과를 기반으로 한 질의응답 |

## Light Research

### 기능 요구

- 사용자는 주제와 모델을 입력해 리서치 태스크 생성을 요청한다.
- 시스템은 검색 계획, 키워드, 태스크 목록을 생성한다.
- 진행 과정은 SSE로 로그/계획/완료 이벤트를 전달한다.
- 사용자는 실행 중인 Light Research를 취소할 수 있다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/queue/research/light` | Light Research 인큐 |
| `GET` | `/api/queue/research/light/:searchId/stream` | SSE 진행 스트림 |
| `DELETE` | `/api/queue/research/light/:searchId` | 취소 |

## 세션 생성/관리

### 기능 요구

- 사용자는 생성된 태스크 목록으로 세션을 만들 수 있다.
- 세션 목록은 결과 본문 없이 빠르게 조회한다.
- 세션 상세는 태스크, 상태, 결과, 소스, 채팅을 포함한다.
- 세션 삭제 시 관련 벡터 데이터도 삭제한다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/sessions` | 세션 목록 |
| `POST` | `/api/sessions` | 세션 생성 |
| `GET` | `/api/sessions/:id` | 세션 상세 |
| `DELETE` | `/api/sessions/:id` | 세션 삭제 |

## Deep Research

### 기능 요구

- 사용자는 세션 전체 또는 특정 태스크의 심층 분석을 실행할 수 있다.
- 시스템은 태스크별 웹 검색 결과와 AI 분석 결과를 저장한다.
- 각 태스크는 `idle`, `running`, `done`, `error`, `stopped` 상태를 가진다.
- 사용자는 세션 전체 또는 특정 태스크 실행을 취소할 수 있다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/queue/research/:sessionId/deep` | Deep Research 인큐 |
| `DELETE` | `/api/queue/research/:sessionId/deep` | 세션 전체 취소 |
| `DELETE` | `/api/queue/research/:sessionId/deep/items/:itemId` | 특정 태스크 취소 |

## 세션 요약

### 기능 요구

- 사용자는 세션 전체 결과를 요약할 수 있다.
- 요약은 SSE chunk로 스트리밍된다.
- 결과 변경 시 요약 상태는 다시 생성 필요 상태로 바뀔 수 있다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/queue/sessions/:sessionId/summary` | 요약 인큐 |
| `GET` | `/api/queue/sessions/:sessionId/summary/stream` | 요약 SSE |
| `DELETE` | `/api/queue/sessions/:sessionId/summary` | 요약 취소 |

## RAG 채팅

### 기능 요구

- 사용자는 세션 결과를 기반으로 질문할 수 있다.
- 시스템은 Qdrant 검색 결과와 채팅 히스토리를 사용해 답변한다.
- 답변은 SSE chunk로 스트리밍된다.
- 사용자는 채팅 히스토리를 조회/초기화할 수 있다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/chat/:sessionId` | RAG 채팅 SSE |
| `GET` | `/api/chat/:sessionId/history` | 채팅 히스토리 |
| `DELETE` | `/api/chat/:sessionId/history` | 히스토리 초기화 |
| `POST` | `/api/chat/:sessionId/compact` | 컨텍스트 압축 예약 |
| `GET` | `/api/chat/:sessionId/compaction` | 압축 상태 |

## 예외/빈 상태

- 태스크 생성 실패 시 사용자에게 재시도와 오류 원인을 표시한다.
- 특정 태스크 실패가 세션 전체 화면을 막지 않는다.
- 검색 결과가 부족하면 AI 응답에 신뢰도/근거 부족을 표시한다.
- 세션이 없거나 삭제된 경우 목록으로 이동할 수 있어야 한다.
