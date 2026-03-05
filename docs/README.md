# ResearchAI — 개요

주제를 입력하면 AI가 리서치 항목을 자동 생성하고, 웹 검색·채용 공고 크롤링·AI 분석을 통해 구조화된 보고서를 만들어주는 시스템입니다.

---

## 목차

- [기능 요약](#기능-요약)
- [기술 스택](#기술-스택)
- [빠른 시작](#빠른-시작)
- [환경 변수](#환경-변수)
- [로컬 모델 선택 가이드](#로컬-모델-선택-가이드)
- [문서 목록](#문서-목록)

---

## 기능 요약

| 기능 | 설명 |
|------|------|
| **검색 소스 자동 판단** | Ollama가 주제를 분석해 웹 검색 / 채용 공고 / 둘 다 중 최적 소스 선택 |
| **채용 공고 검색** | 사람인 실시간 크롤링 (기업유형·경력 구분 필터 지원) |
| **멀티 웹 검색** | Tavily · Serper · Naver · Brave 병렬 실행, Ollama로 결과 압축 |
| **다중 AI 지원** | Claude / GPT / Gemini / Ollama 자유롭게 선택 |
| **실시간 스트리밍** | SSE로 검색·분석 진행 상황을 단계별 로그로 제공 |
| **검색 중단** | 파이프라인 실행 중 언제든 취소 가능 |
| **벡터 RAG 채팅** | Qdrant 시맨틱 검색 기반으로 리서치 결과와 대화 |
| **컨텍스트 압축** | Ollama로 긴 RAG 컨텍스트를 백그라운드 압축 |
| **세션 영속화** | 결과(`session.json`) + 채팅(`chat.json`) 파일로 저장 |

---

## 기술 스택

```
Backend    NestJS + TypeScript          :3001
Frontend   Next.js 14 + Tailwind CSS   :3000
Vector DB  Qdrant                       :6333  (Docker)
Local AI   Ollama                       :11434
```

**지원 AI 모델**

| 제공사 | 모델 예시 |
|--------|----------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI | gpt-4o, gpt-4o-mini, o3-mini |
| Google | gemini-2.0-flash, gemini-2.5-pro |
| Ollama | `ollama:<모델명>` 형식으로 자유 지정 |

---

## 빠른 시작

### 사전 요구사항

- [Node.js 20+](https://nodejs.org)
- [Docker](https://www.docker.com) — Qdrant 벡터 DB 실행용
- [Ollama](https://ollama.com) — 로컬 AI, 검색 계획, 임베딩

### 1. Ollama 모델 준비

```bash
# 검색 계획 (web/recruit/both 자동 판단) — 필수
ollama pull llama3.1

# RAG 임베딩 — 필수 (Qdrant 사용 시)
ollama pull nomic-embed-text

# 검색 결과 필터링 / RAG 압축 — 선택 (메모리에 따라 선택)
ollama pull llama3.2:3b    # 8GB+ (빠름)
ollama pull qwen2.5:7b     # 16GB+ (한국어 강점)
ollama pull gemma2:9b      # 24GB+ (균형)
```

### 2. 환경 변수 설정

```bash
cp BE/.env.example BE/.env
# BE/.env 파일을 열어 API 키 입력
```

최소 **클라우드 AI 키 1개** 이상을 설정해야 합니다.
웹 검색 API가 없으면 Claude·Gemini의 내장 웹서치를 사용합니다.

### 3. 실행

```bash
./run.sh
```

스크립트가 자동으로:
1. Qdrant Docker 컨테이너 시작 (없으면 생성)
2. `nomic-embed-text` 임베딩 모델 확인
3. BE / FE 의존성 설치
4. 백엔드(3001) + 프론트엔드(3000) 동시 실행

→ **http://localhost:3000** 접속

---

## 환경 변수

`BE/.env` 기준입니다.

### 클라우드 AI (1개 이상 설정)

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIz...
```

### 웹 검색 (1개 이상 권장)

```env
TAVILY_API_KEY=tvly-...        # https://app.tavily.com  (무료 1,000회/월)
SERPER_API_KEY=...             # https://serper.dev      (무료 2,500회)
NAVER_CLIENT_ID=...            # 한국어 검색 특화
NAVER_CLIENT_SECRET=...
BRAVE_API_KEY=...              # https://api.search.brave.com (무료 2,000회/월)
TAVILY_SEARCH_DEPTH=basic      # basic | advanced
```

웹 검색 API가 없으면:
- Claude → `web_search_20250305` 내장 툴 자동 사용
- Gemini → `googleSearch` 내장 툴 자동 사용
- GPT / Ollama → 검색 없이 AI 지식만 사용

### Ollama

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_PLANNER_MODEL=llama3.1       # 검색 소스 자동 판단 (web/recruit/both)
OLLAMA_MODEL=llama3.2:3b            # 웹 검색 결과 필터링
OLLAMA_EMBED_MODEL=nomic-embed-text # RAG 임베딩
OLLAMA_COMPRESS_MODEL=llama3.1      # RAG 컨텍스트 압축
```

`OLLAMA_PLANNER_MODEL`이 없으면 `OLLAMA_MODEL`을 사용하고,
둘 다 없으면 `llama3.1`을 기본값으로 시도합니다.

### 벡터 DB

```env
QDRANT_URL=http://localhost:6333
```

### 관리자 (선택)

```env
ANTHROPIC_ADMIN_API_KEY=sk-ant-admin-...  # 사용량 리포트용
```

---

## 로컬 모델 선택 가이드 (맥 기준)

| 모델 | 권장 메모리 | 특징 |
|------|-------------|------|
| `llama3.2:3b` | 8GB+ | 빠른 응답, 영어 중심 |
| `llama3.1` | 8GB+ | 검색 계획·압축 적합 |
| `qwen2.5:7b` | 16GB+ | 한국어·중국어 강점 |
| `gemma2:9b` | 24GB+ | 균형 잡힌 성능 |
| `phi4` | 16GB+ | 추론 특화 (MS) |

맥북 에어 24GB에서는 `qwen2.5:7b` 또는 `gemma2:9b`를 권장합니다.

---

## 문서 목록

| 파일 | 내용 |
|------|------|
| [architecture.md](./architecture.md) | 전체 모듈 구조, 데이터 흐름, 파이프라인 상세 |
| [api-reference.md](./api-reference.md) | 전체 API 엔드포인트 레퍼런스 |
