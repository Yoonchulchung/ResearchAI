"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMarketChart, type ChartPoint } from "@/lib/api/stock";

type Range = "1W" | "1M" | "3M";

const RANGE_MAP: Record<Range, string> = {
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
};

const INDICES = [
  { symbol: "^KS11", label: "KOSPI",  color: "#6366f1" },
  { symbol: "^KQ11", label: "KOSDAQ", color: "#f59e0b" },
  { symbol: "^IXIC", label: "나스닥",  color: "#10b981" },
] as const;

type Symbol = (typeof INDICES)[number]["symbol"];

/** 첫 거래일 종가 기준 상대 수익률(%) 계산 */
function normalize(points: ChartPoint[]): { date: string; pct: number }[] {
  const valid = points.filter((p) => p.close > 0);
  if (valid.length === 0) return [];
  const base = valid[0].close;
  return valid.map((p) => ({ date: p.date, pct: ((p.close - base) / base) * 100 }));
}

function buildPolyline(
  series: { date: string; pct: number }[],
  allDates: string[],
  yMin: number,
  yMax: number,
  w: number,
  h: number,
  pad: number,
): string {
  if (series.length === 0 || allDates.length < 2) return "";
  const dateSet = new Set(series.map((d) => d.date));
  const filteredDates = allDates.filter((d) => dateSet.has(d));
  if (filteredDates.length < 2) return "";

  const range = yMax - yMin || 1;
  const pts = series
    .filter((d) => allDates.includes(d.date))
    .map((d) => {
      const xi = filteredDates.indexOf(d.date);
      const x = pad + (xi / (filteredDates.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (d.pct - yMin) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  return pts.join(" ");
}

export function IndexComparisonChart({ isDark }: { isDark: boolean }) {
  const [range, setRange] = useState<Range>("1M");
  const [data, setData] = useState<Record<Symbol, ChartPoint[]>>({
    "^KS11": [], "^KQ11": [], "^IXIC": [],
  });
  const [loading, setLoading] = useState(true);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    try {
      const results = await Promise.all(
        INDICES.map((idx) => getMarketChart(idx.symbol, RANGE_MAP[r])),
      );
      setData({
        "^KS11": results[0] ?? [],
        "^KQ11": results[1] ?? [],
        "^IXIC": results[2] ?? [],
      });
    } catch {
      // 실패 무시
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(range); }, [load, range]);

  const normalized = useMemo(() => ({
    "^KS11": normalize(data["^KS11"]),
    "^KQ11": normalize(data["^KQ11"]),
    "^IXIC": normalize(data["^IXIC"]),
  }), [data]);

  // 모든 날짜 합집합 → 정렬
  const allDates = useMemo(() => {
    const set = new Set<string>();
    INDICES.forEach(({ symbol }) => normalized[symbol].forEach((d) => set.add(d.date)));
    return [...set].sort();
  }, [normalized]);

  const allPcts = useMemo(() =>
    INDICES.flatMap(({ symbol }) => normalized[symbol].map((d) => d.pct)),
    [normalized],
  );

  const yMin = allPcts.length ? Math.min(...allPcts) : -5;
  const yMax = allPcts.length ? Math.max(...allPcts) : 5;
  const yPad = Math.max(0.5, (yMax - yMin) * 0.12);
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const W = 600;
  const H = 130;
  const PAD = 10;

  // hover 날짜 인덱스
  const hoverIdx = useMemo(() => {
    if (hoverDate === null) return null;
    const idx = allDates.indexOf(hoverDate);
    return idx >= 0 ? idx : null;
  }, [hoverDate, allDates]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || allDates.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const chartW = rect.width - PAD * 2 * (rect.width / W);
    const ratio = Math.max(0, Math.min(1, (relX - PAD * (rect.width / W)) / chartW));
    const idx = Math.round(ratio * (allDates.length - 1));
    setHoverX(relX);
    setHoverDate(allDates[idx] ?? null);
  };

  // y 좌표 변환 (SVG 실제 px)
  const toY = (pct: number) =>
    PAD + (1 - (pct - yLo) / (yHi - yLo)) * (H - PAD * 2);

  // 0% 기준선 y
  const zeroY = toY(0);

  const border = isDark ? "border-slate-800" : "border-slate-200";
  const bg = isDark ? "bg-slate-900" : "bg-white";
  const mutedText = isDark ? "text-slate-500" : "text-slate-400";
  const rangeActive = isDark
    ? "bg-slate-700 text-white"
    : "bg-slate-900 text-white";
  const rangeInactive = isDark
    ? "text-slate-500 hover:text-slate-300"
    : "text-slate-400 hover:text-slate-700";

  // 마지막 값
  const lastPct = (sym: Symbol) => {
    const s = normalized[sym];
    return s.length > 0 ? s[s.length - 1].pct : null;
  };
  const hoverPct = (sym: Symbol) => {
    if (hoverIdx === null) return null;
    const s = normalized[sym];
    const entry = s.find((d) => d.date === allDates[hoverIdx]);
    return entry?.pct ?? null;
  };

  return (
    <div className={`overflow-hidden rounded-2xl border ${border} ${bg} shadow-sm`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-4">
          {INDICES.map(({ symbol, label, color }) => {
            const pct = hoverIdx !== null ? hoverPct(symbol) : lastPct(symbol);
            return (
              <span key={symbol} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                <span className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  {label}
                </span>
                {pct != null && (
                  <span
                    className="font-mono text-xs font-bold"
                    style={{ color: pct >= 0 ? "#f43f5e" : "#38bdf8" }}
                  >
                    {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                  </span>
                )}
              </span>
            );
          })}
          {hoverDate && (
            <span className={`text-xs ${mutedText}`}>{hoverDate}</span>
          )}
        </div>
        {/* 기간 선택 */}
        <div className={`flex gap-0.5 rounded-lg border p-0.5 text-xs ${isDark ? "border-slate-700" : "border-slate-200"}`}>
          {(["1W", "1M", "3M"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2 py-0.5 font-semibold transition ${
                range === r ? rangeActive : rangeInactive
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* SVG 차트 */}
      <div className="relative px-1 pb-2 pt-1">
        {loading ? (
          <div
            className={`flex items-center justify-center rounded-xl ${isDark ? "bg-slate-800/40" : "bg-slate-50"}`}
            style={{ height: H }}
          >
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full cursor-crosshair"
            style={{ height: H }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => { setHoverX(null); setHoverDate(null); }}
          >
            {/* 0% 기준선 */}
            <line
              x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY}
              stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}
              strokeWidth="1"
              strokeDasharray="4,3"
            />

            {/* 각 지수 라인 */}
            {INDICES.map(({ symbol, color }) => {
              const pts = buildPolyline(
                normalized[symbol], allDates, yLo, yHi, W, H, PAD,
              );
              if (!pts) return null;
              return (
                <polyline
                  key={symbol}
                  points={pts}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

            {/* hover 수직선 */}
            {hoverX !== null && svgRef.current && (() => {
              const rect = svgRef.current.getBoundingClientRect();
              const svgX = (hoverX / rect.width) * W;
              return (
                <line
                  x1={svgX} y1={PAD} x2={svgX} y2={H - PAD}
                  stroke={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)"}
                  strokeWidth="1"
                  strokeDasharray="3,2"
                />
              );
            })()}

            {/* hover 점 */}
            {hoverIdx !== null && svgRef.current && INDICES.map(({ symbol, color }) => {
              const entry = normalized[symbol].find((d) => d.date === allDates[hoverIdx]);
              if (!entry) return null;
              const dateSet = new Set(normalized[symbol].map((d) => d.date));
              const filteredDates = allDates.filter((d) => dateSet.has(d));
              const xi = filteredDates.indexOf(entry.date);
              if (xi < 0) return null;
              const x = PAD + (xi / (filteredDates.length - 1)) * (W - PAD * 2);
              const y = PAD + (1 - (entry.pct - yLo) / (yHi - yLo)) * (H - PAD * 2);
              return (
                <circle key={symbol} cx={x} cy={y} r="3.5" fill={color} />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
