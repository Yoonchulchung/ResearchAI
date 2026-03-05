# 시스템 아키텍처

---

## 전체 구조

```
ResearchAI/
├── run.sh                  # 1-click 실행 스크립트
├── docs/                   # 문서
├── data/
│   ├── sessions/           # 세션 데이터 (세션별 폴더)
│   │   └── {sessionId}/
│   │       ├── session.json   ← 태스크·결과·소스·상태
│   │       └── chat.json      ← 채팅 히스토리
│   └── qdrant/             # Qdrant 벡터 DB 볼륨
│
├── BE/                     # NestJS 백엔드 (:3001)
└── FE/                     # Next.js 프론트엔드 (:3000)
```

---

## 백엔드 모듈 구성

```
app.module.ts
├── ResearchModule   — 리서치 파이프라인 (태스크 생성 + AI 분석)
├── RecruitModule    — 채용 공고 크롤링 + 필터링
├── SessionsModule   — 세션 파일 I/O
├── QueueModule      — 작업 큐 + SSE 브로드캐스트
├── ChatModule       — RAG 채팅 + 히스토리
├── VectorModule     — Qdrant 벡터 인덱싱/검색
└── OverviewModule   — API 상태 대시보드
```

각 모듈은 **DDD 레이어 구조**를 따릅니다.

```
{module}/
├── presentation/    — HTTP 컨트롤러 (라우팅)
├── application/     — 서비스 (비즈니스 로직)
├── domain/          — 모델·인터페이스 (순수 타입)
└── infrastructure/  — 외부 연동 (DB·크롤러·AI·검색)
```

---

## 핵심 파이프라인 1 — LightResearch (태스크 생성)

새 세션을 만들 때 동작하는 파이프라인입니다.
주제를 받아 5~7개의 리서치 태스크를 생성합니다.

```
사용자 주제 입력
"FastAPI 신입 채용 공고 찾아줘. 대기업·외국계 위주로"
    │
    ▼
Step 0: 검색 소스 결정 (SearchPlannerService)
    Ollama → 주제 분석
    반환: {
      source: "recruit",           ← web | recruit | both
      keyword: "FastAPI 백엔드",
      companyTypes: ["대기업", "외국계"],
      jobTypes: ["신입"]
    }
    │
    ├─ source = "web" 또는 "both"
    │      ▼
    │  Step 1a: 웹 검색 (Tavily)
    │      → webContext
    │
    └─ source = "recruit" 또는 "both"
           ▼
       Step 1b: 채용 공고 크롤링 (RecruitContextService)
           → 사람인 실시간 크롤링
           → 기업유형 필터: emp_tp (대기업=1, 중견=2, 중소=3, 외국계=4, ...)
           → 경력 필터: career_cd (신입=1, 경력=2), job_type (인턴=3)
           → 소스별 15초 서킷 브레이커
           → recruitCtx
    │
    ▼
Step 2: AI 태스크 생성
    프롬프트: topic + searchContext (webContext + recruitCtx)
    AI → JSON 배열 파싱 → 5~7개 태스크
    [{ id, title, icon, prompt }, ...]
```

**관련 파일:**
- `research/application/pipeline/light-research-pipeline.service.ts`
- `research/application/search-planner.service.ts`
- `recruit/application/recruit-context.service.ts`
- `recruit/infrastructure/sources/saramin.crawler.ts`

---

## 핵심 파이프라인 2 — DeepResearch (태스크 분석)

세션이 생성된 후, 태스크별로 실행되는 파이프라인입니다.
큐에서 1개씩 순차 처리됩니다.

```
사용자 "전체 실행" 또는 태스크 개별 실행
    │
    ▼
POST /queue/session 또는 /queue/task
    │
    ▼
QueueService (순차 처리, 1개씩)
    │
    ├─ Phase 1: 웹 검색 (병렬 실행)
    │   ├─ Tavily
    │   ├─ Serper
    │   ├─ Naver
    │   └─ Brave
    │   → sources: { tavily?, serper?, naver?, brave? }
    │   → SSE로 각 검색 결과 실시간 전송
    │
    ├─ Phase 1-1: Ollama 필터링 (백그라운드, 분석과 병렬)
    │   → 검색 결과 압축·정제
    │   → sources.ollama 추가 후 SSE 업데이트
    │   → session.json에 ollama 소스 저장
    │
    └─ Phase 2: AI 분석
        ├─ Claude → 내장 web_search 또는 Tavily 컨텍스트
        ├─ GPT    → Tavily 컨텍스트
        ├─ Gemini → 내장 googleSearch 또는 Tavily 컨텍스트
        └─ Ollama → Tavily 컨텍스트
        → 마크다운 보고서 생성
        → session.json 저장
        → Qdrant 벡터 인덱싱 (백그라운드)
```

**AI 모델 디스패치 패턴:**

```typescript
if (model.startsWith('claude'))   → callAnthropic()
if (model.startsWith('gemini'))   → callGoogle()
if (model.startsWith('ollama:'))  → callOllama(model.slice('ollama:'.length))
else                              → callOpenAI()  // gpt-*, o3-* 등
```

**관련 파일:**
- `research/application/ai-search.service.ts`
- `research/application/pipeline/deep-research-pipeline.service.ts`
- `queue/application/queue.service.ts`
- `queue/application/job-runner.service.ts`

---

## 채용 공고 모듈 (RecruitModule)

```
recruit/
├── application/
│   ├── recruit-context.service.ts   — liveSearch(): 실시간 크롤링 + AsyncGenerator 로그
│   ├── collect.service.ts           — 수동 수집 API용
│   └── jobs.service.ts              — DB 조회 API
├── domain/
│   ├── job-posting.model.ts         — 채용 공고 타입
│   └── job-source.interface.ts      — JobSource 인터페이스, CollectQuery 타입
└── infrastructure/
    ├── repository/
    │   └── job-repository.ts        — SQLite (better-sqlite3), ON CONFLICT(id)
    └── sources/
        ├── saramin.crawler.ts       — 사람인 HTML 파싱 (emp_tp, career_cd, job_type)
        ├── saramin.api.ts           — 사람인 공식 API
        ├── wanted.crawler.ts        — 원티드 API 크롤링
        └── source-registry.ts       — 소스 목록 관리 (isAvailable() 체크)
```

**liveSearch 흐름:**

```
liveSearch({ keyword, companyTypes, jobTypes })
    │
    ▼
source-registry에서 사용 가능한 소스 목록 조회
    │
    ├─ 소스별 반복
    │   ├─ source.collect({ keyword, companyTypes, jobTypes, limit: 15 })
    │   │   └─ saramin: URL에 emp_tp / career_cd / job_type 파라미터 추가
    │   ├─ 수집 중 실시간 yield { type: 'log' }
    │   └─ Promise.race([수집, 15초 타임아웃]) — 서킷 브레이커
    │
    ▼
yield { type: 'result', result: 포맷된 마크다운 }
```

**CollectQuery 필터 구조:**

```typescript
interface CollectQuery {
  keyword: string;
  companyTypes?: string[];   // ["대기업", "중견기업", "외국계", "중소기업", "스타트업", "공기업"]
  jobTypes?: string[];       // ["신입", "경력", "인턴"]
  location?: string;
  limit?: number;
}
```

**사람인 파라미터 매핑:**

| 필터 | 값 | 사람인 파라미터 |
|------|-----|----------------|
| 대기업 | emp_tp=1 | `url.searchParams.append('emp_tp', '1')` |
| 중견기업 | emp_tp=2 | |
| 중소기업 | emp_tp=3 | |
| 외국계 | emp_tp=4 | |
| 공기업 | emp_tp=5 | |
| 스타트업 | emp_tp=6 | |
| 신입 | career_cd=1 | `url.searchParams.append('career_cd', '1')` |
| 경력 | career_cd=2 | |
| 인턴 | job_type=3 | `url.searchParams.append('job_type', '3')` |

---

## 큐 시스템

```
클라이언트 ──── SSE ──── GET /queue/events
                            │
                            ▼
               { type: "sync", jobs: [...] }
               (매 상태 변경마다 모든 클라이언트에 브로드캐스트)
```

- **단일 실행자**: 태스크를 1개씩 순서대로 처리
- **AbortController**: 취소 요청 시 진행 중 AI 호출 즉시 중단
- **멱등성**: 동일 `(sessionId, taskId)` 중복 큐잉 방지

---

## RAG 채팅

```
사용자 질문
    │
    ▼
POST /chat/:sessionId (SSE 스트리밍)
    │
    ├─ 1. RAG 컨텍스트 구성 (폴백 체인)
    │   ① Qdrant 시맨틱 검색 → 관련 청크 top-6
    │   ② (없으면) Ollama 압축 컨텍스트
    │   ③ (없으면) 원본 리서치 결과 전체
    │
    ├─ 2. 채팅 히스토리 로드  chat.json → 메모리 캐시
    │
    ├─ 3. AI 스트리밍 호출
    │   system: "리서치 분석가 + RAG 컨텍스트"
    │   messages: [히스토리..., { role: "user", content: 질문 }]
    │
    └─ 4. 히스토리 저장  메모리 캐시 + chat.json
```

**벡터 인덱싱:**
- 태스크 결과(마크다운)를 600자 청크로 분할 (80자 오버랩)
- 임베딩 모델: `nomic-embed-text` (768차원, Ollama)
- Qdrant 컬렉션: `research_rag`
- 메타데이터: `sessionId`, `taskId`, `taskTitle`, `taskIcon`

---

## 실시간 LightResearch 스트리밍

검색 계획 수립부터 태스크 생성까지의 전 과정을 SSE로 스트리밍합니다.

```
POST /research/light-search/stream
    │
    ▼
res.setHeader('Content-Type', 'text/event-stream')
req.on('close', () => aborted = true)   ← 클라이언트 중단 감지
    │
    ▼
for await (event of lightResearchPipeline.runStream(...)) {
    if (aborted) break;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

**이벤트 타입:**

```typescript
type LightResearchEvent =
  | { type: 'log';  message: string }          // 진행 로그
  | { type: 'plan'; source: SearchSource; ... } // 검색 계획 결과
  | { type: 'done'; tasks: Task[]; searchPlan } // 완료
```

**프론트엔드 취소:**

```typescript
const controller = new AbortController();
await lightResearchStream(topic, model, onEvent, controller.signal);
// 취소 시:
controller.abort();  // fetch 중단 → req 'close' 이벤트 → BE 루프 break
```

---

## 파일 기반 저장소

데이터베이스 없이 JSON 파일로 세션 데이터를 관리합니다.

```
data/sessions/{sessionId}/session.json
{
  "id": "uuid",
  "topic": "주제",
  "model": "claude-sonnet-4-6",
  "createdAt": "ISO8601",
  "tasks": [
    { "id": 1, "title": "...", "icon": "🔍", "prompt": "..." }
  ],
  "results":  { "1": "마크다운 분석 결과..." },
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
  { "role": "user",      "content": "질문" },
  { "role": "assistant", "content": "답변" }
]
```

---

## 프론트엔드 주요 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `PipelineTerminal` | LightResearch 실시간 로그 + 중단 버튼 + 팝업 확장 |
| `TaskCard` | 태스크별 결과 + 소스 탭 (Tavily / Serper / Ollama) |
| `ChatSection` | 세션 하단 RAG 채팅 UI |
| `QueueWidget` | 우하단 작업 진행 상황 위젯 (SSE 수신) |
| `SessionHeader` | 세션 제목, 모델 뱃지, 진행률 |
| `ModelSelector` | API / 로컬 모델 선택 |
| `ResearchQueueContext` | 전역 큐 상태 (SSE 수신 + React Context) |

---

## 외부 서비스 의존성

| 서비스 | 용도 | 필수 여부 |
|--------|------|----------|
| Anthropic API | Claude 모델 | 선택 (AI 1개 이상 필수) |
| OpenAI API | GPT 모델 | 선택 |
| Google GenAI | Gemini 모델 | 선택 |
| Ollama | 검색 계획 / 필터링 / 임베딩 / 압축 | 강력 권장 |
| Qdrant | 벡터 DB (RAG) | 권장 (없으면 fallback) |
| Tavily | 웹 검색 (LightResearch + DeepResearch) | 선택 (1개 이상 권장) |
| Serper | Google 검색 | 선택 |
| Naver | 한국어 검색 | 선택 |
| Brave | 독립 검색 | 선택 |
| 사람인 | 채용 공고 크롤링 | 선택 (recruit 소스 시 자동 사용) |
