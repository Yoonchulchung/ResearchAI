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
  previousClose?: number;
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

export type StockCountry = 'KR' | 'US';
export type StockRankingType =
  | 'gainers'
  | 'losers'
  | 'high52week'
  | 'volume'
  | 'tradingValue';
export type StockInvestorType = 'foreign' | 'institution' | 'individual';

export interface StockRankingItem {
  country: StockCountry;
  exchange: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number;
  marketCap: number;
  currency: 'KRW' | 'USD';
  logoUrl?: string;
  detailUrl: string;
  fiftyTwoWeekHigh?: number;
}

export interface StockInvestorItem {
  investor: StockInvestorType;
  country: 'KR';
  exchange: 'KOSPI' | 'KOSDAQ';
  symbol: string;
  name: string;
  netBuyAmount: number;
  netBuyVolume: number;
  estimated: boolean;
  detailUrl: string;
}

export interface StockSectorItem {
  country: StockCountry;
  id: string;
  name: string;
  changePercent: number;
  riseCount: number;
  fallCount: number;
  steadyCount: number;
  totalCount: number;
}

export interface StockNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  snippet: string;
  imageUrl?: string;
  country: StockCountry | 'ALL';
}

export interface StockDashboard {
  generatedAt: string;
  rankings: Record<StockRankingType, StockRankingItem[]>;
  investors: Record<StockInvestorType, StockInvestorItem[]>;
  industries: StockSectorItem[];
  themes: StockSectorItem[];
  news: StockNewsItem[];
}

export interface StockSearchItem {
  symbol: string;
  stockCode: string | null;
  name: string;
  exchange: string;
  country: StockCountry;
  currency: 'KRW' | 'USD';
}

export interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  country: StockCountry;
  // 기본 시세
  price: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  week52High: number | null;
  week52Low: number | null;
  // 섹터/산업
  sector: string | null;
  industry: string | null;
  // 기업 개요
  description: string | null;
  employees: number | null;
  // 외국인 보유 비중
  foreignOwnershipPct: number | null;
  // 재무 (최근 연간)
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  revenueGrowth: number | null;
  // 밸류에이션
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
}

export interface StockMarketMetrics {
  per: number | null;
  pbr: number | null;
  eps: number | null;
  bps: number | null;
  estimatedPer: number | null;
  estimatedEps: number | null;
  dividendYield: number | null;
  dividend: number | null;
  asOf: string | null;
  source: string;
}

export interface StockQuote {
  symbol: string | null;
  stockCode: string | null;
  companyName: string;
  currency: string | null;
  exchangeName: string | null;
  regularMarketPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  marketMetrics: StockMarketMetrics | null;
  chart: {
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number;
    volume: number | null;
  }[];
  interval: string;
  source: string;
  fetchedAt: string;
  error?: string;
}
