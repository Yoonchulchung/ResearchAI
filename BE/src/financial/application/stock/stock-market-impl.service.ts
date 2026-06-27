import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCacheEntity } from 'src/financial/domain/stock/stock-cache.entity';
import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new (YahooFinanceClass as any)({
  suppressNotices: ['yahooSurvey'],
});
import {
  MARKET_TARGETS,
  StockCountry,
  StockInfo,
  StockQuote,
  StockSearchItem,
} from 'src/financial/domain/stock/stock-market.types';
import {
  hasKorean,
  resolveKoreanAliases,
} from 'src/financial/domain/stock/korean-company-aliases';

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

const YAHOO_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const YAHOO_HEADERS = {
  'User-Agent': YAHOO_UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://finance.yahoo.com',
  Referer: 'https://finance.yahoo.com/',
};

const NAVER_HEADERS = {
  'User-Agent': YAHOO_UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/* 시세 in-memory 캐시 (TTL: 30초 — DB 쓰기 불필요한 고빈도 폴링용) */

const VALID_RANGES = ['5d', '1mo', '3mo', '1y'] as const;

@Injectable()
export class StockMarketImplService {
  constructor(
    @InjectRepository(StockCacheEntity)
    private readonly cacheRepo: Repository<StockCacheEntity>,
  ) {}

  // ── DB 캐시 helpers ──────────────────────────────────────────────────

  private async dbGet<T>(key: string): Promise<T | null> {
    const row = await this.cacheRepo.findOne({ where: { key } });
    if (!row) return null;
    if (Date.now() > Number(row.expiresAt)) {
      void this.cacheRepo.delete({ key });
      return null;
    }
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  private async dbSet(
    key: string,
    value: unknown,
    ttlMs: number,
  ): Promise<void> {
    await this.cacheRepo.upsert(
      { key, value: JSON.stringify(value), expiresAt: Date.now() + ttlMs },
      ['key'],
    );
  }

  async searchStocks(
    query: string,
    requestedLimit = 10,
  ): Promise<StockSearchItem[]> {
    const normalized = query.trim();
    if (!normalized) return [];
    const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 20);

    const cacheKey = `search:${normalized}:${limit}`;
    const dbCached = await this.dbGet<StockSearchItem[]>(cacheKey);
    if (dbCached && dbCached.length > 0) return dbCached;

    // 심볼처럼 보이면 Yahoo 직접 조회를 우선 실행
    const looksLikeSymbol = /^[A-Z0-9.^=]{1,10}$/.test(
      normalized.toUpperCase(),
    );

    const tasks: Promise<StockSearchItem[]>[] = [
      this.searchNaverStocks(normalized, limit),
      this.searchYahooStocks(normalized, limit),
    ];

    if (looksLikeSymbol) {
      tasks.push(this.searchYahooBySymbols([normalized.toUpperCase()]));
    }

    // 한국어 쿼리이면 매핑된 심볼로 Yahoo 직접 조회 추가
    if (hasKorean(normalized)) {
      const symbols = resolveKoreanAliases(normalized);
      if (symbols.length > 0) {
        tasks.push(this.searchYahooBySymbols(symbols));
      }
    }

    const results = await Promise.all(tasks);
    const merged = [
      ...new Map(
        results.flat().map((item) => [item.symbol, item] as const),
      ).values(),
    ].slice(0, limit);

    if (merged.length > 0) {
      void this.dbSet(cacheKey, merged, 5 * 60_000); // 5분
    }
    return merged;
  }

  /** 심볼 목록을 Yahoo Finance search API로 직접 조회 */
  private async searchYahooBySymbols(
    symbols: string[],
  ): Promise<StockSearchItem[]> {
    const results = await Promise.allSettled(
      symbols.map((sym) => this.searchYahooStocks(sym, 1)),
    );
    return results
      .filter(
        (r): r is PromiseFulfilledResult<StockSearchItem[]> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value);
  }

  async getStockInfo(symbol: string): Promise<StockInfo> {
    const sym = symbol.trim().toUpperCase();
    const isKorean = /\.K[QS]$/.test(sym);
    const country: StockCountry = isKorean ? 'KR' : 'US';
    const currency = isKorean ? 'KRW' : 'USD';

    const empty: StockInfo = {
      symbol: sym,
      name: sym,
      exchange: isKorean ? 'KRX' : 'US',
      currency,
      country,
      price: null,
      marketCap: null,
      sharesOutstanding: null,
      week52High: null,
      week52Low: null,
      sector: null,
      industry: null,
      description: null,
      employees: null,
      foreignOwnershipPct: null,
      revenue: null,
      operatingIncome: null,
      netIncome: null,
      revenueGrowth: null,
      pe: null,
      pb: null,
      roe: null,
      eps: null,
    };

    const cacheKey = `info:${sym}`;
    const dbCached = await this.dbGet<StockInfo>(cacheKey);
    if (dbCached && dbCached.name !== sym) return dbCached; // 실제 데이터가 있는 경우만

    try {
      const yf = yahooFinance;
      const result = await yf.quoteSummary(sym, {
        modules: [
          'price',
          'summaryDetail',
          'assetProfile',
          'defaultKeyStatistics',
          'financialData',
        ],
      });

      const p = result?.price ?? {};
      const sd = result?.summaryDetail ?? {};
      const ap = result?.assetProfile ?? {};
      const ks = result?.defaultKeyStatistics ?? {};
      const fd = result?.financialData ?? {};

      const info: StockInfo = {
        symbol: sym,
        name: p.longName ?? p.shortName ?? sym,
        exchange: p.exchangeName ?? (isKorean ? 'KRX' : 'NYSE'),
        currency: p.currency ?? currency,
        country,
        price: p.regularMarketPrice ?? null,
        marketCap: sd.marketCap ?? null,
        sharesOutstanding: sd.sharesOutstanding ?? null,
        week52High: sd.fiftyTwoWeekHigh ?? null,
        week52Low: sd.fiftyTwoWeekLow ?? null,
        sector: ap.sector ?? null,
        industry: ap.industry ?? null,
        description: ap.longBusinessSummary ?? null,
        employees: ap.fullTimeEmployees ?? null,
        foreignOwnershipPct:
          ks.heldPercentInstitutions != null
            ? ks.heldPercentInstitutions * 100
            : null,
        revenue: fd.totalRevenue ?? null,
        operatingIncome: fd.operatingIncome ?? null,
        netIncome: fd.netIncomeToCommon ?? null,
        revenueGrowth: fd.revenueGrowth ?? null,
        pe: sd.trailingPE ?? null,
        pb: sd.priceToBook ?? null,
        roe: fd.returnOnEquity != null ? fd.returnOnEquity * 100 : null,
        eps: ks.trailingEps ?? null,
      };
      void this.dbSet(cacheKey, info, 60 * 60_000); // 1시간
      return info;
    } catch {
      return empty;
    }
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

    const quoteCacheKey = `quote:${normalizedSymbol}:${interval}:${before ?? ''}`;
    const quoteTtl = ['15m', '1h'].includes(interval)
      ? 15 * 60_000
      : 60 * 60_000;
    const cachedQuote = await this.dbGet<StockQuote>(quoteCacheKey);
    if (cachedQuote && cachedQuote.chart.length > 0) return cachedQuote;

    const config = this.intervalConfig(interval);
    const period2 = before
      ? Math.floor(new Date(before).getTime() / 1000)
      : undefined;
    try {
      const yf = yahooFinance;
      const p1 = period2
        ? new Date((period2 - config.chunkDays * 86400) * 1000)
        : this.rangeToPeriod1(config.range);
      const chartOpts: Record<string, unknown> = {
        interval: config.yahooInterval,
        period1: p1,
        ...(period2 ? { period2: new Date(period2 * 1000) } : {}),
      };
      const payload = await yf.chart(normalizedSymbol, chartOpts);
      const meta = payload?.meta;
      if (!meta) throw new Error('Yahoo Finance 데이터 없음');

      const previousClose: number | null =
        meta.previousClose ?? meta.chartPreviousClose ?? null;
      const price: number | null = meta.regularMarketPrice ?? null;
      const change =
        price != null && previousClose != null ? price - previousClose : null;
      const changePercent =
        change != null && previousClose ? (change / previousClose) * 100 : null;
      const intraday = ['15m', '1h', '4h'].includes(interval);

      // yahoo-finance2 v3: { meta, quotes[] } 구조
      const quotes: Array<{
        date: Date;
        open?: number;
        high?: number;
        low?: number;
        close?: number;
        volume?: number;
      }> = payload?.quotes ?? [];
      const raw = quotes
        .map((q) => {
          if (typeof q.close !== 'number') return null;
          const ts = Math.floor(
            (q.date instanceof Date ? q.date : new Date(q.date)).getTime() /
              1000,
          );
          return {
            date: this.formatCandleDate(ts, intraday),
            open: q.open ?? null,
            high: q.high ?? null,
            low: q.low ?? null,
            close: q.close,
            volume: q.volume ?? null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const chart =
        config.aggregate > 1
          ? this.aggregateCandles(raw, config.aggregate)
          : raw;

      const quoteResult: StockQuote = {
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
      void this.dbSet(quoteCacheKey, quoteResult, quoteTtl);
      return quoteResult;
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
    const yf = yahooFinance;
    const fetchOne = async ({
      symbol,
      name,
    }: {
      symbol: string;
      name: string;
    }): Promise<MarketItem | null> => {
      try {
        const q = await yf.quote(symbol);
        if (!q) return null;
        const price: number = q.regularMarketPrice ?? 0;
        const prev: number = q.regularMarketPreviousClose ?? price;
        const change = price - prev;
        const changePercent = prev !== 0 ? (change / prev) * 100 : 0;
        return {
          symbol,
          name: name || q.shortName || q.longName || symbol,
          price,
          change,
          changePercent,
          currency: q.currency ?? 'USD',
        };
      } catch {
        return null;
      }
    };

    const results = await Promise.all(MARKET_TARGETS.map(fetchOne));
    return results.filter((r): r is MarketItem => r !== null);
  }

  async getMarketPrice(symbol: string): Promise<MarketItem | null> {
    const cacheKey = `price:${symbol}`;
    const PRICE_TTL = 5 * 60_000; // 5분

    const dbCached = await this.dbGet<MarketItem>(cacheKey);
    if (dbCached) return dbCached;

    try {
      const yf = yahooFinance;
      const q = await yf.quote(symbol);
      if (!q) return null;
      const price: number = q.regularMarketPrice ?? 0;
      const prev: number = q.regularMarketPreviousClose ?? price;
      const change = price - prev;
      const changePercent = prev !== 0 ? (change / prev) * 100 : 0;
      const result: MarketItem = {
        symbol,
        name: q.shortName ?? q.longName ?? symbol,
        price,
        change,
        changePercent,
        currency: q.currency ?? 'USD',
      };
      await this.dbSet(cacheKey, result, PRICE_TTL);
      return result;
    } catch (e) {
      Logger.warn(
        `[getMarketPrice] ${symbol}: ${(e as Error).message}`,
        'StockMarketService',
      );
      return null;
    }
  }

  async getMarketChart(symbol: string, range: string): Promise<ChartPoint[]> {
    const validRange = (VALID_RANGES as readonly string[]).includes(range)
      ? range
      : '1mo';
    const interval = validRange === '1y' ? '1wk' : '1d';

    const chartCacheKey = `chart:${symbol}:${validRange}`;
    const chartTtl =
      validRange === '5d'
        ? 15 * 60_000
        : validRange === '1mo'
          ? 60 * 60_000
          : 4 * 60 * 60_000; // 3mo/1y → 4시간
    const cachedChart = await this.dbGet<ChartPoint[]>(chartCacheKey);
    if (cachedChart && cachedChart.length > 0) return cachedChart;

    try {
      const yf = yahooFinance;
      const payload = await yf.chart(symbol, {
        interval,
        period1: this.rangeToPeriod1(validRange),
      });
      // yahoo-finance2 v3: { meta, quotes[] }
      const quotes: Array<{
        date: Date;
        open?: number;
        high?: number;
        low?: number;
        close?: number;
      }> = payload?.quotes ?? [];
      const points = quotes
        .map((q) => ({
          date: (q.date instanceof Date ? q.date : new Date(q.date))
            .toISOString()
            .split('T')[0],
          close: q.close ?? 0,
          open: q.open ?? 0,
          high: q.high ?? 0,
          low: q.low ?? 0,
        }))
        .filter((p) => p.close > 0);

      if (points.length > 0) void this.dbSet(chartCacheKey, points, chartTtl);
      return points;
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
        { headers: NAVER_HEADERS, signal: AbortSignal.timeout(6000) },
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

  private rangeToPeriod1(range: string): Date {
    const now = Date.now();
    const day = 86400_000;
    const map: Record<string, number> = {
      '5d': 5 * day,
      '60d': 60 * day,
      '1mo': 31 * day,
      '3mo': 92 * day,
      '6mo': 183 * day,
      '1y': 365 * day,
      '2y': 730 * day,
      '5y': 1825 * day,
    };
    return new Date(now - (map[range] ?? 730 * day));
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
