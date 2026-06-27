import { Injectable } from '@nestjs/common';
import { BROWSER_USER_AGENT } from 'src/browse/application/puppeteer/browser-automation.util';
import {
  BrowserArticle,
  BrowserNewsSearchRequest,
  BrowserNewsSearchResult,
  BrowserOpenGraph,
} from 'src/browse/application/browser.types';
import { PuppeteerBrowserPort } from 'src/browse/application/puppeteer/puppeteer-browser.port';
import { NaverNewsSearchService } from 'src/browse/infrastructure/search/naver-news-search.service';
import { SerperSearchService } from 'src/browse/infrastructure/search/serper-search.service';

@Injectable()
export class BrowserNewsService {
  constructor(
    private readonly browser: PuppeteerBrowserPort,
    private readonly naverNewsSearch: NaverNewsSearchService,
    private readonly serper: SerperSearchService,
  ) {}

  async fetchOpenGraphImage(url: string): Promise<BrowserOpenGraph> {
    const page = await this.browser.newPage();
    try {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      });

      await this.browser.gotoArticlePage(page, url);

      const finalUrl = page.url();
      const image = await page
        .$eval(
          'meta[property="og:image"], meta[name="twitter:image"]',
          (el) => el.getAttribute('content') ?? '',
        )
        .catch(() => '');

      return {
        image: this.browser.normalizeImageUrl(image, finalUrl),
        finalUrl,
      };
    } finally {
      await page.close();
    }
  }

  fetchOpenGraph(url: string): Promise<BrowserOpenGraph> {
    return this.fetchOpenGraphImage(url);
  }

  async fetchArticle(url: string): Promise<BrowserArticle> {
    const page = await this.browser.newPage();
    try {
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      });

      await this.browser.gotoArticlePage(page, url);

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
        image: this.browser.normalizeImageUrl(image, finalUrl),
        finalUrl,
      };
    } finally {
      await page.close();
    }
  }

  async searchGoogleNews(
    query: string,
    limit = 10,
  ): Promise<BrowserNewsSearchResult[]> {
    const serperNews = await this.serper.searchNews(query, limit);
    if (serperNews) return serperNews;

    // Google 직접 스크래핑은 CAPTCHA로 차단됨 — Serper API 키 없으면 빈 배열 반환
    return [];
  }

  async searchNews(
    request: BrowserNewsSearchRequest,
  ): Promise<BrowserNewsSearchResult[]> {
    return this.naverNewsSearch.searchNews(request);
  }
}
