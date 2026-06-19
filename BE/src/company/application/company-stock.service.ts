import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { CompanyStockQuote } from './company.service';

@Injectable()
export class CompanyStockService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly repo: Repository<CompanyEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
  ) {}

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  async getMarketMetricsByStockCode(
    stockCode: string | null | undefined,
  ): Promise<CompanyStockQuote['marketMetrics']> {
    if (!stockCode?.trim()) return null;
    const data = await this.fetchNaverStockData(stockCode).catch(() => null);
    return data?.marketMetrics ?? null;
  }

  async getStockQuote(
    idOrName: string,
    interval: string = '1d',
    before?: string,
  ): Promise<CompanyStockQuote> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [
        { id: idOrName },
        { normalizedName: normalized },
        { name: idOrName },
      ],
    });
    if (!company) throw new NotFoundException('기업을 찾을 수 없습니다.');

    const financial = await this.financialRepo.findOne({
      where: { companyId: company.id },
    });
    const stockCode = financial?.stockCode ?? null;
    const fetchedAt = new Date().toISOString();

    if (!stockCode?.trim()) {
      return {
        symbol: null,
        stockCode: null,
        companyName: company.name,
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
        error: '저장된 종목코드가 없습니다.',
      };
    }

    const naverStockData = await this.fetchNaverStockData(stockCode).catch(
      () => null,
    );
    const candidates = this.stockSymbolCandidates(
      stockCode,
      naverStockData?.exchangeCode,
    );
    for (const symbol of candidates) {
      const quote = await this.fetchYahooChart(
        symbol,
        company.name,
        stockCode,
        fetchedAt,
        interval,
        before,
      ).catch(() => null);
      if (quote && (quote.regularMarketPrice != null || before)) {
        if (!before && naverStockData?.regularMarketPrice != null) {
          quote.regularMarketPrice = naverStockData.regularMarketPrice;
          quote.previousClose =
            naverStockData.previousClose ?? quote.previousClose;
          quote.change =
            naverStockData.change ??
            (quote.previousClose != null
              ? quote.regularMarketPrice - quote.previousClose
              : null);
          quote.changePercent =
            naverStockData.changePercent ??
            (quote.change != null && quote.previousClose
              ? (quote.change / quote.previousClose) * 100
              : null);
          quote.source = 'Yahoo Finance + Naver Finance';

          if (interval === '1d' && naverStockData.tradingDate) {
            const realtimeCandle = {
              date: naverStockData.tradingDate,
              open: naverStockData.open,
              high: naverStockData.high,
              low: naverStockData.low,
              close: naverStockData.regularMarketPrice,
              volume: naverStockData.volume,
            };
            const existingIndex = quote.chart.findIndex(
              (candle) => candle.date === realtimeCandle.date,
            );
            if (existingIndex >= 0) {
              quote.chart[existingIndex] = {
                ...quote.chart[existingIndex],
                ...realtimeCandle,
              };
            } else {
              quote.chart.push(realtimeCandle);
              quote.chart.sort((a, b) => a.date.localeCompare(b.date));
            }
          }

          if (interval === '15m' && naverStockData.tradingDate) {
            const todayChart = await this.fetchNaverMinuteChart(stockCode, 15);
            if (todayChart.length > 0) {
              quote.chart = [
                ...quote.chart.filter(
                  (candle) =>
                    !candle.date.startsWith(naverStockData.tradingDate!),
                ),
                ...todayChart,
              ].sort((a, b) => a.date.localeCompare(b.date));
            }
          }
        }
        quote.marketCap =
          naverStockData?.marketCap ??
          this.estimateMarketCap(
            financial?.multiYearFinancials,
            quote.regularMarketPrice,
          );
        quote.marketMetrics = naverStockData?.marketMetrics ?? null;
        return quote;
      }
    }

    return {
      symbol: candidates[0] ?? stockCode,
      stockCode,
      companyName: company.name,
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
      error: '주식 데이터를 가져오지 못했습니다.',
    };
  }

  private stockSymbolCandidates(
    stockCode: string,
    exchangeCode?: string | null,
  ): string[] {
    const code = stockCode.trim();
    if (!code) return [];
    if (/[.]/.test(code) || /[A-Za-z]/.test(code)) return [code.toUpperCase()];
    const sixDigit = code.padStart(6, '0');
    if (exchangeCode === 'KQ') {
      return [`${sixDigit}.KQ`, `${sixDigit}.KS`, sixDigit];
    }
    if (exchangeCode === 'KS') {
      return [`${sixDigit}.KS`, `${sixDigit}.KQ`, sixDigit];
    }
    return [`${sixDigit}.KS`, `${sixDigit}.KQ`, sixDigit];
  }

  private intervalConfig(interval: string): {
    yahooInterval: string;
    range: string;
    aggregate: number;
    chunkDays: number;
    canLoadMore: boolean;
  } {
    switch (interval) {
      case '15m':
        return {
          yahooInterval: '15m',
          range: '5d',
          aggregate: 1,
          chunkDays: 5,
          canLoadMore: false,
        };
      case '1h':
        return {
          yahooInterval: '60m',
          range: '60d',
          aggregate: 1,
          chunkDays: 60,
          canLoadMore: false,
        };
      case '4h':
        return {
          yahooInterval: '60m',
          range: '60d',
          aggregate: 4,
          chunkDays: 60,
          canLoadMore: false,
        };
      case '1w':
        return {
          yahooInterval: '1wk',
          range: '5y',
          aggregate: 1,
          chunkDays: 365 * 5,
          canLoadMore: true,
        };
      default: // 1d
        return {
          yahooInterval: '1d',
          range: '2y',
          aggregate: 1,
          chunkDays: 365 * 2,
          canLoadMore: true,
        };
    }
  }

  private formatCandleDate(timestamp: number, intraday: boolean): string {
    const d = new Date(timestamp * 1000);
    if (!intraday) return d.toISOString().slice(0, 10);
    // KST = UTC+9
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 16).replace('T', ' ');
  }

  private async fetchYahooChart(
    symbol: string,
    companyName: string,
    stockCode: string,
    fetchedAt: string,
    interval: string = '1d',
    before?: string,
  ): Promise<CompanyStockQuote> {
    const { yahooInterval, range, aggregate, chunkDays } =
      this.intervalConfig(interval);
    let url: string;
    if (before) {
      const period2 = Math.floor(new Date(before).getTime() / 1000);
      const period1 = period2 - chunkDays * 86400;
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${yahooInterval}`;
    } else {
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${yahooInterval}`;
    }
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 ResearchAI/1.0',
        Accept: 'application/json',
      },
    });
    if (!response.ok)
      throw new Error(`Yahoo Finance 응답 오류: ${response.status}`);

    const payload = (await response.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            currency?: string;
            exchangeName?: string;
            regularMarketPrice?: number;
            previousClose?: number;
            chartPreviousClose?: number;
          };
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
      };
    };

    const result = payload.chart?.result?.[0];
    if (!result) throw new Error('Yahoo Finance 데이터 없음');

    const meta = result.meta ?? {};
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const regularMarketPrice =
      typeof meta.regularMarketPrice === 'number'
        ? meta.regularMarketPrice
        : null;
    const change =
      regularMarketPrice != null && previousClose != null
        ? regularMarketPrice - previousClose
        : null;
    const changePercent =
      change != null && previousClose ? (change / previousClose) * 100 : null;
    const q = result.indicators?.quote?.[0] ?? {};
    const opens = q.open ?? [];
    const highs = q.high ?? [];
    const lows = q.low ?? [];
    const closes = q.close ?? [];
    const volumes = q.volume ?? [];
    const timestamps = result.timestamp ?? [];
    const intraday = ['15m', '1h', '4h'].includes(interval);

    const num = (
      arr: Array<number | null | undefined>,
      i: number,
    ): number | null => {
      const v = arr[i];
      return typeof v === 'number' ? v : null;
    };

    type Candle = {
      date: string;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number;
      volume: number | null;
    };

    const raw: Candle[] = timestamps
      .map((ts, i) => {
        const close = closes[i];
        if (typeof close !== 'number') return null;
        return {
          date: this.formatCandleDate(ts, intraday),
          open: num(opens, i),
          high: num(highs, i),
          low: num(lows, i),
          close,
          volume: num(volumes, i),
        };
      })
      .filter((c): c is Candle => c !== null);

    // 4h 집계: 1h 캔들 4개씩 묶기
    const chart: Candle[] =
      aggregate > 1
        ? raw.reduce<Candle[]>((acc, candle, i) => {
            if (i % aggregate === 0) {
              const group = raw.slice(i, i + aggregate);
              const vol = group.reduce<number | null>(
                (s, g) => (g.volume != null ? (s ?? 0) + g.volume : s),
                null,
              );
              const highs2 = group
                .map((g) => g.high)
                .filter((v): v is number => v != null);
              const lows2 = group
                .map((g) => g.low)
                .filter((v): v is number => v != null);
              acc.push({
                date: candle.date,
                open: candle.open,
                high: highs2.length ? Math.max(...highs2) : null,
                low: lows2.length ? Math.min(...lows2) : null,
                close: group[group.length - 1].close,
                volume: vol,
              });
            }
            return acc;
          }, [])
        : raw;

    return {
      symbol,
      stockCode,
      companyName,
      currency: meta.currency ?? null,
      exchangeName: meta.exchangeName ?? null,
      regularMarketPrice,
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
  }

  private async fetchNaverStockData(stockCode: string): Promise<{
    exchangeCode: string | null;
    regularMarketPrice: number | null;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
    tradingDate: string | null;
    marketCap: number | null;
    marketMetrics: NonNullable<CompanyStockQuote['marketMetrics']>;
  } | null> {
    const code = stockCode.replace(/\D/g, '').padStart(6, '0');
    if (!code) return null;

    const fetchNaver = async <T>(path: string): Promise<T | null> => {
      const response = await fetch(
        `https://m.stock.naver.com/api/stock/${code}/${path}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ResearchAI/1.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) return null;
      return (await response.json()) as T;
    };

    const [basic, integration] = await Promise.all([
      fetchNaver<{
        closePrice?: string;
        compareToPreviousClosePrice?: string;
        fluctuationsRatio?: string;
        localTradedAt?: string;
        stockExchangeType?: {
          code?: string;
        };
      }>('basic'),
      fetchNaver<{
        totalInfos?: Array<{
          code?: string;
          key?: string;
          value?: string;
          valueDesc?: string;
        }>;
      }>('integration'),
    ]);
    if (!basic && !integration) return null;

    const infos = integration?.totalInfos ?? [];
    const find = (code: string) => infos.find((item) => item.code === code);
    const regularMarketPrice = this.parseMetricNumber(basic?.closePrice);
    const previousClose = this.parseMetricNumber(find('lastClosePrice')?.value);
    const directChange = this.parseMetricNumber(
      basic?.compareToPreviousClosePrice,
    );
    const change =
      directChange ??
      (regularMarketPrice != null && previousClose != null
        ? regularMarketPrice - previousClose
        : null);
    const directChangePercent = this.parseMetricNumber(
      basic?.fluctuationsRatio,
    );
    const changePercent =
      directChangePercent ??
      (change != null && previousClose ? (change / previousClose) * 100 : null);
    const tradingDate =
      basic?.localTradedAt?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const asOf =
      find('per')?.valueDesc ??
      find('pbr')?.valueDesc ??
      find('eps')?.valueDesc ??
      null;

    return {
      exchangeCode: basic?.stockExchangeType?.code ?? null,
      regularMarketPrice,
      previousClose,
      change,
      changePercent,
      open: this.parseMetricNumber(find('openPrice')?.value),
      high: this.parseMetricNumber(find('highPrice')?.value),
      low: this.parseMetricNumber(find('lowPrice')?.value),
      volume: this.parseMetricNumber(find('accumulatedTradingVolume')?.value),
      tradingDate,
      marketCap: this.parseKoreanMarketCap(find('marketValue')?.value),
      marketMetrics: {
        per: this.parseMetricNumber(find('per')?.value),
        pbr: this.parseMetricNumber(find('pbr')?.value),
        eps: this.parseMetricNumber(find('eps')?.value),
        bps: this.parseMetricNumber(find('bps')?.value),
        estimatedPer: this.parseMetricNumber(find('cnsPer')?.value),
        estimatedEps: this.parseMetricNumber(find('cnsEps')?.value),
        dividendYield: this.parseMetricNumber(
          find('dividendYieldRatio')?.value,
        ),
        dividend: this.parseMetricNumber(find('dividend')?.value),
        asOf,
        source: 'Naver Finance',
      },
    };
  }

  private async fetchNaverMinuteChart(
    stockCode: string,
    aggregateMinutes: number,
  ): Promise<CompanyStockQuote['chart']> {
    const code = stockCode.replace(/\D/g, '').padStart(6, '0');
    if (!code) return [];

    const response = await fetch(
      `https://api.stock.naver.com/chart/domestic/item/${code}/minute`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ResearchAI/1.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      },
    ).catch(() => null);
    if (!response?.ok) return [];

    const rows = (await response.json()) as Array<{
      localDateTime?: string;
      currentPrice?: number;
      openPrice?: number;
      highPrice?: number;
      lowPrice?: number;
      accumulatedTradingVolume?: number;
    }>;
    const grouped = new Map<string, CompanyStockQuote['chart'][number]>();

    for (const row of rows) {
      const rawDate = row.localDateTime;
      if (
        !rawDate ||
        rawDate.length < 12 ||
        typeof row.currentPrice !== 'number'
      ) {
        continue;
      }
      const minute = Number(rawDate.slice(10, 12));
      if (!Number.isFinite(minute)) continue;
      const bucketMinute =
        Math.floor(minute / aggregateMinutes) * aggregateMinutes;
      const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)} ${rawDate.slice(8, 10)}:${String(bucketMinute).padStart(2, '0')}`;
      const existing = grouped.get(date);
      if (!existing) {
        grouped.set(date, {
          date,
          open: row.openPrice ?? row.currentPrice,
          high: row.highPrice ?? row.currentPrice,
          low: row.lowPrice ?? row.currentPrice,
          close: row.currentPrice,
          volume: row.accumulatedTradingVolume ?? null,
        });
        continue;
      }

      existing.high = Math.max(
        existing.high ?? row.currentPrice,
        row.highPrice ?? row.currentPrice,
      );
      existing.low = Math.min(
        existing.low ?? row.currentPrice,
        row.lowPrice ?? row.currentPrice,
      );
      existing.close = row.currentPrice;
      if (row.accumulatedTradingVolume != null) {
        existing.volume = (existing.volume ?? 0) + row.accumulatedTradingVolume;
      }
    }

    return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  private parseMetricNumber(value?: string): number | null {
    if (!value || value === '-') return null;
    const parsed = Number(value.replace(/,/g, '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseKoreanMarketCap(value?: string): number | null {
    if (!value) return null;
    const normalized = value.replace(/,/g, '').replace(/\s+/g, '');
    const jo = Number(normalized.match(/([\d.]+)조/)?.[1] ?? 0);
    const eok = Number(normalized.match(/([\d.]+)억/)?.[1] ?? 0);
    if (!Number.isFinite(jo) || !Number.isFinite(eok)) return null;
    const result = jo * 1_000_000_000_000 + eok * 100_000_000;
    return result > 0 ? result : null;
  }

  private estimateMarketCap(
    rawFinancials: string | null | undefined,
    marketPrice: number | null,
  ): number | null {
    if (!rawFinancials || marketPrice == null) return null;
    try {
      const rows = JSON.parse(rawFinancials) as Array<{
        year?: number;
        totalEquity?: number | null;
        bps?: number | null;
      }>;
      const latest = rows
        .filter(
          (row) =>
            typeof row.year === 'number' &&
            typeof row.totalEquity === 'number' &&
            typeof row.bps === 'number' &&
            row.bps > 0,
        )
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
      if (latest?.totalEquity == null || latest.bps == null) return null;
      const shares = (latest.totalEquity * 100_000_000) / latest.bps;
      const result = shares * marketPrice;
      return Number.isFinite(result) && result > 0 ? result : null;
    } catch {
      return null;
    }
  }
}
