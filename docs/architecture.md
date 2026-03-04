# 시스템 아키텍처

---

## 디렉터리 구조

```
ResearchAI/
├── run.sh                  # 전체 시스템 1-click 실행 스크립트
├── docs/                   # 문서
├── data/
│   ├── sessions/           # 세션 데이터 (세션별 폴더)
│   │   └── {sessionId}/
│   │       ├── session.json   ← 태스크, 결과, 소스, 상태
│   │       └── chat.json      ← 채팅 히스토리
│   └── qdrant/             # Qdrant 벡터 DB 볼륨
│
├── BE/                     # NestJS 백엔드 (:3001)
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── models.ts           # AI 모델 정의 목록
│   │   ├── research/           # 리서치 핵심 모듈
│   │   ├── sessions/           # 세션 CRUD
│   │   ├── queue/              # 작업 큐 + SSE
│   │   ├── chat/               # 채팅 + RAG
│   │   ├── vector/             # Qdrant 연동
│   │   └── overview/           # 설정/관리 API
│   └── data/               # 런타임 데이터 루트
│
└── FE/                     # Next.js 프론트엔드 (:3000)
    └── app/
        ├── page.tsx            # 홈 (세션 목록)
        ├── sessions/[id]/      # 세션 상세 (메인 워크스페이스)
        ├── sessions/new/       # 새 세션 생성
        ├── settings/           # 설정 허브
        ├── components/         # 공통 컴포넌트
        ├── contexts/           # 전역 큐 상태
        ├── lib/api.ts          # 백엔드 API 호출 레이어
        └── types.ts            # 공유 타입 정의
```

---

## 백엔드 모듈 구성

```
app.module.ts
├── ResearchModule      리서치 파이프라인 (태스크 생성 + AI 분석)
├── SessionsModule      세션 파일 I/O
├── QueueModule         작업 큐 + SSE 브로드캐스트
├── ChatModule          RAG 채팅 + 히스토리
├── VectorModule        Qdrant 벡터 인덱싱/검색
└── OverviewModule      API 상태 / 사용량 대시보드
```

### ResearchModule 내부 구조

```
research/
├── presentation/
│   └── research.controller.ts       # HTTP 엔드포인트
├── application/
│   ├── ai-search.service.ts         # 파이프라인 오케스트레이터
│   ├── web-search.service.ts        # 멀티 검색 엔진 병렬 실행
│   ├── models.service.ts            # 사용 가능 모델 조회
│   └── pipeline/
│       ├── light-research-pipeline.service.ts  # 태스크 생성 파이프라인
│       └── deep-research-pipeline.service.ts   # 분석 파이프라인
├── domain/
│   ├── prompt/research.prompts.ts   # 모든 프롬프트 템플릿
│   └── model/search-sources.model.ts
└── infrastructure/
    ├── ai/
    │   ├── anthropic.ai.ts          # Claude 래퍼 (내장 웹서치 지원)
    │   ├── openai.ai.ts             # GPT 래퍼
    │   ├── google.ai.ts             # Gemini 래퍼 (googleSearch 지원)
    │   └── ollama.ai.ts             # Ollama 로컬 래퍼
    └── search/
        ├── tavily.search.ts
        ├── serper.search.ts
        ├── naver.search.ts
        ├── brave.search.ts
        └── ollama-filter.search.ts  # Ollama 기반 결과 압축
```

---

## 데이터 흐름

### 1. 세션 생성 (태스크 자동 생성)

```
사용자가 주제 입력
    │
    ▼
POST /research/generate-tasks  (Light Research Pipeline)
    ├─ [선택] Tavily 검색으로 최신 컨텍스트 수집
    └─ AI → 5~7개 세부 태스크 생성
            { id, title, icon, prompt }
    │
    ▼
POST /sessions  →  data/sessions/{id}/session.json 생성
```

### 2. 리서치 실행 (태스크 분석)

```
사용자가 "전체 실행" 또는 태스크 개별 실행
    │
    ▼
POST /queue/session  또는  POST /queue/task
    │
    ▼
QueueService (순차 처리, 1개씩)
    │
    ├─ Phase 1: 웹 검색 (병렬)
    │   ├─ Tavily
    │   ├─ Serper
    │   ├─ Naver
    │   └─ Brave
    │   → sources: { tavily?, serper?, naver?, brave? }
    │   → SSE로 검색 결과마다 실시간 브로드캐스트
    │
    ├─ Phase 1-1: Ollama 필터링 (백그라운드, 분석과 병렬)
    │   → sources.ollama 추가 후 SSE 업데이트
    │   → session.json에 ollama 소스 영속화
    │
    └─ Phase 2: AI 분석
        ├─ Claude (내장 웹서치 or Tavily 컨텍스트)
        ├─ GPT (Tavily 컨텍스트)
        ├─ Gemini (내장 googleSearch or Tavily 컨텍스트)
        └─ Ollama (Tavily 컨텍스트)
        → 결과 session.json 저장
        → Qdrant 벡터 인덱싱 (백그라운드)
```

### 3. RAG 채팅

```
사용자가 질문 입력
    │
    ▼
POST /chat/:sessionId  (SSE 스트리밍)
    │
    ├─ 1. RAG 컨텍스트 구성 (우선순위)
    │   ├─ [최우선] Qdrant 시맨틱 검색 (관련 청크 top-6)
    │   ├─ [fallback] Ollama 압축 컨텍스트
    │   └─ [fallback] 원본 리서치 결과 전체
    │
    ├─ 2. 채팅 히스토리 로드  chat.json → 메모리 캐시
    │
    ├─ 3. AI 호출 (스트리밍)
    │   system: "리서치 분석가 + RAG 결과"
    │   messages: [히스토리..., { role: "user", content: 질문 }]
    │
    └─ 4. 히스토리 저장  메모리 캐시 + chat.json
```

### 4. 컨텍스트 압축 (Compaction)

```
리서치 전체 완료 시 자동 트리거
    │
    ▼
POST /chat/:sessionId/compact
    │
    ▼
백그라운드 Ollama 호출
    "핵심 정보·수치·결론 보존, 반복 제거"
    │
    ▼
압축 결과를 메모리에 캐시
    (채팅 시 Qdrant 검색 없으면 이 압축본 사용)
```

---

## 벡터 RAG 상세

**임베딩 모델:** `nomic-embed-text` (768차원, Ollama)

**인덱싱 전략:**
- 태스크 결과(마크다운)를 600자 청크로 분할 (80자 오버랩)
- 각 청크에 `sessionId`, `taskId`, `taskTitle`, `taskIcon` 메타데이터 저장
- Qdrant 컬렉션: `research_rag`

**검색:**
- 쿼리를 임베딩 → `sessionId` 필터로 해당 세션 내 시맨틱 검색
- top-6 청크를 RAG 컨텍스트로 사용

**폴백 체인:**
```
Qdrant 검색 결과 있음 → 벡터 검색 결과 사용
    │
    └─ 없음 → Ollama 압축본 있음? → 압축본 사용
                   │
                   └─ 없음 → 원본 리서치 결과 전체 사용
```

---

## AI 모델 디스패치 패턴

백엔드 전체에서 모델 prefix로 AI 제공사를 판별합니다.

```typescript
if (model.startsWith('claude'))  → callAnthropic()
else if (model.startsWith('gemini')) → callGoogle()
else if (model.startsWith('ollama:')) → callOllama(model.slice('ollama:'.length))
else → callOpenAI()   // gpt-*, o3-* 등
```

**내장 웹서치 활용:**
- Claude: `web_search_20250305` 툴 (Tavily 컨텍스트 없을 때만 활성화)
- Gemini: `googleSearch` 툴 (Tavily 컨텍스트 없을 때만 활성화)
- GPT / Ollama: 내장 웹서치 없음 → Tavily 컨텍스트에 의존

---

## 큐 시스템

- **단일 실행자**: 태스크를 1개씩 순서대로 처리
- **SSE 브로드캐스트**: `GET /queue/events`로 연결된 모든 클라이언트에 실시간 상태 전달
- **AbortController**: 취소 요청 시 진행 중인 AI 호출 즉시 중단
- **멱등성**: 동일 `(sessionId, taskId)` 조합은 중복 큐잉 방지

```
클라이언트 ─── SSE ──── GET /queue/events
                           │
                           ▼
              { type: "sync", jobs: [...] }
              (매 상태 변경마다 전송)
```

---

## 파일 기반 저장소

DB 없이 JSON 파일로 모든 데이터를 관리합니다.

```
data/sessions/{sessionId}/session.json
{
  "id": "uuid",
  "topic": "주제",
  "model": "claude-sonnet-4-6",
  "createdAt": "ISO8601",
  "tasks": [{ "id": 1, "title": "...", "icon": "🔍", "prompt": "..." }],
  "results": { "1": "마크다운 분석 결과..." },
  "statuses": { "1": "done" },
  "sources": {
    "1": {
      "tavily": "원본 검색 결과...",
      "serper": "...",
      "ollama": "Ollama 필터링 결과..."
    }
  }
}
```

```
data/sessions/{sessionId}/chat.json
[
  { "role": "user", "content": "질문" },
  { "role": "assistant", "content": "답변" }
]
```

---

## 프론트엔드 주요 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `QueueWidget` | 우하단 떠있는 작업 진행 상황 위젯 |
| `TaskCard` | 태스크별 결과 + 소스 탭 (Tavily/Serper/Ollama) |
| `ChatSection` | 세션 하단 RAG 채팅 UI |
| `SessionHeader` | 세션 제목, 모델 뱃지, 진행률 |
| `ModelSelector` | AI 모델 선택 드롭다운 |
| `ResearchQueueContext` | 전역 큐 상태 (SSE 수신 + React Context) |

---

## 외부 서비스 의존성

| 서비스 | 용도 | 필수 여부 |
|--------|------|----------|
| Anthropic API | Claude 모델 | 선택 (AI 1개 이상 필요) |
| OpenAI API | GPT 모델 | 선택 |
| Google GenAI | Gemini 모델 | 선택 |
| Ollama | 로컬 AI / 임베딩 / 필터링 / 압축 | 권장 |
| Qdrant | 벡터 DB (RAG) | 권장 (없으면 fallback) |
| Tavily | 웹 검색 | 선택 (1개 이상 권장) |
| Serper | Google 검색 | 선택 |
| Naver | 한국어 검색 | 선택 |
| Brave | 독립 검색 | 선택 |
