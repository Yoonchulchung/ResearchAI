# ResearchAI

주제를 입력하면 AI가 리서치 항목을 자동 생성하고, 웹 검색 + AI 분석을 통해 구조화된 보고서를 만들어주는 도구입니다.
클라우드 API 없이 Ollama 로컬 모델만으로도 동작합니다.

---

## 동작 방식 (한눈에)

```
① 주제 입력
    "FastAPI 신입 채용 공고 찾아줘. 대기업·외국계 위주로"
         │
         ▼
② [LightResearch] 검색 계획 수립 (Ollama)
    → source: "recruit", keyword: "FastAPI 백엔드",
      companyTypes: ["대기업", "외국계"], jobTypes: ["신입"]
         │
         ├─ 웹 검색 (Tavily)            ← source가 "web" 또는 "both"일 때
         └─ 채용 공고 크롤링 (사람인)    ← source가 "recruit" 또는 "both"일 때
               • 기업유형 필터 (emp_tp)
               • 경력 구분 필터 (career_cd / job_type)
         │
         ▼
③ AI → 5~7개 리서치 태스크 생성
    [{"title": "FastAPI 백엔드 신입 우대 스킬", ...}, ...]
         │
         ▼
④ [DeepResearch] 태스크별 분석 (순차 실행)
    Phase 1: 웹 검색 병렬 실행 (Tavily / Serper / Naver / Brave)
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
| **검색 소스 자동 판단** | Ollama가 주제를 보고 웹 / 채용 공고 / 둘 다 중 선택 |
| **채용 공고 검색** | 사람인 크롤러 (기업유형·경력 필터 지원) |
| **멀티 검색 엔진** | Tavily · Serper · Naver · Brave 병렬 실행 |
| **다중 AI 지원** | Claude · GPT · Gemini · Ollama 전환 가능 |
| **벡터 RAG 채팅** | Qdrant 시맨틱 검색 기반 Q&A |
| **실시간 진행 확인** | SSE로 단계별 로그 스트리밍 |
| **검색 중단** | 진행 중 검색을 언제든 취소 가능 |

---

## 빠른 시작

### 사전 요구사항

- Node.js 20+
- Docker (Qdrant 벡터 DB)
- Ollama (로컬 AI / 검색 계획 / 임베딩)

### 1. Ollama 모델 준비

```bash
ollama pull llama3.1         # 검색 계획·필터링용 (필수)
ollama pull nomic-embed-text # RAG 임베딩용 (필수)
ollama pull llama3.2:3b      # 가벼운 모델 (16GB 이상)
```

### 2. 환경 변수 설정

```bash
cp BE/.env.example BE/.env
# BE/.env 에 API 키 입력
```

최소 **클라우드 AI 키 1개** + **웹 검색 키 1개** 이상을 권장합니다.

### 3. 실행

```bash
./run.sh
```

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

### Ollama

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_PLANNER_MODEL=llama3.1    # 검색 계획 (web/recruit/both 판단)
OLLAMA_MODEL=llama3.2:3b         # 웹 검색 결과 필터링
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_COMPRESS_MODEL=llama3.1   # RAG 컨텍스트 압축
```

---

## 기술 스택

```
Backend   NestJS + TypeScript       :3001
Frontend  Next.js 14 + Tailwind     :3000
Vector DB Qdrant                    :6333 (Docker)
Local AI  Ollama                    :11434
```

---

## 문서

| 파일 | 내용 |
|------|------|
| [docs/architecture.md](./docs/architecture.md) | 전체 아키텍처, 모듈 구조, 데이터 흐름 |
| [docs/api-reference.md](./docs/api-reference.md) | API 엔드포인트 레퍼런스 |
