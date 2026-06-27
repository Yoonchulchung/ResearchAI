import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { BROWSER_ARGS } from 'src/browse/application/puppeteer/browser-automation.util';
import { PuppeteerBrowserPort } from 'src/browse/application/puppeteer/puppeteer-browser.port';

const DEFAULT_MAX_PAGES = 2;
const MAX_PAGE_LIMIT = 6;

@Injectable()
export class PuppeteerBrowserEngine
  extends PuppeteerBrowserPort
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PuppeteerBrowserEngine.name);
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser | null> | null = null;
  private activePages = 0;
  private readonly pageWaiters: Array<() => void> = [];

  async onModuleInit() {
    await this.ensureBrowser();
  }

  async onModuleDestroy() {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
    this.logger.log('Puppeteer browser closed');
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const page = await this.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async newPage(): Promise<Page> {
    await this.acquirePageSlot();
    let browser = await this.ensureBrowser();
    if (!browser) {
      this.releasePageSlot();
      throw new Error('Browser not initialized');
    }

    try {
      return this.wrapPage(await browser.newPage());
    } catch (error) {
      if (!this.isConnectionClosedError(error)) {
        this.releasePageSlot();
        throw error;
      }
      this.logger.warn(
        `Puppeteer page 생성 실패 - 브라우저 재시작 후 재시도: ${(error as Error).message}`,
      );
      browser = await this.recreateBrowser();
      if (!browser) {
        this.releasePageSlot();
        throw new Error('Browser not initialized');
      }
      try {
        return this.wrapPage(await browser.newPage());
      } catch (retryError) {
        this.releasePageSlot();
        throw retryError;
      }
    }
  }

  async gotoArticlePage(page: Page, url: string): Promise<void> {
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

  normalizeImageUrl(image: string, baseUrl: string): string | undefined {
    const trimmed = image.trim();
    if (!trimmed) return undefined;

    try {
      const normalized = new URL(trimmed, baseUrl).toString();
      return /^https?:\/\//i.test(normalized) ? normalized : undefined;
    } catch {
      return undefined;
    }
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

  private getMaxPages(): number {
    const parsed = Number(process.env.PUPPETEER_MAX_PAGES);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_PAGES;
    return Math.min(Math.max(Math.floor(parsed), 1), MAX_PAGE_LIMIT);
  }

  private async acquirePageSlot(): Promise<void> {
    if (this.activePages < this.getMaxPages()) {
      this.activePages++;
      return;
    }

    await new Promise<void>((resolve) => this.pageWaiters.push(resolve));
    this.activePages++;
  }

  private releasePageSlot(): void {
    this.activePages = Math.max(0, this.activePages - 1);
    this.pageWaiters.shift()?.();
  }

  private wrapPage(page: Page): Page {
    let released = false;
    const originalClose = page.close.bind(page);
    page.close = (async (...args: Parameters<Page['close']>) => {
      try {
        return await originalClose(...args);
      } finally {
        if (!released) {
          released = true;
          this.releasePageSlot();
        }
      }
    }) as Page['close'];
    return page;
  }

  private isConnectionClosedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Connection closed|Target closed|Session closed|Protocol error/i.test(
      message,
    );
  }
}
