"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api/base";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

interface ChartPoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
}

function unwrapApiResult<T>(data: unknown): T | null {
  if (data && typeof data === "object" && "result" in data) {
    return (data as { result?: T }).result ?? null;
  }
  return data as T;
}

const RANGES = [
  { label: "1주", value: "5d" },
  { label: "1달", value: "1mo" },
  { label: "3달", value: "3mo" },
  { label: "1년", value: "1y" },
] as const;
type Range = (typeof RANGES)[number]["value"];

function formatPrice(price: number, symbol: string): string {
  if (symbol === "^KS11" || symbol === "^KQ11" || symbol === "USDKRW=X") {
    return price.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  }
  return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatChange(change: number, pct: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
}

const SYMBOL_ICON: Record<string, string> = {
  "^KS11": "🇰🇷",
  "^KQ11": "🇰🇷",
  "^IXIC": "🇺🇸",
  "USDKRW=X": "💱",
};

// ── Chart Modal ────────────────────────────────────────────────
function ChartModal({ item, onClose }: { item: MarketItem; onClose: () => void }) {
  const [range, setRange] = useState<Range>("1mo");
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    fetch(
      `${API_BASE}/news/market-chart?symbol=${encodeURIComponent(item.symbol)}&range=${range}`,
    )
      .then((r) => r.json())
      .then((data: unknown) => {
        const result = unwrapApiResult<ChartPoint[]>(data);
        setPoints(Array.isArray(result) ? result : []);
      })
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [item.symbol, range]);

  const up = item.change >= 0;
  const color = up ? "#ef4444" : "#3b82f6";
  const gradId = `grad-${item.symbol.replace(/[^a-z0-9]/gi, "")}`;

  const minVal = points.length ? Math.min(...points.map((p) => p.close)) * 0.998 : 0;
  const maxVal = points.length ? Math.max(...points.map((p) => p.close)) * 1.002 : 0;

  const formatXTick = (date: string) => {
    const d = new Date(date);
    if (range === "5d") return `${d.getMonth() + 1}/${d.getDate()}`;
    if (range === "1y") return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatYTick = (val: number) =>
    item.symbol === "^IXIC"
      ? val.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : val.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span>{SYMBOL_ICON[item.symbol] ?? "📈"}</span>
              <h3 className="text-base font-bold text-slate-800">{item.name}</h3>
              <span className="text-xs text-slate-400">{item.symbol}</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">
                {formatPrice(item.price, item.symbol)}
              </span>
              <span className={`text-sm font-semibold ${up ? "text-red-500" : "text-blue-500"}`}>
                {formatChange(item.change, item.changePercent)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Range selector */}
        <div className="flex gap-1.5 px-6 pt-4">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
                range === r.value
                  ? "text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
              style={range === r.value ? { backgroundColor: color } : {}}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="px-4 pt-3 pb-5">
          {loading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : points.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-400 text-sm">
              차트 데이터를 불러올 수 없습니다
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXTick}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[minVal, maxVal]}
                  tickFormatter={formatYTick}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                  formatter={(val) => [formatYTick(Number(val)), "종가"]}
                  labelFormatter={(label) => label}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 3, fill: color }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MarketCard ─────────────────────────────────────────────────
export function MarketCard() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<MarketItem | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`${API_BASE}/news/market`)
      .then((r) => r.json())
      .then((data: unknown) => {
        const result = unwrapApiResult<MarketItem[]>(data);
        setItems(Array.isArray(result) ? result : []);
        setLastUpdated(new Date());
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <>
      {selected && <ChartModal item={selected} onClose={() => setSelected(null)} />}

      <div className="glass-panel rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700">주요 지표</h2>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs font-medium text-slate-400">
                {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-xs2 font-medium text-slate-400 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40"
            >
              {loading ? "⟳" : "⟳ 새로고침"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-1.5 p-3 rounded-xl bg-slate-50">
                <div className="h-3 bg-slate-200 rounded animate-pulse w-16" />
                <div className="h-5 bg-slate-200 rounded animate-pulse w-24" />
                <div className="h-2.5 bg-slate-100 rounded animate-pulse w-20" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-4 gap-2 text-slate-400">
            <span className="text-lg">📡</span>
            <p className="text-xs">지표를 불러올 수 없습니다</p>
            <button onClick={fetchData} className="text-xs text-indigo-600 hover:underline">
              다시 시도
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {items.map((item) => {
              const up = item.change >= 0;
              return (
                <button
                  key={item.symbol}
                  onClick={() => setSelected(item)}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:border-indigo-100 border border-transparent transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs">{SYMBOL_ICON[item.symbol] ?? "📈"}</span>
                    <span className="text-2xs sm:text-xs font-semibold text-slate-500 truncate">{item.name}</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold text-slate-800 leading-tight">
                    {formatPrice(item.price, item.symbol)}
                  </p>
                  <p className={`text-2xs sm:text-xs font-medium mt-0.5 ${up ? "text-red-500" : "text-blue-500"}`}>
                    {formatChange(item.change, item.changePercent)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
