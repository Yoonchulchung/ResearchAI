import { Injectable } from '@nestjs/common';
import { BrowserService } from 'src/browse/application/browser.service';
import {
  StockDashboard,
  StockNewsItem,
  StockRankingItem,
  StockRankingType,
} from 'src/financial/domain/stock/stock-market.types';
import { NaverStockMarketAdapter } from 'src/financial/infrastructure/stock/naver-stock-market.adapter';
import { YahooStockMarketAdapter } from 'src/financial/infrastructure/stock/yahoo-stock-market.adapter';

const RANKING_TYPES: StockRankingType[] = [
  'gainers',
  'losers',
  'high52week',
  'volume',
  'tradingValue',
];
const CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * 한국·미국 증시 데이터를 하나의 대시보드 모델로 조합한다.
 *
 * 국내/미국 제공처의 응답 차이는 infrastructure 어댑터에서 흡수하고,
 * 화면은 이 서비스가 반환하는 공통 타입만 사용한다.
 */
@Injectable()
export class StockDashboardImplService {
  private cache:
    | { expiresAt: number; limit: number; value: StockDashboard }
    | undefined;

  constructor(
    private readonly naver: NaverStockMarketAdapter,
    private readonly yahoo: YahooStockMarketAdapter,
    private readonly browser: BrowserService,
  ) {}

  async getDashboard(requestedLimit = 20): Promise<StockDashboard> {
    const limit = Math.min(Math.max(Math.floor(requestedLimit), 5), 40);
    if (
      this.cache &&
      this.cache.expiresAt > Date.now() &&
      this.cache.limit === limit
    ) {
      return this.cache.value;
    }

    const [rankingPairs, investors, krIndustries, krThemes, usSectors, news] =
      await Promise.all([
        Promise.all(
          RANKING_TYPES.map(async (type) => ({
            type,
            kr: await this.safe(() => this.naver.getRankings(type, limit), []),
            us: await this.safe(() => this.yahoo.getRankings(type, limit), []),
          })),
        ),
        this.safe(() => this.naver.getInvestorRankings(limit), {
          foreign: [],
          institution: [],
          individual: [],
        }),
        this.safe(() => this.naver.getIndustries(limit), []),
        this.safe(() => this.naver.getThemes(limit), []),
        this.safe(() => this.yahoo.getSectors(limit), []),
        this.getStockNews(),
      ]);

    const rankings = Object.fromEntries(
      rankingPairs.map(({ type, kr, us }) => [
        type,
        this.sortCombined(type, [...kr, ...us]).slice(0, limit * 2),
      ]),
    ) as StockDashboard['rankings'];

    const dashboard: StockDashboard = {
      generatedAt: new Date().toISOString(),
      rankings,
      investors,
      industries: [...krIndustries, ...usSectors],
      themes: [...krThemes, ...usSectors.slice(0, Math.ceil(limit / 2))],
      news,
    };
    this.cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      limit,
      value: dashboard,
    };
    return dashboard;
  }

  private async getStockNews(): Promise<StockNewsItem[]> {
    const searches = await Promise.all([
      this.safe(
        () =>
          this.browser.searchNews({
            query: '한국 증시 코스피 코스닥 주식',
          }),
        [],
      ),
      this.safe(
        () =>
          this.browser.searchNews({
            query: '미국 증시 나스닥 S&P500 뉴욕증시',
          }),
        [],
      ),
    ]);
    const items = [
      ...searches[0].slice(0, 8).map((item) => ({
        ...item,
        country: 'KR' as const,
      })),
      ...searches[1].slice(0, 8).map((item) => ({
        ...item,
        country: 'US' as const,
      })),
    ].map<StockNewsItem>((item) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt,
      snippet: item.snippet,
      imageUrl: item.imageUrl,
      country: item.country,
    }));

    return [
      ...new Map(items.map((item) => [item.url, item] as const)).values(),
    ].slice(0, 14);
  }

  private sortCombined(
    type: StockRankingType,
    items: StockRankingItem[],
  ): StockRankingItem[] {
    if (type === 'gainers') {
      return items.sort((a, b) => b.changePercent - a.changePercent);
    }
    if (type === 'losers') {
      return items.sort((a, b) => a.changePercent - b.changePercent);
    }
    if (type === 'volume') {
      return items.sort((a, b) => b.volume - a.volume);
    }
    if (type === 'tradingValue') {
      return items.sort(
        (a, b) =>
          this.toKrw(b.tradingValue, b.currency) -
          this.toKrw(a.tradingValue, a.currency),
      );
    }
    return items.sort((a, b) => {
      const aRatio = a.fiftyTwoWeekHigh
        ? a.price / a.fiftyTwoWeekHigh
        : a.changePercent;
      const bRatio = b.fiftyTwoWeekHigh
        ? b.price / b.fiftyTwoWeekHigh
        : b.changePercent;
      return bRatio - aRatio;
    });
  }

  private async safe<T>(task: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await task();
    } catch {
      return fallback;
    }
  }

  private toKrw(value: number, currency: 'KRW' | 'USD'): number {
    // 통합 순위 비교용 환산값. 실제 표시는 각 종목의 원 통화를 유지한다.
    return currency === 'USD' ? value * 1_400 : value;
  }
}
