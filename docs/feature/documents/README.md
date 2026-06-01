# 문서/경험 기능 명세

## 목적

사용자가 자기소개서, 경험, 문서 자료를 저장하고 검색하며, AI로 경험 추출/카테고리 추천/문서 질의를 수행할 수 있게 한다.

## 주요 화면

| 경로 | 설명 |
|------|------|
| `/recruit/doc-store` | 채용 문서 저장소 |
| `/recruit/doc-parse` | 문서 파싱/질의 |
| `/recruit/write` | 문서 작성 보조 |

## 문서 관리

### 기능 요구

- 사용자는 문서를 생성, 조회, 수정, 삭제할 수 있다.
- 문서는 제목, 내용, 회사명, 생성/수정 시간을 가진다.
- 문서 내용은 Qdrant에 인덱싱되어 검색/채팅에 활용될 수 있다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/documents` | 문서 목록 |
| `GET` | `/api/documents/:id` | 문서 상세 |
| `POST` | `/api/documents` | 문서 생성 |
| `PATCH` | `/api/documents/:id` | 문서 수정 |
| `DELETE` | `/api/documents/:id` | 문서 삭제 |

## 경험 관리

### 기능 요구

- 사용자는 경험 항목을 생성, 조회, 수정, 삭제할 수 있다.
- 경험은 제목, 내용, 카테고리, AI 추천 카테고리, 원본문서 ID를 가진다.
- 사용자는 의미 기반으로 경험을 검색할 수 있다.
- 시스템은 경험 카테고리를 AI로 추천할 수 있다.
- 시스템은 문서 내용에서 경험 단락을 추출할 수 있다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/experiences` | 경험 목록 |
| `POST` | `/api/experiences` | 경험 생성 |
| `PATCH` | `/api/experiences/:id` | 경험 수정 |
| `DELETE` | `/api/experiences/:id` | 경험 삭제 |
| `POST` | `/api/experiences/search` | 경험 벡터 검색 |
| `POST` | `/api/experiences/:id/suggest-categories` | 카테고리 추천 |
| `POST` | `/api/experiences/extract-from-doc` | 문서에서 경험 추출 |

## 문서 작성 보조

### 기능 요구

- 사용자는 현재 문서 내용과 지시문을 기반으로 AI 작성 보조를 실행할 수 있다.
- 응답은 SSE chunk로 스트리밍된다.
- 사용자는 실행 중인 작성 보조 작업을 취소할 수 있다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/queue/write-assist` | 작성 보조 인큐 |
| `GET` | `/api/queue/write-assist/:jobId/stream` | 작성 보조 SSE |
| `DELETE` | `/api/queue/write-assist/:jobId` | 취소 |

## 예외/빈 상태

- 문서가 없으면 새 문서 생성 버튼을 제공한다.
- 경험 검색 결과가 없으면 검색어 변경을 안내한다.
- AI 추천 실패 시 사용자가 직접 카테고리를 입력할 수 있어야 한다.
