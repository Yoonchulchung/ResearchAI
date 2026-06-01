# BE_BROWSE Internal API 명세

작성일: 2026-06-01

이 문서는 Spring `BE`가 FastAPI `BE_BROWSE`를 호출할 때 사용하는 internal REST API를 정의한다.

## 공통

Base URL:

```text
local: http://localhost:8001
k8s:   http://be-browse:8001
```

운영 목표 transport:

```text
REST over HTTP/2
```

초기 구현은 HTTP/1.1 compatible REST contract로 작성한다. 배포 환경에서 transport만 HTTP/2로 올릴 수 있어야 한다.

## 인증

BE_BROWSE는 외부 공개 API가 아니다. Spring BE만 호출한다.

권장 header:

```http
Authorization: Bearer <internal-service-token>
X-Request-Id: <spring-correlation-uuid>
X-Caller: queue.company-analysis
Content-Type: application/json
```

장기적으로는 service token 대신 mTLS 또는 short-lived internal token을 사용한다.

## 공통 Error Envelope

모든 오류 응답은 같은 envelope을 사용한다.

```json
{
  "isSuccess": false,
  "error": {
    "code": "BE_BROWSE_REQUEST_NOT_FOUND",
    "message": "Request not found",
    "requestId": "spring-correlation-uuid",
    "beBrowseRequestId": "be-browse-request-uuid",
    "retryable": false,
    "details": {}
  }
}
```

대표 status code:

| HTTP | 의미 |
|------|------|
| `400` | request validation 실패 |
| `401` | internal auth 실패 |
| `404` | request/result 없음 |
| `409` | 이미 완료/취소되어 변경 불가 |
| `422` | requestType 또는 payload schema 오류 |
| `429` | BE_BROWSE 내부 queue/backpressure 제한 |
| `500` | 예기치 못한 내부 오류 |
| `503` | worker/provider/browser 사용 불가 |

## 상태 모델

BE_BROWSE request status:

```text
queued
running
succeeded
failed
cancelled
expired
```

상태 전이:

```text
queued -> running -> succeeded
queued -> running -> failed
queued -> cancelled
queued -> running -> cancelled
queued -> expired
running -> expired
```

## Request Type

모든 실행 요청은 `requestType`으로 분기한다.

| Namespace | 예시 | 설명 |
|-----------|------|------|
| `ai.*` | `ai.complete`, `ai.structured_output` | AI provider 도구 호출 |
| `agent.*` | `agent.run` | agent workflow |
| `search.*` | `search.browse.extract`, `search.company.analyze` | search engine 실행 |
| `document.*` | `document.parse`, `document.ocr` | 문서/OCR |
| `rag.*` | `rag.embed`, `rag.retrieve` | embedding/RAG |

`browse`, `company`, `recruit`은 최상위 namespace가 아니라 `search.*` 하위에 둔다.

## POST /v1/requests

작업을 BE_BROWSE 내부 request queue에 enqueue한다. 실행은 즉시 하지 않는다.

### Request

```http
POST /v1/requests
Authorization: Bearer <internal-service-token>
X-Request-Id: 8c5c79c2-2d8b-42c0-a671-8f0b5f16e077
Content-Type: application/json
```

```json
{
  "version": "v1",
  "requestType": "search.company.analyze",
  "requestId": "8c5c79c2-2d8b-42c0-a671-8f0b5f16e077",
  "userId": "user-uuid",
  "caller": "queue.company-analysis",
  "modelPolicy": {
    "cloudModel": "claude-sonnet-4-6",
    "localModel": "ollama:nomic-embed-text"
  },
  "credentialsRef": {
    "scope": "user",
    "keys": ["anthropic", "tavily"]
  },
  "execution": {
    "priority": 0,
    "timeoutMs": 600000,
    "idempotencyKey": "company-analysis:company-uuid"
  },
  "payload": {
    "companyId": "company-uuid",
    "companyName": "Example"
  }
}
```

### Fields

| Field | Required | 설명 |
|-------|----------|------|
| `version` | yes | API contract version. 초기값 `v1` |
| `requestType` | yes | 실행 작업 유형 |
| `requestId` | yes | Spring correlation UUID |
| `userId` | no | 사용자 ID 또는 anon ID |
| `caller` | yes | 호출 use case 식별자 |
| `modelPolicy` | no | AI model 선택 정책 |
| `credentialsRef` | no | Spring이 제공한 credential scope 정보 |
| `execution.priority` | no | 초기에는 저장만 하고 순차 worker는 FIFO 우선 |
| `execution.timeoutMs` | no | request-level timeout |
| `execution.idempotencyKey` | no | 중복 enqueue 방지 key |
| `payload` | yes | requestType별 payload |

### Response

```http
202 Accepted
```

```json
{
  "isSuccess": true,
  "result": {
    "beBrowseRequestId": "b4fd1d02-4b34-43cc-8277-a2fbf33778bd",
    "status": "queued",
    "queuedAt": "2026-06-01T00:00:00Z"
  }
}
```

### Notes

- 같은 `idempotencyKey`가 이미 queued/running이면 기존 `beBrowseRequestId`를 반환할 수 있다.
- 초기 worker concurrency는 `1`이다.
- queue가 꽉 찬 경우 `429`를 반환한다.

## GET /v1/requests/{beBrowseRequestId}

작업 상태를 조회한다.

### Response

```json
{
  "isSuccess": true,
  "result": {
    "beBrowseRequestId": "b4fd1d02-4b34-43cc-8277-a2fbf33778bd",
    "requestType": "search.company.analyze",
    "status": "running",
    "progress": {
      "stage": "search.company.fetch_sources",
      "message": "Fetching company sources",
      "percentage": 35
    },
    "queuedAt": "2026-06-01T00:00:00Z",
    "startedAt": "2026-06-01T00:00:03Z",
    "finishedAt": null,
    "error": null
  }
}
```

## GET /v1/requests/{beBrowseRequestId}/result

완료된 작업 결과를 조회한다.

### 성공 Response

```json
{
  "isSuccess": true,
  "result": {
    "beBrowseRequestId": "b4fd1d02-4b34-43cc-8277-a2fbf33778bd",
    "status": "succeeded",
    "resultType": "company.analysis",
    "data": {
      "companyName": "Example",
      "summary": "..."
    },
    "artifacts": [
      {
        "type": "html",
        "key": "artifact/company/b4fd1d02/raw.html",
        "contentType": "text/html"
      }
    ],
    "metrics": {
      "durationMs": 12345,
      "inputTokens": 1000,
      "outputTokens": 300
    }
  }
}
```

### 아직 미완료

```http
409 Conflict
```

```json
{
  "isSuccess": false,
  "error": {
    "code": "BE_BROWSE_RESULT_NOT_READY",
    "message": "Request is still running",
    "beBrowseRequestId": "b4fd1d02-4b34-43cc-8277-a2fbf33778bd",
    "retryable": true
  }
}
```

## POST /v1/requests/{beBrowseRequestId}/cancel

작업 취소를 요청한다.

### Request

```json
{
  "reason": "user_cancelled"
}
```

### Response

```json
{
  "isSuccess": true,
  "result": {
    "beBrowseRequestId": "b4fd1d02-4b34-43cc-8277-a2fbf33778bd",
    "status": "cancelled",
    "cancelledAt": "2026-06-01T00:01:00Z"
  }
}
```

실행 중인 browser/AI 작업은 best-effort cancellation으로 처리한다.

## GET /v1/requests/{beBrowseRequestId}/events

선택 기능이다. 초기 구현은 polling을 기본으로 하고, 이후 progress stream이 필요할 때 추가한다.

권장 포맷은 SSE다.

```text
event: progress
data: {"stage":"search.company.fetch_sources","percentage":35}

event: completed
data: {"status":"succeeded"}
```

## GET /health

BE_BROWSE service health check.

```json
{
  "status": "ok",
  "service": "be-browse",
  "time": "2026-06-01T00:00:00Z"
}
```

## Payload 예시

### search.company.analyze

```json
{
  "companyId": "company-uuid",
  "companyName": "Example",
  "homepageUrl": "https://example.com",
  "careerPageUrl": null
}
```

### search.company.find_career_page

```json
{
  "companyId": "company-uuid",
  "companyName": "Example",
  "homepageUrl": "https://example.com"
}
```

### search.recruit.collect_job_postings

```json
{
  "keywords": ["backend", "java"],
  "sources": ["jobkorea", "saramin", "wanted"],
  "limit": 50
}
```

### search.browse.extract

```json
{
  "url": "https://example.com",
  "mode": "readable_text",
  "useBrowser": true
}
```

### document.ocr

```json
{
  "artifactKey": "documents/uploaded/file.pdf",
  "languageHints": ["kor", "eng"],
  "outputFormat": "text"
}
```

## Spring Mapping

Spring `QueueJob` 저장 필드:

| Field | 설명 |
|-------|------|
| `id` | Spring job ID |
| `taskType` | Spring task type |
| `status` | Spring job status |
| `beBrowseRequestId` | BE_BROWSE request ID |
| `requestType` | BE_BROWSE request type |
| `createdAt` | 생성 시간 |
| `updatedAt` | 수정 시간 |

상태 매핑은 [CONNECT.md](CONNECT.md)의 상태 매핑을 따른다.
