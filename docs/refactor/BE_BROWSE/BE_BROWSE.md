# BE_BROWSE 리팩토링 설계

작성일: 2026-06-01

## 역할

`BE_BROWSE/`는 Python FastAPI 기반 정보 탐색/수집 실행 서버다. AI는 이 서버의 정체성이 아니라 내부 도구다. 핵심 책임은 Spring BE가 요청한 정보 탐색 작업을 search engine, browser automation, crawling, RAG, AI 도구 호출로 처리하는 것이다.

| 영역 | 책임 |
|------|------|
| Search engine | browse, crawling, company discovery, recruit discovery orchestration |
| Browser | Playwright 기반 fetch, content extraction, login/session flow |
| AI tools | provider 호출, structured output, summarization, model routing |
| RAG | embedding, retrieval, reranking, Qdrant helper |
| Document/OCR | 문서 파싱, OCR, 요약, 구조화 |
| Execution queue | UUID request queue, sequential worker, result store |

BE_BROWSE는 외부 공개 API가 아니라 Spring BE만 호출하는 내부 실행 서버다.

## 기술 선택

| 항목 | 선택 |
|------|------|
| Framework | FastAPI |
| Architecture | Modular Clean Architecture / Hexagonal |
| Package manager | uv |
| Validation | Pydantic v2 |
| Browser | Playwright Python |
| HTTP server | Hypercorn HTTP/2 또는 Envoy/sidecar HTTP/2 front |
| Queue model | UUID request queue + sequential worker |

MCP는 사용하지 않는다.

## 패키지 구조

```text
BE_BROWSE/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── settings.py
│   │   ├── logging.py
│   │   ├── errors.py
│   │   └── security.py
│   ├── api/
│   │   └── v1/
│   │       ├── requests.py
│   │       ├── ai.py
│   │       ├── agent.py
│   │       ├── search.py
│   │       └── health.py
│   ├── application/
│   │   ├── common/
│   │   │   ├── idempotency.py
│   │   │   ├── progress.py
│   │   │   └── result_store.py
│   │   ├── request_queue/
│   │   │   ├── enqueue_request.py
│   │   │   ├── get_request_status.py
│   │   │   ├── get_request_result.py
│   │   │   ├── cancel_request.py
│   │   │   ├── dispatch_request.py
│   │   │   └── sequential_worker.py
│   │   ├── ai/
│   │   │   ├── complete_text.py
│   │   │   ├── stream_text.py
│   │   │   ├── structured_output.py
│   │   │   └── model_router.py
│   │   ├── agent/
│   │   │   ├── run_agent.py
│   │   │   ├── tool_registry.py
│   │   │   ├── planner.py
│   │   │   ├── executor.py
│   │   │   └── memory.py
│   │   ├── search/
│   │   │   ├── engine.py
│   │   │   ├── plan_search.py
│   │   │   ├── run_search.py
│   │   │   ├── aggregate_results.py
│   │   │   ├── rank_results.py
│   │   │   ├── browse/
│   │   │   │   ├── fetch_page.py
│   │   │   │   ├── extract_content.py
│   │   │   │   ├── browser_session.py
│   │   │   │   └── login_flow.py
│   │   │   ├── company/
│   │   │   │   ├── analyze_company.py
│   │   │   │   ├── find_career_page.py
│   │   │   │   └── enrich_company_profile.py
│   │   │   └── recruit/
│   │   │       ├── collect_job_postings.py
│   │   │       ├── scrape_job_posting.py
│   │   │       └── analyze_cover_letter.py
│   │   ├── rag/
│   │   │   ├── embed_documents.py
│   │   │   ├── retrieve_context.py
│   │   │   ├── rerank_context.py
│   │   │   └── summarize_context.py
│   │   └── document/
│   │       ├── parse_document.py
│   │       ├── ocr_document.py
│   │       └── summarize_document.py
│   ├── domain/
│   │   ├── common/
│   │   ├── request_queue/
│   │   ├── ai/
│   │   ├── agent/
│   │   ├── search/
│   │   ├── rag/
│   │   └── document/
│   ├── infrastructure/
│   │   ├── request_queue/
│   │   ├── ai_providers/
│   │   ├── search/
│   │   ├── browser/
│   │   ├── vector/
│   │   └── document/
│   └── workers/
│       └── request_queue_worker.py
├── tests/
├── pyproject.toml
└── Dockerfile
```

## Search Engine

`search`는 단순 외부 검색 API wrapper가 아니라 BE_BROWSE의 정보 탐색 엔진이다.

- `search/engine.py`가 orchestration entrypoint다.
- `search/browse`는 URL fetch, browser automation, content extraction, login/session flow를 담당한다.
- `search/company`는 회사 정보 탐색, career page discovery, 회사 프로필 보강을 담당한다.
- `search/recruit`는 채용 공고 수집, 채용 사이트 scraping, 자기소개서/공고 관련 탐색을 담당한다.
- Tavily/Serper/Naver/Brave/DuckDuckGo adapter는 `infrastructure/search`에 둔다.
- Playwright 구현은 `infrastructure/browser`에 두고, 이를 조합하는 use case는 `application/search/browse`에 둔다.

Request type은 `search.*` namespace를 사용한다.

```text
search.browse.extract
search.company.analyze
search.company.find_career_page
search.recruit.collect_job_postings
search.recruit.scrape_job_posting
```

## Request Queue

모든 실행 요청은 내부 request queue를 거쳐 처리한다. API endpoint가 provider/browser/search use case를 직접 실행하지 않는다.

기본 흐름:

```text
POST /v1/requests
-> EnqueueRequestUseCase
-> RequestQueuePort.enqueue()
-> 202 Accepted { beBrowseRequestId, status: "queued" }
-> SequentialRequestWorker
-> DispatchRequestUseCase
-> target use case 실행
-> RequestResultStorePort.save()
-> GET /v1/requests/{beBrowseRequestId}/result
```

상태:

```text
queued -> running -> succeeded | failed | cancelled | expired
```

규칙:

- 모든 요청은 UUID 기반 `beBrowseRequestId`를 발급받는다.
- 초기 구현은 전역 concurrency `1`로 순차 처리한다.
- Spring BE는 `beBrowseRequestId`를 Spring `QueueJob`에 저장한다.
- result payload가 크면 response body에 직접 싣지 않고 artifact key를 반환한다.
- request queue와 result store는 port로 추상화한다.
- 초기 local은 SQLite 또는 file-backed queue를 허용한다.
- 운영 1차는 Redis list/stream + object storage 또는 metadata DB를 후보로 둔다.

API:

| Method | Path | 역할 |
|--------|------|------|
| `POST` | `/v1/requests` | 모든 AI/search-engine/document 작업 enqueue |
| `GET` | `/v1/requests/{beBrowseRequestId}` | 상태, progress, timestamps 조회 |
| `GET` | `/v1/requests/{beBrowseRequestId}/result` | 성공 결과 또는 artifact reference 조회 |
| `GET` | `/v1/requests/{beBrowseRequestId}/events` | 선택: progress stream |
| `POST` | `/v1/requests/{beBrowseRequestId}/cancel` | 취소 요청 |

요청 예시:

```json
{
  "requestType": "search.company.analyze",
  "correlationId": "spring-job-uuid",
  "userId": "user-uuid",
  "caller": "queue.company-analysis",
  "payload": {
    "companyId": "company-uuid",
    "companyName": "Example"
  }
}
```

응답 예시:

```json
{
  "beBrowseRequestId": "uuid",
  "status": "queued",
  "queuedAt": "2026-06-01T00:00:00Z"
}
```

## OOP / DIP

- Use case는 class로 작성한다.
- 외부 의존성은 생성자 주입으로 받는다.
- Domain port는 `typing.Protocol` 또는 ABC로 정의한다.
- Infrastructure adapter가 port를 구현한다.
- Domain model은 Pydantic model 또는 dataclass/value object로 정의한다.
- 복잡한 분기와 정책은 `Policy`, `Strategy`, `Router`, `Planner`, `Executor` 객체로 분리한다.
- inheritance보다 composition을 우선한다.
- 테스트는 port mock/fake를 주입해 use case 단위로 검증한다.

Port 후보:

| 대상 | Port |
|------|------|
| AI provider | `AiProviderPort` |
| Search source | `SearchSourcePort` |
| Browser | `BrowserPort` |
| Vector store | `VectorStorePort` |
| Artifact store | `ArtifactStorePort` |
| Queue store | `RequestQueuePort` |
| Result store | `RequestResultStorePort` |
| Progress | `ProgressReporterPort` |

## 횡단 관심사

Python에서는 Spring AOP처럼 proxy를 남용하지 않는다. 명시적인 middleware, dependency, decorator, policy 객체를 사용한다.

- request id
- structured logging
- metrics
- error envelope
- retry
- timeout
- rate limit
- provider fallback
- idempotency

## OCR / Document

OCR은 Spring BE가 직접 수행하지 않는다. BE_BROWSE가 문서 파싱, 이미지 전처리, OCR, VLM/AI 기반 구조화를 수행한다.

Spring BE는 문서 업로드, 권한, metadata 저장, queue orchestration, 결과 저장/조회 API를 담당한다.

## 결합도 보호

BE_BROWSE는 import-linter 또는 pytest 구조 테스트로 역의존을 금지한다.

규칙:

- `domain`은 `infrastructure`를 import하지 않는다.
- `application`은 SDK와 client 구현체를 직접 import하지 않는다.
- OpenAI/Anthropic/Tavily/Playwright/Qdrant SDK는 infrastructure adapter 내부에만 둔다.
- API router는 use case 호출만 수행한다.

## 이관 체크리스트

- [ ] FastAPI skeleton 생성
- [ ] request queue skeleton 생성
- [ ] enqueue/status/result/cancel API 추가
- [ ] sequential worker 추가
- [ ] search engine root 구조 생성
- [ ] browse/company/recruit를 search 하위로 배치
- [ ] AI provider adapter 이관
- [ ] Playwright browser adapter 이관
- [ ] search source adapter 이관
- [ ] OCR/document parsing 이관
- [ ] Qdrant helper 이관
- [ ] HTTP/2 실행 방식 결정
- [ ] Dockerfile 추가
