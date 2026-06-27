import { Injectable } from '@nestjs/common';
import {
  StockRankingItem,
  StockRankingType,
  StockSectorItem,
} from 'src/financial/domain/stock/stock-market.types';

interface YahooQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  currency?: string;
  sector?: string;
}

interface YahooScreenerResponse {
  finance?: {
    result?: { quotes?: YahooQuote[] }[];
  };
}

const YAHOO_SCREENER =
  'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ResearchAI/1.0)',
};
const US_SECTOR_ETFS = [
  ['XLK', 'Technology'],
  ['XLC', 'Communication Services'],
  ['XLY', 'Consumer Discretionary'],
  ['XLP', 'Consumer Staples'],
  ['XLE', 'Energy'],
  ['XLF', 'Financials'],
  ['XLV', 'Health Care'],
  ['XLI', 'Industrials'],
  ['XLB', 'Materials'],
  ['XLRE', 'Real Estate'],
  ['XLU', 'Utilities'],
] as const;

interface YahooChartResponse {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
      };
    }[];
  };
}

@Injectable()
export class YahooStockMarketAdapter {
  async getRankings(
    type: StockRankingType,
    limit: number,
  ): Promise<StockRankingItem[]> {
    const screener =
      type === 'gainers'
        ? 'day_gainers'
        : type === 'losers'
          ? 'day_losers'
          : 'most_actives';
    const quotes = await this.fetchScreener(
      screener,
      type === 'high52week' ? 100 : Math.max(limit, 40),
    );
    const items = quotes.map((quote) => this.toRankingItem(quote));

    if (type === 'high52week') {
      return items
        .filter(
          (item) =>
            item.fiftyTwoWeekHigh && item.price >= item.fiftyTwoWeekHigh * 0.97,
        )
        .sort(
          (a, b) =>
            b.price / (b.fiftyTwoWeekHigh ?? b.price) -
            a.price / (a.fiftyTwoWeekHigh ?? a.price),
        )
        .slice(0, limit);
    }
    if (type === 'tradingValue') {
      return items
        .sort((a, b) => b.tradingValue - a.tradingValue)
        .slice(0, limit);
    }
    if (type === 'volume') {
      return items.sort((a, b) => b.volume - a.volume).slice(0, limit);
    }
    return items.slice(0, limit);
  }

  async getSectors(limit: number): Promise<StockSectorItem[]> {
    const sectors = await Promise.all(
      US_SECTOR_ETFS.map(async ([symbol, name]) => {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
          { headers: HEADERS, signal: AbortSignal.timeout(8000) },
        );
        if (!response.ok) return null;
        const data = (await response.json()) as YahooChartResponse;
        const meta = data.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice ?? 0;
        const previous = meta?.chartPreviousClose ?? 0;
        const changePercent =
          previous > 0 ? ((price - previous) / previous) * 100 : 0;
        return {
          symbol,
          name,
          changePercent,
        };
      }),
    );

    return sectors
      .filter((sector): sector is NonNullable<typeof sector> => sector !== null)
      .map((sector) => ({
        country: 'US' as const,
        id: `us-sector-${sector.symbol.toLowerCase()}`,
        name: sector.name,
        changePercent: sector.changePercent,
        riseCount: sector.changePercent > 0 ? 1 : 0,
        fallCount: sector.changePercent < 0 ? 1 : 0,
        steadyCount: sector.changePercent === 0 ? 1 : 0,
        totalCount: 1,
      }))
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, limit);
  }

  private async fetchScreener(
    scrIds: string,
    count: number,
  ): Promise<YahooQuote[]> {
    const params = new URLSearchParams({
      scrIds,
      count: String(count),
      start: '0',
    });
    const response = await fetch(`${YAHOO_SCREENER}?${params.toString()}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as YahooScreenerResponse;
    return data.finance?.result?.[0]?.quotes ?? [];
  }

  private toRankingItem(quote: YahooQuote): StockRankingItem {
    const price = quote.regularMarketPrice ?? 0;
    const volume = quote.regularMarketVolume ?? 0;
    const symbol = quote.symbol ?? '';
    return {
      country: 'US',
      exchange: quote.fullExchangeName ?? quote.exchange ?? 'US',
      symbol,
      name: quote.shortName ?? quote.longName ?? symbol,
      price,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      volume,
      tradingValue: price * volume,
      marketCap: quote.marketCap ?? 0,
      currency: quote.currency === 'USD' ? 'USD' : 'USD',
      detailUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    };
  }
}
