import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';

// ── 포트 상수 ────────────────────────────────────────────────────────────────
const BE_PORT = 3001;
const FE_PORT = 3000;

// ── 경로 헬퍼 ────────────────────────────────────────────────────────────────
const isPacked = app.isPackaged;

function resourcePath(...segments: string[]): string {
  return isPacked
    ? path.join(process.resourcesPath, ...segments)
    : path.join(__dirname, '..', ...segments);
}

// ── 상태 ──────────────────────────────────────────────────────────────────────
let beProcess: ChildProcess | null = null;
let feProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
/** BE/FE가 모두 기동 완료된 뒤 true로 설정 — 그 전까지 activate 무시 */
let serversReady = false;

// ── userData 초기화 ──────────────────────────────────────────────────────────
function initUserData(): string {
  const userData = app.getPath('userData');
  for (const dir of ['data', 'media/data/backgrounds']) {
    fs.mkdirSync(path.join(userData, dir), { recursive: true });
  }
  const envPath = path.join(userData, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(
      envPath,
      [
        '# ResearchAI 설정 파일',
        '# API 키를 입력하세요.',
        '',
        'ANTHROPIC_API_KEY=',
        'OPENAI_API_KEY=',
        'GOOGLE_API_KEY=',
        '',
        '# 웹 검색 (선택)',
        'TAVILY_API_KEY=',
        'SERPER_API_KEY=',
        '',
        '# Ollama 로컬 AI (선택)',
        'OLLAMA_BASE_URL=http://localhost:11434',
      ].join('\n'),
    );
  }
  return userData;
}

function parseEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && val) result[key] = val;
  }
  return result;
}

// ── health check ─────────────────────────────────────────────────────────────
function waitForPort(port: number, timeout = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Port ${port} did not open within ${timeout / 1000}s`));
        } else {
          setTimeout(attempt, 800);
        }
      });
      // req.destroy()가 error 이벤트를 다시 발생시키지 않도록 타임아웃 후 destroy
      const t = setTimeout(() => req.destroy(), 500);
      req.on('close', () => clearTimeout(t));
    };
    attempt();
  });
}

// ── BE/FE 프로세스 시작 ───────────────────────────────────────────────────────
function startBackend(userData: string): void {
  const beEntry = resourcePath('BE', 'dist', 'main.js');
  const envVars = parseEnvFile(path.join(userData, '.env'));
  beProcess = spawn(process.execPath, [beEntry], {
    env: {
      ...process.env,
      ...envVars,
      NODE_ENV: 'production',
      PORT: String(BE_PORT),
      DATABASE_PATH: path.join(userData, 'data', 'sessions.db'),
      MEDIA_PATH: path.join(userData, 'media'),
    },
    cwd: resourcePath('BE'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  beProcess.stdout?.on('data', (d) => console.log('[BE]', d.toString().trim()));
  beProcess.stderr?.on('data', (d) => console.error('[BE]', d.toString().trim()));
  beProcess.on('exit', (code) => console.log(`[BE] exited: ${code}`));
}

function startFrontend(): void {
  const feEntry = resourcePath('FE', '.next', 'standalone', 'server.js');
  feProcess = spawn(process.execPath, [feEntry], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(FE_PORT),
      HOSTNAME: '127.0.0.1',
    },
    cwd: resourcePath('FE', '.next', 'standalone'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  feProcess.stdout?.on('data', (d) => console.log('[FE]', d.toString().trim()));
  feProcess.stderr?.on('data', (d) => console.error('[FE]', d.toString().trim()));
  feProcess.on('exit', (code) => console.log(`[FE] exited: ${code}`));
}

// ── 스플래시 ──────────────────────────────────────────────────────────────────
function createSplash(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html><html><head><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:rgba(15,15,20,0.92);backdrop-filter:blur(20px);
             border-radius:20px;display:flex;flex-direction:column;
             align-items:center;justify-content:center;height:100vh;
             font-family:-apple-system,sans-serif;color:#fff}
        .logo{font-size:28px;font-weight:700;letter-spacing:-.5px;margin-bottom:8px}
        .sub{font-size:13px;color:rgba(255,255,255,.45);margin-bottom:32px}
        .bar{width:200px;height:3px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden}
        .fill{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:3px;
              animation:slide 1.6s ease-in-out infinite}
        @keyframes slide{0%{width:0%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0%;margin-left:100%}}
        .status{margin-top:16px;font-size:12px;color:rgba(255,255,255,.3)}
      </style></head><body>
        <div class="logo">ResearchAI</div>
        <div class="sub">서비스를 시작하는 중...</div>
        <div class="bar"><div class="fill"></div></div>
        <div class="status">잠시만 기다려 주세요</div>
      </body></html>
    `)}`,
  );
  return splash;
}

// ── 메인 창 생성 ──────────────────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const preloadPath = isPacked
    ? path.join(process.resourcesPath, 'app', 'electron', 'dist', 'preload.js')
    : path.join(__dirname, 'preload.js');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f14',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // maximize 상태 → FE로 전달 (isDestroyed 방어)
  win.on('maximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximizeChange', true);
  });
  win.on('unmaximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximizeChange', false);
  });

  // 창이 닫히면 반드시 null로 초기화
  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

// ── IPC 핸들러 (앱 전체에서 1회만 등록) ─────────────────────────────────────
function setupIPC(): void {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
}

// ── 앱 진입점 ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const userData = initUserData();

  // IPC 핸들러는 앱 전체에서 단 1회 등록
  setupIPC();

  const splash = createSplash();

  startBackend(userData);
  startFrontend();

  try {
    await Promise.all([
      waitForPort(BE_PORT, 60_000),
      waitForPort(FE_PORT, 60_000),
    ]);
  } catch (err) {
    if (!splash.isDestroyed()) splash.destroy();
    dialog.showErrorBox(
      'ResearchAI 시작 실패',
      `서버를 시작하지 못했습니다.\n\n${(err as Error).message}\n\n앱을 다시 실행해 주세요.`,
    );
    app.quit();
    return;
  }

  // 서버 준비 완료 — 이 시점부터 activate 핸들러 동작 허용
  serversReady = true;

  mainWindow = createMainWindow();
  mainWindow.loadURL(`http://127.0.0.1:${FE_PORT}`);
  mainWindow.once('ready-to-show', () => {
    if (!splash.isDestroyed()) splash.destroy();
    mainWindow?.show();
    mainWindow?.focus();
  });
});

// ── macOS: Dock 아이콘 클릭 시 기존 창만 앞으로 ─────────────────────────────
app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── 앱 종료 처리 ──────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  killChildren();
  app.quit();
});

// 앱 완전 종료 시(Cmd+Q) 프로세스 정리
app.on('before-quit', killChildren);

function killChildren(): void {
  if (beProcess && !beProcess.killed) {
    beProcess.kill('SIGTERM');
    beProcess = null;
  }
  if (feProcess && !feProcess.killed) {
    feProcess.kill('SIGTERM');
    feProcess = null;
  }
}
