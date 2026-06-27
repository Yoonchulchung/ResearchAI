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
  companyId?: string | null;
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
  return getJson(`${API_BASE}/financial/dashboard?limit=${limit}`);
}

export function getMarketPrice(symbol: string): Promise<MarketItem | null> {
  return getJson(
    `${API_BASE}/financial/price?symbol=${encodeURIComponent(symbol)}`,
  );
}

export function searchStocks(
  query: string,
  limit = 10,
): Promise<StockSearchItem[]> {
  return getJson(
    `${API_BASE}/financial/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

export interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  country: StockCountry;
  price: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  week52High: number | null;
  week52Low: number | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  employees: number | null;
  foreignOwnershipPct: number | null;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  revenueGrowth: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
}

export interface ChartPoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
}

export function getMarketChart(
  symbol: string,
  range = "1mo",
): Promise<ChartPoint[]> {
  return getJson(
    `${API_BASE}/financial/chart?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
  );
}

export function getStockInfo(symbol: string): Promise<StockInfo> {
  return getJson(`${API_BASE}/financial/info?symbol=${encodeURIComponent(symbol)}`);
}

export interface ShortSellingRecord {
  date: string;
  shortVolume: number | null;
  uptickRuleVolume: number | null;
  uptickRuleExemptVolume: number | null;
  balanceVolume: number | null;
  shortAmount: number | null;
  balanceAmount: number | null;
}

export interface ShortSellingData {
  stockCode: string | null;
  records: ShortSellingRecord[];
  source: string;
  error?: string;
}

export interface InvestorTradingRecord {
  date: string;
  individual: number | null;
  foreign: number | null;
  institutional: number | null;
}

export interface InvestorTradingData {
  stockCode: string | null;
  records: InvestorTradingRecord[];
  source: string;
  error?: string;
}

export interface AutoRegisterResult {
  companyId: string;
  name: string;
  stockCode: string;
  created: boolean;
}

export async function registerCompany(symbol: string): Promise<AutoRegisterResult> {
  const res = await fetch(`${API_BASE}/financial/register?symbol=${encodeURIComponent(symbol)}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AutoRegisterResult>;
}

export function getShortSelling(symbol: string, days = 90): Promise<ShortSellingData> {
  return getJson(`${API_BASE}/financial/short-selling?symbol=${encodeURIComponent(symbol)}&days=${days}`);
}

export function getInvestorTrading(symbol: string, days = 30): Promise<InvestorTradingData> {
  return getJson(`${API_BASE}/financial/investor-trading?symbol=${encodeURIComponent(symbol)}&days=${days}`);
}

export function getStockQuote(
  symbol: string,
  name: string,
  interval = "1d",
  before?: string,
): Promise<CompanyStockQuote> {
  const params = new URLSearchParams({ symbol, name, interval });
  if (before) params.set("before", before);
  return getJson(`${API_BASE}/financial/quote?${params.toString()}`);
}
