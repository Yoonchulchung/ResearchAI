import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { getCircuitBreaker } from '../../../shared/resilience/circuit-breaker';

const policy = getCircuitBreaker('duckduckgo');

const MAX_RESULTS = 8;
const FETCH_LIMIT = MAX_RESULTS * 2; // 블랙리스트 필터 후 MAX_RESULTS 확보용
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const PAGE_CONTENT_TIMEOUT_MS = 5_000;
const PAGE_CONTENT_MAX_CHARS = 2_000;

const BLOCKED_DOMAINS = ['tistory.com', 'blog.naver.com', 'cafe.naver.com'];

function isBlockedUrl(url: string): boolean {
  return BLOCKED_DOMAINS.some((d) => url.includes(d));
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// TTL 캐시
const cache = new Map<string, { value: string; expiresAt: number }>();

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** DDG redirect URL(/l/?uddg=...) → 실제 URL 디코딩 */
function decodeRedirectUrl(href: string): string {
  try {
    const u = new URL('https://duckduckgo.com' + href);
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

function parseResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // HTML endpoint 셀렉터 (https://html.duckduckgo.com/html/)
  $('.result:not(.result--ad)').each((_, el) => {
    if (results.length >= FETCH_LIMIT) return false as any;
    const title = $(el).find('.result__title').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    const rawHref = $(el).find('a.result__a').attr('href') ?? '';
    const url = decodeRedirectUrl(rawHref);
    if (title && !isBlockedUrl(url)) results.push({ title, snippet, url });
  });

  // JS 렌더링 결과 셀렉터 (Puppeteer fallback)
  if (results.length === 0) {
    $('[data-testid="result"], li[data-layout]').each((_, el) => {
      if (results.length >= FETCH_LIMIT) return false as any;
      const title =
        $(el).find('[data-testid="result-title-a"] span').text().trim() ||
        $(el).find('h2').text().trim();
      const snippet =
        $(el).find('[data-result="snippet"]').text().trim() ||
        $(el).find('div[class*="snippet"]').text().trim();
      const url =
        $(el).find('a[data-testid="result-title-a"]').attr('href') ||
        $(el).find('a[href^="http"]').attr('href') ||
        '';
      if (title && !isBlockedUrl(url)) results.push({ title, snippet, url });
    });
  }

  return results.slice(0, MAX_RESULTS);
}

/** 각 결과 URL의 실제 페이지 본문 크롤링 */
async function fetchPageContent(url: string): Promise<string> {
  try {
    // PDF URL은 바이너리가 그대로 들어오므로 스킵
    if (/\.pdf(\?.*)?$/i.test(url)) return '';

    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(PAGE_CONTENT_TIMEOUT_MS),
    });
    if (!res.ok) return '';

    // Content-Type이 PDF면 스킵
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
      return '';
    }

    const $ = cheerio.load(await res.text());
    $('script, style, nav, footer, header, aside, [class*="ad"], [id*="ad"]').remove();
    const text = ($('article, main, [class*="content"], [id*="content"]').first().text() || $('body').text())
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, PAGE_CONTENT_MAX_CHARS);
    return text;
  } catch {
    return '';
  }
}

/** 검색 결과에 실제 페이지 콘텐츠를 병렬로 추가 */
async function enrichResults(results: SearchResult[]): Promise<string> {
  const enriched = await Promise.all(
    results.map(async (r) => {
      const content = await fetchPageContent(r.url);
      return `[${r.title}]\n${content || r.snippet}\n출처: ${r.url}`;
    }),
  );
  return enriched.join('\n\n');
}

/** 1차: fetch + cheerio — 브라우저 없이 빠르게 처리 */
async function searchViaHtml(query: string): Promise<SearchResult[]> {
  const body = new URLSearchParams({ q: query, kl: 'kr-kr' }).toString();
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': randomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Referer': 'https://duckduckgo.com/',
      'Origin': 'https://duckduckgo.com',
    },
    body,
  });
  if (!res.ok) throw new Error(`DDG HTML ${res.status}`);
  return parseResults(await res.text());
}

/** 2차: Puppeteer fallback — HTML 방식이 막혔을 때 */
async function searchViaPuppeteer(query: string): Promise<SearchResult[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(randomUA());
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' });
    await page.goto(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web&kl=kr-kr`,
      { waitUntil: 'networkidle2', timeout: 20_000 },
    );
    await page.waitForSelector('[data-testid="result"], .result', { timeout: 8_000 }).catch(() => {});
    return parseResults(await page.content());
  } finally {
    await browser.close();
  }
}

export async function searchDuckDuckGo(query: string): Promise<string> {
  // 캐시 확인
  const cached = cache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const result = await policy.execute(async () => {
    let results: SearchResult[];
    try {
      results = await searchViaHtml(query);
      if (results.length === 0) results = await searchViaPuppeteer(query);
    } catch {
      results = await searchViaPuppeteer(query);
    }
    return enrichResults(results);
  });

  cache.set(query, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
