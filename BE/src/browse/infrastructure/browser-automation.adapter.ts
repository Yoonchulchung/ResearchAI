import { Injectable, Logger } from '@nestjs/common';
import { BROWSER_USER_AGENT } from 'src/browse/application/puppeteer/browser-automation.util';
import { BrowserAutomationPort } from 'src/browse/application/ports/browser-automation.port';
import {
  BrowserLiveVideo,
  BrowserNewsSearchRequest,
  BrowserNewsSearchResult,
  BrowserPdfOptions,
} from 'src/browse/application/browser.types';
import {
  BrowserPage,
  PuppeteerBrowserPort,
} from 'src/browse/application/puppeteer/puppeteer-browser.port';
import { BrowserNewsService } from 'src/browse/infrastructure/news/browser-news.service';
import { GoogleSearchService } from 'src/browse/infrastructure/search/google-search.service';
import { SerperSearchService } from 'src/browse/infrastructure/search/serper-search.service';

@Injectable()
export class BrowserAutomationAdapter extends BrowserAutomationPort {
  private readonly logger = new Logger(BrowserAutomationAdapter.name);

  constructor(
    private readonly browser: PuppeteerBrowserPort,
    private readonly news: BrowserNewsService,
    private readonly googleSearch: GoogleSearchService,
    private readonly serper: SerperSearchService,
  ) {
    super();
  }

  async fetchOpenGraphImage(url: string): Promise<{
    image?: string;
    finalUrl: string;
  }> {
    return this.news.fetchOpenGraphImage(url);
  }

  fetchOpenGraph(url: string) {
    return this.news.fetchOpenGraph(url);
  }

  async fetchArticle(url: string): Promise<{
    title: string;
    content: string;
    image?: string;
    finalUrl: string;
  }> {
    return this.news.fetchArticle(url);
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
    const page: BrowserPage = await this.browser.newPage();
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
    const page: BrowserPage = await this.browser.newPage();
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
  async searchDuckDuckGo(
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
      `searchDuckDuckGo: query="${query}" limit=${limit} got=${results.length} images=${options.includeImages ?? false}`,
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
    return this.searchDuckDuckGo(query, limit, offset, options);
  }

  /**
   * Google 검색 직접 스크래핑 (google.com/search)
   * Serper API가 없을 때 사용하는 폴백.
   */
  async searchGoogle(
    query: string,
    limit = 10,
  ): Promise<{ title: string; url: string; snippet: string }[]> {
    const page: BrowserPage = await this.browser.newPage();
    try {
      return await this.googleSearch.scrape(page, query, limit);
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
    const serperResult = await this.serper.searchWeb(query, limit);
    if (serperResult) return serperResult;

    // 2) Google 직접 스크래핑
    const direct = await this.searchGoogle(query, limit);
    if (direct.length > 0) {
      return direct.map((r) => ({
        ...r,
        source: new URL(r.url).hostname.replace(/^www\./, ''),
      }));
    }

    // 3) DDG 폴백
    const ddg = await this.searchDuckDuckGo(query, limit);
    return ddg.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: new URL(r.url).hostname.replace(/^www\./, ''),
    }));
  }

  async searchGoogleNews(
    query: string,
    limit = 10,
  ): Promise<BrowserNewsSearchResult[]> {
    return this.news.searchGoogleNews(query, limit);
  }

  async searchNews(
    request: BrowserNewsSearchRequest,
  ): Promise<BrowserNewsSearchResult[]> {
    return this.news.searchNews(request);
  }

  async findLiveVideo(
    channelUrl: string,
    channelName: string,
  ): Promise<BrowserLiveVideo | null> {
    return this.browser.withPage(async (page) => {
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
    return this.browser.withPage(async (page) => {
      await page.setContent(html, { waitUntil: ['load', 'networkidle0'] });
      const pdf = await page.pdf(options);
      return Buffer.from(pdf);
    });
  }

  private async resolveYoutubeVideoId(
    page: BrowserPage,
  ): Promise<string | null> {
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
