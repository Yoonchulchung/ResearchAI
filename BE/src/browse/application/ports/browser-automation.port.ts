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
 * 브라우저 엔진 교체 지점.
 *
 * application과 다른 도메인 모듈은 Puppeteer/Playwright 같은 구현체를
 * 직접 import하지 않고 이 계약만 사용한다. 새 엔진을 추가할 때는 이
 * 추상 클래스를 구현하고 BrowseModule의 provider 한 곳만 교체하면 된다.
 *
 * 의도적으로 Page/Browser 객체를 노출하지 않는다. 엔진 객체가 밖으로
 * 새면 호출부가 특정 라이브러리에 결합되고, 기능 파악을 위해 거대한
 * 구현 파일을 읽어야 하기 때문이다.
 */
export abstract class BrowserAutomationPort {
  /** 검색 결과 수집. 구현체는 검색 엔진 폴백과 이미지 보강을 처리한다. */
  abstract search(
    query: string,
    limit?: number,
    offset?: number,
    options?: { includeImages?: boolean },
  ): Promise<BrowserSearchResult[]>;

  /** 소스 도메인이 포함된 범용 웹 검색. */
  abstract searchWeb(
    query: string,
    limit?: number,
  ): Promise<BrowserWebSearchResult[]>;

  /** JS 렌더링 후 기사 제목·본문·대표 이미지를 추출한다. */
  abstract fetchArticle(url: string): Promise<BrowserArticle>;

  /** 대표 이미지만 가볍게 추출한다. */
  abstract fetchOpenGraph(url: string): Promise<BrowserOpenGraph>;

  /** 동적 페이지를 렌더링한 최종 HTML을 반환한다. */
  abstract fetchRenderedHtml(
    url: string,
    waitSelector?: string,
    options?: BrowserRenderedHtmlOptions,
  ): Promise<string | null>;

  /** 네이버 뉴스 검색 화면을 구조화된 데이터로 변환한다. */
  abstract searchNews(
    request: BrowserNewsSearchRequest,
  ): Promise<BrowserNewsSearchResult[]>;

  /** 채널의 현재 YouTube 라이브 방송을 확인한다. */
  abstract findLiveVideo(
    channelUrl: string,
    channelName: string,
  ): Promise<BrowserLiveVideo | null>;

  /** HTML 문서를 브라우저 인쇄 엔진으로 PDF로 렌더링한다. */
  abstract renderPdf(
    html: string,
    options?: BrowserPdfOptions,
  ): Promise<Buffer>;
}

/**
 * Nest DI 토큰. 구현체 이름을 호출부에서 숨겨 엔진 교체 범위를
 * BrowseModule 하나로 제한한다.
 */
export const BROWSER_AUTOMATION_PORT = Symbol('BROWSER_AUTOMATION_PORT');
