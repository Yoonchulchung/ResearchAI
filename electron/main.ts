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

/** 패키징 여부에 따라 resources 하위 경로 반환 */
function resourcePath(...segments: string[]): string {
  return isPacked
    ? path.join(process.resourcesPath, ...segments)
    : path.join(__dirname, '..', ...segments);
}

// ── child process 참조 ───────────────────────────────────────────────────────
let beProcess: ChildProcess | null = null;
let feProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

// ── userData 초기화 ──────────────────────────────────────────────────────────
function initUserData() {
  const userData = app.getPath('userData');

  // 필요한 디렉터리 생성
  for (const dir of ['data', 'media/data/backgrounds']) {
    fs.mkdirSync(path.join(userData, dir), { recursive: true });
  }

  // 처음 실행 시 .env가 없으면 빈 파일 생성 (사용자가 API 키 직접 입력 가능)
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

/** .env 파일을 파싱해 key=value 객체로 반환 */
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
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Port ${port} did not open within ${timeout}ms`));
        } else {
          setTimeout(check, 600);
        }
      });
      req.setTimeout(500, () => req.destroy());
    };
    check();
  });
}

// ── NestJS BE 시작 ────────────────────────────────────────────────────────────
function startBackend(userData: string): void {
  const beEntry = resourcePath('BE', 'dist', 'main.js');
  const envVars = parseEnvFile(path.join(userData, '.env'));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...envVars,
    NODE_ENV: 'production',
    PORT: String(BE_PORT),
    DATABASE_PATH: path.join(userData, 'data', 'sessions.db'),
    MEDIA_PATH: path.join(userData, 'media'),
  };

  console.log(`[BE] Starting: node ${beEntry}`);
  beProcess = spawn(process.execPath, [beEntry], {
    env,
    cwd: resourcePath('BE'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  beProcess.stdout?.on('data', (d) => console.log('[BE]', d.toString().trim()));
  beProcess.stderr?.on('data', (d) => console.error('[BE]', d.toString().trim()));
  beProcess.on('exit', (code) => console.log(`[BE] exited with code ${code}`));
}

// ── Next.js FE 시작 ───────────────────────────────────────────────────────────
function startFrontend(): void {
  const feEntry = resourcePath('FE', '.next', 'standalone', 'server.js');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(FE_PORT),
    HOSTNAME: '127.0.0.1',
    // Next.js standalone이 static assets을 찾는 경로
    NEXT_SHARP_PATH: resourcePath('FE', '.next', 'standalone', 'node_modules', 'sharp'),
  };

  console.log(`[FE] Starting: node ${feEntry}`);
  feProcess = spawn(process.execPath, [feEntry], {
    env,
    cwd: resourcePath('FE', '.next', 'standalone'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  feProcess.stdout?.on('data', (d) => console.log('[FE]', d.toString().trim()));
  feProcess.stderr?.on('data', (d) => console.error('[FE]', d.toString().trim()));
  feProcess.on('exit', (code) => console.log(`[FE] exited with code ${code}`));
}

// ── 스플래시 / 로딩 창 ────────────────────────────────────────────────────────
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

  // 인라인 HTML로 로딩 화면 표시 (별도 파일 불필요)
  splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: rgba(15,15,20,0.92);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: -apple-system, sans-serif;
            color: #fff;
            overflow: hidden;
          }
          .logo { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; }
          .sub  { font-size: 13px; color: rgba(255,255,255,0.45); margin-bottom: 32px; }
          .bar  { width: 200px; height: 3px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
          .fill { height: 100%; background: linear-gradient(90deg,#6366f1,#8b5cf6); border-radius: 3px;
                  animation: slide 1.6s ease-in-out infinite; }
          @keyframes slide {
            0%   { width: 0%; margin-left: 0; }
            50%  { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
          }
          .status { margin-top: 16px; font-size: 12px; color: rgba(255,255,255,0.3); }
        </style>
      </head>
      <body>
        <div class="logo">ResearchAI</div>
        <div class="sub">서비스를 시작하는 중...</div>
        <div class="bar"><div class="fill"></div></div>
        <div class="status">잠시만 기다려 주세요</div>
      </body>
      </html>
    `)}`,
  );

  return splash;
}

// ── 메인 창 생성 ──────────────────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',  // macOS 신호등 버튼 유지, 타이틀바 숨김
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f14',
    webPreferences: {
      preload: isPacked
        ? path.join(process.resourcesPath, 'app', 'electron', 'dist', 'preload.js')
        : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // 외부 링크는 기본 브라우저로 열기
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // maximize 상태 변경을 FE로 전달
  win.on('maximize', () => win.webContents.send('window:maximizeChange', true));
  win.on('unmaximize', () => win.webContents.send('window:maximizeChange', false));

  return win;
}

// ── IPC 핸들러 ────────────────────────────────────────────────────────────────
function registerIPC(win: BrowserWindow) {
  ipcMain.handle('window:minimize', () => win.minimize());
  ipcMain.handle('window:maximize', () => {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle('window:close', () => win.close());
  ipcMain.handle('window:isMaximized', () => win.isMaximized());
}

// ── 앱 진입점 ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const userData = initUserData();

  // 스플래시 화면 먼저 표시
  const splash = createSplash();

  // BE / FE 동시에 시작
  startBackend(userData);
  startFrontend();

  // 두 서비스가 모두 준비될 때까지 대기
  try {
    await Promise.all([
      waitForPort(BE_PORT, 60_000),
      waitForPort(FE_PORT, 60_000),
    ]);
  } catch (err) {
    dialog.showErrorBox(
      'ResearchAI 시작 실패',
      `서버를 시작하지 못했습니다.\n\n${(err as Error).message}\n\n앱을 다시 실행해 주세요.`,
    );
    app.quit();
    return;
  }

  // 메인 창 생성 & 표시
  mainWindow = createMainWindow();
  registerIPC(mainWindow);

  mainWindow.loadURL(`http://127.0.0.1:${FE_PORT}`);
  mainWindow.once('ready-to-show', () => {
    splash.destroy();
    mainWindow!.show();
    mainWindow!.focus();
  });
});

// ── 앱 종료 처리 ──────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  killChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', killChildren);

app.on('activate', () => {
  // macOS: Dock 아이콘 클릭 시 창 복원
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
    // 이미 서버가 실행 중이므로 바로 창만 새로 생성
    mainWindow = createMainWindow();
    if (mainWindow) registerIPC(mainWindow);
    mainWindow.loadURL(`http://127.0.0.1:${FE_PORT}`);
    mainWindow.once('ready-to-show', () => {
      mainWindow!.show();
    });
  } else {
    mainWindow?.show();
  }
});

function killChildren() {
  if (beProcess && !beProcess.killed) {
    beProcess.kill('SIGTERM');
    beProcess = null;
  }
  if (feProcess && !feProcess.killed) {
    feProcess.kill('SIGTERM');
    feProcess = null;
  }
}
