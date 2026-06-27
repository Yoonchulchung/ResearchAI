import { Injectable } from '@nestjs/common';
import {
  BrowserNewsSearchRequest,
  BrowserNewsSearchResult,
} from 'src/browse/application/browser.types';
import { BROWSER_USER_AGENT } from 'src/browse/application/puppeteer/browser-automation.util';
import { PuppeteerBrowserPort } from 'src/browse/application/puppeteer/puppeteer-browser.port';

@Injectable()
export class NaverNewsSearchService {
  constructor(private readonly browser: PuppeteerBrowserPort) {}

  async searchNews(
    request: BrowserNewsSearchRequest,
  ): Promise<BrowserNewsSearchResult[]> {
    const url = this.buildNaverNewsUrl(request);
    const today = new Date().toISOString().substring(0, 10);

    const items = await this.browser.withPage(async (page) => {
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
        const titleAnchors = Array.from(
          section.querySelectorAll<HTMLAnchorElement>(
            'a[data-heatmap-target=".tit"], a.news_tit',
          ),
        );
        const anchors = titleAnchors.length
          ? titleAnchors
          : Array.from(section.querySelectorAll<HTMLAnchorElement>('a[href]'));
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

        const findNewsCard = (anchor: HTMLAnchorElement) => {
          let current: Element | null =
            anchor.closest('li') ??
            anchor.closest('[class*="news_area"]') ??
            anchor.parentElement;

          for (let depth = 0; current && depth < 8; depth++) {
            const hasTitle =
              current.querySelector('a[data-heatmap-target=".tit"]') ??
              current.querySelector('a.news_tit');
            const hasProfile =
              current.querySelector('[data-sds-comp="Profile"]') ??
              current.querySelector('a[data-heatmap-target=".prof"]') ??
              current.querySelector('[class*="press"]') ??
              current.querySelector('[class*="source"]');
            const hasBody =
              current.querySelector('a[data-heatmap-target=".body"]') ??
              current.querySelector('[class*="dsc"]') ??
              current.querySelector('[class*="desc"]') ??
              current.querySelector('[class*="summary"]');
            if (hasTitle && (hasProfile || hasBody)) return current;
            current = current.parentElement;
          }

          return (
            anchor.closest('li') ??
            anchor.closest('[class*="news_area"]') ??
            anchor.parentElement
          );
        };

        for (const anchor of anchors) {
          const title = anchor.textContent?.trim() ?? '';
          if (title.length < 10 || !isNewsUrl(anchor.href)) continue;
          const normalizedUrl = anchor.href.split('?')[0];
          if (seen.has(normalizedUrl)) continue;
          seen.add(normalizedUrl);

          const card = findNewsCard(anchor);
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
            } else if (/\d+\s*개월\s*전/.test(cardText)) {
              const monthsAgo = Number(
                cardText.match(/(\d+)\s*개월\s*전/)?.[1] ?? 0,
              );
              const date = new Date(todayString);
              date.setMonth(date.getMonth() - monthsAgo);
              publishedAt = date.toISOString().substring(0, 10);
            } else if (/\d+\s*주\s*전/.test(cardText)) {
              const weeksAgo = Number(
                cardText.match(/(\d+)\s*주\s*전/)?.[1] ?? 0,
              );
              const date = new Date(todayString);
              date.setDate(date.getDate() - weeksAgo * 7);
              publishedAt = date.toISOString().substring(0, 10);
            } else if (/\d+\s*일\s*전/.test(cardText)) {
              const daysAgo = Number(
                cardText.match(/(\d+)\s*일\s*전/)?.[1] ?? 0,
              );
              const date = new Date(todayString);
              date.setDate(date.getDate() - daysAgo);
              publishedAt = date.toISOString().substring(0, 10);
            } else if (/\d+\s*(?:시간|분|초)\s*전|방금|오늘/.test(cardText)) {
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
                'a[data-heatmap-target=".body"], [class*="dsc"], [class*="desc"], [class*="summary"]',
              )
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() ?? '';
          const source =
            card
              ?.querySelector(
                'a[data-heatmap-target=".prof"], [class*="press"], [class*="source"], [class*="info_press"]',
              )
              ?.textContent?.trim() ?? '';
          const imgEl = card?.querySelector('img');
          const imageSource =
            imgEl?.getAttribute('data-src') ??
            imgEl?.getAttribute('data-lazy-src') ??
            imgEl?.getAttribute('data-original') ??
            imgEl?.getAttribute('src') ??
            '';

          results.push({
            title,
            url: anchor.href,
            snippet,
            publishedAt,
            imageUrl:
              imageSource.startsWith('http') &&
              !imageSource.includes('data:image') &&
              imageSource.length < 500
                ? imageSource
                : undefined,
            source,
          });
        }
        return results;
      }, today);
    });

    const enriched = await this.enrichPublishedDates(items, request);
    return this.filterByRequestedDateRange(enriched, request);
  }

  private filterByRequestedDateRange(
    items: BrowserNewsSearchResult[],
    request: BrowserNewsSearchRequest,
  ): BrowserNewsSearchResult[] {
    if (!request.dateFrom || !request.dateTo) return items;

    return items.filter((item) => {
      if (!item.publishedAt) return false;
      const dateKey = item.publishedAt.slice(0, 10);
      return dateKey >= request.dateFrom! && dateKey <= request.dateTo!;
    });
  }

  private async enrichPublishedDates(
    items: BrowserNewsSearchResult[],
    request: BrowserNewsSearchRequest,
  ): Promise<BrowserNewsSearchResult[]> {
    const enriched = [...items];
    const indexes = enriched
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => this.shouldFetchArticlePublishedAt(item, request));

    const concurrency = 4;
    for (let i = 0; i < indexes.length; i += concurrency) {
      const batch = indexes.slice(i, i + concurrency);
      const dates = await Promise.allSettled(
        batch.map(({ item }) => this.fetchArticlePublishedAt(item.url)),
      );
      dates.forEach((result, j) => {
        if (result.status === 'fulfilled' && result.value) {
          enriched[batch[j].index] = {
            ...enriched[batch[j].index],
            publishedAt: result.value,
          };
        }
      });
    }

    return enriched;
  }

  private shouldFetchArticlePublishedAt(
    item: BrowserNewsSearchResult,
    request: BrowserNewsSearchRequest,
  ): boolean {
    if (!item.publishedAt) return true;
    if (!request.dateFrom || !request.dateTo) return false;

    const dateKey = item.publishedAt.slice(0, 10);
    return dateKey < request.dateFrom || dateKey > request.dateTo;
  }

  private async fetchArticlePublishedAt(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          Accept: 'text/html',
        },
      });
      if (!response.ok || !response.body) return null;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let html = '';
      let bytes = 0;
      while (bytes < 131_072) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        bytes += value.length;
        if (html.includes('</head>')) break;
      }
      await reader.cancel().catch(() => undefined);

      return this.extractPublishedAtFromHtml(html);
    } catch {
      return null;
    }
  }

  private extractPublishedAtFromHtml(html: string): string | null {
    const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
    const dateKeys = [
      'article:published_time',
      'published_time',
      'datePublished',
      'pubDate',
      'publishdate',
      'publish-date',
      'date',
    ].map((key) => key.toLowerCase());

    for (const tag of metaTags) {
      const key =
        this.readHtmlAttribute(tag, 'property') ??
        this.readHtmlAttribute(tag, 'name') ??
        this.readHtmlAttribute(tag, 'itemprop');
      if (!key || !dateKeys.includes(key.toLowerCase())) continue;

      const content = this.readHtmlAttribute(tag, 'content');
      const parsed = this.parsePublishedAt(content);
      if (parsed) return parsed;
    }

    const timeMatch =
      html.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i) ??
      html.match(/datetime=["']([^"']+)["']/i);
    return this.parsePublishedAt(timeMatch?.[1]);
  }

  private readHtmlAttribute(tag: string, name: string): string | null {
    const match = tag.match(
      new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'),
    );
    return match?.[1]?.trim() ?? null;
  }

  private parsePublishedAt(value?: string | null): string | null {
    if (!value) return null;

    const compact = value.replace(/\s+/g, ' ').trim();
    const bracketed = compact.match(
      /(\d{4})-(\d{2})-(\d{2})(?:\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?)?/,
    );
    if (bracketed) {
      const [, year, month, day, hour = '00', minute = '00', second = '00'] =
        bracketed;
      return new Date(
        `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:${second}+09:00`,
      ).toISOString();
    }

    const dotted = compact.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (dotted) {
      const [, year, month, day] = dotted;
      return new Date(
        `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+09:00`,
      ).toISOString();
    }

    const timestamp = Date.parse(compact);
    if (Number.isNaN(timestamp)) return null;
    return new Date(timestamp).toISOString();
  }

  private buildNaverNewsUrl(request: BrowserNewsSearchRequest): string {
    const start = request.start ?? 1;
    const sort = '1';
    let url =
      'https://search.naver.com/search.naver?where=news&ssc=tab.news.all' +
      `&query=${encodeURIComponent(request.query)}` +
      `&sm=tab_opt&sort=${sort}&photo=0&field=0&start=${start}`;

    if (request.dateFrom && request.dateTo) {
      const from = request.dateFrom.replace(/-/g, '');
      const to = request.dateTo.replace(/-/g, '');
      url +=
        `&pd=3&ds=${request.dateFrom.replace(/-/g, '.')}` +
        `&de=${request.dateTo.replace(/-/g, '.')}` +
        `&nso=so:dd,p:from${from}to${to},a:all`;
    }
    return url;
  }
}
