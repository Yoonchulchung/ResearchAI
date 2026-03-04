# Research AI 백엔드 서버

## 개요

리서치는 크게 두 단계로 동작합니다.

1. **LightResearch** — 주제를 분석하여 조사 항목(태스크) 목록 생성
2. **DeepResearch** — 각 태스크를 실제로 심층 조사하여 결과 반환

---

## 리서치 흐름

```
사용자 입력: "AI 반도체 시장 동향"
        │
        ▼
┌─────────────────────────────────────┐
│  LightResearch                      │
│  POST /research/generate-tasks      │
│                                     │
│  1. Tavily 검색 (선택적)             │
│  2. AI → 태스크 목록 생성 (5~7개)    │
└─────────────────────────────────────┘
        │  [{ id, title, icon, prompt }, ...]
        ▼
  세션 생성 후 태스크별 실행
        │
        ▼
┌─────────────────────────────────────┐
│  DeepResearch (태스크당 1회)         │
│  POST /research                     │
│                                     │
│  1. 외부 검색 (병렬)                 │
│     Tavily / Serper / Naver / Brave  │
│  2. Ollama 필터링                    │
│     중복 제거 및 핵심 정보 압축       │
│  3. AI 심층 분석                     │
│     Claude / Gemini / GPT 등         │
└─────────────────────────────────────┘
        │  { result: string }
        ▼
    결과 저장 (sessions DB)
```

---

## 모듈 구조

```
src/
├── research/                          # 리서치 핵심 모듈
│   ├── presentation/
│   │   └── research.controller.ts    # HTTP 라우팅
│   │
│   ├── application/
│   │   ├── ai-search.service.ts      # 파사드 (lightResearch / deepResearch)
│   │   ├── web-search.service.ts     # 웹 검색 파이프라인 + SSE 스트리밍
│   │   ├── models.service.ts         # 사용 가능한 AI 모델 목록
│   │   │
│   │   └── pipeline/
│   │       ├── light-research-pipeline.service.ts  # LightResearch 파이프라인
│   │       └── deep-research-pipeline.service.ts   # DeepResearch 파이프라인
│   │
│   ├── domain/
│   │   ├── model/
│   │   │   └── search-sources.model.ts  # SearchSources, SearchStreamEvent 타입
│   │   └── prompt/
│   │       └── research.prompts.ts      # 시스템/태스크 생성/검색 결과 프롬프트
│   │
│   └── infrastructure/
│       ├── search/
│       │   ├── tavily.search.ts         # Tavily API 클라이언트
│       │   ├── serper.search.ts         # Serper (Google) API 클라이언트
│       │   ├── naver.search.ts          # Naver 뉴스 API 클라이언트
│       │   ├── brave.search.ts          # Brave Search API 클라이언트
│       │   └── ollama-filter.search.ts  # Ollama 로컬 AI 필터
│       └── ai/
│           ├── anthropic.ai.ts          # Claude API 클라이언트
│           ├── openai.ai.ts             # OpenAI API 클라이언트
│           ├── google.ai.ts             # Gemini API 클라이언트
│           └── ollama.ai.ts             # Ollama 로컬 AI 클라이언트
│
├── overview/                          # 대시보드/설정 모듈
│   ├── presentation/
│   │   └── overview.controller.ts    # GET /overview/*
│   ├── application/
│   │   └── overview.service.ts       # 프롬프트 템플릿, 파이프라인 상태, API 사용량
│   └── infrastructure/
│       ├── tavily.client.ts           # Tavily 사용량 조회
│       └── anthropic.client.ts        # Anthropic 사용량 조회
│
└── sessions/                          # 세션/태스크 결과 저장
    ├── sessions.controller.ts
    └── sessions.service.ts
```

---

## API 엔드포인트

### `/research`

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/research/models` | 사용 가능한 AI 모델 목록 |
| `POST` | `/research/generate-tasks` | **LightResearch** — 태스크 목록 생성 |
| `POST` | `/research` | **DeepResearch** — 태스크 심층 조사 |
| `POST` | `/research/search` | 웹 검색만 실행 |
| `POST` | `/research/search/stream` | 웹 검색 SSE 스트리밍 |
| `POST` | `/research/test/generate-tasks` | LightResearch 파이프라인 테스트 |
| `POST` | `/research/test/search` | 검색 엔진 개별 테스트 |
| `POST` | `/research/test/ollama-filter` | Ollama 필터 테스트 |

### `/overview`

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/overview/prompts` | 프롬프트 템플릿 조회 |
| `GET` | `/overview/pipeline-status` | 각 검색 엔진 활성화 여부 |
| `GET` | `/overview/tavily` | Tavily 사용량 조회 |
| `GET` | `/overview/anthropic/usage` | Anthropic 사용량 조회 |

### `/sessions`

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/sessions` | 세션 목록 |
| `POST` | `/sessions` | 세션 생성 |
| `GET` | `/sessions/:id` | 세션 상세 |
| `DELETE` | `/sessions/:id` | 세션 삭제 |
| `PUT` | `/sessions/:id/tasks/:taskId` | 태스크 결과 저장 |

---

## 환경 변수

```env
# AI 모델
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=

# 웹 검색 (하나 이상 설정 시 DeepResearch에서 실제 검색 수행)
TAVILY_API_KEY=
SERPER_API_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
BRAVE_API_KEY=

# Anthropic 사용량 조회 (optional)
ANTHROPIC_ADMIN_KEY=
```
