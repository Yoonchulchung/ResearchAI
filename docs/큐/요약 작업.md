# 요약 작업 (SUMMARY Job)

요약 작업은 세션 내 완료된 딥리서치 결과들을 LLM이 하나의 요약문으로 정리하는 작업입니다.

---

## 상태 흐름 (SummaryState)

```
IDLE → PENDING → RUNNING → DONE
                         → ERROR
                         → STOPPED
```

| 상태      | 설명                              |
|-----------|-----------------------------------|
| IDLE      | 초기 상태 (세션 생성 시 기본값)   |
| PENDING   | 큐에 등록됨, 실행 대기 중         |
| RUNNING   | LLM 스트리밍 진행 중              |
| DONE      | 요약 완료, summary 텍스트 저장됨  |
| ERROR     | 오류 발생                         |
| STOPPED   | 사용자에 의해 중단됨              |

---

## API

| 메서드   | 경로                                  | 설명                        |
|----------|---------------------------------------|-----------------------------|
| POST     | /queue/sessions/:id/summary           | 요약 작업 큐 등록           |
| DELETE   | /queue/sessions/:id/summary           | 요약 작업 중단              |
| SSE      | /queue/sessions/:id/summary/stream    | 요약 결과 실시간 스트리밍   |

---

## 작업 등록 흐름 (POST)

1. `buildSummaryContext()` 로 완료된 태스크 존재 여부 확인 — 없으면 400 반환
2. `summaryState` → `PENDING` 으로 업데이트
3. 큐에 `SUMMARY` 타입 Job 등록
4. 큐가 비어있으면 즉시 실행, 아니면 앞 작업 완료 후 실행

## 실행 흐름 (executeJob)

1. `summaryState` → `RUNNING`
2. `buildSummaryContext()` 로 프롬프트 구성 (완료된 태스크들의 aiResult 취합)
3. `streamOllama()` 로 LLM 스트리밍 시작
4. 청크마다 `subject.next({ type: 'chunk', text })` → SSE로 FE 전달
5. 스트리밍 완료 시:
   - `saveSummary()` 로 전체 텍스트 DB 저장
   - `subject.next({ type: 'done' })` → SSE 종료
   - `summaryState` → `DONE`

## 스트리밍 접근 흐름 (SSE)

`getSummaryStream()` 에서 `summaryState` 기준으로 분기:

| summaryState     | 반환값                              |
|------------------|-------------------------------------|
| DONE             | 저장된 summary를 즉시 chunk + done  |
| PENDING / RUNNING| 진행 중인 Subject Observable 반환   |
| 그 외            | null → 컨트롤러에서 400 반환        |

> FE는 POST 직후 SSE 연결해야 합니다. 스트리밍이 완료된 후 연결하면 DONE 분기로 처리됩니다.

## 중단 흐름 (DELETE)

1. 해당 세션의 SUMMARY Job 탐색
2. PENDING / RUNNING 상태이면 abort 신호 전송
3. Subject에 `{ type: 'error', message: '서머리가 중단되었습니다.' }` 전송 후 complete
4. `summaryState` → `STOPPED`

## 오류 흐름 (catch)

1. Subject에 `{ type: 'error', message }` 전송 후 complete
2. `summaryState` → `ERROR`
