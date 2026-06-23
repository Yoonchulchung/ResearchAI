import { Inject, Injectable } from '@nestjs/common';
import {
  BROWSER_AUTOMATION_PORT,
  BrowserAutomationPort,
} from 'src/browse/application/ports/browser-automation.port';
import {
  BrowserArticle,
  BrowserLiveVideo,
  BrowserNewsSearchRequest,
  BrowserNewsSearchResult,
  BrowserOpenGraph,
  BrowserPdfOptions,
  BrowserRenderedHtmlOptions,
  BrowserSearchResult,
  BrowserWebSearchResult,
} from 'src/browse/application/browser.types';

/**
 * 다른 모듈이 사용하는 브라우저 기능 파사드.
 *
 * 이 파일만 읽으면 프로젝트가 제공하는 브라우저 기능을 파악할 수 있다.
 * 실제 DOM 선택자, 브라우저 재시작, 타임아웃과 같은 엔진 세부 구현은
 * infrastructure 어댑터에 숨겨져 있다.
 */
@Injectable()
export class BrowserService {
  constructor(
    @Inject(BROWSER_AUTOMATION_PORT)
    private readonly driver: BrowserAutomationPort,
  ) {}

  search(
    query: string,
    limit = 8,
    offset = 0,
    options: { includeImages?: boolean } = {},
  ): Promise<BrowserSearchResult[]> {
    return this.driver.search(query, limit, offset, options);
  }

  searchWeb(query: string, limit = 10): Promise<BrowserWebSearchResult[]> {
    return this.driver.searchWeb(query, limit);
  }

  fetchArticle(url: string): Promise<BrowserArticle> {
    return this.driver.fetchArticle(url);
  }

  /**
   * Puppeteer 없이 HTTP fetch로 빠르게 기사 본문 텍스트를 추출합니다.
   * JS 렌더링이 필요 없는 정적 페이지에 적합하며, searchAnswer 등 속도가
   * 중요한 컨텍스트에서 사용하세요.
   */
  async fetchArticleText(url: string, maxChars = 1500): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ResearchAI/1.0; +https://localhost)',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return '';
      const html = await res.text();

      const stripped = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<(nav|header|footer|aside|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')
        .trim();

      return stripped.substring(0, maxChars);
    } catch {
      return '';
    }
  }

  fetchOpenGraph(url: string): Promise<BrowserOpenGraph> {
    return this.driver.fetchOpenGraph(url);
  }

  fetchRenderedHtml(
    url: string,
    waitSelector?: string,
    options: BrowserRenderedHtmlOptions = {},
  ): Promise<string | null> {
    return this.driver.fetchRenderedHtml(url, waitSelector, options);
  }

  searchNews(
    request: BrowserNewsSearchRequest,
  ): Promise<BrowserNewsSearchResult[]> {
    return this.driver.searchNews(request);
  }

  findLiveVideo(
    channelUrl: string,
    channelName: string,
  ): Promise<BrowserLiveVideo | null> {
    return this.driver.findLiveVideo(channelUrl, channelName);
  }

  renderPdf(html: string, options: BrowserPdfOptions = {}): Promise<Buffer> {
    return this.driver.renderPdf(html, options);
  }
}
