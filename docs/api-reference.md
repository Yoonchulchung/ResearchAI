# API Reference

모든 엔드포인트 기준: `http://localhost:3001/api`

공통 규칙:
- 요청/응답 `Content-Type: application/json`
- SSE 엔드포인트 `Content-Type: text/event-stream`
- 오류 응답: `{ "statusCode": 404, "message": "..." }`
- 세션 ID: UUID v4

---

## Research

### `POST /research/light-search/stream`
주제 → 리서치 태스크 생성 (SSE). 현재는 큐 방식(`/queue/research/light`)으로 대체됨.

### `POST /research/generate-tasks`
주제로부터 리서치 태스크 목록을 생성합니다.

**Request Body**
```json
{ "topic": "양자 컴퓨터 현황", "model": "claude-sonnet-4-6" }
```
**Response**: `Task[]` — `[{ "id": 1, "title": "...", "icon": "⚛️", "prompt": "..." }]`

---

### `POST /research`
단일 프롬프트 AI 심층 분석.

**Request Body**
```json
{ "prompt": "분석 프롬프트", "model": "claude-sonnet-4-6" }
```
**Response**: `{ "result": "마크다운...", "sources": { "tavily": "..." } }`

---

### `GET /research/models`
사용 가능한 AI 모델 목록.

**Response**: `[{ "id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "provider": "anthropic" }]`

---

### `POST /research/search`
웹 검색 실행.

**Request Body**: `{ "query": "검색어" }`

---

### `POST /research/search/stream`
웹 검색 결과 SSE 스트리밍.

**Response (SSE)**
```
data: {"type":"source","key":"tavily","result":"..."}
data: {"type":"done","sources":{...},"context":"combined"}
```

---

## Sessions

### `GET /sessions`
모든 세션 목록 (결과 제외).

**Response**
```json
[{
  "id": "uuid", "topic": "양자 컴퓨터", "model": "claude-sonnet-4-6",
  "createdAt": "ISO8601", "tasks": [...],
  "statuses": { "1": "done" }, "doneCount": 1
}]
```

---

### `GET /sessions/:id`
세션 상세 (결과 포함).

**Response**
```json
{
  "id": "uuid", "topic": "...", "model": "...",
  "tasks": [...],
  "results":  { "1": "## 분석 결과..." },
  "statuses": { "1": "done" },
  "sources":  { "1": { "tavily": "...", "ollama": "..." } }
}
```

---

### `POST /sessions`
새 세션 생성.

**Request Body**
```json
{
  "topic": "주제", "model": "claude-sonnet-4-6",
  "tasks": [{ "id": 1, "title": "...", "icon": "🔍", "prompt": "..." }]
}
```

---

### `DELETE /sessions/:id`
세션 삭제 (Qdrant 벡터 데이터 포함).

---

### `PUT /sessions/:id/tasks/:taskId`
태스크 결과 저장.

**Request Body**
```json
{ "result": "## 분석...", "status": "done", "sources": { "tavily": "..." } }
```

---

## Queue

### `GET /queue/events`
전역 큐 상태 SSE. 프론트엔드가 연결 유지하며 모든 큐 변경 수신.

**Response (SSE)**
```
data: {"type":"sync","jobs":[...]}
```

**Job 객체 구조**
```json
{
  "jobId": "id", "sessionId": "uuid", "itemId": "1",
  "taskType": "deepresearch",
  "status": "running",   // pending | running | done | error | stopped
  "phase": "analyzing",  // searching | analyzing (running일 때)
  "webSources": { "tavily": "..." },
  "result": "완료된 결과"
}
```

---

### `GET /queue/status`
현재 큐 상태 조회.

**Response**
```json
{ "running": 1, "total": 5, "pending": 2, "done": 2, "error": 0 }
```

---

### `GET /queue/jobs`
큐의 모든 작업 목록.

---

### Light Research

#### `POST /queue/research/light`
LightResearch 인큐.

**Request Body**: `{ "topic": "주제", "model": "claude-sonnet-4-6" }`
**Response**: `{ "searchId": "uuid", "status": "pending" }`

#### `GET /queue/research/light/:searchId/stream`
LightResearch SSE 스트림.

**Response (SSE)**
```
data: {"type":"log","message":"검색 계획 수립 중..."}
data: {"type":"plan","source":"web","keyword":"양자컴퓨터",...}
data: {"type":"done","tasks":[...],"searchPlan":{...}}
```

#### `DELETE /queue/research/light/:searchId`
LightResearch 취소. **Response**: `{ "ok": true }`

---

### Deep Research

#### `POST /queue/research/:sessionId/deep`
DeepResearch 인큐 (세션 전체 또는 특정 태스크).

**Request Body**
```json
{
  "tasks": [{
    "itemId": "1", "itemTitle": "태스크 제목", "itemIcon": "🔍",
    "itemPrompt": "분석 프롬프트", "cloudAIModel": "claude-sonnet-4-6"
  }]
}
```
**Response**: `{ "status": "ok", "sessionId": "uuid" }`

#### `DELETE /queue/research/:sessionId/deep`
세션 전체 DeepResearch 취소.

#### `DELETE /queue/research/:sessionId/deep/items/:itemId`
특정 태스크 취소.

---

### Summary

#### `POST /queue/sessions/:sessionId/summary`
세션 요약 생성 인큐.

**Request Body**: `{ "localAIModel": "ollama:llama3.1" }` (선택)
**Response**: `{ "ok": true }`

#### `GET /queue/sessions/:sessionId/summary/stream`
요약 SSE 스트림.

**Response (SSE)**
```
data: {"type":"chunk","text":"요약 텍스트..."}
data: {"type":"done"}
```

#### `DELETE /queue/sessions/:sessionId/summary`
요약 취소.

---

### Write Assist

#### `POST /queue/write-assist`
문서 작성 AI 어시스턴트 인큐.

**Request Body**
```json
{
  "content": "현재 에디터 내용",
  "instruction": "기업 컨텍스트 + 요청사항 (FE에서 조립)",
  "model": "claude-haiku-4-5-20251001"
}
```
**Response**: `{ "jobId": "uuid" }`

#### `GET /queue/write-assist/:jobId/stream`
Write Assist SSE 스트림.

**Response (SSE)**
```
data: {"type":"chunk","text":"AI 응답 조각..."}
data: {"type":"done"}
```

#### `DELETE /queue/write-assist/:jobId`
Write Assist 취소. **Response**: `{ "ok": true }`

---

### Company Profile

#### `POST /queue/company-profile`
기업 인재상 조회 인큐. 웹 검색 후 AI 합성.

**Request Body**: `{ "companyName": "삼성전자", "model": "claude-haiku-4-5-20251001" }`
**Response**: `{ "jobId": "uuid" }`

#### `GET /queue/company-profile/:jobId/stream`
Company Profile SSE 스트림.

**Response (SSE)**
```
data: {"type":"chunk","text":"## 삼성전자 인재상\n..."}
data: {"type":"done"}
```

#### `DELETE /queue/company-profile/:jobId`
취소. **Response**: `{ "ok": true }`

---

## Chat (RAG)

### `POST /chat/:sessionId`
리서치 결과를 컨텍스트로 사용하는 RAG 채팅. SSE 스트리밍.

**Request Body**: `{ "message": "질문", "model": "claude-sonnet-4-6" }`
**Response (SSE)**
```
data: {"type":"chunk","text":"IBM은 "}
data: {"type":"done"}
```

---

### `GET /chat/:sessionId/history`
채팅 히스토리.

**Response**: `[{ "role": "user", "content": "질문" }, { "role": "assistant", "content": "답변" }]`

---

### `DELETE /chat/:sessionId/history`
채팅 히스토리 초기화 (메모리 캐시 + `chat.json`).

---

### `POST /chat/:sessionId/compact`
Ollama로 리서치 결과 압축 (백그라운드). **Response**: `{ "scheduled": true }`

---

### `GET /chat/:sessionId/compaction`
압축 상태. **Response**: `{ "status": "idle|running|done", "compactedAt": "ISO8601" }`

---

## Documents

### `GET /documents`
저장된 문서 전체 목록.

**Response**
```json
[{
  "id": "uuid", "title": "한화엔진 자기소개서",
  "companyName": "한화엔진", "content": "...",
  "createdAt": "ISO8601", "updatedAt": "ISO8601"
}]
```

---

### `GET /documents/:id`
문서 상세 조회.

---

### `POST /documents`
문서 생성.

**Request Body**
```json
{ "title": "문서 제목", "content": "마크다운 내용", "companyName": "기업명" }
```
`companyName`은 선택사항.

---

### `PATCH /documents/:id`
문서 수정. 변경할 필드만 포함.

**Request Body**: `{ "title"?: string, "content"?: string, "companyName"?: string }`

---

### `DELETE /documents/:id`
문서 삭제.

---

## Experiences

### `GET /experiences`
저장된 경험 전체 목록.

**Response**
```json
[{
  "id": "uuid", "title": "IoT 서버실 환경 개선 프로젝트",
  "content": "경험 내용...", "category": "개발",
  "aiCategories": ["IT기획", "IoT"],
  "sourceDocId": "원본문서UUID",
  "createdAt": "ISO8601", "updatedAt": "ISO8601"
}]
```

---

### `POST /experiences`
경험 생성.

**Request Body**
```json
{
  "title": "경험 제목",
  "content": "경험 내용",
  "category": "카테고리",     // 선택
  "sourceDocId": "문서UUID"   // 선택 — 문서에서 추출 시 설정
}
```

---

### `PATCH /experiences/:id`
경험 수정.

**Request Body**: `{ "title"?, "content"?, "category"?, "aiCategories"?: string[] }`

---

### `DELETE /experiences/:id`
경험 삭제.

---

### `POST /experiences/search`
경험 벡터 검색 (의미 기반).

**Request Body**: `{ "query": "IoT 관련 경험", "topK": 5 }`
**Response**: `[{ "id", "title", "content", "category", "score": 0.92 }]`

---

### `POST /experiences/:id/suggest-categories`
AI로 경험 카테고리 자동 추천.

**Request Body**: `{ "model": "claude-haiku-4-5-20251001" }`
**Response**: `{ "categories": ["IT기획", "IoT", "문제해결"] }`

---

### `POST /experiences/extract-from-doc`
문서 내용에서 AI가 경험 단락을 추출.

**Request Body**: `{ "content": "자기소개서 전문...", "model": "claude-haiku-4-5-20251001" }`
**Response**: `[{ "title": "1번 문항", "content": "내용..." }]`

---

## Doc Parse

### `POST /doc-parse/upload`
파일 업로드 후 텍스트 추출 (PDF, DOCX, TXT 등).

**Request**: `multipart/form-data`, 필드명 `file`
**Response**: `{ "text": "추출된 텍스트", "pageCount": 5, "filename": "파일명", "size": 12345 }`

---

### `POST /doc-parse/ask`
추출된 문서에 AI 질문.

**Request Body**: `{ "docText": "문서 텍스트", "question": "질문", "aiModel": "claude-sonnet-4-6" }`
**Response**: `{ "answer": "AI 답변" }`

---

### `POST /doc-parse/quick-action`
문서 빠른 작업.

**Request Body**
```json
{
  "docText": "문서 텍스트",
  "action": "translate | summarize | explain | keywords",
  "aiModel": "claude-sonnet-4-6"
}
```
**Response**: `{ "answer": "결과 텍스트" }`

---

## Gmail

### `GET /gmail/auth-url`
Google OAuth 인증 URL 반환.

**Response**: `{ "url": "https://accounts.google.com/o/oauth2/auth?..." }`

---

### `GET /gmail/callback`
OAuth 콜백 (Google에서 리다이렉트). 인증 완료 후 FE로 리다이렉트.

**Query**: `?code=...&state=...`

---

### `GET /gmail/status`
Gmail 연동 상태. **Response**: `{ "connected": true, "email": "user@gmail.com" }`

---

### `GET /gmail/messages`
최근 메일 목록. **Query**: `?maxResults=10`

---

### `DELETE /gmail/disconnect`
Gmail 연동 해제. **Response**: `{ "success": true }`

---

## Overview (설정/관리)

### `GET /overview/pipeline-status`
검색 엔진·AI 제공사 설정 상태.

**Response**
```json
{
  "search": { "tavily": true, "serper": false, "naver": false, "brave": true },
  "ai": { "anthropic": true, "openai": false, "google": true },
  "ollama": true, "qdrant": true
}
```

---

### `GET /overview/prompts`
편집 가능한 프롬프트 템플릿 목록.

---

### `GET /overview/tavily`
Tavily API 사용량·잔여 크레딧.

---

### `GET /overview/anthropic/usage`
Anthropic 월간 토큰 사용량. `ANTHROPIC_ADMIN_API_KEY` 필요.
