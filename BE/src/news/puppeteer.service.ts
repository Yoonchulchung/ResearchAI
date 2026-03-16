import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';

@Injectable()
export class PuppeteerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerService.name);
  private browser: Browser | null = null;

  async onModuleInit() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    this.logger.log('Puppeteer browser launched');
  }

  async onModuleDestroy() {
    await this.browser?.close();
    this.logger.log('Puppeteer browser closed');
  }

  async fetchArticle(url: string): Promise<{
    title: string;
    content: string;
    image?: string;
    finalUrl: string;
  }> {
    if (!this.browser) throw new Error('Browser not initialized');

    const page: Page = await this.browser.newPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' });

      const isGoogleNews = url.includes('news.google.com');

      if (isGoogleNews) {
        // Google News는 JS 리다이렉트 → 실제 기사 URL로 이동할 때까지 대기
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // google.com에 아직 있으면 JS 리다이렉트 완료 대기
        if (page.url().includes('google.com')) {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        }

        // 여전히 google.com이면 페이지 내 링크에서 실제 URL 추출 후 직접 이동
        if (page.url().includes('google.com')) {
          const articleUrl = await page.evaluate(() => {
            const a = document.querySelector('a[href^="http"]:not([href*="google.com"])');
            return a ? (a as HTMLAnchorElement).href : null;
          });
          if (articleUrl) {
            await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          }
        }
      } else {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      }

      // 기사 본문 로딩 대기 (lazy-load 대응)
      await page.waitForSelector('p', { timeout: 5000 }).catch(() => {});

      const finalUrl = page.url();

      // og:image
      const image = await page
        .$eval('meta[property="og:image"]', (el) => el.getAttribute('content') ?? '')
        .catch(() => '');

      // og:title
      const title = await page
        .$eval('meta[property="og:title"]', (el) => el.getAttribute('content') ?? '')
        .catch(async () => page.title());

      // 본문 추출
      const content = await page.evaluate(() => {
        // 노이즈 요소 제거 (광고·네비·푸터 등)
        document
          .querySelectorAll(
            'script, style, nav, header, footer, aside, iframe,' +
            '.ad, .ads, .advertisement, .banner,' +
            '.related, .recommend, .comment, .share, .sns,' +
            '[class*="ad-"], [id*="ad-"], [class*="banner"], [id*="banner"]',
          )
          .forEach((n) => n.remove());

        // 한국 언론사 주요 본문 컨테이너 선택자 (우선순위 순)
        const SELECTORS = [
          'article',
          '[class*="article_body"]', '[class*="article-body"]',
          '[id*="article_body"]',   '[id*="articleBody"]',
          '[class*="article_txt"]', '[class*="art_txt"]',
          '[class*="news_view"]',   '[class*="news-view"]',
          '[class*="view_text"]',   '[class*="view-text"]',
          '[id*="newsContent"]',    '[id*="news_content"]',
          '[id*="articleBodyContents"]',
          '[class*="content_area"]','[class*="contentArea"]',
          '[class*="story-body"]',  '[class*="storyBody"]',
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

        // p 태그가 거의 없으면 target 내 텍스트 노드 전체를 줄 단위로 추출
        if (paras.length < 3) {
          return (target.textContent ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 20)
            .join('\n\n');
        }

        return paras.join('\n\n');
      });

      return { title, content, image: image || undefined, finalUrl };
    } finally {
      await page.close();
    }
  }

  async searchGoogle(query: string, limit = 8): Promise<{ title: string; url: string; snippet: string }[]> {
    if (!this.browser) throw new Error('Browser not initialized');

    const page: Page = await this.browser.newPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' });

      // DuckDuckGo HTML 버전 사용 (bot 차단 없음)
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('.result', { timeout: 8000 }).catch(() => {});

      const results = await page.evaluate((maxItems: number) => {
        const items: { title: string; url: string; snippet: string }[] = [];

        const blocks = Array.from(document.querySelectorAll('.result'));
        for (const block of blocks) {
          if (items.length >= maxItems) break;

          const anchor = block.querySelector('.result__a') as HTMLAnchorElement | null;
          const snippetEl = block.querySelector('.result__snippet');

          const title = anchor?.textContent?.trim() ?? '';
          // DuckDuckGo는 href가 /l/?uddg=... 형태 → data-href 혹은 실제 href 추출
          const rawHref = anchor?.getAttribute('href') ?? '';
          let rawUrl = '';
          if (rawHref.startsWith('http')) {
            rawUrl = rawHref;
          } else {
            // /l/?uddg=<encoded-url> 에서 실제 URL 추출
            const match = rawHref.match(/uddg=([^&]+)/);
            rawUrl = match ? decodeURIComponent(match[1]) : '';
          }

          const snippet = snippetEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

          if (!title || !rawUrl || rawUrl.includes('duckduckgo.com')) continue;

          items.push({ title, url: rawUrl, snippet });
        }
        return items;
      }, limit);

      this.logger.log(`searchGoogle(DDG): query="${query}" results=${results.length}`);
      return results;
    } finally {
      await page.close();
    }
  }
}
