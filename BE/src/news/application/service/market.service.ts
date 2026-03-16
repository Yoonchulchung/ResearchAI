import { Injectable } from '@nestjs/common';
import {
  MARKET_TARGETS,
  YahooChartResponse,
  YahooChartQuote,
} from '../../domain/market';

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

const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)' };
const VALID_RANGES = ['5d', '1mo', '3mo', '1y'] as const;

async function fetchYahooChart(symbol: string, interval: string, range: string): Promise<YahooChartResponse> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  return res.json() as Promise<YahooChartResponse>;
}

@Injectable()
export class MarketService {
  async getMarketData(): Promise<MarketItem[]> {
    const fetchOne = async ({ symbol, name }: { symbol: string; name: string }): Promise<MarketItem | null> => {
      try {
        const data = await fetchYahooChart(symbol, '1d', '2d');
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) return null;

        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose;
        const change = price - prev;
        const changePercent = prev !== 0 ? (change / prev) * 100 : 0;

        return { symbol, name, price, change, changePercent, currency: meta.currency };
      } catch {
        return null;
      }
    };

    const results = await Promise.all(MARKET_TARGETS.map(fetchOne));
    return results.filter((r): r is MarketItem => r !== null);
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
          open:  quote.open[i]  ?? 0,
          high:  quote.high[i]  ?? 0,
          low:   quote.low[i]   ?? 0,
        }))
        .filter((p) => p.close > 0);
    } catch {
      return [];
    }
  }
}
