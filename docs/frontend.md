# 프론트엔드 구조

Next.js 14 App Router + Tailwind CSS v4. 포트 `:3000`.

---

## 페이지 라우트

| 경로 | 파일 | 설명 |
|------|------|------|
| `/` | `app/page.tsx` | 루트 리다이렉트 |
| `/main` | `app/main/page.tsx` | 리서치 홈 (주제 입력, 모델 선택, 세션 목록) |
| `/sessions/[id]` | `app/sessions/[id]/page.tsx` | 리서치 세션 결과 (태스크 카드, 채팅) |
| `/doc-write` | `app/doc-write/page.tsx` | 문서 에디터 (AI 어시스턴트 포함) |
| `/doc-store` | `app/doc-store/page.tsx` | 저장 문서·경험 관리 |
| `/doc-parse` | `app/doc-parse/page.tsx` | 문서 업로드·파싱·Q&A |
| `/settings` | `app/settings/page.tsx` | 설정 (API 키, 프롬프트, 모델) |

---

## 전역 컴포넌트

**`app/components/AppShell.tsx`**
전체 레이아웃 래퍼. 사이드바·헤더 포함.

**`app/components/DocStoreModal.tsx`**
doc-store를 모달로 열 때 사용하는 래퍼.

**`app/contexts/ResearchQueueContext.tsx`**
전역 큐 상태 (SSE `/queue/events` 수신). `useResearchQueue()` 훅으로 접근.

---

## 색상 테마 (globals.css)

6개 CSS 변수만 변경하면 전체 앱 색상이 바뀜.

```css
:root {
  --brand-dark:    #003366;   /* 짙은 네이비 */
  --brand-primary: #0055A5;   /* 기본 파랑   */
  --brand-accent:  #00A0DF;   /* 하늘색      */
  --brand-bg:      #F5F7FA;   /* 페이지 배경 */
  --brand-text:    #1A2B3D;   /* 기본 텍스트 */
  --brand-muted:   #6B7A8F;   /* 보조 텍스트 */
}
```

Tailwind의 `indigo` 색상 스케일도 위 변수로 오버라이드됨:
- `indigo-600` → `--brand-primary`
- `indigo-400` → `--brand-accent`
- `indigo-800` → `--brand-dark`

**하이라이트 애니메이션**: `highlight-pulse` keyframe 정의됨 (doc-write 단락 포커스용).

---

## API 호출 함수 (`app/lib/api/`)

모든 API 함수는 `apiFetch()` 또는 SSE 스트리밍을 사용.

```typescript
// base.ts
apiFetch<T>(path, options?): Promise<T>
readSSE<T>(res, onEvent): Promise<void>
```

### documents.ts

```typescript
interface SavedDocument {
  id: string; title: string; companyName: string | null;
  content: string; createdAt: string; updatedAt: string;
}

getDocuments(): Promise<SavedDocument[]>
getDocument(id: string): Promise<SavedDocument>
createDocument(title, content, companyName?): Promise<SavedDocument>
updateDocument(id, { title?, content?, companyName? }): Promise<SavedDocument>
deleteDocument(id): Promise<void>
```

### experiences.ts

```typescript
interface Experience {
  id: string; title: string; content: string;
  category?: string; aiCategories?: string[] | null;
  sourceDocId?: string | null;
  createdAt: string; updatedAt: string;
}

interface ExperienceSearchResult {
  id: string; title: string; content: string; category?: string; score: number;
}

getExperiences(): Promise<Experience[]>
createExperience(data: { title, content, category?, sourceDocId? }): Promise<Experience>
updateExperience(id, data): Promise<Experience>
deleteExperience(id): Promise<void>
searchExperiences(query, topK?): Promise<ExperienceSearchResult[]>
suggestCategories(id, model): Promise<{ categories: string[] }>
extractExperiencesFromDoc(content, model): Promise<{ title, content }[]>
```

### ai.ts

```typescript
// Write Assist
enqueueWriteAssist(content, instruction, model): Promise<{ jobId }>
streamWriteAssist(jobId, onEvent, signal?): Promise<void>

// Company Profile
enqueueCompanyProfile(companyName, model): Promise<{ jobId }>
streamCompanyProfile(jobId, onEvent, signal?): Promise<void>

// 기타
getRunningOllamaModels(): Promise<OllamaRunningModel[]>
generateSessionTitle(topic, tasks, model): Promise<{ title }>
```

### queue.ts

```typescript
getQueueStatus(): Promise<QueueStatus>
cancelSummary(sessionId): Promise<void>
```

### gmail.ts

```typescript
getAuthUrl(): Promise<{ url: string }>
getStatus(): Promise<{ connected: boolean, email?: string }>
getMessages(maxResults?): Promise<any[]>
disconnect(): Promise<{ success: boolean }>
```

---

## `/doc-write` 페이지

에디터 + AI 어시스턴트 + 경험 RAG 검색을 가로 분할 레이아웃으로 제공.

### URL 파라미터

| 파라미터 | 설명 |
|---------|------|
| `?docId=uuid` | 기존 문서 불러오기 모드 |
| `?highlight=ENCODED_TEXT` | 특정 단락으로 스크롤 + 하이라이트 (경험 수정 진입 시) |

### Hooks

**`useEditor`** — 에디터 상태 관리
```typescript
{
  content, setContent,
  mode: 'edit' | 'preview', setMode,
  selectedText, selectedRange,
  replaceSelected(replacement),
  contextMenu, textareaRef,
  highlightFlash,          // highlight 파라미터 진입 시 2.5초 펄스
  handleTextareaSelect, handleContextMenu,
  applyToolbar, handleExport,
  words, chars,
}
```
- `isExistingDoc`: `docId` 파라미터 있으면 true → localStorage draft 미사용
- `highlight` 파라미터: content 로드 후 해당 텍스트 찾아 스크롤 + 선택 + `highlightFlash = true`

---

**`useDocSave`** — 문서 저장/로드
```typescript
// 호출: useDocSave(setCompanyName)
{
  savedDocId, savedDocTitle,
  saveModal, setSaveModal,
  saveTitleInput, setSaveTitleInput,
  saving, saveSuccess,
  handleSave(content, companyName, title?),
}
```
- `docId` 파라미터 변경 시 document 로드 → content, companyName 설정
- 신규 문서: 제목 입력 모달 → `createDocument` 호출
- 기존 문서: 바로 `updateDocument` 호출

---

**`useAiAssist`** — AI 어시스턴트 메시지 관리
```typescript
{
  model, setModel,
  messages: ChatMessage[],
  streamingContent,
  aiLoading, aiError,
  runAssist(instruction, userLabel?),
  copyMessage(id),
  copiedId,
  clearMessages,
}
```
- messages: `localStorage`에 자동 저장 (hydration 방지: `useState([])` + `useEffect` 로드)
- `runAssist`: `enqueueWriteAssist` → `streamWriteAssist` SSE 수신

---

**`useRag`** — 경험 RAG 검색
```typescript
{
  ragQuery, setRagQuery,
  ragResults: ExperienceSearchResult[],
  selectedExperiences, toggleExperience,
  ragLoading, ragExpanded, setRagExpanded,
  searchRag(),
}
```

---

**`useResize`** — Split View 리사이저
```typescript
{
  splitRatio: number,   // 0~1, 기본 0.5
  isDragging,
  handleMouseDown,
}
```

### Components

**`EditorPanel`** — 왼쪽 에디터 패널

Props:
```typescript
{
  content, setContent,
  mode, textareaRef, words, chars,
  onTextareaSelect, onContextMenu,
  pendingImprovement: { original, improved, start } | null,
  onAccept, onRevert,
  companyName, setCompanyName,
  jobTitle, setJobTitle,
  onFetchProfile, profileLoading,
  highlightFlash?,         // true이면 테두리 펄스 애니메이션
}
```

- 상단 바: 지원 기업 + 직무 입력 → 인재상 조회 버튼
- 우측 상단: 글자수·단어수
- 편집 모드: `<textarea>` (하이라이트 플래시 래퍼 포함)
- 인라인 diff 뷰: `pendingImprovement` 있을 때 원문/개선문 나란히 표시
- 미리보기 모드: ReactMarkdown 렌더링

---

**`AiPanel`** — 오른쪽 AI 패널

Props:
```typescript
{
  messages, streamingContent, aiLoading,
  model, setModel,
  selectedText,
  onRunAssist(instruction, userLabel?, skipCompanyCtx?),
  companyProfile, profileLoading,
  ragResults, selectedExperiences, toggleExperience,
  ragQuery, setRagQuery, searchRag, ragLoading, ragExpanded, setRagExpanded,
}
```

퀵 액션 목록 (`QUICK_ACTIONS`):
| 키 | 레이블 | skipCompanyCtx |
|----|--------|----------------|
| `evaluate` | 글 평가 | true |
| `plagiarism` | AI 표절률 검사 | true |
| `improve` | 표현 개선 | false |
| `formal` | 격식체 변환 | false |

글 평가 프롬프트 분석 항목: 반복 단어, 진부한 표현, 애매한 표현, 긴 문장, 논리적 흐름, 질문 적절성, 종합 개선 제안.

---

**`_types.ts`**
```typescript
type ChatMessage = {
  id: string; role: 'user' | 'assistant'; content: string;
};

type AssistAction = {
  key: string; label: string; icon: React.ReactNode;
  instruction: (content: string) => string;
  skipCompanyCtx?: boolean;   // true면 기업 컨텍스트 없이 호출
};
```

### `handleRunAssist` 동작

```typescript
const handleRunAssist = (instruction, userLabel?, skipCompanyCtx?) => {
  const companyCtx = skipCompanyCtx
    ? ""
    : companyProfile
      ? `## 지원 기업 정보\n${companyName} ${jobTitle}\n${companyProfile}`
      : "";
  ai.runAssist(companyCtx + instruction, userLabel);
};
```

---

## `/doc-store` 페이지

저장 문서(Docs) ↔ 경험(Experiences) 탭 전환 UI.

### State

```typescript
tab: 'docs' | 'exp'
extractModal: { doc: SavedDocument, items: { title, content }[] } | null
```

### Hooks

**`useDocuments`**: `getDocuments()` 호출, 검색 필터링
**`useExperiences`**: `getExperiences()` 호출, 검색 + 카테고리 필터링
**`useCardPopup`**: 카드 호버 팝업 상태 관리
**`useAiSuggest`**: 경험별 AI 카테고리 추천 상태 관리

### Components

| 컴포넌트 | 역할 |
|----------|------|
| `DocsTab` | 문서 카드 그리드 (lg:2열, xl:3열) |
| `ExperienceTab` | 경험 카드 그리드 + 카테고리 필터 |
| `DocumentCard` | 문서 카드 (companyName 뱃지 포함) |
| `ExperienceCard` | 경험 카드 (aiCategories 뱃지 포함) |
| `CardPopup` | 카드 위 팝업 메뉴 (수정·삭제·경험추출 등) |
| `ExperienceModal` | 경험 생성/편집 모달 |
| `ExtractExpModal` | 추출된 경험 선택 후 저장 모달 |

### 문서 → 경험 추출 흐름

```
1. DocumentCard 호버 → CardPopup "경험 추출" 버튼 클릭
2. page.tsx: extractExperiencesFromDoc(doc.content, model) 호출
3. API: POST /experiences/extract-from-doc → { title, content }[]
4. ExtractExpModal 열림 — 추출된 항목 체크박스 선택
5. 저장: createExperience({ title, content, sourceDocId: doc.id })
6. sourceDocId 덕분에 나중에 CardPopup → 수정 클릭 시
   → /doc-write?docId={sourceDocId}&highlight={encodeURIComponent(content)} 이동
```

### 경험 수정 → 원문서 이동 흐름

```
CardPopup (experience, sourceDocId 있음)
  → 수정 클릭
  → window.location.href = /doc-write?docId={sourceDocId}&highlight={encoded content}

doc-write 진입:
  → useDocSave: docId로 문서 로드
  → useEditor: highlight 파라미터 감지
  → 해당 텍스트 찾아 setSelectionRange + scrollTextareaToIndex
  → highlightFlash = true (2.5초 후 false)
  → EditorPanel: highlightFlash=true → 인디고 테두리 펄스 애니메이션
```

---

## `/sessions/[id]` 페이지

### Components

| 컴포넌트 | 역할 |
|----------|------|
| `TaskCard` | 태스크별 마크다운 결과 + 소스 탭 |
| `ChatSection` | 하단 RAG 채팅 UI |
| `QueueWidget` | 우하단 작업 진행 위젯 (SSE 수신) |
| `SessionHeader` | 세션 제목, 모델 뱃지, 진행률 |
| `ModelSelector` | AI 모델 선택 |
| `PipelineTerminal` | LightResearch 실시간 로그 |

**TaskCard + ChatSection 폰트 설정:**
```
prose font-sans [&_p]:leading-loose [&_p]:text-base
```

---

## 공통 패턴

### Hydration 방지 (localStorage 초기화)
```typescript
// 잘못된 방법 (SSR/CSR 불일치)
const [content, setContent] = useState(localStorage.getItem('key') ?? '');

// 올바른 방법
const [content, setContent] = useState('');
useEffect(() => {
  setContent(localStorage.getItem('key') ?? '');
}, []);
```
단어수 등 SSR에서 알 수 없는 값은 `suppressHydrationWarning` 추가.

### SSE 스트리밍 패턴
```typescript
// 1. 인큐
const { jobId } = await enqueueWriteAssist(content, instruction, model);

// 2. 스트림
await streamWriteAssist(jobId, (event) => {
  if (event.type === 'chunk') setStreamingContent(prev => prev + event.text);
  if (event.type === 'done')  finalizeMessage();
}, abortController.signal);
```

### 새 기능 추가 시 체크리스트

**BE에 새 AI 작업 추가:**
1. `QueueJob.TaskType`에 enum 값 추가
2. `{name}-executor.service.ts` 생성 (enqueue → SSE stream 패턴)
3. `queue.service.ts`의 `executeJob`에 케이스 추가 + enqueue/cancel/stream 메서드 추가
4. `queue.controller.ts`에 3개 엔드포인트 추가 (POST enqueue, GET stream SSE, DELETE cancel)
5. `queue.module.ts`에 executor 등록

**FE에 새 퀵 액션 추가:**
1. `AiPanel.tsx`의 `QUICK_ACTIONS` 배열에 항목 추가
2. `skipCompanyCtx` 여부 결정 (글 평가·표절 검사는 true)
3. 필요시 `icons.tsx`에 아이콘 추가
