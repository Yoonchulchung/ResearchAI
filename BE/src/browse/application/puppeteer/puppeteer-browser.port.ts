import type { Page } from 'puppeteer';

export type BrowserPage = Page;

/**
 * Puppeteer 기반 기능들이 공유하는 브라우저 엔진 계약.
 *
 * 브라우저 생명주기는 application에 두고, infrastructure의 검색/뉴스
 * 구현체들은 이 계약을 통해 Page를 빌려 쓴다.
 */
export abstract class PuppeteerBrowserPort {
  abstract withPage<T>(fn: (page: BrowserPage) => Promise<T>): Promise<T>;

  abstract newPage(): Promise<BrowserPage>;

  abstract gotoArticlePage(page: BrowserPage, url: string): Promise<void>;

  abstract normalizeImageUrl(
    image: string,
    baseUrl: string,
  ): string | undefined;
}
