# ResearchAI 문서 인덱스

주제를 입력하면 AI가 리서치 항목을 자동 생성하고, 웹 검색·AI 분석을 통해 구조화된 보고서를 만들어주는 시스템입니다.

---

## 빠른 시작

```bash
./run.sh dev   # Qdrant + BE(:3001) + FE(:3000) 동시 실행
```

→ **http://localhost:3000** 접속 후 회원가입

---

## 기술 스택

```
Backend   NestJS 11 + TypeScript   :3001
Frontend  Next.js 14 + Tailwind    :3000
DB        SQLite (TypeORM)         data/sessions.db
Vector    Qdrant                   :6333 (Docker)
Local AI  Ollama                   :11434
```

**지원 AI 모델**

| 제공사 | 모델 |
|--------|------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI | gpt-4o, gpt-4o-mini, o3-mini |
| Google | gemini-2.0-flash, gemini-2.5-pro |
| Groq | llama-3.3-70b-versatile (Gemini 쿼터 초과 시 자동 폴백) |
| Ollama | `ollama:<모델명>` 로컬 실행 |
| llama.cpp | `llama:<모델명>` 로컬 HTTP 서버 |

---

## 문서 목록

### 아키텍처

| 파일 | 설명 |
|------|------|
| [architecture/overview.md](architecture/overview.md) | 전체 시스템 구조도, 디렉터리, 외부 서비스 |
| [architecture/backend.md](architecture/backend.md) | BE 모듈 상세 (NestJS DDD 4계층) |
| [architecture/frontend.md](architecture/frontend.md) | FE 페이지 라우트, 컴포넌트, 훅 |
| [architecture/database.md](architecture/database.md) | SQLite 엔티티 스키마, Qdrant 컬렉션 |

### 리팩토링

| 파일 | 설명 |
|------|------|
| [refactor/be-browse-spring-migration-plan.md](refactor/be-browse-spring-migration-plan.md) | BE + BE_BROWSE 전환 로드맵 |
| [refactor/BE/BE.md](refactor/BE/BE.md) | Spring BE 설계 |
| [refactor/BE_BROWSE/BE_BROWSE.md](refactor/BE_BROWSE/BE_BROWSE.md) | FastAPI BE_BROWSE 설계 |
| [refactor/CONNECT/CONNECT.md](refactor/CONNECT/CONNECT.md) | BE와 BE_BROWSE 연결 설계 |
| [refactor/CONNECT/API.md](refactor/CONNECT/API.md) | BE_BROWSE internal API 명세 |

### 기능 명세

| 파일 | 설명 |
|------|------|
| [feature/README.md](feature/README.md) | 기능 명세 인덱스 |
| [feature/common/README.md](feature/common/README.md) | 공통 UX, 인증, 권한, API 통신 |
| [feature/dashboard/README.md](feature/dashboard/README.md) | 메인 대시보드, 검색 진입 |
| [feature/research/README.md](feature/research/README.md) | 리서치 세션, Light/Deep Research, RAG 채팅 |
| [feature/recruit/README.md](feature/recruit/README.md) | 채용 공고, 이력서, 자기소개서, 문서 파싱 |
| [feature/company/README.md](feature/company/README.md) | 기업 목록, 상세, 분석, 정보 보강 |
| [feature/news/README.md](feature/news/README.md) | 뉴스, 논문, 기술 블로그, AI 리더보드 |
| [feature/documents/README.md](feature/documents/README.md) | 문서 저장소, 경험 관리, 작성 보조 |
| [feature/settings/README.md](feature/settings/README.md) | 설정, API 키, 사용량, 파이프라인 테스트 |

### 파이프라인

| 파일 | 설명 |
|------|------|
| [pipelines/queue.md](pipelines/queue.md) | 큐 시스템 (인-메모리 + DB 영속, SSE 스트리밍) |
| [pipelines/light-research.md](pipelines/light-research.md) | Light Research — 태스크 목록 자동 생성 |
| [pipelines/deep-research.md](pipelines/deep-research.md) | Deep Research — 태스크별 심층 분석 |
| [pipelines/chat-rag.md](pipelines/chat-rag.md) | RAG 채팅 파이프라인 |

### 기능 상세

| 파일 | 설명 |
|------|------|
| [auth.md](auth.md) | 인증(JWT), 역할(visitor/admin), 사용자별 API 키 |
| [ai-providers.md](ai-providers.md) | AI 프로바이더 멀티-폴백 체인, 요금 정보 |
| [api-reference.md](api-reference.md) | REST API 엔드포인트 레퍼런스 |
