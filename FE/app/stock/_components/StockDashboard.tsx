"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMarketPrice,
  getStockDashboard,
  MarketItem,
  StockCountry,
  StockDashboard as StockDashboardData,
  StockInvestorItem,
  StockInvestorType,
  StockMarketFilter,
  StockRankingItem,
  StockRankingType,
  StockSearchItem,
  StockSectorItem,
  searchStocks,
} from "@/lib/api/stock";
import { StockChart } from "@/companies/_components/StockChart";
import { useTheme } from "@/contexts/ThemeContext";

const INDEX_SYMBOLS = [
  { symbol: "^KS11", label: "KOSPI", country: "KR" as const },
  { symbol: "^KQ11", label: "KOSDAQ", country: "KR" as const },
  { symbol: "USDKRW=X", label: "USD/KRW", country: "KR" as const },
  { symbol: "^GSPC", label: "S&P 500", country: "US" as const },
  { symbol: "^IXIC", label: "NASDAQ", country: "US" as const },
  { symbol: "^DJI", label: "DOW", country: "US" as const },
];

const RANKING_TABS: { key: StockRankingType; label: string }[] = [
  { key: "gainers", label: "상승률" },
  { key: "losers", label: "하락률" },
  { key: "high52week", label: "52주 신고가" },
  { key: "volume", label: "거래량" },
  { key: "tradingValue", label: "거래대금" },
];

const INVESTOR_TABS: { key: StockInvestorType; label: string }[] = [
  { key: "foreign", label: "외국인" },
  { key: "institution", label: "기관" },
  { key: "individual", label: "개인" },
];

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits }).format(
    value,
  );
}

function formatMoney(value: number, currency: "KRW" | "USD"): string {
  if (!Number.isFinite(value)) return "-";
  if (currency === "USD") {
    return `$${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: value < 100 ? 2 : 0,
    }).format(value)}`;
  }
  return `${formatNumber(value)}원`;
}

function formatCompact(value: number, currency?: "KRW" | "USD"): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const prefix = currency === "USD" ? "$" : "";
  if (absolute >= 1_000_000_000_000)
    return `${sign}${prefix}${(absolute / 1_000_000_000_000).toFixed(1)}조`;
  if (absolute >= 100_000_000)
    return `${sign}${prefix}${(absolute / 100_000_000).toFixed(1)}억`;
  if (absolute >= 1_000_000)
    return `${sign}${prefix}${(absolute / 1_000_000).toFixed(1)}백만`;
  return `${sign}${prefix}${formatNumber(absolute)}`;
}

function changeClass(value: number): string {
  if (value > 0) return "text-rose-500";
  if (value < 0) return "text-blue-500";
  return "text-slate-400";
}

function CountryBadge({ country }: { country: StockCountry }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      {country === "KR" ? "🇰🇷 한국" : "🇺🇸 미국"}
    </span>
  );
}

function IndexStrip({
  items,
  loading,
}: {
  items: Record<string, MarketItem | null>;
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
      {INDEX_SYMBOLS.map(({ symbol, label, country }) => {
        const item = items[symbol];
        return (
          <div
            key={symbol}
            className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <span className="text-xs">{country === "KR" ? "🇰🇷" : "🇺🇸"}</span>
            </div>
            {loading && !item ? (
              <div className="space-y-2">
                <div className="h-5 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-3 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : item ? (
              <>
                <p className="truncate text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  {formatNumber(item.price, 2)}
                </p>
                <p
                  className={`mt-1 text-xs font-semibold ${changeClass(item.changePercent)}`}
                >
                  {item.change >= 0 ? "+" : ""}
                  {formatNumber(item.change, 2)} (
                  {item.changePercent >= 0 ? "+" : ""}
                  {item.changePercent.toFixed(2)}%)
                </p>
              </>
            ) : (
              <p className="py-2 text-xs text-slate-400">데이터 없음</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RankingTable({
  items,
  type,
  onSelect,
}: {
  items: StockRankingItem[];
  type: StockRankingType;
  onSelect: (item: StockSearchItem) => void;
}) {
  return (
    <div className="max-h-[590px] overflow-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-slate-900/95">
          <tr className="text-left text-[11px] font-semibold text-slate-400">
            <th className="w-14 border-b border-slate-100 px-4 py-3 text-center dark:border-slate-800">
              순위
            </th>
            <th className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">
              종목
            </th>
            <th className="border-b border-slate-100 px-3 py-3 text-right dark:border-slate-800">
              현재가
            </th>
            <th className="border-b border-slate-100 px-3 py-3 text-right dark:border-slate-800">
              등락률
            </th>
            <th className="border-b border-slate-100 px-3 py-3 text-right dark:border-slate-800">
              {type === "tradingValue" ? "거래대금" : "거래량"}
            </th>
            <th className="border-b border-slate-100 px-4 py-3 text-right dark:border-slate-800">
              시가총액
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={`${item.country}-${item.exchange}-${item.symbol}-${index}`}
              className="group hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <td className="border-b border-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-400 dark:border-slate-800">
                {index + 1}
              </td>
              <td className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      symbol:
                        item.country === "KR" && !item.symbol.includes(".")
                          ? `${item.symbol}.${item.exchange === "KOSDAQ" ? "KQ" : "KS"}`
                          : item.symbol,
                      stockCode: item.country === "KR" ? item.symbol : null,
                      name: item.name,
                      exchange: item.exchange,
                      country: item.country,
                      currency: item.currency,
                    })
                  }
                  className="flex min-w-0 items-center gap-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800">
                    {item.logoUrl ? (
                      <img
                        src={item.logoUrl}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      item.symbol.slice(0, 2)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-100">
                      {item.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <CountryBadge country={item.country} />
                      <span className="text-[10px] text-slate-400">
                        {item.symbol}
                      </span>
                    </div>
                  </div>
                </button>
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-right text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                {formatMoney(item.price, item.currency)}
              </td>
              <td
                className={`border-b border-slate-100 px-3 py-3 text-right text-sm font-bold dark:border-slate-800 ${changeClass(item.changePercent)}`}
              >
                {item.changePercent >= 0 ? "+" : ""}
                {item.changePercent.toFixed(2)}%
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-right text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                {type === "tradingValue"
                  ? formatCompact(item.tradingValue, item.currency)
                  : formatCompact(item.volume)}
              </td>
              <td className="border-b border-slate-100 px-4 py-3 text-right text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {formatCompact(item.marketCap, item.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <div className="flex h-56 items-center justify-center text-sm text-slate-400">
          해당 시장의 순위 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}

function InvestorList({
  items,
  type,
}: {
  items: StockInvestorItem[];
  type: StockInvestorType;
}) {
  return (
    <div className="max-h-[420px] overflow-y-auto">
      {items.map((item, index) => (
        <a
          key={`${item.exchange}-${item.symbol}-${index}`}
          href={item.detailUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
        >
          <span className="w-5 text-center text-xs font-semibold text-slate-400">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {item.name}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {item.exchange} · {item.symbol}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-rose-500">
              +{formatCompact(item.netBuyAmount)}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {formatCompact(item.netBuyVolume)}주
              {type === "individual" ? " · 추정" : ""}
            </p>
          </div>
        </a>
      ))}
      {items.length === 0 && (
        <div className="flex h-44 items-center justify-center text-sm text-slate-400">
          수급 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}

function SectorList({
  items,
  emptyText,
}: {
  items: StockSectorItem[];
  emptyText: string;
}) {
  return (
    <div className="max-h-[430px] space-y-2 overflow-y-auto p-3">
      {items.map((item, index) => {
        const riseRatio = item.totalCount
          ? (item.riseCount / item.totalCount) * 100
          : 0;
        return (
          <div
            key={`${item.country}-${item.id}`}
            className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 text-xs font-bold text-indigo-500">
                {index + 1}
              </span>
              <span className="text-xs">
                {item.country === "KR" ? "🇰🇷" : "🇺🇸"}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                {item.name}
              </p>
              <span
                className={`text-sm font-bold ${changeClass(item.changePercent)}`}
              >
                {item.changePercent >= 0 ? "+" : ""}
                {item.changePercent.toFixed(2)}%
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
                <div
                  className="h-full rounded-full bg-rose-400"
                  style={{ width: `${Math.min(100, riseRatio)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400">
                {item.totalCount}개 중 {item.riseCount}개 상승
              </span>
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="flex h-36 items-center justify-center text-sm text-slate-400">
          {emptyText}
        </div>
      )}
    </div>
  );
}

export function StockDashboard() {
  const { theme } = useTheme();
  const [dashboard, setDashboard] = useState<StockDashboardData | null>(null);
  const [indices, setIndices] = useState<Record<string, MarketItem | null>>({});
  const [market, setMarket] = useState<StockMarketFilter>("ALL");
  const [rankingType, setRankingType] =
    useState<StockRankingType>("tradingValue");
  const [investorType, setInvestorType] =
    useState<StockInvestorType>("foreign");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockSearchItem | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardData, indexEntries] = await Promise.all([
        getStockDashboard(20),
        Promise.all(
          INDEX_SYMBOLS.map(async ({ symbol }) => {
            try {
              return [symbol, await getMarketPrice(symbol)] as const;
            } catch {
              return [symbol, null] as const;
            }
          }),
        ),
      ]);
      setDashboard(dashboardData);
      setIndices(Object.fromEntries(indexEntries));
      setSelectedStock((current) => {
        if (current) return current;
        const first = dashboardData.rankings.tradingValue[0];
        if (!first) return null;
        return {
          symbol:
            first.country === "KR" && !first.symbol.includes(".")
              ? `${first.symbol}.${first.exchange === "KOSDAQ" ? "KQ" : "KS"}`
              : first.symbol,
          stockCode: first.country === "KR" ? first.symbol : null,
          name: first.name,
          exchange: first.exchange,
          country: first.country,
          currency: first.currency,
        };
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "증시 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestedMarket = new URLSearchParams(window.location.search).get(
      "market",
    );
    if (requestedMarket === "KR" || requestedMarket === "US") {
      setMarket(requestedMarket);
    }
    void load();
  }, [load]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchStocks(query, 12)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const selectStock = useCallback((item: StockSearchItem) => {
    setSelectedStock(item);
    setSearchQuery(item.name);
    setSearchOpen(false);
    window.setTimeout(() => {
      document
        .getElementById("stock-chart")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const rankingItems = useMemo(() => {
    const items = dashboard?.rankings[rankingType] ?? [];
    return market === "ALL"
      ? items
      : items.filter((item) => item.country === market);
  }, [dashboard, market, rankingType]);

  const sectorFilter = useCallback(
    (items: StockSectorItem[]) =>
      market === "ALL"
        ? items
        : items.filter((item) => item.country === market),
    [market],
  );

  const news = useMemo(() => {
    const items = dashboard?.news ?? [];
    return market === "ALL"
      ? items
      : items.filter(
          (item) => item.country === market || item.country === "ALL",
        );
  }, [dashboard, market]);

  return (
    <main className="min-h-full bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold tracking-widest text-white">
                MARKET
              </span>
              <span className="text-xs text-slate-400">
                한국 · 미국 증시 통합
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Stock
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              시장 순위, 투자자 수급, 업종·테마와 주요 뉴스를 한곳에서
              확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              {(
                [
                  ["ALL", "전체"],
                  ["KR", "🇰🇷 한국"],
                  ["US", "🇺🇸 미국"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMarket(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    market === value
                      ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {loading ? "불러오는 중..." : "↻ 새로고침"}
            </button>
          </div>
        </header>

        <div className="relative z-30 mb-5 max-w-2xl">
          <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900">
            <svg
              className="h-5 w-5 shrink-0 text-slate-400"
              viewBox="0 0 20 20"
              fill="none"
            >
              <circle
                cx="8.5"
                cy="8.5"
                r="5.5"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M13 13L17 17"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) {
                  selectStock(searchResults[0]);
                }
                if (event.key === "Escape") setSearchOpen(false);
              }}
              placeholder="회사명 또는 종목코드 검색 (예: 삼성전자, 005930, NVDA)"
              className="h-13 min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
            />
            {searching && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
            )}
          </div>
          {searchOpen && searchQuery.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              {searchResults.map((item) => (
                <button
                  key={`${item.country}-${item.symbol}`}
                  type="button"
                  onClick={() => selectStock(item)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800">
                    {item.country === "KR" ? "🇰🇷" : "🇺🇸"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800 dark:text-white">
                      {item.name}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {item.symbol} · {item.exchange}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-indigo-500">
                    차트 보기
                  </span>
                </button>
              ))}
              {!searching && searchResults.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-slate-400">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950/40">
            {error}
          </div>
        )}

        <IndexStrip items={indices} loading={loading} />

        {selectedStock && (
          <section id="stock-chart" className="mt-5 scroll-mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedStock.name} 주식 차트
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {selectedStock.symbol} · {selectedStock.exchange}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStock(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                차트 닫기
              </button>
            </div>
            <div className="h-[720px] min-h-[560px]">
              <StockChart
                key={selectedStock.symbol}
                symbol={selectedStock.symbol}
                companyName={selectedStock.name}
                isDark={theme === "dark"}
                panelClass="border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                mutedPanel="bg-slate-50 dark:bg-slate-950/50"
                subtleText="text-slate-400 dark:text-slate-500"
              />
            </div>
          </section>
        )}

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,0.7fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 pt-4 dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    시장 순위
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    국내 데이터는 KOSPI·KOSDAQ 통합 기준입니다.
                  </p>
                </div>
                {dashboard?.generatedAt && (
                  <span className="text-[10px] text-slate-400">
                    {new Date(dashboard.generatedAt).toLocaleString("ko-KR")}{" "}
                    기준
                  </span>
                )}
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {RANKING_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setRankingType(tab.key)}
                    className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition ${
                      rankingType === tab.key
                        ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                        : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            {loading && !dashboard ? (
              <div className="flex h-[430px] items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
              </div>
            ) : (
              <RankingTable
                items={rankingItems}
                type={rankingType}
                onSelect={selectStock}
              />
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 pt-4 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                투자자 순매수
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                국내 시장 순매수 금액 기준
              </p>
              <div className="mt-3 flex gap-1">
                {INVESTOR_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setInvestorType(tab.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      investorType === tab.key
                        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
                        : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <InvestorList
              items={dashboard?.investors[investorType] ?? []}
              type={investorType}
            />
            {investorType === "individual" && (
              <p className="border-t border-slate-100 px-4 py-3 text-[10px] leading-relaxed text-slate-400 dark:border-slate-800">
                개인 수급은 공개된 외국인·기관 순매매의 반대값으로 산출한
                추정치이며, 기타법인 거래에 따라 실제 값과 차이가 날 수
                있습니다.
              </p>
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                업종 현황
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                국내 업종과 미국 강세 섹터
              </p>
            </div>
            <SectorList
              items={sectorFilter(dashboard?.industries ?? [])}
              emptyText="업종 데이터가 없습니다."
            />
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                급상승 테마
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                당일 상승률과 상승 종목 비중 기준
              </p>
            </div>
            <SectorList
              items={sectorFilter(dashboard?.themes ?? [])}
              emptyText="테마 데이터가 없습니다."
            />
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              주요 증시 뉴스
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              한국·미국 주식시장 관련 최신 기사
            </p>
          </div>
          <div className="grid md:grid-cols-2">
            {news.map((item, index) => (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="group flex min-w-0 gap-3 border-b border-slate-100 p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 md:odd:border-r"
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-20 w-28 shrink-0 rounded-xl bg-slate-100 object-cover dark:bg-slate-800"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <CountryBadge
                      country={item.country === "US" ? "US" : "KR"}
                    />
                    <span className="truncate text-[10px] text-slate-400">
                      {item.source}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800 group-hover:text-indigo-600 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                    {item.snippet}
                  </p>
                </div>
              </a>
            ))}
          </div>
          {news.length === 0 && (
            <div className="flex h-44 items-center justify-center text-sm text-slate-400">
              관련 뉴스를 불러오지 못했습니다.
            </div>
          )}
        </section>

        <p className="py-5 text-center text-[10px] leading-relaxed text-slate-400">
          시세 정보는 투자 참고용이며 제공처 사정에 따라 지연되거나 오류가 있을
          수 있습니다. 국내: Npay 증권·KRX 제공 데이터, 미국: Yahoo Finance.
        </p>
      </div>
    </main>
  );
}
