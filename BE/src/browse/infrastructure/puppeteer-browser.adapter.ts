import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import {
  BROWSER_ARGS,
  BROWSER_USER_AGENT,
} from 'src/browse/infrastructure/browser-automation.util';
import { BrowserAutomationPort } from 'src/browse/application/ports/browser-automation.port';
import {
  BrowserLiveVideo,
  BrowserNewsSearchRequest,
  BrowserNewsSearchResult,
  BrowserPdfOptions,
} from 'src/browse/application/browser.types';

@Injectable()
export class PuppeteerBrowserAdapter
  extends BrowserAutomationPort
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PuppeteerBrowserAdapter.name);
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser | null> | null = null;

  constructor() {
    super();
  }

  async onModuleInit() {
    await this.ensureBrowser();
  }

  async onModuleDestroy() {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
    this.logger.log('Puppeteer browser closed');
  }

  private async ensureBrowser(): Promise<Browser | null> {
    if (this.browser?.connected) return this.browser;
    if (this.launchPromise) return this.launchPromise;

    this.launchPromise = this.launchBrowser().finally(() => {
      this.launchPromise = null;
    });

    return this.launchPromise;
  }

  private async launchBrowser(): Promise<Browser | null> {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: BROWSER_ARGS,
        protocolTimeout: 15_000,
      });
      this.browser.once('disconnected', () => {
        this.logger.warn('Puppeteer browser disconnected');
        this.browser = null;
      });
      this.logger.log('Puppeteer browser launched');
      return this.browser;
    } catch (e) {
      this.logger.warn(
        `Puppeteer 초기화 실패 - 웹 크롤링 비활성화: ${(e as Error).message}`,
      );
      this.browser = null;
      return null;
    }
  }

  private async recreateBrowser(): Promise<Browser | null> {
    const previous = this.browser;
    this.browser = null;
    await previous?.close().catch(() => undefined);
    return this.ensureBrowser();
  }

  private isConnectionClosedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Connection closed|Target closed|Session closed|Protocol error/i.test(
      message,
    );
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const page = await this.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async newPage(): Promise<Page> {
    let browser = await this.ensureBrowser();
    if (!browser) throw new Error('Browser not initialized');

    try {
      return await browser.newPage();
    } catch (error) {
      if (!this.isConnectionClosedError(error)) throw error;
      this.logger.warn(
        `Puppeteer page 생성 실패 - 브라우저 재시작 후 재시도: ${(error as Error).message}`,
      );
      browser = await this.recreateBrowser();
      if (!browser) throw new Error('Browser not initialized');
      return browser.newPage();
    }
  }

  private async gotoArticlePage(page: Page, url: string): Promise<void> {
    const isGoogleNews = url.includes('news.google.com');

    if (isGoogleNews) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      if (page.url().includes('google.com')) {
        await page
          .waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          })
          .catch(() => {});
      }

      if (page.url().includes('google.com')) {
        const articleUrl = await page.evaluate(() => {
          const a = document.querySelector(
            'a[href^="http"]:not([href*="google.com"])',
          );
          return a ? (a as HTMLAnchorElement).href : null;
        });
        if (articleUrl) {
          await page.goto(articleUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
        }
      }
      return;
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }

  private normalizeImageUrl(
    image: string,
    baseUrl: string,
  ): string | undefined {
    const trimmed = image.trim();
    if (!trimmed) return undefined;

    try {
      const normalized = new URL(trimmed, baseUrl).toString();
      return /^https?:\/\//i.test(normalized) ? normalized : undefined;
    } catch {
      return undefined;
    }
  }

  async fetchOpenGraphImage(url: string): Promise<{
    image?: string;
    finalUrl: string;
  }> {
    const page: Page = await this.newPage();
    try {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      });

      await this.gotoArticlePage(page, url);

      const finalUrl = page.url();
      const image = await page
        .$eval(
          'meta[property="og:image"], meta[name="twitter:image"]',
          (el) => el.getAttribute('content') ?? '',
        )
        .catch(() => '');

      return {
        image: this.normalizeImageUrl(image, finalUrl),
        finalUrl,
      };
    } finally {
      await page.close();
    }
  }

  fetchOpenGraph(url: string) {
    return this.fetchOpenGraphImage(url);
  }

  async fetchArticle(url: string): Promise<{
    title: string;
    content: string;
    image?: string;
    finalUrl: string;
  }> {
    const page: Page = await this.newPage();
    try {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      });

      await this.gotoArticlePage(page, url);

      await page.waitForSelector('p', { timeout: 5000 }).catch(() => {});

      const finalUrl = page.url();
      const image = await page
        .$eval(
          'meta[property="og:image"]',
          (el) => el.getAttribute('content') ?? '',
        )
        .catch(() => '');
      const title = await page
        .$eval(
          'meta[property="og:title"]',
          (el) => el.getAttribute('content') ?? '',
        )
        .catch(async () => page.title());

      const content = await page.evaluate(() => {
        document
          .querySelectorAll(
            'script, style, nav, header, footer, aside, iframe,' +
              '.ad, .ads, .advertisement, .banner,' +
              '.related, .recommend, .comment, .share, .sns,' +
              '[class*="ad-"], [id*="ad-"], [class*="banner"], [id*="banner"]',
          )
          .forEach((n) => n.remove());

        const SELECTORS = [
          'article',
          '[class*="article_body"]',
          '[class*="article-body"]',
          '[id*="article_body"]',
          '[id*="articleBody"]',
          '[class*="article_txt"]',
          '[class*="art_txt"]',
          '[class*="news_view"]',
          '[class*="news-view"]',
          '[class*="view_text"]',
          '[class*="view-text"]',
          '[id*="newsContent"]',
          '[id*="news_content"]',
          '[id*="articleBodyContents"]',
          '[class*="content_area"]',
          '[class*="contentArea"]',
          '[class*="story-body"]',
          '[class*="storyBody"]',
          'main',
        ];

        let target: Element | null = null;
        for (const sel of SELECTORS) {
          const el = document.querySelector(sel);
          if (el && (el.textContent?.trim().length ?? 0) > 100) {
            target = el;
            break;
          }
        }
        target = target ?? document.body;

        const paras = Array.from(target.querySelectorAll('p, .p'))
          .map((p) => p.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter((t) => t.length > 20);

        if (paras.length < 3) {
          return (target.textContent ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 20)
            .join('\n\n');
        }

        return paras.join('\n\n');
      });

      return {
        title,
        content,
        image: this.normalizeImageUrl(image, finalUrl),
        finalUrl,
      };
    } finally {
      await page.close();
    }
  }

  /** JS 렌더링된 페이지의 outerHTML 반환 */
  async fetchRenderedHtml(
    url: string,
    waitSelector?: string,
    options: {
      waitUntil?: 'domcontentloaded' | 'networkidle2';
      selectorTimeout?: number;
    } = {},
  ): Promise<string | null> {
    const { waitUntil = 'domcontentloaded', selectorTimeout = 8000 } = options;
    const page: Page = await this.newPage();
    try {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });
      await page.goto(url, { waitUntil, timeout: 20000 });
      if (waitSelector) {
        await page
          .waitForSelector(waitSelector, { timeout: selectorTimeout })
          .catch(() => {});
      }
      return await page.content();
    } catch (e) {
      this.logger.warn(
        `fetchRenderedHtml 오류 — ${url}: ${(e as Error).message}`,
      );
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * DuckDuckGo 검색 — HTML 버전 단일 페이지 스크래핑
   * 최대 약 25건 반환 (DDG HTML 1페이지 한계)
   */
  private async scrapeOneDDGPage(
    query: string,
    pageOffset: number,
  ): Promise<{ title: string; url: string; snippet: string }[]> {
    const page: Page = await this.newPage();
    try {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      });

      const params = new URLSearchParams({ q: query, kl: 'kr-kr' });
      if (pageOffset > 0) {
        params.set('s', String(pageOffset));
        params.set('dc', String(pageOffset + 1));
      }
      const url = `https://html.duckduckgo.com/html/?${params.toString()}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18000 });
      await page.waitForSelector('.result', { timeout: 8000 }).catch(() => {});

      const results = await page.evaluate(() => {
        const items: { title: string; url: string; snippet: string }[] = [];
        const blocks = Array.from(document.querySelectorAll('.result'));
        for (const block of blocks) {
          const anchor = block.querySelector('.result__a');
          const snippetEl = block.querySelector('.result__snippet');
          const title = anchor?.textContent?.trim() ?? '';
          const rawHref = anchor?.getAttribute('href') ?? '';
          let rawUrl = '';
          if (rawHref.startsWith('http')) {
            rawUrl = rawHref;
          } else {
            const match = rawHref.match(/uddg=([^&]+)/);
            rawUrl = match ? decodeURIComponent(match[1]) : '';
          }
          const snippet =
            snippetEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          if (!title || !rawUrl || rawUrl.includes('duckduckgo.com')) continue;
          items.push({ title, url: rawUrl, snippet });
        }
        return items;
      });

      return results;
    } catch (e) {
      this.logger.warn(
        `DDG 페이지(offset=${pageOffset}) 스크래핑 실패: ${(e as Error).message}`,
      );
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * 단일 URL에서 og:image / twitter:image 추출 (경량 fetch, puppeteer 사용 안 함)
   * 안전 최우선 — 모든 실패는 undefined 반환, 절대 throw 안 함
   */
  private async fetchOgImageFromUrl(
    url: string,
    timeoutMs = 3500,
  ): Promise<string | undefined> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ResearchAI/1.0)',
          Accept: 'text/html',
        },
      });
      if (!res.ok || !res.body) return undefined;

      // head 태그가 끝나거나 64 KB를 넘으면 중단 — 이미지 태그는 항상 head에 있음
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let html = '';
      let bytes = 0;
      while (bytes < 65_536) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        bytes += value.length;
        if (html.includes('</head>')) break;
      }
      reader.cancel().catch(() => {});

      // og:image (property 앞/뒤 순서 모두 대응)
      const m =
        html.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        ) ??
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        ) ??
        html.match(
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        ) ??
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
        );

      const imageUrl = m?.[1]?.trim();
      if (!imageUrl || !imageUrl.startsWith('http')) return undefined;

      // 너무 작은 placeholder 아이콘 제외
      if (
        /logo|icon|favicon|placeholder|blank|noimage|default/i.test(imageUrl)
      ) {
        return undefined;
      }
      return imageUrl;
    } catch {
      return undefined;
    }
  }

  /**
   * 결과 배열에 og:image를 병렬 첨부 — 동시 최대 `concurrency`개, 실패는 무시
   */
  private async enrichWithImages<T extends { url: string }>(
    items: T[],
    concurrency = 6,
    timeoutMs = 3500,
  ): Promise<(T & { imageUrl?: string })[]> {
    const enriched: (T & { imageUrl?: string })[] = items.map((item) => ({
      ...item,
      imageUrl: undefined,
    }));

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const images = await Promise.allSettled(
        batch.map((item) => this.fetchOgImageFromUrl(item.url, timeoutMs)),
      );
      images.forEach((result, j) => {
        if (result.status === 'fulfilled' && result.value) {
          enriched[i + j].imageUrl = result.value;
        }
      });
    }

    return enriched;
  }

  /**
   * DuckDuckGo 검색 (공개 API)
   * - limit > 22 이면 자동으로 2페이지 요청 후 합산 (최대 ~50건)
   * - includeImages: true 면 각 결과 URL에서 og:image를 경량 fetch로 보강
   */
  async searchGoogle(
    query: string,
    limit = 8,
    offset = 0,
    options: { includeImages?: boolean } = {},
  ): Promise<
    { title: string; url: string; snippet: string; imageUrl?: string }[]
  > {
    const PAGE_SIZE = 22; // DDG HTML 1페이지 안전 한도

    let raw: { title: string; url: string; snippet: string }[] = [];

    if (limit <= PAGE_SIZE) {
      // 단일 페이지
      raw = await this.scrapeOneDDGPage(query, offset);
    } else {
      // 2페이지 병렬 요청
      const [page1, page2] = await Promise.allSettled([
        this.scrapeOneDDGPage(query, offset),
        this.scrapeOneDDGPage(query, offset + PAGE_SIZE),
      ]);
      const p1 = page1.status === 'fulfilled' ? page1.value : [];
      const p2 = page2.status === 'fulfilled' ? page2.value : [];

      // URL 기준 중복 제거
      const seen = new Set<string>();
      for (const item of [...p1, ...p2]) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          raw.push(item);
        }
      }
    }

    const results = raw.slice(0, limit);

    this.logger.log(
      `searchGoogle(DDG): query="${query}" limit=${limit} got=${results.length} images=${options.includeImages ?? false}`,
    );

    if (!options.includeImages) {
      return results;
    }

    return this.enrichWithImages(results);
  }

  search(
    query: string,
    limit = 8,
    offset = 0,
    options: { includeImages?: boolean } = {},
  ) {
    return this.searchGoogle(query, limit, offset, options);
  }

  /**
   * Google 검색 직접 스크래핑 (google.com/search)
   * Serper API가 없을 때 사용하는 폴백.
   */
  async searchGoogleDirect(
    query: string,
    limit = 10,
  ): Promise<{ title: string; url: string; snippet: string }[]> {
    const page: Page = await this.newPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      );
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ko&gl=kr&num=${Math.min(limit, 10)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('#search', { timeout: 8000 }).catch(() => {});

      const results = await page.evaluate(() => {
        const items: { title: string; url: string; snippet: string }[] = [];
        const blocks = Array.from(
          document.querySelectorAll('#search .g, #search [data-hveid]'),
        );
        for (const block of blocks) {
          const anchor =
            block.querySelector<HTMLAnchorElement>('a[href^="http"]');
          if (!anchor) continue;
          const h3 = block.querySelector('h3');
          const title = h3?.textContent?.trim() ?? '';
          if (!title || title.length < 3) continue;
          const rawUrl = anchor.href;
          if (!rawUrl.startsWith('http')) continue;
          const snippetEl =
            block.querySelector('[data-sncf]') ??
            block.querySelector('.VwiC3b') ??
            block.querySelector('[style*="-webkit-line-clamp"]');
          const snippet =
            snippetEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          items.push({ title, url: rawUrl, snippet });
          if (items.length >= 10) break;
        }
        return items;
      });

      this.logger.log(
        `searchGoogleDirect: query="${query}" got=${results.length}`,
      );
      return results.slice(0, limit);
    } catch (e) {
      this.logger.warn(`searchGoogleDirect 실패: ${(e as Error).message}`);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * 웹 검색 — Serper(Google) 우선, 없으면 Google 직접, 최후 DDG
   */
  async searchWeb(
    query: string,
    limit = 10,
  ): Promise<
    { title: string; url: string; snippet: string; source: string }[]
  > {
    // 1) Serper (Google 래퍼) — API 키 있으면 우선 사용
    if (
      process.env.SERPER_API_KEY &&
      !process.env.SERPER_API_KEY.startsWith('your_')
    ) {
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.SERPER_API_KEY,
          },
          body: JSON.stringify({ q: query, num: limit, hl: 'ko', gl: 'kr' }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            organic?: Array<{
              title?: string;
              link?: string;
              snippet?: string;
            }>;
          };
          const items = (data.organic ?? [])
            .filter(
              (row): row is { title: string; link: string; snippet?: string } =>
                Boolean(row.title && row.link),
            )
            .slice(0, limit)
            .map((row) => ({
              title: row.title,
              url: row.link,
              snippet: row.snippet ?? '',
              source: new URL(row.link).hostname.replace(/^www\./, ''),
            }));
          if (items.length > 0) {
            this.logger.log(
              `searchWeb(Serper): query="${query}" got=${items.length}`,
            );
            return items;
          }
        }
      } catch (e) {
        this.logger.warn(
          `Serper 실패, Google 직접 시도: ${(e as Error).message}`,
        );
      }
    }

    // 2) Google 직접 스크래핑
    const direct = await this.searchGoogleDirect(query, limit);
    if (direct.length > 0) {
      return direct.map((r) => ({
        ...r,
        source: new URL(r.url).hostname.replace(/^www\./, ''),
      }));
    }

    // 3) DDG 폴백
    const ddg = await this.searchGoogle(query, limit);
    return ddg.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: new URL(r.url).hostname.replace(/^www\./, ''),
    }));
  }

  async searchNews(
    request: BrowserNewsSearchRequest,
  ): Promise<BrowserNewsSearchResult[]> {
    const url = this.buildNaverNewsUrl(request);
    const today = new Date().toISOString().substring(0, 10);

    return this.withPage(async (page) => {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      await page
        .waitForSelector('section._prs_nws a[href]', { timeout: 5_000 })
        .catch(() => {});

      return page.evaluate((todayString) => {
        const section =
          document.querySelector('section._prs_nws') ??
          document.querySelector('.sp_nnews') ??
          document.querySelector('[class*="_prs_nws"]') ??
          document.querySelector('#main_pack') ??
          document;
        const anchors = Array.from(
          section.querySelectorAll<HTMLAnchorElement>('a[href]'),
        );
        const results: Array<{
          title: string;
          url: string;
          snippet: string;
          publishedAt: string | null;
          imageUrl?: string;
          source: string;
        }> = [];
        const seen = new Set<string>();

        const isNewsUrl = (href: string) => {
          if (!href.startsWith('http')) return false;
          if (
            href.includes('search.naver.com') ||
            href.includes('media.naver.com/press')
          ) {
            return false;
          }
          return !(
            href.includes('naver.com/') &&
            !href.includes('n.news.naver.com') &&
            !href.includes('news.naver.com/article')
          );
        };

        for (const anchor of anchors) {
          const title = anchor.textContent?.trim() ?? '';
          if (title.length < 10 || !isNewsUrl(anchor.href)) continue;
          const normalizedUrl = anchor.href.split('?')[0];
          if (seen.has(normalizedUrl)) continue;
          seen.add(normalizedUrl);

          const card =
            anchor.closest('li') ??
            anchor.closest('[class*="news_area"]') ??
            anchor.closest('[class]') ??
            anchor.parentElement;
          const cardText = card?.textContent ?? '';
          const datetime = card
            ?.querySelector('time[datetime]')
            ?.getAttribute('datetime');
          let publishedAt: string | null = null;
          const isoMatch = datetime?.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (isoMatch) {
            publishedAt = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
          } else {
            const dotted = cardText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
            if (dotted) {
              publishedAt = `${dotted[1]}-${dotted[2]}-${dotted[3]}`;
            } else if (/시간|분|초|방금|오늘/.test(cardText)) {
              publishedAt = todayString;
            } else if (/어제/.test(cardText)) {
              const date = new Date(todayString);
              date.setDate(date.getDate() - 1);
              publishedAt = date.toISOString().substring(0, 10);
            }
          }

          const snippet =
            card
              ?.querySelector(
                '[class*="dsc"], [class*="desc"], [class*="summary"]',
              )
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() ?? '';
          const source =
            card
              ?.querySelector(
                '[class*="press"], [class*="source"], [class*="info_press"]',
              )
              ?.textContent?.trim() ?? '';
          const imageSource =
            card?.querySelector('img[src]')?.getAttribute('src') ?? '';

          results.push({
            title,
            url: anchor.href,
            snippet,
            publishedAt,
            imageUrl: imageSource.startsWith('http') ? imageSource : undefined,
            source,
          });
        }
        return results;
      }, today);
    });
  }

  async findLiveVideo(
    channelUrl: string,
    channelName: string,
  ): Promise<BrowserLiveVideo | null> {
    return this.withPage(async (page) => {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9',
      });
      await page.goto(`${channelUrl}/live`, {
        waitUntil: 'networkidle2',
        timeout: 25_000,
      });

      const videoId = await this.resolveYoutubeVideoId(page);
      if (!videoId) return null;
      return {
        videoId,
        title: await this.resolveYoutubeTitle(videoId, channelName),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`,
      };
    });
  }

  async renderPdf(
    html: string,
    options: BrowserPdfOptions = {},
  ): Promise<Buffer> {
    return this.withPage(async (page) => {
      await page.setContent(html, { waitUntil: ['load', 'networkidle0'] });
      const pdf = await page.pdf(options);
      return Buffer.from(pdf);
    });
  }

  private buildNaverNewsUrl(request: BrowserNewsSearchRequest): string {
    const start = request.start ?? 1;
    const sort = request.dateFrom && request.dateTo ? '0' : '1';
    let url =
      'https://search.naver.com/search.naver?ssc=tab.news.all' +
      `&query=${encodeURIComponent(request.query)}` +
      `&sm=tab_opt&sort=${sort}&photo=0&field=0&start=${start}`;

    if (request.dateFrom && request.dateTo) {
      const from = request.dateFrom.replace(/-/g, '');
      const to = request.dateTo.replace(/-/g, '');
      url +=
        `&pd=3&ds=${request.dateFrom.replace(/-/g, '.')}` +
        `&de=${request.dateTo.replace(/-/g, '.')}` +
        `&nso=so:r,p:from${from}to${to}`;
    }
    return url;
  }

  private async resolveYoutubeVideoId(page: Page): Promise<string | null> {
    const fromUrl = page.url().match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] ?? null;
    if (fromUrl) return fromUrl;

    const canonical = await page
      .$eval('link[rel="canonical"]', (element) => element.getAttribute('href'))
      .catch(() => null);
    const fromCanonical =
      canonical?.match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] ?? null;
    if (fromCanonical) return fromCanonical;

    return page
      .evaluate(
        () =>
          document.documentElement.innerHTML.match(
            /"videoId":"([a-zA-Z0-9_-]{11})"/,
          )?.[1] ?? null,
      )
      .catch(() => null);
  }

  private async resolveYoutubeTitle(
    videoId: string,
    channelName: string,
  ): Promise<string> {
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (response.ok) {
        const data = (await response.json()) as { title?: string };
        if (data.title) return data.title;
      }
    } catch {
      // 채널 기본 제목 사용
    }
    return `${channelName} 라이브`;
  }
}
