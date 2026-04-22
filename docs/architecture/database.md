# 데이터베이스 스키마

## 구성

| 저장소 | 용도 | 위치 |
|--------|------|------|
| SQLite (TypeORM) | 전체 애플리케이션 데이터 | `data/sessions.db` |
| Qdrant | 벡터 임베딩 (RAG) | `:6333` (Docker) |

- TypeORM `synchronize: true` — 서버 재시작 시 스키마 자동 반영, 마이그레이션 불필요
- 드라이버: `better-sqlite3`

---

## SQLite 엔티티

### UserEntity (`users`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK | UUID |
| `username` | text UNIQUE | 사용자명 |
| `password_hash` | text | bcrypt 해시 |
| `anthropic_api_key` | text? | 개인 Anthropic 키 |
| `openai_api_key` | text? | 개인 OpenAI 키 |
| `google_api_key` | text? | 개인 Google 키 |
| `tavily_api_key` | text? | 개인 Tavily 키 |
| `serper_api_key` | text? | 개인 Serper 키 |
| `naver_client_id` | text? | 개인 Naver ID |
| `naver_client_secret` | text? | 개인 Naver Secret |
| `brave_api_key` | text? | 개인 Brave 키 |
| `default_cloud_model` | text? | 기본 클라우드 AI 모델 |
| `default_local_model` | text? | 기본 로컬 AI 모델 |
| `role` | text | `'visitor'` \| `'admin'` |
| `created_at` | datetime | |
| `updated_at` | datetime | |

---

### SessionEntity (`sessions`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK | UUID |
| `user_id` | text FK→users | 소유 사용자 |
| `topic` | text | 리서치 주제 |
| `research_cloud_ai_model` | text? | 사용된 클라우드 모델 |
| `research_local_ai_model` | text? | 사용된 로컬 모델 |
| `research_web_model` | text? | 사용된 웹 검색 엔진 |
| `research_state` | enum | IDLE·PENDING·RUNNING·DONE·ERROR·STOPPED·ABORTED |
| `summary_state` | enum | IDLE·PENDING·RUNNING·DONE·ERROR·STOPPED·CHANGED |
| `summary` | text? | AI 요약 결과 |
| `attached_file_ids` | text? | JSON 배열 (첨부 파일 ID) |
| `created_at` | datetime | |

---

### SessionItemEntity (`session_items`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | integer PK | 자동 증가 |
| `item_id` | text | UUID (외부 참조용) |
| `session_id` | text FK→sessions | |
| `title` | text | 태스크 제목 |
| `prompt` | text | AI 프롬프트 |
| `status` | enum | idle·running·done·error·stopped |
| `ai_result` | text? | AI 생성 마크다운 결과 |
| `web_result` | text? | 웹 검색 원본 결과 |
| `web_model` | text? | 사용된 웹 검색 엔진 |
| `confidence` | text? | JSON `{ score, reason }` |
| `created_at` | datetime | |

---

### ChatEntity (`chats`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK | UUID |
| `session_id` | text FK→sessions | |
| `role` | text | `'user'` \| `'assistant'` |
| `content` | text | 메시지 내용 |
| `context_message` | text? | RAG 보강된 프롬프트 (내부용) |
| `created_at` | datetime | |

---

### QueueJobEntity (`queue_jobs`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK | jobId |
| `session_id` | text? | 관련 세션 |
| `item_id` | text? | 관련 태스크 |
| `task_type` | text | TaskType enum |
| `status` | text | pending·running·done·error·stopped |
| `created_at` | datetime | |
| `updated_at` | datetime | |

---

### AiCallLogEntity (`ai_call_logs`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK | UUID |
| `ai_model` | text | 사용된 모델 ID |
| `caller` | text? | 호출 위치 식별자 |
| `user_id` | text? | 요청 사용자 |
| `system_prompt` | text? | 시스템 프롬프트 (최대 2000자) |
| `user_prompt` | text? | 사용자 프롬프트 (최대 2000자) |
| `response` | text? | AI 응답 (최대 2000자) |
| `error` | text? | 오류 메시지 |
| `input_tokens` | integer | 입력 토큰 수 |
| `output_tokens` | integer | 출력 토큰 수 |
| `estimated_fees` | float | 추정 비용 (USD) |
| `duration_ms` | integer | 소요 시간 (ms) |
| `created_at` | datetime | |

> `/settings/pipeline` → "AI 호출 이력" 탭에서 확인 가능 (admin 전용)

---

### TokenHistoryEntity (`token_histories`)

토큰 사용량 집계용 (비용 차트 데이터).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK | UUID |
| `ai_model` | text | 모델 ID |
| `used_tokens` | text | `"input:N/output:N"` 형식 |
| `estimated_fees` | float | 추정 비용 (USD) |
| `created_at` | datetime | |

---

### DocumentEntity / ExperienceEntity

| 테이블 | 주요 컬럼 |
|--------|----------|
| `documents` | id, title, content(마크다운), company_name?, created_at |
| `experiences` | id, title, content, category?, ai_categories?(JSON), source_doc_id?, created_at |

---

### AppConfigEntity (`app_configs`)

시스템 설정 KV 스토어.

| 컬럼 | 타입 |
|------|------|
| `key` | text PK |
| `value` | text |

---

## Qdrant 컬렉션

| 컬렉션 | 용도 | 청크 크기 |
|--------|------|----------|
| `research_rag` | 리서치 결과 → RAG 채팅 | 600자, 80자 오버랩 |
| `experience_rag` | 경험 항목 검색 | 전체 텍스트 |
| `document_rag` | 문서 내용 검색 | 600자 |

- 임베딩 모델: `nomic-embed-text` (Ollama, 768차원)
- 메타데이터: `sessionId`, `itemId`, `chunkIndex`

---

## 주의사항 (TypeORM + SQLite)

`string | null` 컬럼은 반드시 타입 명시가 필요합니다:

```ts
// ✅ 올바른 방법
@Column({ type: 'text', nullable: true })
field: string | null;

// ❌ 오류 발생 (TypeORM이 타입 추론 실패)
@Column({ nullable: true })
field: string | null;
```
