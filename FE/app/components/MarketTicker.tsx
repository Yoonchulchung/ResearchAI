"use client";

import { useEffect, useRef, useState } from "react";
import { getMarketPrice } from "@/lib/api/stock";
import { useTheme } from "@/contexts/ThemeContext";

interface TickerItem {
  symbol: string;
  label: string;
  flag: string;
}

const TICKER_SYMBOLS: TickerItem[] = [
  { symbol: "^KS11",     label: "코스피",   flag: "🇰🇷" },
  { symbol: "^KQ11",     label: "코스닥",   flag: "🇰🇷" },
  { symbol: "^DJI",      label: "다우",     flag: "🇺🇸" },
  { symbol: "^GSPC",     label: "S&P500",   flag: "🇺🇸" },
  { symbol: "^IXIC",     label: "나스닥",   flag: "🇺🇸" },
  { symbol: "USDKRW=X",  label: "미국 USD", flag: "🇺🇸" },
  { symbol: "GC=F",      label: "금",       flag: "🪙"  },
];

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

function fmtPrice(price: number, currency: string, symbol: string): string {
  if (symbol === "GC=F") {
    return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price)}`;
  }
  if (currency === "KRW" || symbol === "USDKRW=X") {
    return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(price);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(price);
}

function TickerChip({
  item,
  data,
  isDark,
}: {
  item: TickerItem;
  data: PriceData | undefined;
  isDark: boolean;
}) {
  const up = (data?.changePercent ?? 0) >= 0;
  const changeCls = !data
    ? isDark ? "text-slate-500" : "text-slate-400"
    : up
      ? "text-rose-500"
      : "text-sky-500";
  const priceCls = isDark ? "text-slate-200" : "text-slate-700";

  return (
    <span className="flex shrink-0 items-center gap-2 px-5">
      <span className="text-sm">{item.flag}</span>
      <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {item.label}
      </span>
      {data ? (
        <>
          <span className={`font-mono text-xs font-bold tabular-nums ${priceCls}`}>
            {fmtPrice(data.price, data.currency, item.symbol)}
          </span>
          <span className={`font-mono text-xs font-semibold tabular-nums ${changeCls}`}>
            {data.changePercent >= 0 ? "+" : ""}
            {data.changePercent.toFixed(2)}%
          </span>
        </>
      ) : (
        <span className={`h-3 w-16 animate-pulse rounded ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
      )}
      {/* 구분자 */}
      <span className={`mx-1 h-3 w-px ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
    </span>
  );
}

export function MarketTicker() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = () => {
    void Promise.allSettled(
      TICKER_SYMBOLS.map(async ({ symbol }) => {
        try {
          const data = await getMarketPrice(symbol);
          if (data) {
            setPrices((prev) => ({
              ...prev,
              [symbol]: {
                price: data.price,
                change: data.change,
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
  };

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const border = isDark ? "border-slate-800" : "border-slate-200";
  const bg = isDark ? "bg-slate-900/95" : "bg-white/95";

  // 2벌 복제해서 끊김 없는 루프
  const chips = [...TICKER_SYMBOLS, ...TICKER_SYMBOLS];

  return (
    <div
      className={`relative z-20 flex h-9 shrink-0 items-center overflow-hidden border-b ${border} ${bg} backdrop-blur-sm`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex w-max items-center"
        style={{
          animation: `ticker-scroll 40s linear infinite`,
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {chips.map((item, i) => (
          <TickerChip
            key={`${item.symbol}-${i}`}
            item={item}
            data={prices[item.symbol]}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  );
}
