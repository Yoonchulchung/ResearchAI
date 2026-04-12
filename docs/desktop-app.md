# macOS 데스크탑 앱 전환 설계

## 목표

현재 웹 브라우저에서 실행하는 구조(NestJS + Next.js)를 macOS 네이티브 앱(`.app` / `.dmg`)으로 배포 가능한 구조로 전환한다.
사용자는 브라우저 없이 앱을 실행하면 바로 사용할 수 있어야 한다.

---

## 기술 선택: Electron

| 후보 | 장점 | 단점 | 결론 |
|------|------|------|------|
| **Electron** | Node.js 내장, NestJS 그대로 실행, 생태계 성숙 | 번들 크기 큼 (~150MB) | **채택** |
| Tauri | 매우 가볍지만 Rust 필요, NestJS 실행 불가 | 백엔드 구조 전면 재작성 필요 | 기각 |
| PWA | 설치 가능하지만 네이티브 기능 없음 | Qdrant 등 로컬 프로세스 제어 불가 | 기각 |

Electron은 내부에 Node.js 런타임을 포함하므로 NestJS를 **child process**로 실행할 수 있다.

---

## 최종 아키텍처

```
macOS .app 번들
└── Electron 메인 프로세스 (main.ts)
    ├── child_process: NestJS BE  (port 3001)  ← node dist/main.js
    ├── child_process: Next.js FE (port 3000)  ← node .next/standalone/server.js
    └── BrowserWindow → http://localhost:3000
```

- **포트는 고정** (3001 BE, 3000 FE). 데스크탑 환경에서 포트 충돌 가능성이 낮고, FE 코드 전체에 이미 localhost:3001이 하드코딩되어 있어 최소 변경으로 유지.
- Qdrant, Ollama는 **선택적 외부 서비스** — 앱이 시작될 때 실행 중이면 연결, 없으면 해당 기능만 비활성화 (기존 동작 유지).

---

## 빌드 결과물 구조

```
dist/
└── ResearchAI-1.0.0-arm64.dmg    ← 배포 파일
└── mac-arm64/
    └── ResearchAI.app/
        └── Contents/
            └── Resources/
                ├── app.asar              ← Electron + 메인 프로세스
                └── app.asar.unpacked/
                    ├── BE/dist/          ← NestJS 컴파일 결과
                    ├── BE/node_modules/  ← 네이티브 모듈 포함
                    └── FE/.next/standalone/  ← Next.js 독립 서버
```

`better-sqlite3`는 네이티브 Node.js 애드온이므로 `app.asar.unpacked`에 위치해야 한다.

---

## 폴더 구조 변경

```
ResearchAI/                        ← 기존 구조 유지
├── electron/                      ← 신규
│   ├── main.ts                    ← Electron 메인 프로세스
│   ├── preload.ts                 ← contextBridge (창 제어용)
│   └── tsconfig.json
├── electron-builder.yml           ← 신규: macOS 패키징 설정
├── package.json                   ← 신규: 루트 패키지 (Electron 의존성)
├── BE/                            ← 기존 (수정 최소)
└── FE/                            ← 기존 (next.config.ts 수정)
```

루트에 새 `package.json`을 추가한다. BE는 pnpm, FE는 npm을 그대로 사용한다.

---

## 변경이 필요한 파일

### 1. `FE/next.config.ts` — standalone 출력 모드 추가

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
};
```

`standalone` 모드는 `node_modules` 없이 실행 가능한 `server.js`를 `.next/standalone/`에 생성한다. Electron 번들에 Next.js `node_modules` 전체를 포함하지 않아도 된다.

### 2. `BE/src/main.ts` — PORT 환경변수 지원

```ts
await app.listen(process.env.PORT ?? 3001);
```

개발 시에는 기존과 동일하게 3001, Electron에서도 동일하지만 유연성 확보.

### 3. `FE/app/settings/pipeline/AiCallLogPanel.tsx` — 기본 포트 수정

기존 코드에 `NEXT_PUBLIC_API_URL ?? "http://localhost:4000"` 오타가 있음 → `3001`로 수정.

### 4. `electron/main.ts` — 메인 프로세스 (신규)

주요 역할:
1. `app.getPath('userData')`에서 `.env` 파일 로드 (API 키 등 사용자 설정)
2. `data/` 디렉터리를 userData에 생성 (DB, 미디어 파일 위치)
3. NestJS child process 시작 → health check poll (`GET /api`)
4. Next.js child process 시작 → health check poll
5. `BrowserWindow` 생성 후 `http://localhost:3000` 로드
6. 로딩 중 스플래시 화면 표시
7. 앱 종료 시 두 child process kill

```
환경변수 주입:
  BE child: PORT=3001, NODE_ENV=production, DATABASE_PATH=<userData>/data/sessions.db
  FE child: PORT=3000, HOSTNAME=127.0.0.1
```

### 5. `electron/preload.ts` — 네이티브 창 제어용 (신규)

```ts
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  platform: process.platform,
});
```

기존 `titleBarStyle: 'hiddenInset'`을 사용하면 macOS 신호등 버튼이 그대로 유지되므로 preload는 최소한으로.

### 6. `electron-builder.yml` — 패키징 설정 (신규)

```yaml
appId: com.researchai.app
productName: ResearchAI
directories:
  output: dist

mac:
  target: [dmg, zip]
  arch: [arm64, x64]
  icon: electron/assets/icon.icns

files:
  - electron/dist/**       # 컴파일된 메인 프로세스
  - "!BE/**"               # BE는 아래 extraResources에서 별도 처리
  - "!FE/**"

extraResources:
  - from: BE/dist
    to: BE/dist
  - from: FE/.next/standalone
    to: FE/.next/standalone
  - from: FE/.next/static
    to: FE/.next/standalone/.next/static
  - from: FE/public
    to: FE/.next/standalone/public

asarUnpack:
  - BE/node_modules/better-sqlite3/**
  - BE/node_modules/bufferutil/**
```

### 7. 루트 `package.json` (신규)

```json
{
  "name": "research-ai-desktop",
  "version": "1.0.0",
  "main": "electron/dist/main.js",
  "scripts": {
    "dev": "...",
    "build": "...",
    "dist": "electron-builder"
  },
  "devDependencies": {
    "electron": "^35.0.0",
    "electron-builder": "^26.0.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

---

## 데이터 경로 처리

패키징 후 앱 내부는 읽기 전용이므로 사용자 데이터는 `app.getPath('userData')`로 분리.

| 항목 | 개발 시 | 패키징 후 |
|------|--------|----------|
| SQLite DB | `BE/data/sessions.db` | `~/Library/Application Support/ResearchAI/data/sessions.db` |
| 미디어 파일 | `BE/media/` | `~/Library/Application Support/ResearchAI/media/` |
| .env | `BE/.env` | `~/Library/Application Support/ResearchAI/.env` |
| Qdrant 데이터 | `data/qdrant/` | `~/Library/Application Support/ResearchAI/qdrant/` |

NestJS에 `DATABASE_PATH`, `MEDIA_PATH` 환경변수를 주입하여 경로를 동적으로 처리.

BE에서 수정이 필요한 부분:
- `database.module.ts`: `process.env.DATABASE_PATH ?? 'data/sessions.db'`
- `main.ts`: `useStaticAssets`의 backgrounds 경로를 env 기반으로

---

## 개발 워크플로우

기존 `./run.sh dev`는 그대로 유지. Electron 개발 모드 추가:

```bash
# 기존 (웹 개발)
./run.sh dev

# 신규 (Electron 개발)
npm run dev          # 루트에서: BE + FE 빌드 후 electron . 실행

# 배포 빌드
npm run dist         # DMG 생성
```

---

## 구현 순서

1. `FE/next.config.ts` — `output: 'standalone'` 추가
2. `BE/src/main.ts` — PORT env, 경로 환경변수 지원
3. `BE/src/database/database.module.ts` — DATABASE_PATH env 지원
4. 루트 `package.json` 생성
5. `electron/tsconfig.json` 생성
6. `electron/preload.ts` 생성
7. `electron/main.ts` 생성 (핵심)
8. `electron-builder.yml` 생성
9. 루트 `package.json` scripts 완성 (build, dev, dist)
10. AiCallLogPanel 포트 오타 수정

---

## 미결 사항 / 이후 고려

- **API 키 설정 UI**: 첫 실행 시 `.env`가 없으면 설정 화면을 먼저 띄우는 온보딩 흐름 필요 (현재 `/settings`에서 수동 설정 가능한지 확인 필요)
- **자동 업데이트**: `electron-updater` 연동 (추후)
- **코드 서명**: 배포 시 Apple Developer ID 서명 필요 (공증 Notarization)
- **Qdrant 번들링**: Qdrant 바이너리를 앱에 포함하려면 `extraResources`에 추가하고 Electron에서 직접 spawn하는 로직 추가 필요 (현재는 외부 실행 가정)
