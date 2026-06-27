import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  StockInvestorItem,
  StockInvestorType,
  StockRankingItem,
  StockRankingType,
  StockSectorItem,
} from 'src/financial/domain/stock/stock-market.types';

type NaverMarket = 'KOSPI' | 'KOSDAQ';

interface NaverStock {
  itemCode: string;
  stockName: string;
  closePriceRaw?: string;
  compareToPreviousClosePriceRaw?: string;
  fluctuationsRatio?: string;
  accumulatedTradingVolumeRaw?: string;
  accumulatedTradingValueRaw?: string;
  marketValueRaw?: string;
  endUrl?: string;
  itemLogoPngUrl?: string;
  stockExchangeType?: { nameEng?: string };
}

interface NaverStockListResponse {
  stocks?: NaverStock[];
}

interface NaverGroupResponse {
  groups?: {
    no: number;
    name: string;
    totalCount: number;
    changeRate: string;
    riseCount: number;
    fallCount: number;
    steadyCount: number;
  }[];
}

const NAVER_MOBILE = 'https://m.stock.naver.com/api/stocks';
const NAVER_FINANCE = 'https://finance.naver.com';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

const RANKING_PATHS: Record<
  Exclude<StockRankingType, 'tradingValue'>,
  string
> = {
  gainers: 'up',
  losers: 'down',
  high52week: 'high52week',
  volume: 'quantTop',
};

@Injectable()
export class NaverStockMarketAdapter {
  async getRankings(
    type: StockRankingType,
    limit: number,
  ): Promise<StockRankingItem[]> {
    if (type === 'tradingValue') {
      const candidates = await Promise.all([
        this.fetchRankedStocks('quantTop', 100),
        this.fetchRankedStocks('marketValue', 100),
      ]);
      return this.unique(candidates.flat())
        .sort((a, b) => b.tradingValue - a.tradingValue)
        .slice(0, limit);
    }

    return (await this.fetchRankedStocks(RANKING_PATHS[type], limit))
      .sort((a, b) => this.compare(type, a, b))
      .slice(0, limit);
  }

  async getInvestorRankings(
    limit: number,
  ): Promise<Record<StockInvestorType, StockInvestorItem[]>> {
    const [institution, foreign] = await Promise.all([
      this.fetchInvestor('institution', '1000'),
      this.fetchInvestor('foreign', '9000'),
    ]);
    const flow = new Map<
      string,
      { item: StockInvestorItem; amount: number; volume: number }
    >();

    for (const item of [...institution, ...foreign]) {
      const key = `${item.exchange}:${item.symbol}`;
      const previous = flow.get(key);
      flow.set(key, {
        item,
        amount: (previous?.amount ?? 0) + item.netBuyAmount,
        volume: (previous?.volume ?? 0) + item.netBuyVolume,
      });
    }

    const individual = [...flow.values()]
      .map(({ item, amount, volume }) => ({
        ...item,
        investor: 'individual' as const,
        netBuyAmount: -amount,
        netBuyVolume: -volume,
        estimated: true,
      }))
      .filter((item) => item.netBuyAmount > 0)
      .sort((a, b) => b.netBuyAmount - a.netBuyAmount)
      .slice(0, limit);

    return {
      foreign: foreign
        .filter((item) => item.netBuyAmount > 0)
        .sort((a, b) => b.netBuyAmount - a.netBuyAmount)
        .slice(0, limit),
      institution: institution
        .filter((item) => item.netBuyAmount > 0)
        .sort((a, b) => b.netBuyAmount - a.netBuyAmount)
        .slice(0, limit),
      individual,
    };
  }

  getIndustries(limit: number): Promise<StockSectorItem[]> {
    return this.fetchGroups('industry', limit);
  }

  getThemes(limit: number): Promise<StockSectorItem[]> {
    return this.fetchGroups('theme', limit);
  }

  private async fetchRankedStocks(
    path: string,
    pageSize: number,
  ): Promise<StockRankingItem[]> {
    const results = await Promise.all(
      (['KOSPI', 'KOSDAQ'] as const).map(async (market) => {
        const url = `${NAVER_MOBILE}/${path}/${market}?page=1&pageSize=${pageSize}`;
        const response = await fetch(url, {
          headers: HEADERS,
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return [];
        const data = (await response.json()) as NaverStockListResponse;
        return (data.stocks ?? []).map((stock) =>
          this.toRankingItem(stock, market),
        );
      }),
    );
    return this.unique(results.flat());
  }

  private async fetchInvestor(
    investor: Exclude<StockInvestorType, 'individual'>,
    investorCode: string,
  ): Promise<StockInvestorItem[]> {
    const results = await Promise.all(
      (['KOSPI', 'KOSDAQ'] as const).flatMap((market) =>
        (['buy', 'sell'] as const).map(async (side) => {
          const sosok = market === 'KOSPI' ? '01' : '02';
          const url = `${NAVER_FINANCE}/sise/sise_deal_rank_iframe.naver?sosok=${sosok}&investor_gubun=${investorCode}&type=${side}`;
          const response = await fetch(url, {
            headers: HEADERS,
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) return [];
          const html = new TextDecoder('euc-kr').decode(
            await response.arrayBuffer(),
          );
          const $ = cheerio.load(html);
          const items: StockInvestorItem[] = [];

          $('table.type_1 tr').each((_, row) => {
            const link = $(row).find('a.tltle');
            const href = link.attr('href') ?? '';
            const symbol = href.match(/code=([0-9A-Z]+)/)?.[1];
            const cells = $(row)
              .find('td')
              .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
              .get();
            if (!symbol || cells.length < 4) return;

            const volume = this.number(cells[1]);
            const amount = this.number(cells[2]);
            items.push({
              investor,
              country: 'KR',
              exchange: market,
              symbol,
              name: link.text().trim(),
              netBuyVolume:
                side === 'buy' ? Math.abs(volume) : -Math.abs(volume),
              netBuyAmount:
                (side === 'buy' ? Math.abs(amount) : -Math.abs(amount)) *
                1_000_000,
              estimated: false,
              detailUrl: `${NAVER_FINANCE}/item/main.naver?code=${symbol}`,
            });
          });
          return items;
        }),
      ),
    );
    return [
      ...new Map(
        results
          .flat()
          .sort((a, b) => Math.abs(b.netBuyAmount) - Math.abs(a.netBuyAmount))
          .map((item) => [item.symbol, item] as const),
      ).values(),
    ];
  }

  private async fetchGroups(
    type: 'industry' | 'theme',
    limit: number,
  ): Promise<StockSectorItem[]> {
    const response = await fetch(
      `${NAVER_MOBILE}/${type}?page=1&pageSize=${limit}`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as NaverGroupResponse;
    return (data.groups ?? []).map((group) => ({
      country: 'KR',
      id: `${type}-${group.no}`,
      name: group.name,
      changePercent: this.number(group.changeRate),
      riseCount: group.riseCount,
      fallCount: group.fallCount,
      steadyCount: group.steadyCount,
      totalCount: group.totalCount,
    }));
  }

  private toRankingItem(
    stock: NaverStock,
    market: NaverMarket,
  ): StockRankingItem {
    return {
      country: 'KR',
      exchange: stock.stockExchangeType?.nameEng ?? market,
      symbol: stock.itemCode,
      name: stock.stockName,
      price: this.number(stock.closePriceRaw),
      change: this.number(stock.compareToPreviousClosePriceRaw),
      changePercent: this.number(stock.fluctuationsRatio),
      volume: this.number(stock.accumulatedTradingVolumeRaw),
      tradingValue: this.number(stock.accumulatedTradingValueRaw),
      marketCap: this.number(stock.marketValueRaw),
      currency: 'KRW',
      logoUrl: stock.itemCode
        ? `/api/financial/logo/${stock.itemCode}`
        : stock.itemLogoPngUrl,
      detailUrl:
        stock.endUrl ??
        `https://m.stock.naver.com/domestic/stock/${stock.itemCode}`,
    };
  }

  private compare(
    type: Exclude<StockRankingType, 'tradingValue'>,
    a: StockRankingItem,
    b: StockRankingItem,
  ): number {
    if (type === 'gainers') return b.changePercent - a.changePercent;
    if (type === 'losers') return a.changePercent - b.changePercent;
    if (type === 'volume') return b.volume - a.volume;
    return b.changePercent - a.changePercent;
  }

  private unique(items: StockRankingItem[]): StockRankingItem[] {
    return [
      ...new Map(
        items.map((item) => [`${item.exchange}:${item.symbol}`, item]),
      ).values(),
    ];
  }

  private number(value?: string): number {
    const parsed = Number((value ?? '').replace(/,/g, '').replace(/%/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
