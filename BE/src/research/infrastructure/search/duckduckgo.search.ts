import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { getCircuitBreaker } from '../../../shared/resilience/circuit-breaker';

const policy = getCircuitBreaker('duckduckgo');

const MAX_RESULTS = 8;

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

function parseResults(html: string): string {
  const $ = cheerio.load(html);
  const results: string[] = [];

  // HTML endpoint 셀렉터 (https://html.duckduckgo.com/html/)
  $('.result:not(.result--ad)').each((_, el) => {
    if (results.length >= MAX_RESULTS) return false as any;
    const title = $(el).find('.result__title').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    const rawHref = $(el).find('a.result__a').attr('href') ?? '';
    const url = decodeRedirectUrl(rawHref);
    if (title) results.push(`[${title}]\n${snippet}\n출처: ${url}`);
  });

  // JS 렌더링 결과 셀렉터 (Puppeteer fallback)
  if (results.length === 0) {
    $('[data-testid="result"], li[data-layout]').each((_, el) => {
      if (results.length >= MAX_RESULTS) return false as any;
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
      if (title) results.push(`[${title}]\n${snippet}\n출처: ${url}`);
    });
  }

  return results.join('\n\n');
}

/** 1차: fetch + cheerio — 브라우저 없이 빠르게 처리 */
async function searchViaHtml(query: string): Promise<string> {
  const body = new URLSearchParams({ q: query, kl: 'us-en' }).toString();
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
async function searchViaPuppeteer(query: string): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(randomUA());
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' });
    await page.goto(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`,
      { waitUntil: 'networkidle2', timeout: 20_000 },
    );
    // 결과 로드 대기
    await page.waitForSelector('[data-testid="result"], .result', { timeout: 8_000 }).catch(() => {});
    return parseResults(await page.content());
  } finally {
    await browser.close();
  }
}

export async function searchDuckDuckGo(query: string): Promise<string> {
  return policy.execute(async () => {
    try {
      const result = await searchViaHtml(query);
      // 결과가 너무 짧으면(빈 응답 or 봇 차단) Puppeteer로 재시도
      if (result.length > 100) return result;
      return await searchViaPuppeteer(query);
    } catch {
      return searchViaPuppeteer(query);
    }
  });
}
