"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { searchStocks, getMarketPrice, registerCompany, type StockSearchItem } from "@/lib/api/stock";
import { StockChart } from "@/companies/_components/StockChart";
import { useTheme } from "@/contexts/ThemeContext";
import { StockSidebar } from "./StockSidebar";
import { CompanyInfoSidebar } from "./CompanyInfoSidebar";

interface CompanyStockPageProps {
  company: string;
}

type MobileTab = "chart" | "watchlist" | "info";

export function CompanyStockPage({ company }: CompanyStockPageProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const router = useRouter();

  const [stockItem, setStockItem] = useState<StockSearchItem | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [searching, setSearching] = useState(true);
  const [failure, setFailure] = useState<{ kind: "notfound" | "error"; message: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chart");

  // 검색바
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setSearching(true);
    setFailure(null);
    setStockItem(null);
    setCompanyId(null);

    const looksLikeSymbol = /^[\w^.=]{1,15}$/.test(company) && !/\s/.test(company);

    try {
      let item: StockSearchItem;

      if (looksLikeSymbol) {
        const sym = company.toUpperCase();
        const isKorean = /\.K[QS]$/.test(sym);
        const searched = await searchStocks(sym, 1).catch(() => []);
        const matched = searched.find((r) => r.symbol === sym || r.stockCode === sym.replace(/\.K[QS]$/, ""));
        item = matched ?? {
          symbol: sym,
          stockCode: isKorean ? sym.replace(/\.K[QS]$/, "") : null,
          name: sym,
          exchange: isKorean ? "KRX" : "US",
          country: isKorean ? "KR" : "US",
          currency: isKorean ? "KRW" : "USD",
        };
      } else {
        const results = await searchStocks(company, 5);
        if (results.length === 0) {
          setFailure({ kind: "notfound", message: `'${company}'에 해당하는 종목을 찾지 못했습니다.` });
          return;
        }
        item = results[0];
      }

      if (item.companyId) {
        setCompanyId(item.companyId);
      } else if (/\.K[QS]$/i.test(item.symbol)) {
        registerCompany(item.symbol)
          .then((r) => setCompanyId(r.companyId))
          .catch(() => {});
      }

      setStockItem(item);

      try {
        const price = await getMarketPrice(item.symbol);
        if (price) {
          setStockItem((prev) => prev ? { ...prev, name: price.name || prev.name } : prev);
        }
      } catch { /* 무시 */ }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFailure({ kind: "error", message: msg });
    } finally {
      setSearching(false);
    }
  }, [company]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearchInput = (q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); setSearchOpen(false); return; }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchStocks(q.trim(), 8);
        setSearchResults(results);
        setSearchOpen(true);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  };

  const handleSelectResult = (item: StockSearchItem) => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
    setSearchExpanded(false);
    router.push(`/stock?company=${encodeURIComponent(item.symbol)}`);
  };

  const MOBILE_TABS: { id: MobileTab; label: string }[] = [
    { id: "chart",     label: "차트" },
    { id: "watchlist", label: "관심종목" },
    { id: "info",      label: "기업정보" },
  ];

  const bodyHeight = "calc(100vh - 130px)";

  return (
    <main className={`min-h-full ${isDark ? "bg-slate-950" : "bg-slate-50"} px-4 py-4 sm:px-6 lg:px-8`}>
      <div className="mx-auto max-w-375">

        {/* ── 헤더 ── */}
        <header className="mb-4 flex items-center gap-3">
          {/* 뒤로가기 */}
          <Link
            href="/stock"
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              isDark ? "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white"
                     : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">증시 대시보드</span>
          </Link>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />

          {/* 종목명 */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {searching ? (
              <div className={`h-6 w-32 animate-pulse rounded-lg ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
            ) : (
              <>
                <h1 className={`truncate text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  {stockItem?.name ?? company}
                </h1>
                {stockItem && (
                  <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-2xs font-bold ${
                    isDark ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-300" : "border-indigo-150 bg-indigo-50 text-indigo-600"
                  }`}>
                    {stockItem.symbol}
                  </span>
                )}
              </>
            )}
          </div>

          {/* 검색바 — 데스크탑: 인라인, 모바일: 아이콘 토글 */}
          <div ref={searchRef} className="relative shrink-0">
            {/* 모바일 검색 아이콘 버튼 */}
            {!searchExpanded && (
              <button
                className={`flex sm:hidden items-center justify-center h-8 w-8 rounded-xl border transition ${
                  isDark ? "border-slate-800 bg-slate-900 text-slate-400 hover:text-white" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => {
                  setSearchExpanded(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {/* 검색 입력창 — 데스크탑 항상, 모바일 확장 시 */}
            <div className={`${searchExpanded ? "flex" : "hidden sm:flex"} items-center gap-2 rounded-xl border px-3 py-1.5 transition-all duration-300 focus-within:border-indigo-500/50 ${
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
            } w-52 sm:w-60`}>
              <svg viewBox="0 0 16 16" fill="none" className={`h-3.5 w-3.5 shrink-0 ${isDark ? "text-slate-550" : "text-slate-400"}`}>
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="종목 검색..."
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                onKeyDown={(e) => e.key === "Escape" && (setSearchExpanded(false), setSearchOpen(false))}
                className={`w-full bg-transparent text-xs outline-none placeholder:text-slate-400 ${
                  isDark ? "text-slate-100" : "text-slate-800"
                }`}
              />
              {searchLoading && (
                <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              )}
            </div>

            {searchOpen && searchResults.length > 0 && (
              <ul className={`absolute right-0 top-full z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border shadow-xl ${
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
              }`}>
                {searchResults.map((item) => (
                  <li key={item.symbol}>
                    <button
                      type="button"
                      onClick={() => handleSelectResult(item)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                        isDark ? "hover:bg-slate-800" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        isDark ? "bg-indigo-500/20 text-indigo-300" : "bg-indigo-50 text-indigo-600"
                      }`}>
                        {item.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                          {item.name}
                        </p>
                        <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {item.symbol} · {item.exchange}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </header>

        {/* ── 모바일 탭 바 (lg 미만) ── */}
        <div className={`mb-3 flex rounded-2xl border overflow-hidden lg:hidden ${
          isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
        }`}>
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 py-2.5 text-xs font-bold transition border-b-2 ${
                mobileTab === tab.id
                  ? isDark ? "border-indigo-400 text-indigo-300" : "border-indigo-600 text-indigo-600"
                  : isDark ? "border-transparent text-slate-400 hover:text-slate-200" : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 본문 ── */}

        {/* 데스크탑: 3컬럼 */}
        <div className="hidden lg:flex gap-4" style={{ height: bodyHeight, minHeight: 560 }}>
          <StockSidebar currentSymbol={company} isDark={isDark} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1">
              <ChartArea
                searching={searching} failure={failure} stockItem={stockItem}
                companyId={companyId} company={company} isDark={isDark} onRetry={load}
              />
            </div>
          </div>
          {stockItem && <CompanyInfoSidebar symbol={stockItem.symbol} isDark={isDark} />}
        </div>

        {/* 모바일: 탭별 단일 패널 */}
        <div className="lg:hidden" style={{ minHeight: 480 }}>
          {mobileTab === "chart" && (
            <div style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
              <ChartArea
                searching={searching} failure={failure} stockItem={stockItem}
                companyId={companyId} company={company} isDark={isDark} onRetry={load}
              />
            </div>
          )}
          {mobileTab === "watchlist" && (
            <div style={{ height: "calc(100vh - 220px)", minHeight: 400 }} className="[&>aside]:w-full">
              <StockSidebar currentSymbol={company} isDark={isDark} />
            </div>
          )}
          {mobileTab === "info" && stockItem && (
            <div style={{ height: "calc(100vh - 220px)", minHeight: 400 }} className="[&>aside]:w-full">
              <CompanyInfoSidebar symbol={stockItem.symbol} isDark={isDark} />
            </div>
          )}
          {mobileTab === "info" && !stockItem && !searching && (
            <div className={`flex h-48 items-center justify-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              종목을 먼저 선택하세요.
            </div>
          )}
        </div>

        <p className={`py-5 text-center text-2xs leading-relaxed ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          시세 정보는 투자 참고용이며 제공처 사정에 따라 지연되거나 오류가 있을 수 있습니다. 국내: Npay 증권·KRX 제공 데이터, 미국: Yahoo Finance.
        </p>
      </div>
    </main>
  );
}

// ── 차트 영역 분리 컴포넌트 ──
function ChartArea({
  searching, failure, stockItem, companyId, company, isDark, onRetry,
}: {
  searching: boolean;
  failure: { kind: "notfound" | "error"; message: string } | null;
  stockItem: StockSearchItem | null;
  companyId: string | null;
  company: string;
  isDark: boolean;
  onRetry: () => void;
}) {
  if (searching) {
    return (
      <div className={`flex h-full items-center justify-center rounded-2xl border ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
          <span className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{company} 검색 중...</span>
        </div>
      </div>
    );
  }
  if (failure) {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-4 rounded-2xl border ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
        {failure.kind === "error" ? (
          <>
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold ${isDark ? "bg-rose-950/60 text-rose-300" : "bg-rose-50 text-rose-600"}`}>
              <span>⚠</span><span>API 오류</span>
            </div>
            <p className={`max-w-xs text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{failure.message}</p>
          </>
        ) : (
          <p className={`text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{failure.message}</p>
        )}
        <div className="flex gap-2">
          <button onClick={onRetry} className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${isDark ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}>
            다시 시도
          </button>
          <Link href="/stock" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
            증시 대시보드
          </Link>
        </div>
      </div>
    );
  }
  if (stockItem) {
    return (
      <div className={`h-full overflow-hidden rounded-2xl border shadow-sm ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <StockChart
          companyId={companyId ?? undefined}
          symbol={stockItem.symbol}
          companyName={stockItem.name}
          isDark={isDark}
          panelClass={isDark ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}
          mutedPanel={isDark ? "bg-slate-950/50" : "bg-slate-50"}
          subtleText={isDark ? "text-slate-400" : "text-slate-400"}
        />
      </div>
    );
  }
  return null;
}
