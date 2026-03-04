# API Reference

모든 엔드포인트는 `http://localhost:3001` 기준입니다.

---

## Research

### `POST /research/generate-tasks`
주제로부터 리서치 태스크 목록을 생성합니다 (Light Research).

**Request Body**
```json
{
  "topic": "양자 컴퓨터의 현황과 미래",
  "model": "claude-sonnet-4-6"
}
```

**Response**
```json
[
  { "id": 1, "title": "양자 컴퓨터 기본 원리", "icon": "⚛️", "prompt": "..." },
  { "id": 2, "title": "주요 기업 현황", "icon": "🏢", "prompt": "..." }
]
```

---

### `POST /research`
단일 프롬프트에 대한 AI 심층 분석을 실행합니다 (Deep Research).

**Request Body**
```json
{
  "prompt": "양자 컴퓨터 주요 기업 현황을 분석해줘",
  "model": "claude-sonnet-4-6"
}
```

**Response**
```json
{
  "result": "## 양자 컴퓨터 주요 기업 현황\n...",
  "sources": { "tavily": "..." }
}
```

---

### `GET /research/models`
사용 가능한 AI 모델 목록을 반환합니다.

**Response**
```json
[
  { "id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "provider": "anthropic" },
  { "id": "gpt-4o", "name": "GPT-4o", "provider": "openai" },
  { "id": "ollama:llama3.2", "name": "Llama 3.2 (Local)", "provider": "ollama" }
]
```

---

### `POST /research/search`
설정된 검색 엔진으로 웹 검색을 실행합니다.

**Request Body**
```json
{ "query": "검색어" }
```

---

### `POST /research/search/stream`
웹 검색 결과를 SSE로 스트리밍합니다. 검색 엔진별로 완료 시마다 이벤트가 발생합니다.

**Response (SSE)**
```
data: {"type":"source","key":"tavily","result":"..."}
data: {"type":"source","key":"serper","result":"..."}
data: {"type":"done","sources":{...},"context":"combined"}
```

---

### `POST /research/test/generate-tasks`
태스크 생성 로직을 테스트합니다 (설정 페이지용).

### `POST /research/test/search`
특정 검색 엔진을 단독 테스트합니다.

**Request Body**
```json
{ "engine": "tavily", "query": "테스트 검색어" }
```

### `POST /research/test/ollama-filter`
Ollama 필터링을 테스트합니다.

**Request Body**
```json
{ "query": "원래 질문", "context": "필터링할 검색 결과" }
```

---

## Sessions

### `GET /sessions`
모든 세션 목록을 반환합니다 (결과 제외).

**Response**
```json
[
  {
    "id": "uuid",
    "topic": "양자 컴퓨터",
    "model": "claude-sonnet-4-6",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "tasks": [...],
    "statuses": { "1": "done", "2": "running" },
    "doneCount": 1
  }
]
```

---

### `GET /sessions/:id`
세션 상세 정보를 반환합니다 (결과 포함).

**Response**
```json
{
  "id": "uuid",
  "topic": "양자 컴퓨터",
  "model": "claude-sonnet-4-6",
  "tasks": [...],
  "results": { "1": "## 분석 결과..." },
  "statuses": { "1": "done" },
  "sources": {
    "1": { "tavily": "원본 검색...", "ollama": "필터링 결과..." }
  }
}
```

---

### `POST /sessions`
새 세션을 생성합니다.

**Request Body**
```json
{
  "topic": "주제",
  "model": "claude-sonnet-4-6",
  "tasks": [{ "id": 1, "title": "...", "icon": "🔍", "prompt": "..." }]
}
```

---

### `DELETE /sessions/:id`
세션을 삭제합니다. Qdrant 벡터 데이터도 함께 삭제됩니다.

---

### `PUT /sessions/:id/tasks/:taskId`
태스크 결과를 저장합니다 (큐 완료 시 자동 호출, 수동 저장에도 사용 가능).

**Request Body**
```json
{
  "result": "## 분석 결과...",
  "status": "done",
  "sources": { "tavily": "..." }
}
```

---

## Queue

### `GET /queue/events`
실시간 큐 상태를 SSE로 수신합니다. 프론트엔드가 연결을 유지하며 모든 큐 변경사항을 받습니다.

**Response (SSE)**
```
data: {"type":"sync","jobs":[...]}
```

**Job 객체 구조**
```json
{
  "jobId": "sessionId-taskId-timestamp",
  "sessionId": "uuid",
  "taskId": 1,
  "taskTitle": "태스크 제목",
  "model": "claude-sonnet-4-6",
  "status": "running",
  "phase": "analyzing",
  "sources": { "tavily": "...", "ollama": "..." },
  "result": "완료된 경우 결과 텍스트"
}
```

`status`: `pending` | `running` | `done` | `error`
`phase`: `searching` | `analyzing` (status가 running일 때)

---

### `GET /queue/jobs`
현재 큐의 모든 작업 목록을 반환합니다.

---

### `POST /queue/session`
세션의 여러 태스크를 한 번에 큐에 추가합니다. 이미 완료된 태스크는 건너뜁니다.

**Request Body**
```json
{
  "tasks": [
    {
      "sessionId": "uuid",
      "sessionTopic": "주제",
      "taskId": 1,
      "taskTitle": "태스크 제목",
      "taskIcon": "🔍",
      "taskPrompt": "분석 프롬프트",
      "model": "claude-sonnet-4-6"
    }
  ],
  "doneTaskIds": [3, 4]
}
```

---

### `POST /queue/task`
단일 태스크를 큐에 추가합니다. 이미 실행 중이면 중단 후 재시작합니다.

**Request Body**: 위 `tasks` 배열의 항목 1개

---

### `DELETE /queue/sessions/:sessionId`
세션의 대기 중 / 실행 중 태스크를 모두 취소합니다.

---

### `DELETE /queue/completed`
완료 / 오류 상태의 작업을 큐에서 제거합니다.

---

## Chat

### `POST /chat/:sessionId`
리서치 결과를 컨텍스트로 사용하는 RAG 채팅. 응답을 SSE로 스트리밍합니다.

**Request Body**
```json
{
  "message": "양자 컴퓨터에서 IBM과 Google의 차이점은?",
  "model": "claude-sonnet-4-6"
}
```

**Response (SSE)**
```
data: {"type":"chunk","text":"IBM은 "}
data: {"type":"chunk","text":"초전도 큐비트를..."}
data: {"type":"done"}
```

---

### `GET /chat/:sessionId/history`
채팅 히스토리를 반환합니다.

**Response**
```json
[
  { "role": "user", "content": "질문" },
  { "role": "assistant", "content": "답변" }
]
```

---

### `DELETE /chat/:sessionId/history`
채팅 히스토리를 초기화합니다. 메모리 캐시와 `chat.json` 파일 모두 삭제됩니다.

---

### `POST /chat/:sessionId/compact`
리서치 결과를 Ollama로 압축합니다 (백그라운드 실행). 채팅 시 Qdrant 검색이 없을 경우 압축본을 우선 사용합니다.

**Response**
```json
{ "scheduled": true }
```

---

### `GET /chat/:sessionId/compaction`
압축 상태를 반환합니다.

**Response**
```json
{
  "status": "done",
  "compactedAt": "2025-01-01T00:00:00.000Z"
}
```

`status`: `idle` | `running` | `done`

---

## Overview (설정/관리)

### `GET /overview/pipeline-status`
설정된 검색 엔진 및 AI 제공사 상태를 반환합니다.

**Response**
```json
{
  "search": {
    "tavily": true,
    "serper": false,
    "naver": false,
    "brave": true
  },
  "ai": {
    "anthropic": true,
    "openai": false,
    "google": true
  },
  "ollama": true,
  "qdrant": true
}
```

---

### `GET /overview/prompts`
편집 가능한 프롬프트 템플릿 목록을 반환합니다.

---

### `GET /overview/tavily`
Tavily API 사용량 및 잔여 크레딧을 반환합니다.

---

### `GET /overview/anthropic/usage`
Anthropic 월간 토큰 사용량 리포트를 반환합니다. `ANTHROPIC_ADMIN_API_KEY` 필요.

---

## 공통 규칙

- 모든 요청/응답은 `Content-Type: application/json`
- SSE 엔드포인트는 `Content-Type: text/event-stream`
- 오류 응답 형식: `{ "statusCode": 404, "message": "Session not found" }`
- 세션 ID는 UUID v4 형식
