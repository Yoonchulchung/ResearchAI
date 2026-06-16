import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');
const generatedDir = path.join(docsDir, 'generated');
const htmlOut = path.join(generatedDir, 'ResearchAI-docs.html');
const pdfOut = path.join(generatedDir, 'ResearchAI-docs.pdf');
const htmlOnly = process.argv.includes('--html-only');

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

const orderedFiles = [
  'architecture/overview.md',
  'architecture/backend.md',
  'architecture/frontend.md',
  'architecture/database.md',
  'legacy/architecture.md',
  'legacy/frontend.md',
  'feature/README.md',
  'feature/common/README.md',
  'feature/dashboard/README.md',
  'feature/search/README.md',
  'feature/recruit/README.md',
  'feature/recruit/job-posting/ocr.md',
  'feature/recruit/job-posting/recommendation.md',
  'feature/recruit/resume/experience_extract.md',
  'feature/recruit/resume/cover_letter.md',
  'feature/recruit/cover-letter/spec_analysis.md',
  'feature/recruit/portfolio/evaluation.md',
  'feature/recruit/documents/prompts.md',
  'feature/company/README.md',
  'feature/company/analyses/README.md',
  'feature/news/README.md',
  'feature/documents/README.md',
  'feature/settings/README.md',
  'pipelines/queue.md',
  'pipelines/light-research.md',
  'pipelines/deep-research.md',
  'pipelines/chat-rag.md',
  'pipelines/summary.md',
  'reference/auth.md',
  'reference/ai-providers.md',
  'reference/api-reference.md',
  'desktop/desktop-app.md',
  'refactor/README.md',
  'refactor/be-browse-spring-migration-plan.md',
  'refactor/BE/BE.md',
  'refactor/BE_BROWSE/BE_BROWSE.md',
  'refactor/CONNECT/CONNECT.md',
  'refactor/CONNECT/API.md',
];

const excludedFiles = new Set([
  'README.md',
]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  });
}

function waitForProcessExit(child, timeoutMs = 2000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function cleanupTempDir(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      return;
    } catch (error) {
      if (attempt === 4) {
        console.warn(`임시 Chrome 디렉터리를 삭제하지 못했습니다: ${dir} (${error.code ?? error.message})`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}

function formatGeneratedAt(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} KST`;
}

function toDocsRelative(filePath) {
  return path.relative(docsDir, filePath).split(path.sep).join('/');
}

function titleFromMarkdown(content, relativePath) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }

  const basename = path.basename(relativePath, '.md');
  return basename === 'README'
    ? path.basename(path.dirname(relativePath))
    : basename.replace(/[-_]/g, ' ');
}

function stripFirstH1(content) {
  return content.replace(/(^|\n)#\s+.+\r?\n?/, '$1').trim();
}

function categoryFor(relativePath) {
  const parts = relativePath.split('/');

  if (relativePath === 'README.md') {
    return ['문서', '인덱스'];
  }

  if (parts[0] === 'architecture') {
    return ['아키텍처', architectureName(relativePath, parts[1])];
  }

  if (parts[0] === 'feature') {
    return ['기능 명세', parts[1] ? featureName(parts[1]) : '인덱스'];
  }

  if (parts[0] === 'pipelines' || parts[0] === '큐' || parts[0] === 'Research') {
    return ['파이프라인', parts[1] ? readableName(parts[1]) : readableName(parts[0])];
  }

  if (parts[0] === 'reference') {
    return ['참조', referenceName(parts[1])];
  }

  if (parts[0] === 'desktop') {
    return ['데스크탑', readableName(parts[1])];
  }

  if (parts[0] === 'legacy') {
    return ['Legacy', readableName(parts[1])];
  }

  if (parts[0] === 'refactor') {
    return ['리팩토링', parts[1] ? refactorName(parts[1]) : '인덱스'];
  }

  return ['참조', readableName(parts[0])];
}

function architectureName(relativePath, value) {
  const labels = {
    'architecture.md': '시스템',
    'frontend.md': '프론트엔드',
    overview: '개요',
    backend: '백엔드',
    frontend: '프론트엔드',
    database: '데이터베이스',
  };
  return labels[value] ?? labels[relativePath] ?? readableName(value ?? relativePath);
}

function refactorName(value) {
  const labels = {
    BE: 'BE',
    BE_BROWSE: 'BE_BROWSE',
    CONNECT: '연결',
  };
  return labels[value] ?? readableName(value);
}

function referenceName(value) {
  const labels = {
    'auth.md': '인증',
    'ai-providers.md': 'AI 프로바이더',
    'api-reference.md': 'API',
  };
  return labels[value] ?? readableName(value);
}

function readableName(value) {
  return value
    .replace(/\.md$/, '')
    .replace(/README$/i, '인덱스')
    .replace(/[-_]/g, ' ')
    .trim();
}

function featureName(value) {
  const labels = {
    common: '공통',
    dashboard: '대시보드',
    search: '리서치',
    recruit: '채용',
    company: '기업',
    news: '뉴스',
    documents: '문서/경험',
    settings: '설정/관리',
  };
  return labels[value] ?? readableName(value);
}

function slugFor(relativePath) {
  return `doc-${relativePath
    .replace(/\.md$/, '')
    .replace(/README$/i, 'index')
    .replace(/[^a-zA-Z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

function getDocsFiles() {
  const allFiles = new Map(walk(docsDir).map((filePath) => [toDocsRelative(filePath), filePath]));
  for (const relativePath of excludedFiles) {
    allFiles.delete(relativePath);
  }

  const files = [];

  for (const relativePath of orderedFiles) {
    if (excludedFiles.has(relativePath)) {
      continue;
    }

    const filePath = allFiles.get(relativePath);
    if (filePath) {
      files.push(filePath);
      allFiles.delete(relativePath);
    }
  }

  const remaining = [...allFiles.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([, filePath]) => filePath);

  return [...files, ...remaining];
}

function createMarkdownRenderer(docsByRelativePath) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  });

  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const language = tokens[idx].info.trim().split(/\s+/)[0].toLowerCase();
    if (language === 'mermaid') {
      return `<div class="mermaid">${escapeHtml(tokens[idx].content)}</div>\n`;
    }

    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  const defaultLinkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const hrefIndex = tokens[idx].attrIndex('href');
    if (hrefIndex >= 0) {
      const href = tokens[idx].attrs[hrefIndex][1];
      const normalized = normalizeMarkdownHref(href, env.currentFile);
      if (normalized && docsByRelativePath.has(normalized)) {
        tokens[idx].attrs[hrefIndex][1] = `#${slugFor(normalized)}`;
      }
    }

    return defaultLinkOpen
      ? defaultLinkOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const srcIndex = tokens[idx].attrIndex('src');
    if (srcIndex >= 0) {
      const src = tokens[idx].attrs[srcIndex][1];
      if (!/^(https?:|data:|file:)/.test(src)) {
        const absolute = path.resolve(path.dirname(env.currentFile), src);
        tokens[idx].attrs[srcIndex][1] = pathToFileURL(absolute).href;
      }
    }

    return defaultImage
      ? defaultImage(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return md;
}

function normalizeMarkdownHref(href, currentFile) {
  if (!href || /^(https?:|mailto:|#)/.test(href)) {
    return null;
  }

  const [filePart] = href.split('#');
  if (!filePart.endsWith('.md')) {
    return null;
  }

  const absolute = path.resolve(path.dirname(currentFile), filePart);
  return toDocsRelative(absolute);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeScript(value) {
  return value.replace(/<\/script/gi, '<\\/script');
}

function readMermaidScript() {
  const mermaidPath = path.join(rootDir, 'node_modules/mermaid/dist/mermaid.min.js');
  if (!fs.existsSync(mermaidPath)) {
    return null;
  }

  return fs.readFileSync(mermaidPath, 'utf8');
}

function renderHtml(docs, options = {}) {
  const docsByRelativePath = new Set(docs.map((doc) => doc.relativePath));
  const md = createMarkdownRenderer(docsByRelativePath);
  const generatedAt = formatGeneratedAt();
  const totalPages = options.totalPages ?? '계산 중';
  const hasMermaid = docs.some((doc) => /```mermaid|~~~mermaid/.test(doc.content));
  const mermaidScript = hasMermaid ? readMermaidScript() : null;
  if (hasMermaid && !mermaidScript) {
    console.warn('Mermaid 패키지를 찾지 못해 Mermaid 다이어그램은 코드블록으로 출력됩니다.');
  }
  const tocGroups = new Map();

  for (const doc of docs) {
    if (!tocGroups.has(doc.category)) {
      tocGroups.set(doc.category, []);
    }
    tocGroups.get(doc.category).push(doc);
  }

  const toc = [...tocGroups.entries()]
    .map(([category, items]) => `
      <section class="toc-group">
        <h2>${escapeHtml(category)}</h2>
        <ol>
          ${items.map((doc) => `<li><a href="#${doc.id}">${escapeHtml(doc.printTitle)}</a><span>${escapeHtml(doc.relativePath)}</span></li>`).join('\n')}
        </ol>
      </section>
    `)
    .join('\n');

  const body = docs
    .map((doc) => {
      const content = stripFirstH1(doc.content);
      const rendered = content
        ? md.render(content, { currentFile: doc.filePath })
        : '<p class="empty-doc">이 문서는 아직 작성된 내용이 없습니다.</p>';

      return `
        <article id="${doc.id}" class="doc-section">
          <header class="doc-header">
            <p class="doc-path">${escapeHtml(doc.relativePath)}</p>
            <p class="doc-category">${escapeHtml(doc.category)} / ${escapeHtml(doc.subcategory)}</p>
            <h1>${escapeHtml(doc.printTitle)}</h1>
          </header>
          <div class="doc-content">
            ${rendered}
          </div>
        </article>
      `;
    })
    .join('\n');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>ResearchAI 문서 통합본</title>
  <style>
    @page {
      size: A4;
      margin: 15mm 13mm 17mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #172033;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.65;
      word-break: keep-all;
      overflow-wrap: anywhere;
    }

    a {
      color: #0055a5;
      text-decoration: none;
    }

    .cover {
      min-height: 255mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      page-break-after: always;
      border-left: 8px solid #0055a5;
      padding-left: 24px;
    }

    .cover p {
      margin: 0 0 10px;
      color: #546179;
      font-size: 15px;
    }

    .cover h1 {
      margin: 0 0 18px;
      color: #0b2341;
      font-size: 42px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .cover dl {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 6px 14px;
      margin-top: 28px;
      color: #334155;
    }

    .cover dt {
      font-weight: 700;
    }

    .toc {
      page-break-after: always;
    }

    .toc > h1 {
      margin: 0 0 18px;
      font-size: 28px;
      color: #0b2341;
    }

    .toc-group {
      break-inside: avoid;
      margin-bottom: 20px;
    }

    .toc-group h2 {
      margin: 0 0 8px;
      border-bottom: 1px solid #cbd5e1;
      color: #0b2341;
      font-size: 18px;
    }

    .toc-group ol {
      margin: 0;
      padding-left: 24px;
    }

    .toc-group li {
      margin: 4px 0;
    }

    .toc-group span {
      display: block;
      color: #64748b;
      font-size: 11px;
    }

    .doc-section {
      page-break-before: always;
    }

    .doc-header {
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #0b2341;
    }

    .doc-path,
    .doc-category {
      margin: 0 0 4px;
      color: #64748b;
      font-size: 12px;
    }

    .doc-header h1 {
      margin: 4px 0 0;
      color: #0b2341;
      font-size: 27px;
      line-height: 1.25;
      letter-spacing: 0;
    }

    h2 {
      margin: 24px 0 8px;
      color: #17365d;
      font-size: 21px;
      line-height: 1.35;
      letter-spacing: 0;
      break-after: avoid;
    }

    h3 {
      margin: 18px 0 7px;
      color: #24476f;
      font-size: 17px;
      line-height: 1.35;
      letter-spacing: 0;
      break-after: avoid;
    }

    h4 {
      margin: 14px 0 6px;
      color: #334155;
      font-size: 14px;
      break-after: avoid;
    }

    p {
      margin: 7px 0;
    }

    hr {
      height: 1px;
      margin: 18px 0;
      border: 0;
      background: #d8dee8;
    }

    blockquote {
      margin: 12px 0;
      padding: 9px 12px;
      border-left: 4px solid #94a3b8;
      background: #f8fafc;
      color: #475569;
    }

    table {
      width: 100%;
      margin: 12px 0 18px;
      border-collapse: collapse;
      table-layout: fixed;
      break-inside: avoid;
    }

    th,
    td {
      padding: 7px 8px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    th {
      background: #eef4fb;
      color: #0f2744;
      font-weight: 700;
    }

    pre {
      margin: 12px 0 18px;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #f8fafc;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      break-inside: avoid;
    }

    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
    }

    :not(pre) > code {
      padding: 1px 4px;
      border-radius: 3px;
      background: #eef2f7;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    .mermaid {
      width: 100%;
      margin: 14px 0 20px;
      padding: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .mermaid svg {
      max-width: 100%;
      max-height: 650px;
      height: auto;
    }

    .empty-doc {
      padding: 12px;
      border: 1px dashed #94a3b8;
      color: #64748b;
    }
  </style>
</head>
<body>
  <section class="cover">
    <p>ResearchAI Documentation</p>
    <h1>ResearchAI 문서 통합본</h1>
    <p>문서별 분류 제목과 목차를 포함한 인쇄용 PDF입니다.</p>
    <dl>
      <dt>생성일</dt>
      <dd>${generatedAt}</dd>
      <dt>문서 수</dt>
      <dd>${docs.length}</dd>
      <dt>총 페이지</dt>
      <dd>${escapeHtml(String(totalPages))}</dd>
      <dt>출력</dt>
      <dd>docs/generated/ResearchAI-docs.pdf</dd>
    </dl>
  </section>

  <section class="toc">
    <h1>목차</h1>
    ${toc}
  </section>

  ${body}
  ${hasMermaid && mermaidScript ? `
  <script>${escapeScript(mermaidScript)}</script>
  <script>
    window.__researchAIDocsMermaidReady = (async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'neutral',
          flowchart: {
            htmlLabels: false,
            nodeSpacing: 24,
            rankSpacing: 28,
            useMaxWidth: true
          },
          sequence: { useMaxWidth: true }
        });
        await mermaid.run({ querySelector: '.mermaid' });
        document.documentElement.classList.add('mermaid-ready');
      } catch (error) {
        console.error('Mermaid render failed', error);
        document.documentElement.classList.add('mermaid-error');
      }
    })();
  </script>` : ''}
</body>
</html>`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  for (const command of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) {
    const result = spawnSync('command', ['-v', command], { shell: true, encoding: 'utf8' });
    const resolved = result.stdout.trim();
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevToolsPort(userDataDir, chromeProcess) {
  const activePortFile = path.join(userDataDir, 'DevToolsActivePort');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (chromeProcess.exitCode !== null) {
      throw new Error('Chrome이 DevTools 포트를 열기 전에 종료되었습니다.');
    }

    if (fs.existsSync(activePortFile)) {
      const [port] = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
      if (port) {
        return port;
      }
    }

    await delay(100);
  }

  throw new Error('Chrome DevTools 포트를 찾지 못했습니다.');
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} 요청 실패: ${response.status}`);
  }
  return response.json();
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const eventWaiters = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
      return;
    }

    if (message.method && eventWaiters.has(message.method)) {
      const waiters = eventWaiters.get(message.method);
      eventWaiters.delete(message.method);
      for (const resolve of waiters) {
        resolve(message.params);
      }
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    async send(method, params = {}) {
      await opened;

      const id = nextId;
      nextId += 1;

      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    async waitForEvent(method) {
      await opened;

      return new Promise((resolve) => {
        if (!eventWaiters.has(method)) {
          eventWaiters.set(method, []);
        }
        eventWaiters.get(method).push(resolve);
      });
    },
    close() {
      socket.close();
    },
  };
}

function countPdfPages(pdfBuffer) {
  const pdfText = pdfBuffer.toString('latin1');
  const matches = pdfText.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? null;
}

async function printPdf() {
  const chrome = findChrome();
  if (!chrome) {
    console.warn('Chrome/Chromium을 찾지 못해 PDF 변환을 건너뜁니다. HTML은 생성되었습니다.');
    return null;
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-ai-docs-chrome-'));
  const chromeProcess = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  chromeProcess.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  let cdp;
  try {
    const port = await waitForDevToolsPort(userDataDir, chromeProcess);
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === 'page');
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('Chrome page target을 찾지 못했습니다.');
    }

    cdp = connectCdp(pageTarget.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const loadEvent = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: pathToFileURL(htmlOut).href });
    await loadEvent;

    await cdp.send('Runtime.evaluate', {
      expression: 'window.__researchAIDocsMermaidReady ? window.__researchAIDocsMermaidReady.then(() => true).catch(() => false) : true',
      awaitPromise: true,
      returnByValue: true,
      timeout: 10000,
    });
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });

    const pdf = await cdp.send('Page.printToPDF', {
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%; padding:0 13mm 4mm 0; text-align:right; font-size:9px; color:#64748b; font-family:-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.59,
      marginBottom: 0.67,
      marginLeft: 0.51,
      marginRight: 0.51,
    });

    const pdfBuffer = Buffer.from(pdf.data, 'base64');
    fs.writeFileSync(pdfOut, pdfBuffer);
    return countPdfPages(pdfBuffer);
  } catch (error) {
    if (stderr) {
      process.stderr.write(stderr);
    }
    throw error;
  } finally {
    cdp?.close();
    if (chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
      chromeProcess.kill();
    }
    await waitForProcessExit(chromeProcess);
    await cleanupTempDir(userDataDir);
  }

  return null;
}

const docs = getDocsFiles().map((filePath) => {
  const relativePath = toDocsRelative(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const title = titleFromMarkdown(content, relativePath);
  const [category, subcategory] = categoryFor(relativePath);
  const printTitle = [category, subcategory, title]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(' / ');

  return {
    id: slugFor(relativePath),
    filePath,
    relativePath,
    content,
    title,
    category,
    subcategory,
    printTitle,
  };
});

fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(htmlOut, renderHtml(docs));
console.log(`HTML 생성: ${path.relative(rootDir, htmlOut)}`);

if (!htmlOnly) {
  const totalPages = await printPdf();
  if (totalPages) {
    fs.writeFileSync(htmlOut, renderHtml(docs, { totalPages }));
    await printPdf();
    console.log(`총 페이지: ${totalPages}`);
    console.log(`PDF 생성: ${path.relative(rootDir, pdfOut)}`);
  }
}
