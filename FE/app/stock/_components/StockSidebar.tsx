"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMarketPrice } from "@/lib/api/stock";
import { API_BASE } from "@/lib/api/base";

interface SidebarStock {
  symbol: string;
  name: string;
  logoUrl?: string;
  bg?: string;
  fg?: string;
  initials?: string;
}

function krLogoUrl(code: string) {
  return `${API_BASE}/financial/logo/${code}`;
}

const KR_STOCKS: SidebarStock[] = [
  { symbol: "005930.KS", name: "삼성전자",       bg: "#1428A0", fg: "#fff", initials: "S",  logoUrl: krLogoUrl("005930") },
  { symbol: "000660.KS", name: "SK하이닉스",     bg: "#E8003D", fg: "#fff", initials: "SK", logoUrl: krLogoUrl("000660") },
  { symbol: "005380.KS", name: "현대차",         bg: "#002C5F", fg: "#fff", initials: "H",  logoUrl: krLogoUrl("005380") },
  { symbol: "000270.KS", name: "기아",           bg: "#05141F", fg: "#fff", initials: "K",  logoUrl: krLogoUrl("000270") },
  { symbol: "035420.KS", name: "NAVER",          bg: "#03C75A", fg: "#fff", initials: "N",  logoUrl: krLogoUrl("035420") },
  { symbol: "035720.KQ", name: "카카오",          bg: "#FEE500", fg: "#3C1E1E", initials: "K", logoUrl: krLogoUrl("035720") },
  { symbol: "373220.KS", name: "LG에너지솔루션", bg: "#A50034", fg: "#fff", initials: "LG", logoUrl: krLogoUrl("373220") },
  { symbol: "006400.KS", name: "삼성SDI",        bg: "#1428A0", fg: "#fff", initials: "SD", logoUrl: krLogoUrl("006400") },
];

const US_STOCKS: SidebarStock[] = [
  { symbol: "AAPL",  name: "애플",          logoUrl: "https://logo.clearbit.com/apple.com" },
  { symbol: "MSFT",  name: "마이크로소프트", logoUrl: "https://logo.clearbit.com/microsoft.com" },
  { symbol: "NVDA",  name: "엔비디아",       logoUrl: "https://logo.clearbit.com/nvidia.com" },
  { symbol: "TSLA",  name: "테슬라",         logoUrl: "https://logo.clearbit.com/tesla.com" },
  { symbol: "AMZN",  name: "아마존",         logoUrl: "https://logo.clearbit.com/amazon.com" },
  { symbol: "META",  name: "메타",           logoUrl: "https://logo.clearbit.com/meta.com" },
  { symbol: "GOOGL", name: "구글",           logoUrl: "https://logo.clearbit.com/google.com" },
  { symbol: "NFLX",  name: "넷플릭스",       logoUrl: "https://logo.clearbit.com/netflix.com" },
  { symbol: "AMD",   name: "AMD",            logoUrl: "https://logo.clearbit.com/amd.com" },
  { symbol: "PLTR",  name: "팔란티어",       logoUrl: "https://logo.clearbit.com/palantir.com" },
];

interface PriceInfo {
  price: number;
  changePercent: number;
  currency: string;
}

function fmtPrice(price: number, currency: string) {
  if (currency === "KRW") {
    return new Intl.NumberFormat("ko-KR").format(Math.round(price));
  }
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: price < 100 ? 2 : 2,
    maximumFractionDigits: 2,
  }).format(price)}`;
}

function LogoCircle({ stock, size = 36 }: { stock: SidebarStock; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const style = { width: size, height: size, minWidth: size };

  if (stock.logoUrl && !imgError) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
        style={style}
      >
        <img
          src={stock.logoUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-1"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl text-[11px] font-bold shadow-xs border border-white/10"
      style={{ ...style, background: stock.bg ?? "#64748b", color: stock.fg ?? "#fff" }}
    >
      {stock.initials ?? stock.symbol.slice(0, 2)}
    </div>
  );
}

interface StockSidebarProps {
  currentSymbol: string;
  isDark: boolean;
}

export function StockSidebar({ currentSymbol, isDark }: StockSidebarProps) {
  const [prices, setPrices] = useState<Record<string, PriceInfo | null>>({});

  useEffect(() => {
    const all = [...KR_STOCKS, ...US_STOCKS];
    void Promise.allSettled(
      all.map(async (s) => {
        try {
          const data = await getMarketPrice(s.symbol);
          if (data) {
            setPrices((prev) => ({
              ...prev,
              [s.symbol]: {
                price: data.price,
                changePercent: data.changePercent,
                currency: data.currency,
              },
            }));
          }
        } catch {
          // 실패 무시
        }
      }),
    );
  }, []);

  const border = isDark ? "border-slate-800" : "border-slate-200/80";
  const bg = isDark ? "bg-slate-900" : "bg-white";
  const sectionLabel = isDark ? "text-slate-500 font-bold tracking-wider" : "text-slate-400 font-bold tracking-wider";
  const nameCls = isDark ? "text-slate-100" : "text-slate-800";
  const codeCls = isDark ? "text-slate-500" : "text-slate-400";
  const activeBg = isDark ? "bg-indigo-950/20 border-l-3 border-indigo-500" : "bg-indigo-50/40 border-l-3 border-indigo-600";
  const hoverBg = isDark ? "hover:bg-slate-850/60" : "hover:bg-slate-50/70";

  function StockRow({ stock }: { stock: SidebarStock }) {
    const price = prices[stock.symbol];
    const isActive =
      stock.symbol === currentSymbol ||
      stock.symbol.replace(/\.(KS|KQ)$/, "") === currentSymbol;
    const up = (price?.changePercent ?? 0) >= 0;
    const changeCls = !price
      ? sectionLabel
      : up
        ? "text-rose-500"
        : "text-sky-500";

    const displayCode = stock.symbol.replace(/\.(KS|KQ)$/, "");

    return (
      <Link
        href={`/stock?company=${encodeURIComponent(stock.symbol)}`}
        className={`flex items-center gap-2.5 pl-2 pr-3 py-3 border-l-3 transition-all duration-200 ${hoverBg} ${
          isActive ? activeBg : "border-transparent"
        }`}
      >
        <LogoCircle stock={stock} size={36} />
        <div className="min-w-0 flex-1 pl-1">
          <p className={`truncate text-sm font-semibold leading-tight ${nameCls}`}>
            {stock.name}
          </p>
          <p className={`font-mono text-2xs leading-tight mt-0.5 ${codeCls}`}>{displayCode}</p>
        </div>
        <div className="shrink-0 text-right">
          {price ? (
            <>
              <p className={`font-mono text-sm font-bold tracking-tight ${changeCls}`}>
                {fmtPrice(price.price, price.currency)}
              </p>
              <p className={`font-mono text-xs font-semibold mt-0.5 ${changeCls}`}>
                {price.changePercent >= 0 ? "+" : ""}
                {price.changePercent.toFixed(2)}%
              </p>
            </>
          ) : (
            <div className="space-y-1">
              <div className={`h-4 w-16 animate-pulse rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`} />
              <div className={`h-3 w-10 animate-pulse rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`} />
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <aside
      className={`flex h-full w-56 shrink-0 flex-col overflow-hidden rounded-2xl border ${border} ${bg} shadow-sm`}
    >
      <div className="flex-1 overflow-y-auto">
        {/* 국내종목 */}
        <p className={`px-3 pb-1 pt-3 text-xs font-bold ${sectionLabel}`}>
          국내종목
        </p>
        {KR_STOCKS.map((s) => (
          <StockRow key={s.symbol} stock={s} />
        ))}

        {/* 해외종목 */}
        <p className={`px-3 pb-1 pt-4 text-xs font-bold ${sectionLabel}`}>
          해외종목
        </p>
        {US_STOCKS.map((s) => (
          <StockRow key={s.symbol} stock={s} />
        ))}
      </div>
    </aside>
  );
}
