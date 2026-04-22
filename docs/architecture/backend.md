# 백엔드 구조 (NestJS 11)

## DDD 4계층 패턴

모든 모듈은 동일한 4계층 구조를 따릅니다.

```
{module}/
├── presentation/    — HTTP 컨트롤러, WebSocket 게이트웨이, DTO 검증
├── application/     — 비즈니스 로직 서비스
├── domain/          — 엔티티, 인터페이스, 도메인 모델, AI 프롬프트
└── infrastructure/  — 외부 연동 (DB·크롤러·AI·검색)
```

---

## 모듈별 상세

### auth/ — 인증·사용자 관리

| 파일 | 역할 |
|------|------|
| `domain/entity/user.entity.ts` | 사용자 엔티티 (API 키·기본 모델·역할 포함) |
| `application/auth.service.ts` | 회원가입·로그인·토큰 갱신·API 키 저장 |
| `guards/jwt-auth.guard.ts` | 보호된 라우트 JWT 검증 |
| `presentation/auth.controller.ts` | `/auth/*` 엔드포인트 |

- JWT 만료: 3일, 1일 미만 남으면 자동 갱신 (`tryRenewToken`)
- 역할: `visitor` (기본) / `admin` (파이프라인 테스트 접근)
- 사용자별 API 키는 DB 컬럼으로 저장 (시스템 `.env`와 분리)

→ 상세: [auth.md](../auth.md)

---

### ai/ — AI 프로바이더

| 파일 | 역할 |
|------|------|
| `infrastructure/ai-provider.service.ts` | 모든 AI 호출 진입점, 폴백 체인 |
| `infrastructure/provider/anthropic.ai.ts` | Claude (web_search 툴 지원) |
| `infrastructure/provider/openai.ai.ts` | GPT (function calling) |
| `infrastructure/provider/google.ai.ts` | Gemini (VLM 지원) |
| `infrastructure/provider/groq.ai.ts` | Groq (Gemini 쿼터 초과 폴백) |
| `infrastructure/provider/ollama.ai.ts` | 로컬 Ollama (툴 지원) |
| `infrastructure/provider/llama-cpp.ai.ts` | 로컬 llama.cpp HTTP 서버 |
| `application/ai.service.ts` | 에이전트 루프, 신뢰도 평가, 전문 태스크 |
| `domain/models.ts` | 지원 모델 목록, 단가 정보 |

- 모든 AI 호출 결과는 `ai_call_log` 테이블에 기록 (프롬프트·응답·토큰·비용·소요시간)
- Default 키 호출 시 RPM throttle 적용 (12 req/min)

→ 상세: [ai-providers.md](../ai-providers.md)

---

### sessions/ — 세션·태스크 관리

| 엔티티 | 설명 |
|--------|------|
| `SessionEntity` | 리서치 세션 (topic, researchState, summaryState, userId) |
| `SessionItemEntity` | 세션 내 개별 태스크 (title, prompt, aiResult, confidence, status) |
| `ChatEntity` | 세션별 채팅 메시지 히스토리 |

- **파일 기반 JSON이 아닌 SQLite 저장** (TypeORM, `synchronize: true`)
- WebSocket 게이트웨이로 실시간 상태 브로드캐스트

---

### queue/ — 비동기 작업 큐

인-메모리 큐 + DB 영속화. 최대 동시 실행 3개.

| TaskType | Executor |
|----------|----------|
| `LIGHTRESEARCH` | LightResearchExecutorService |
| `DEEPRESEARCH` | DeepResearchExecutorService |
| `SUMMARY` | SummaryExecutorService |
| `WRITEASSIST` | WriteAssistExecutorService |
| `COMPANYPROFILE` | CompanyProfileExecutorService |

→ 상세: [pipelines/queue.md](../pipelines/queue.md)

---

### research/ — 웹 검색·파이프라인

| 파일 | 역할 |
|------|------|
| `infrastructure/web-search.provider.ts` | 멀티-소스 병렬 검색 오케스트레이터 |
| `infrastructure/search/tavily.search.ts` | Tavily API |
| `infrastructure/search/serper.search.ts` | Serper API |
| `infrastructure/search/naver.search.ts` | Naver 검색 |
| `infrastructure/search/brave.search.ts` | Brave Search |
| `infrastructure/search/duckduckgo.search.ts` | DuckDuckGo (무료, HTML + Puppeteer fallback) |
| `application/pipeline/light-research-pipeline.service.ts` | 태스크 목록 생성 파이프라인 |
| `application/pipeline/deep-research-pipeline.service.ts` | 태스크 심층 분석 파이프라인 |

- TTL 캐시 (5분), 도메인 차단 필터, 회로 차단기(circuit breaker) 내장
- DuckDuckGo는 API 키 없이 항상 사용 가능

→ 상세: [pipelines/light-research.md](../pipelines/light-research.md), [pipelines/deep-research.md](../pipelines/deep-research.md)

---

### chat/ — RAG 채팅

- Qdrant 시맨틱 검색 → 슬라이딩 윈도우 히스토리 (최근 20개) → AI 스트리밍
- 첨부 문서(PDF 등)가 있으면 RAG 대신 직접 텍스트 주입
- 웹 검색 툴 사용 가능 (RAG 결과 없을 때)

→ 상세: [pipelines/chat-rag.md](../pipelines/chat-rag.md)

---

### vector/ — 임베딩·검색

- Qdrant 래퍼 (`VectorService`)
- 임베딩 모델: Ollama `nomic-embed-text` (768차원)
- 컬렉션: `research_rag`, `experience_rag`, `document_rag`
- 청크 크기: 600자, 80자 오버랩

---

### overview/ — 대시보드·통계

- 시스템 레벨 API 키 관리 (Tavily, Google Default, ANTHROPIC Admin 등)
- 토큰 사용량·비용 집계
- Anthropic Admin API로 월별 사용 리포트 조회
- **Anthropic·OpenAI 사용자 개인 키는 이 모듈에서 관리하지 않음** → `auth` 모듈 담당

---

### documents/ — 문서·경험

- PDF 파싱 (`pdf-parse`)
- 문서 → 경험 추출 (AI 분석)
- Qdrant `document_rag`, `experience_rag` 컬렉션 인덱싱

---

### news/ — 뉴스

- 카테고리별 뉴스 수집 (IT·경제·사회·정치·세계·문화·과학)
- AI 요약 (기본 키 사용)
- 분쟁 지역 감지 → 월드맵 표시

---

### shared/ — 공통

| 파일 | 역할 |
|------|------|
| `request-context.ts` | AsyncLocalStorage 기반 요청 컨텍스트 (사용자·API 키) |
| `middleware/auth-context.middleware.ts` | JWT 검증 → requestContext 주입 |
| `env/env.utils.ts` | 환경변수 유틸 |
| `exceptions/` | 커스텀 예외 클래스 |
| `resilience/` | 회로 차단기 |
