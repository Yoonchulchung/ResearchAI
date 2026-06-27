import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'puppeteer';
import { BrowserNewsSearchResult } from 'src/browse/application/browser.types';

export interface GoogleSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const GOOGLE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

@Injectable()
export class GoogleSearchService {
  private readonly logger = new Logger(GoogleSearchService.name);

  async scrape(
    page: Page,
    query: string,
    limit = 10,
  ): Promise<GoogleSearchResult[]> {
    try {
      await page.setUserAgent(GOOGLE_USER_AGENT);
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

      this.logger.log(`scrape: query="${query}" got=${results.length}`);
      return results.slice(0, limit);
    } catch (e) {
      this.logger.warn(`Google 스크래핑 실패: ${(e as Error).message}`);
      return [];
    }
  }

  /** Google 뉴스 탭(tbm=nws) 스크래핑. 날짜 파싱 포함. */
  /* CATCHA로 막혀서 동작 안됨 */
  async scrapeNews(
    page: Page,
    query: string,
    limit = 10,
  ): Promise<BrowserNewsSearchResult[]> {
    try {
      await page.setUserAgent(GOOGLE_USER_AGENT);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&hl=ko&gl=kr&num=${Math.min(limit, 10)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('#search', { timeout: 8000 }).catch(() => {});

      // 진단 로그 (필요시 주석 해제)
      // const diag = await page.evaluate(() => ({
      //   title: document.title,
      //   hasSearch: !!document.querySelector('#search'),
      //   yKoRafCount: document.querySelectorAll('a[jsname="YKoRaf"]').length,
      //   wlydOeCount: document.querySelectorAll('a.WlydOe').length,
      //   externalLinkCount: Array.from(document.querySelectorAll('#search a[href^="http"]')).filter(a => !(a as HTMLAnchorElement).href.includes('google.com')).length,
      //   dataNewsCount: document.querySelectorAll('[data-news-cluster-id]').length,
      //   bodySnippet: document.body.innerHTML.slice(0, 300),
      // }));
      // this.logger.debug(`scrapeNews 진단: title="${diag.title}" hasSearch=${diag.hasSearch} YKoRaf=${diag.yKoRafCount} WlydOe=${diag.wlydOeCount} externalLinks=${diag.externalLinkCount} datanews=${diag.dataNewsCount}`);
      // this.logger.debug(`body snippet: ${diag.bodySnippet}`);

      const raw = await page.evaluate(() => {
        const seen = new Set<string>();
        const items: {
          title: string;
          url: string;
          snippet: string;
          dateText: string;
          source: string;
        }[] = [];

        // Google News 기사 링크: jsname="YKoRaf" 또는 class="WlydOe"
        // 둘 다 없으면 #search 내 외부 링크 전체로 폴백
        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(
            '#search a[jsname="YKoRaf"], #search a.WlydOe',
          ),
        ).filter((a) => a.href && !a.href.includes('google.com'));

        const fallbackAnchors =
          anchors.length === 0
            ? Array.from(
                document.querySelectorAll<HTMLAnchorElement>(
                  '#search a[href^="http"]',
                ),
              ).filter(
                (a) =>
                  !a.href.includes('google.com') &&
                  !a.href.includes('googleusercontent.com'),
              )
            : [];

        for (const anchor of [...anchors, ...fallbackAnchors]) {
          const rawUrl = anchor.href;
          if (seen.has(rawUrl)) continue;

          // 개별 뉴스 컨테이너: data-news-cluster-id 또는 data-news-doc-id
          const block =
            anchor.closest<HTMLElement>('[data-news-cluster-id]') ??
            anchor.closest<HTMLElement>('[data-news-doc-id]') ??
            anchor.closest<HTMLElement>('[data-hveid]') ??
            anchor.parentElement;
          if (!block) continue;

          // 제목: role="heading" 우선, 없으면 h3, 없으면 anchor 텍스트
          const headingEl =
            block.querySelector('[role="heading"]') ??
            block.querySelector('h3');
          const title =
            headingEl?.textContent?.trim() ?? anchor.textContent?.trim() ?? '';
          if (!title || title.length < 3) continue;

          seen.add(rawUrl);

          // 스니펫
          const snippetEl = block.querySelector(
            '.UqSP2b, .HSSq5c, [data-content-feature="1"]',
          );
          const snippet =
            snippetEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

          // 날짜: OSrXXb / LfVVr / time[datetime]
          const dateEl =
            block.querySelector<HTMLElement>('time[datetime]') ??
            block.querySelector<HTMLElement>('.OSrXXb, .LfVVr');
          let dateText =
            dateEl?.getAttribute('datetime') ??
            dateEl?.textContent?.trim() ??
            '';
          if (!dateText) {
            const allSpans = Array.from(block.querySelectorAll('span')).map(
              (s) => s.textContent?.trim() ?? '',
            );
            dateText =
              allSpans.find((t) =>
                /\d+\s*(분|시간|일|주|개월)\s*전|\d+\s*(minute|hour|day|week|month)s?\s+ago/i.test(
                  t,
                ),
              ) ?? '';
          }

          // 출처
          let source = '';
          try {
            source = new URL(rawUrl).hostname.replace(/^www\./, '');
          } catch {
            source = '';
          }

          items.push({ title, url: rawUrl, snippet, dateText, source });
          if (items.length >= 20) break;
        }
        return items;
      });

      this.logger.log(`scrapeNews: query="${query}" got=${raw.length}`);
      return raw.slice(0, limit).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        publishedAt: this.parseRelativeDate(r.dateText),
        source: r.source,
      }));
    } catch (e) {
      this.logger.warn(`Google News 스크래핑 실패: ${(e as Error).message}`);
      return [];
    }
  }

  private parseRelativeDate(dateText: string): string | null {
    if (!dateText) return null;

    // datetime 속성 (ISO 형식)
    const ts = Date.parse(dateText);
    if (!Number.isNaN(ts)) return new Date(ts).toISOString();

    // 한국어 상대 표현: "3시간 전", "2일 전"
    const koMatch = dateText.match(/(\d+)\s*(분|시간|일|주|개월)\s*전/);
    if (koMatch) {
      const n = parseInt(koMatch[1], 10);
      const unitMs: Record<string, number> = {
        분: 60_000,
        시간: 3_600_000,
        일: 86_400_000,
        주: 604_800_000,
        개월: 2_592_000_000,
      };
      return new Date(Date.now() - n * (unitMs[koMatch[2]] ?? 0)).toISOString();
    }

    // 영어 상대 표현: "3 hours ago"
    const enMatch = dateText.match(
      /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i,
    );
    if (enMatch) {
      const n = parseInt(enMatch[1], 10);
      const unitMs: Record<string, number> = {
        minute: 60_000,
        hour: 3_600_000,
        day: 86_400_000,
        week: 604_800_000,
        month: 2_592_000_000,
      };
      return new Date(
        Date.now() - n * (unitMs[enMatch[2].toLowerCase()] ?? 0),
      ).toISOString();
    }

    return null;
  }
}
