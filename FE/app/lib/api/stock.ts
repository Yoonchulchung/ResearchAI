import { API_BASE } from "@/lib/api/base";
import type { CompanyStockQuote } from "@/lib/api/companies";

export type StockCountry = "KR" | "US";
export type StockMarketFilter = "ALL" | StockCountry;
export type StockRankingType =
  | "gainers"
  | "losers"
  | "high52week"
  | "volume"
  | "tradingValue";
export type StockInvestorType = "foreign" | "institution" | "individual";

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
  currency: "KRW" | "USD";
  logoUrl?: string;
  detailUrl: string;
  fiftyTwoWeekHigh?: number;
}

export interface StockInvestorItem {
  investor: StockInvestorType;
  country: "KR";
  exchange: "KOSPI" | "KOSDAQ";
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
  country: StockCountry | "ALL";
}

export interface StockDashboard {
  generatedAt: string;
  rankings: Record<StockRankingType, StockRankingItem[]>;
  investors: Record<StockInvestorType, StockInvestorItem[]>;
  industries: StockSectorItem[];
  themes: StockSectorItem[];
  news: StockNewsItem[];
}

export interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

export interface StockSearchItem {
  symbol: string;
  stockCode: string | null;
  name: string;
  exchange: string;
  country: StockCountry;
  currency: "KRW" | "USD";
}

function unwrap<T>(data: T | { result: T }): T {
  return data && typeof data === "object" && "result" in data
    ? data.result
    : data;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Stock API HTTP ${response.status}`);
  return unwrap<T>((await response.json()) as T | { result: T });
}

export function getStockDashboard(limit = 20): Promise<StockDashboard> {
  return getJson(`${API_BASE}/stock/dashboard?limit=${limit}`);
}

export function getMarketPrice(symbol: string): Promise<MarketItem | null> {
  return getJson(
    `${API_BASE}/stock/price?symbol=${encodeURIComponent(symbol)}`,
  );
}

export function searchStocks(
  query: string,
  limit = 10,
): Promise<StockSearchItem[]> {
  return getJson(
    `${API_BASE}/stock/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

export function getStockQuote(
  symbol: string,
  name: string,
  interval = "1d",
  before?: string,
): Promise<CompanyStockQuote> {
  const params = new URLSearchParams({ symbol, name, interval });
  if (before) params.set("before", before);
  return getJson(`${API_BASE}/stock/quote?${params.toString()}`);
}
