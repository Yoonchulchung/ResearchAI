export enum MarketSymbol {
  KOSPI = '^KS11',
  KOSDAQ = '^KQ11',
  NASDAQ = '^IXIC',
  USD_KRW = 'USDKRW=X',
}

export const MARKET_TARGETS: Array<{ symbol: MarketSymbol; name: string }> = [
  { symbol: MarketSymbol.KOSPI, name: 'KOSPI' },
  { symbol: MarketSymbol.KOSDAQ, name: 'KOSDAQ' },
  { symbol: MarketSymbol.NASDAQ, name: 'NASDAQ' },
  { symbol: MarketSymbol.USD_KRW, name: 'USD/KRW' },
];

/** Yahoo Finance v8 chart API의 meta 필드 구조 */
export interface YahooChartMeta {
  currency: string;
  symbol: string;
  shortName?: string;
  longName?: string;
  exchangeName: string;
  fullExchangeName: string;
  instrumentType: string;
  regularMarketPrice: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  /** 이전 거래일 종가 (change 계산에 사용) */
  chartPreviousClose: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  timezone: string;
  exchangeTimezoneName: string;
  dataGranularity: string;
  range: string;
  validRanges: string[];
}

export interface YahooChartQuote {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

export interface YahooChartResult {
  meta: YahooChartMeta;
  timestamp: number[];
  indicators: {
    quote: YahooChartQuote[];
  };
}

export interface YahooChartResponse {
  chart: {
    result: YahooChartResult[] | null;
    error: unknown;
  };
}
