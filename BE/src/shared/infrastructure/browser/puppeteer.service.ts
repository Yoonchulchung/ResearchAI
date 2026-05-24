import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { BROWSER_ARGS, BROWSER_USER_AGENT } from './browser-automation.util';

@Injectable()
export class PuppeteerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerService.name);
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser | null> | null = null;

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
      this.logger.warn(`Puppeteer 초기화 실패 - 웹 크롤링 비활성화: ${(e as Error).message}`);
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
    return /Connection closed|Target closed|Session closed|Protocol error/i.test(message);
  }

  private async newPage(): Promise<Page> {
    let browser = await this.ensureBrowser();
    if (!browser) throw new Error('Browser not initialized');

    try {
      return await browser.newPage();
    } catch (error) {
      if (!this.isConnectionClosedError(error)) throw error;
      this.logger.warn(`Puppeteer page 생성 실패 - 브라우저 재시작 후 재시도: ${(error as Error).message}`);
      browser = await this.recreateBrowser();
      if (!browser) throw new Error('Browser not initialized');
      return browser.newPage();
    }
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
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' });

      const isGoogleNews = url.includes('news.google.com');

      if (isGoogleNews) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        if (page.url().includes('google.com')) {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        }

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

      await page.waitForSelector('p', { timeout: 5000 }).catch(() => {});

      const finalUrl = page.url();
      const image = await page
        .$eval('meta[property="og:image"]', (el) => el.getAttribute('content') ?? '')
        .catch(() => '');
      const title = await page
        .$eval('meta[property="og:title"]', (el) => el.getAttribute('content') ?? '')
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
          '[class*="article_body"]', '[class*="article-body"]',
          '[id*="article_body"]', '[id*="articleBody"]',
          '[class*="article_txt"]', '[class*="art_txt"]',
          '[class*="news_view"]', '[class*="news-view"]',
          '[class*="view_text"]', '[class*="view-text"]',
          '[id*="newsContent"]', '[id*="news_content"]',
          '[id*="articleBodyContents"]',
          '[class*="content_area"]', '[class*="contentArea"]',
          '[class*="story-body"]', '[class*="storyBody"]',
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

      return { title, content, image: image || undefined, finalUrl };
    } finally {
      await page.close();
    }
  }

  async searchGoogle(query: string, limit = 8): Promise<{ title: string; url: string; snippet: string }[]> {
    const page: Page = await this.newPage();
    try {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' });

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
          const rawHref = anchor?.getAttribute('href') ?? '';
          let rawUrl = '';
          if (rawHref.startsWith('http')) {
            rawUrl = rawHref;
          } else {
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
