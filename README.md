# ResearchAI

주제를 입력하면 AI가 리서치 항목을 자동 생성하고, 웹 검색 + AI 분석을 통해 구조화된 보고서를 만들어주는 Research AI 에이전트입니다.

---

## 동작 방식 (한눈에)

```
① 주제 입력
    "NestJS 최신 트렌드와 마이크로서비스 아키텍처 분석해줘"
         │
         ▼
② [LightResearch] 검색 계획 수립 (AI)
    → source: "web", keywords: ["NestJS", "microservices"],
      리서치 방향 자동 결정
         │
         ├─ 웹 검색 (Tavily / Serper / Naver / Brave)
         └─ 채용 공고 크롤링 (사람인)  ← 채용 관련 주제일 때
         │
         ▼
③ AI → 5~7개 리서치 태스크 자동 생성
    [{"title": "NestJS 모듈 아키텍처 분석", ...}, ...]
         │
         ▼
④ [DeepResearch] 태스크별 심층 분석 (순차 실행)
    Phase 1: 웹 검색 병렬 실행
    Phase 2: AI 분석 → 마크다운 보고서 생성
         │
         ▼
⑤ RAG 채팅
    Qdrant 시맨틱 검색 → 관련 리서치 청크 → AI 응답
```

---

## 기능

| 기능 | 설명 |
|------|------|
| **AI 리서치 자동화** | 주제 입력 시 AI가 리서치 태스크를 자동 설계하고 분석 |
| **멀티 검색 엔진** | Tavily · Serper · Naver · Brave 병렬 실행 |
| **채용 공고 검색** | 사람인 크롤러 (기업유형·경력 필터 지원) |
| **검색 소스 자동 판단** | 주제를 분석해 웹 / 채용 공고 / 둘 다 중 자동 선택 |
| **다중 AI 지원** | Claude · GPT · Gemini · Ollama 전환 가능 |
| **벡터 RAG 채팅** | Qdrant 시맨틱 검색 기반 리서치 결과 Q&A |
| **실시간 진행 확인** | SSE로 단계별 로그 스트리밍 |
| **문서 작성** | AI 어시스턴트 + 실시간 교정이 포함된 마크다운 에디터 |
| **경험 관리** | 작성 문서에서 AI가 경험 단락을 자동 추출·저장 |

---

## 빠른 시작

### 사전 요구사항

- Node.js 20+
- Docker (Qdrant 벡터 DB)
- Ollama (선택 — 로컬 AI 사용 시)

### 1. 환경 변수 설정

```bash
cp BE/.env.example BE/.env
# BE/.env 에 API 키 입력
```

최소 **클라우드 AI 키 1개** + **웹 검색 키 1개** 이상을 권장합니다.

### 2. 실행

```bash
./run.sh

./run.sh dev // 개발 환경

npm run dist:mac // mac 애플리케이션 빌드
```

__mac 애플리케이션 실행하면 무한 생성 버그가 있습니다.__

`run.sh`가 자동으로: Qdrant 시작 → 의존성 설치 → 백엔드(3001) + 프론트엔드(3000) 동시 실행
→ **http://localhost:3000** 접속

---

## 환경 변수 요약

### 클라우드 AI

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIz...
```

### 웹 검색

```env
TAVILY_API_KEY=tvly-...     # 무료 1,000회/월
SERPER_API_KEY=...           # 무료 2,500회
NAVER_CLIENT_ID=...          # 한국어 검색
NAVER_CLIENT_SECRET=...
BRAVE_API_KEY=...            # 무료 2,000회/월
```

### Ollama (선택)

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_PLANNER_MODEL=llama3.1
OLLAMA_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_COMPRESS_MODEL=llama3.1
```

---

## 기술 스택

```
Backend   NestJS + TypeScript       :3001
Frontend  Next.js 14 + Tailwind     :3000
Vector DB Qdrant                    :6333 (Docker)
Local AI  Ollama                    :11434 (선택)
```

---

## 문서

| 파일 | 내용 |
|------|------|
| [docs/architecture/overview.md](./docs/architecture/overview.md) | 전체 아키텍처, 모듈 구조, 데이터 흐름 |
| [docs/reference/api-reference.md](./docs/reference/api-reference.md) | API 엔드포인트 레퍼런스 |
