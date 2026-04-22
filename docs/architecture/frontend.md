# 프론트엔드 구조 (Next.js 14)

App Router + Tailwind CSS v4. 포트 `:3000`.

---

## 페이지 라우트

| 경로 | 설명 |
|------|------|
| `/` | 루트 → `/main` 리다이렉트 |
| `/landing` | 랜딩 페이지 (미로그인 사용자) |
| `/login` | 로그인·회원가입 |
| `/main` | 대시보드 (뉴스·날씨·캘린더·마켓·지도·검색) |
| `/sessions/[id]` | 리서치 세션 상세 (태스크 카드, 채팅, DetailPanel) |
| `/doc-write` | 문서 에디터 (AI 어시스턴트 포함) |
| `/doc-store` | 저장 문서·경험 관리 |
| `/settings/overview` | API 키 설정, 기본 모델, 사용량 |
| `/settings/analytics` | 토큰 사용·비용 분석 |
| `/settings/analytics/logs` | AI 호출 이력 |
| `/settings/pipeline` | 파이프라인 테스트 (admin 전용) |
| `/settings/system` | 시스템 설정 |
| `/settings/background` | 배경 이미지 설정 |

---

## 레이아웃

### 데스크탑 (≥768px) — `AppShell`

```
┌──────────┬─────────────────────────────────┐
│ Sidebar  │           Page Content          │
│ (세션·   │                                 │
│  메뉴)   │                                 │
└──────────┴─────────────────────────────────┘
```

### 모바일 (<768px) — `MobileShell`

```
┌─────────────────────────────────┐
│         MobileHeader            │
├─────────────────────────────────┤
│           Page Content          │
├─────────────────────────────────┤
│     BottomNav (홈·세션·문서·설정) │
└─────────────────────────────────┘
```

- `SessionsDrawer`: 슬라이드업 시트로 세션 목록 표시
- 모바일에서 DetailPanel은 오른쪽에서 슬라이드-인

---

## 주요 컴포넌트

### `components/TopicInput/`

연구 주제 입력 + 모델 선택 + 파일 첨부.

| 서브컴포넌트 | 역할 |
|-------------|------|
| `ModelSelect.tsx` | 클라우드/로컬/웹 모델 드롭다운 |
| `UploadDropdown.tsx` | 파일 업로드 (PDF, 이미지) |
| `ImageChip.tsx` | 첨부 이미지 미리보기 칩 |
| `DocChip.tsx` | 첨부 문서 칩 |
| `useFileUpload.ts` | 드래그앤드롭·클립보드 붙여넣기 훅 |

### `main/components/`

| 컴포넌트 | 설명 |
|---------|------|
| `WorldMapCard` | 직교 투영 지구본 (자동 회전, 드래그, 스크롤 줌, 분쟁 지역 표시) |
| `NewsSection` | 카테고리별 뉴스 요약 |
| `WeatherCard` | 날씨 위젯 |
| `CalendarSection` | 캘린더 위젯 |
| `MarketCard` | 주가·환율 |
| `SummaryCard` | 최근 리서치 요약 |
| `SearchPromptCard` | 주제 입력창 |
| `EmailCard` | Gmail 메일 목록 |

### `sessions/components/`

| 컴포넌트 | 설명 |
|---------|------|
| `TaskCard` | 개별 리서치 태스크 카드 (상태·신뢰도·결과 표시) |
| `DetailPanel` | 전체 결과 통합 뷰어 (글자 크기·배경색 조절) |
| `TaskPanel` | 태스크별 상세·DuckDuckGo 결과 패널 |
| `SessionHeader` | 세션 헤더 (모델 선택, 전체 실행, 내보내기) |
| `ChatSection` | RAG 채팅 영역 |
| `ChatInputArea` | 채팅 입력 (파일 첨부, 모델 선택) |
| `SessionSkeleton` | 로딩 스켈레톤 |

---

## 컨텍스트

| Context | 내용 |
|---------|------|
| `AuthContext` | 로그인 사용자 정보, `refreshUser()` |
| `ThemeContext` | `theme` (dark/light), `uiStyle` (default/glass) |
| `SidebarContext` | 사이드바 open 상태 |

---

## API 통신 (`lib/api/`)

| 파일 | 담당 엔드포인트 |
|------|---------------|
| `auth.ts` | `/auth/*` (로그인·회원가입·API 키·기본 모델) |
| `sessions.ts` | `/sessions/*` |
| `research.ts` | `/queue/research/*`, `/models` |
| `chat.ts` | `/chat/*` |
| `overview.ts` | `/overview/*` |
| `documents.ts` | `/documents/*` |
| `gmail.ts` | `/gmail/*` |
| `news.ts` | `/news/*` |
| `backgrounds.ts` | `/backgrounds/*` |

---

## 테마 시스템

```
ThemeContext.theme:   "dark" | "light"
ThemeContext.uiStyle: "default" | "glass"
```

- 두 축은 독립적으로 동작
- `isDark = theme === "dark"` (glass 여부와 별도 확인)
- glass 모드: `backdrop-blur` + `bg-white/10` 등 반투명 스타일

---

## 스크롤 위치 복원

세션 페이지와 DetailPanel은 **비율 기반** 스크롤 저장/복원을 사용합니다.

```ts
// 저장
const ratio = el.scrollTop / (el.scrollHeight - el.clientHeight);
sessionStorage.setItem(`scroll-ratio:${id}`, String(ratio));

// 복원 (ResizeObserver로 레이아웃 변경 시에도 동일 비율 유지)
el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
```

데스크탑↔모바일 전환 시 레이아웃이 바뀌어도 같은 위치를 유지합니다.
