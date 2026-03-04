# ResearchAI

주제를 입력하면 AI가 자동으로 세부 리서치 태스크를 생성하고, 웹 검색 + AI 분석을 통해 구조화된 보고서를 만들어주는 시스템입니다.

---

## 목차

- [기능 요약](#기능-요약)
- [기술 스택](#기술-스택)
- [빠른 시작](#빠른-시작)
- [환경 변수](#환경-변수)
- [문서 목록](#문서-목록)

---

## 기능 요약

| 기능 | 설명 |
|------|------|
| **태스크 자동 생성** | 주제를 입력하면 AI가 5~7개의 세부 리서치 항목 생성 |
| **멀티 검색 엔진** | Tavily / Serper / Naver / Brave 병렬 검색 |
| **AI 분석** | Claude / GPT / Gemini / Ollama 중 선택하여 심층 분석 |
| **소스 탭** | 원본 검색 결과와 Ollama 필터링 결과를 나란히 비교 |
| **벡터 RAG 채팅** | 리서치 결과를 Qdrant에 인덱싱, 시맨틱 검색 기반 Q&A |
| **컨텍스트 압축** | Ollama로 긴 RAG 컨텍스트를 백그라운드 압축 |
| **히스토리 영속화** | 세션별 폴더에 결과(`session.json`) + 채팅(`chat.json`) 저장 |

---

## 기술 스택

```
Backend   NestJS + TypeScript          :3001
Frontend  Next.js 14 + Tailwind CSS   :3000
Vector DB Qdrant                      :6333  (Docker)
Local AI  Ollama                      :11434
```

**지원 AI 모델**

| 제공사 | 모델 |
|--------|------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI | gpt-4o, gpt-4o-mini, o3-mini |
| Google | gemini-2.0-flash, gemini-2.5-pro |
| Ollama | `ollama:<모델명>` 형식으로 자유롭게 지정 |

---

## 빠른 시작

### 사전 요구사항

- [Node.js 20+](https://nodejs.org)
- [pnpm](https://pnpm.io) (`npm i -g pnpm`)
- [Docker](https://www.docker.com) (Qdrant 벡터 DB용)
- [Ollama](https://ollama.com) (로컬 AI / 임베딩용)

### 1. 환경 변수 설정

```bash
cp BE/.env.example BE/.env
# BE/.env 파일을 열어 API 키 입력
```

최소한 **클라우드 AI 키 1개**와 **검색 API 키 1개** 이상을 설정해야 합니다.

### 2. 실행

```bash
./run.sh
```

스크립트가 자동으로:
1. Qdrant Docker 컨테이너 시작 (없으면 생성)
2. `nomic-embed-text` Ollama 임베딩 모델 다운로드
3. BE / FE 의존성 설치
4. 백엔드(3001) + 프론트엔드(3000) 동시 실행

브라우저에서 http://localhost:3000 접속

---

## 환경 변수

`BE/.env` 파일을 기준으로 합니다.

### 클라우드 AI (1개 이상 필수)

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIz...
```

### 웹 검색 (1개 이상 권장)

```env
TAVILY_API_KEY=tvly-...        # https://app.tavily.com  (무료 1,000회/월)
SERPER_API_KEY=...             # https://serper.dev      (무료 2,500회)
NAVER_CLIENT_ID=...            # 한국어 검색
NAVER_CLIENT_SECRET=...
BRAVE_API_KEY=...              # https://api.search.brave.com (무료 2,000회/월)
TAVILY_SEARCH_DEPTH=basic      # basic | advanced
```

### 로컬 AI (Ollama)

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b          # 웹 검색 결과 필터링용
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_COMPRESS_MODEL=llama3.1    # RAG 컨텍스트 압축용
```

### 벡터 DB

```env
QDRANT_URL=http://localhost:6333
```

### 관리자 (선택)

```env
ANTHROPIC_ADMIN_API_KEY=sk-ant-admin-...  # 사용량 리포트용
```

---

## 문서 목록

| 파일 | 내용 |
|------|------|
| [architecture.md](./architecture.md) | 시스템 구조, 데이터 흐름, 모듈 설명 |
| [api-reference.md](./api-reference.md) | 전체 API 엔드포인트 레퍼런스 |
