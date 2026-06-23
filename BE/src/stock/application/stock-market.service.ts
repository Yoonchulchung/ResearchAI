import { Injectable } from '@nestjs/common';
import {
  MARKET_TARGETS,
  StockQuote,
  StockSearchItem,
  YahooChartResponse,
  YahooChartQuote,
} from 'src/stock/domain/stock-market.types';

export interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  close: number;
  open: number;
  high: number;
  low: number;
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)',
};
const VALID_RANGES = ['5d', '1mo', '3mo', '1y'] as const;

async function fetchYahooChart(
  symbol: string,
  interval: string,
  range: string,
): Promise<YahooChartResponse> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  return res.json() as Promise<YahooChartResponse>;
}

@Injectable()
export class StockMarketService {
  async searchStocks(
    query: string,
    requestedLimit = 10,
  ): Promise<StockSearchItem[]> {
    const normalized = query.trim();
    if (!normalized) return [];
    const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 20);
    const [naver, yahoo] = await Promise.all([
      this.searchNaverStocks(normalized, limit),
      this.searchYahooStocks(normalized, limit),
    ]);
    return [
      ...new Map(
        [...naver, ...yahoo].map((item) => [item.symbol, item] as const),
      ).values(),
    ].slice(0, limit);
  }

  async getStockQuote(
    symbol: string,
    name: string,
    interval = '1d',
    before?: string,
  ): Promise<StockQuote> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const fetchedAt = new Date().toISOString();
    if (!normalizedSymbol) {
      return this.emptyQuote(
        symbol,
        name,
        interval,
        fetchedAt,
        '종목코드가 없습니다.',
      );
    }

    const config = this.intervalConfig(interval);
    const period2 = before
      ? Math.floor(new Date(before).getTime() / 1000)
      : undefined;
    const params = period2
      ? `period1=${period2 - config.chunkDays * 86400}&period2=${period2}`
      : `range=${config.range}`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?${params}&interval=${config.yahooInterval}`;

    try {
      const response = await fetch(url, {
        headers: YAHOO_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(`Yahoo Finance HTTP ${response.status}`);
      const payload = (await response.json()) as YahooChartResponse;
      const result = payload.chart?.result?.[0];
      if (!result) throw new Error('Yahoo Finance 데이터 없음');

      const meta = result.meta;
      const previousClose =
        meta.previousClose ?? meta.chartPreviousClose ?? null;
      const price = meta.regularMarketPrice ?? null;
      const change =
        price != null && previousClose != null ? price - previousClose : null;
      const changePercent =
        change != null && previousClose ? (change / previousClose) * 100 : null;
      const quote = result.indicators.quote[0];
      const intraday = ['15m', '1h', '4h'].includes(interval);
      const raw = result.timestamp
        .map((timestamp, index) => {
          const close = quote.close[index];
          if (typeof close !== 'number') return null;
          return {
            date: this.formatCandleDate(timestamp, intraday),
            open: this.valueAt(quote.open, index),
            high: this.valueAt(quote.high, index),
            low: this.valueAt(quote.low, index),
            close,
            volume: this.valueAt(quote.volume, index),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const chart =
        config.aggregate > 1
          ? this.aggregateCandles(raw, config.aggregate)
          : raw;

      return {
        symbol: normalizedSymbol,
        stockCode: normalizedSymbol.match(/^([0-9A-Z]+)\.K[QS]$/)?.[1] ?? null,
        companyName:
          name || meta.shortName || meta.longName || normalizedSymbol,
        currency: meta.currency ?? null,
        exchangeName: meta.fullExchangeName ?? meta.exchangeName ?? null,
        regularMarketPrice: price,
        previousClose,
        change,
        changePercent,
        marketCap: null,
        marketMetrics: null,
        chart,
        interval,
        source: 'Yahoo Finance',
        fetchedAt,
      };
    } catch (error) {
      return this.emptyQuote(
        normalizedSymbol,
        name,
        interval,
        fetchedAt,
        (error as Error).message,
      );
    }
  }

  async getMarketData(): Promise<MarketItem[]> {
    const fetchOne = async ({
      symbol,
      name,
    }: {
      symbol: string;
      name: string;
    }): Promise<MarketItem | null> => {
      try {
        const data = await fetchYahooChart(symbol, '1d', '2d');
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) return null;

        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose;
        const change = price - prev;
        const changePercent = prev !== 0 ? (change / prev) * 100 : 0;

        return {
          symbol,
          name,
          price,
          change,
          changePercent,
          currency: meta.currency,
        };
      } catch {
        return null;
      }
    };

    const results = await Promise.all(MARKET_TARGETS.map(fetchOne));
    return results.filter((r): r is MarketItem => r !== null);
  }

  async getMarketPrice(symbol: string): Promise<MarketItem | null> {
    try {
      const data = await fetchYahooChart(symbol, '1d', '2d');
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose;
      const change = price - prev;
      const changePercent = prev !== 0 ? (change / prev) * 100 : 0;
      return {
        symbol,
        name: meta.shortName ?? meta.longName ?? symbol,
        price,
        change,
        changePercent,
        currency: meta.currency,
      };
    } catch {
      return null;
    }
  }

  async getMarketChart(symbol: string, range: string): Promise<ChartPoint[]> {
    const validRange = (VALID_RANGES as readonly string[]).includes(range)
      ? range
      : '1mo';
    const interval = validRange === '1y' ? '1wk' : '1d';

    try {
      const data = await fetchYahooChart(symbol, interval, validRange);
      const result = data?.chart?.result?.[0];
      if (!result) return [];

      const { timestamp, indicators } = result;
      const quote: YahooChartQuote = indicators.quote[0];

      return timestamp
        .map((ts, i) => ({
          date: new Date(ts * 1000).toISOString().split('T')[0],
          close: quote.close[i] ?? 0,
          open: quote.open[i] ?? 0,
          high: quote.high[i] ?? 0,
          low: quote.low[i] ?? 0,
        }))
        .filter((p) => p.close > 0);
    } catch {
      return [];
    }
  }

  private async searchNaverStocks(
    query: string,
    limit: number,
  ): Promise<StockSearchItem[]> {
    try {
      const response = await fetch(
        `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`,
        { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(6000) },
      );
      if (!response.ok) return [];
      const data = (await response.json()) as {
        items?: {
          code?: string;
          name?: string;
          typeCode?: string;
          typeName?: string;
          nationCode?: string;
          category?: string;
        }[];
      };
      return (data.items ?? [])
        .filter(
          (item) =>
            item.category === 'stock' &&
            item.nationCode === 'KOR' &&
            item.code &&
            item.name,
        )
        .map((item) => ({
          symbol: `${item.code}.${item.typeCode === 'KOSDAQ' ? 'KQ' : 'KS'}`,
          stockCode: item.code ?? null,
          name: item.name ?? item.code ?? '',
          exchange: item.typeName ?? item.typeCode ?? 'Korea',
          country: 'KR' as const,
          currency: 'KRW' as const,
        }))
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  private async searchYahooStocks(
    query: string,
    limit: number,
  ): Promise<StockSearchItem[]> {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${limit}&newsCount=0`,
        { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(6000) },
      );
      if (!response.ok) return [];
      const data = (await response.json()) as {
        quotes?: {
          symbol?: string;
          shortname?: string;
          longname?: string;
          exchDisp?: string;
          exchange?: string;
          quoteType?: string;
        }[];
      };
      return (data.quotes ?? [])
        .filter(
          (item) =>
            item.symbol &&
            (item.quoteType === 'EQUITY' || item.quoteType === 'ETF'),
        )
        .map((item) => {
          const isKorean = /\.K[QS]$/.test(item.symbol ?? '');
          return {
            symbol: item.symbol ?? '',
            stockCode: item.symbol?.match(/^([0-9A-Z]+)\.K[QS]$/)?.[1] ?? null,
            name: item.shortname ?? item.longname ?? item.symbol ?? '',
            exchange: item.exchDisp ?? item.exchange ?? 'US',
            country: isKorean ? ('KR' as const) : ('US' as const),
            currency: isKorean ? ('KRW' as const) : ('USD' as const),
          };
        })
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  private intervalConfig(interval: string): {
    yahooInterval: string;
    range: string;
    aggregate: number;
    chunkDays: number;
  } {
    if (interval === '15m')
      return { yahooInterval: '15m', range: '5d', aggregate: 1, chunkDays: 5 };
    if (interval === '1h')
      return {
        yahooInterval: '60m',
        range: '60d',
        aggregate: 1,
        chunkDays: 60,
      };
    if (interval === '4h')
      return {
        yahooInterval: '60m',
        range: '60d',
        aggregate: 4,
        chunkDays: 60,
      };
    if (interval === '1w')
      return {
        yahooInterval: '1wk',
        range: '5y',
        aggregate: 1,
        chunkDays: 1825,
      };
    return { yahooInterval: '1d', range: '2y', aggregate: 1, chunkDays: 730 };
  }

  private formatCandleDate(timestamp: number, intraday: boolean): string {
    const date = new Date(timestamp * 1000);
    if (!intraday) return date.toISOString().slice(0, 10);
    return new Date(date.getTime() + 9 * 3600 * 1000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
  }

  private valueAt(values: (number | null)[], index: number): number | null {
    const value = values[index];
    return typeof value === 'number' ? value : null;
  }

  private aggregateCandles(
    candles: StockQuote['chart'],
    size: number,
  ): StockQuote['chart'] {
    const result: StockQuote['chart'] = [];
    for (let index = 0; index < candles.length; index += size) {
      const group = candles.slice(index, index + size);
      if (!group.length) continue;
      const highs = group
        .map((item) => item.high)
        .filter((value): value is number => value != null);
      const lows = group
        .map((item) => item.low)
        .filter((value): value is number => value != null);
      result.push({
        date: group[0].date,
        open: group[0].open,
        high: highs.length ? Math.max(...highs) : null,
        low: lows.length ? Math.min(...lows) : null,
        close: group[group.length - 1].close,
        volume: group.reduce<number | null>(
          (sum, item) => (item.volume == null ? sum : (sum ?? 0) + item.volume),
          null,
        ),
      });
    }
    return result;
  }

  private emptyQuote(
    symbol: string,
    name: string,
    interval: string,
    fetchedAt: string,
    error: string,
  ): StockQuote {
    return {
      symbol: symbol || null,
      stockCode: symbol.match(/^([0-9A-Z]+)\.K[QS]$/)?.[1] ?? null,
      companyName: name || symbol,
      currency: null,
      exchangeName: null,
      regularMarketPrice: null,
      previousClose: null,
      change: null,
      changePercent: null,
      marketCap: null,
      marketMetrics: null,
      chart: [],
      interval,
      source: 'Yahoo Finance',
      fetchedAt,
      error,
    };
  }
}
