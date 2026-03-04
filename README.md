# ResearchAI

**맥북 에어 16GB / 24GB에서 로컬 AI + 클라우드 AI를 함께 사용하는 리서치 자동화 도구**

주제를 입력하면 AI가 조사 항목을 자동 생성하고, 각 항목을 병렬로 리서치해 마크다운 보고서로 정리합니다.
클라우드 API 없이 Ollama 로컬 모델만으로도 완전히 동작합니다.

---

## 특징

- **로컬 + 클라우드 동시 선택** — 태스크 생성은 API 모델로, 검색 필터링은 Ollama 로컬 모델로 역할 분담
- **맥북 에어 24GB 최적화** — llama3.2:3b, qwen2.5:7b, gemma2:9b 등 메모리 효율 모델 권장
- **다중 검색 파이프라인** — Tavily · Serper · 네이버 · Brave 를 병렬 실행 후 Ollama로 압축
- **클라우드 AI 지원** — Claude (Anthropic) · GPT (OpenAI) · Gemini (Google) 전환 가능
- **실시간 진행 확인** — 검색 결과와 AI 분석을 탭으로 분리해 단계별로 확인
- **프롬프트 테스트** — 설정 페이지에서 태스크 생성 파이프라인을 API / 로컬 모델별로 직접 실험

---

## 구조

```
ResearchAI/
├── BE/   # NestJS 백엔드 (포트 3001)
└── FE/   # Next.js 프론트엔드 (포트 3000)
```

---

## 시작하기

### 1. Ollama 설치 (로컬 AI)

```bash
# https://ollama.com 에서 설치 후
ollama pull llama3.2:3b      # 맥북 에어 16GB 이상 권장
ollama pull qwen2.5:7b       # 24GB 권장
ollama pull gemma2:9b        # 24GB 권장
```

### 2. 백엔드 설정

```bash
cd BE
cp .env.example .env
# .env 파일에서 사용할 API 키 입력
npm install
npm run start:dev
```

### 3. 프론트엔드 실행

```bash
cd FE
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 환경 변수 (.env)

### 클라우드 AI (하나 이상 설정)

| 변수 | 발급처 |
|------|--------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `OPENAI_API_KEY` | https://platform.openai.com |
| `GOOGLE_API_KEY` | https://aistudio.google.com |

### 웹 검색 (선택, 하나 이상 설정 시 파이프라인 활성화)

| 변수 | 무료 한도 | 발급처 |
|------|-----------|--------|
| `TAVILY_API_KEY` | 1,000회/월 | https://app.tavily.com |
| `SERPER_API_KEY` | 2,500회 | https://serper.dev |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 한국어 특화 | https://developers.naver.com |
| `BRAVE_API_KEY` | 2,000회/월 | https://api.search.brave.com |

검색 API를 설정하지 않으면 각 클라우드 모델의 내장 웹 검색을 사용합니다.

### 로컬 AI (Ollama)

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b   # 검색 결과 압축에 사용
```

---

## 로컬 모델 선택 가이드 (맥 기준)

| 모델 | 권장 메모리 | 특징 |
|------|-------------|------|
| `llama3.2:3b` | 8GB+ | 빠른 응답, 영어 중심 |
| `qwen2.5:7b` | 16GB+ | 한국어·중국어 강점 |
| `gemma2:9b` | 24GB+ | 균형 잡힌 성능 |
| `phi4` | 16GB+ | 추론 특화, MS |

맥북 에어 24GB 환경에서는 `qwen2.5:7b` 또는 `gemma2:9b`를 권장합니다.

---

## 기술 스택

- **Backend** — NestJS · TypeScript
- **Frontend** — Next.js 14 · Tailwind CSS
- **Local AI** — Ollama (OpenAI-compatible API)
- **Cloud AI** — Anthropic SDK · OpenAI SDK · Google GenAI SDK
- **Search** — Tavily SDK · Serper · Naver Search API · Brave Search API
