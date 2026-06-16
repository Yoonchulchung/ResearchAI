"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCompanyStock, type CompanyStockQuote } from "@/lib/api/companies";

/* ── 상수 ─────────────────────────────────────────────────── */

const INTERVALS = [
  { key: "15m", label: "15분" },
  { key: "1h",  label: "1시간" },
  { key: "4h",  label: "4시간" },
  { key: "1d",  label: "1일" },
  { key: "1w",  label: "1주" },
] as const;

type IntervalKey = (typeof INTERVALS)[number]["key"];

const CHART_TYPES = [
  { key: "candlestick", label: "캔들" },
  { key: "line",        label: "라인" },
  { key: "area",        label: "영역" },
  { key: "bars",        label: "바" },
] as const;

type ChartType = (typeof CHART_TYPES)[number]["key"];

type Candle = CompanyStockQuote["chart"][number];

const WINDOW_SIZE = 80; // 한 화면에 표시할 최대 캔들 수

/* ── 헬퍼 ─────────────────────────────────────────────────── */

function calcMA(data: Candle[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, d) => s + d.close, 0) / period;
  });
}

function fmtPrice(v: number | null | undefined, currency: string | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(v);
}

function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtSigned(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}`;
}

/* ── SVG 레이아웃 ─────────────────────────────────────────── */

const W     = 600;
const PH    = 200;
const VH    = 58;
const GAP   = 14;
const H     = PH + GAP + VH;
const PAD_L = 4;
const PAD_R = 60;
const PAD_T = 10;
const PAD_B = 22;
const CW    = W - PAD_L - PAD_R;

/* ── 차트 컴포넌트 ────────────────────────────────────────── */

interface ChartProps {
  chart:       Candle[];
  ma7:         (number | null)[];
  ma25:        (number | null)[];
  isUp:        boolean;
  isDark:      boolean;
  chartType:   ChartType;
  hoveredIdx:  number | null;
  onHover:     (idx: number | null) => void;
  onPanStart:  () => void;
  onPanDelta:  (delta: number) => void;
}

function PriceVolumeChart({
  chart, ma7, ma25, isUp, isDark, chartType,
  hoveredIdx, onHover, onPanStart, onPanDelta,
}: ChartProps) {
  const svgRef      = useRef<SVGSVGElement>(null);
  const dragStartX  = useRef<number | null>(null);
  const isDragging  = useRef(false);

  const upClr    = "#ef4444";
  const dnClr    = "#3b82f6";
  const lineClr  = isUp ? upClr : dnClr;
  const gridClr  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const crossClr = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)";
  const lblClr   = isDark ? "rgba(255,255,255,0.35)" : "#94a3b8";

  const useFull = chartType === "candlestick" || chartType === "bars";
  const allLow  = useFull
    ? Math.min(...chart.map((d) => d.low  ?? d.close))
    : Math.min(...chart.map((d) => d.close));
  const allHigh = useFull
    ? Math.max(...chart.map((d) => d.high ?? d.close))
    : Math.max(...chart.map((d) => d.close));
  const pSpan   = allHigh - allLow || 1;

  const cx = (i: number) =>
    PAD_L + (chart.length === 1 ? CW / 2 : (i / (chart.length - 1)) * CW);
  const cy = (p: number) =>
    PAD_T + (PH - PAD_T) - ((p - allLow) / pSpan) * (PH - PAD_T - 4);

  const bW = Math.max(1.5, Math.min(10, (CW / chart.length) * 0.6));

  const linePts = chart
    .map((d, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(d.close).toFixed(1)}`)
    .join(" ");
  const areaPts = `${linePts} L${cx(chart.length - 1).toFixed(1)},${PH} L${cx(0).toFixed(1)},${PH} Z`;

  const maPath = (ma: (number | null)[]) => {
    const pts: string[] = [];
    let pen = false;
    ma.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      pts.push(`${!pen ? "M" : "L"}${cx(i).toFixed(1)},${cy(v).toFixed(1)}`);
      pen = true;
    });
    return pts.join(" ");
  };

  const yTicks = 4;
  const yVals  = Array.from({ length: yTicks + 1 }, (_, i) => allLow + (pSpan / yTicks) * i);
  const maxVol = Math.max(...chart.map((d) => d.volume ?? 0), 1);
  const volTop = PH + GAP;
  const volH   = VH - 8;
  const volBW  = Math.max(1, CW / chart.length - 0.5);
  const xStep  = Math.max(1, Math.floor(chart.length / 5));
  const xIdxs  = Array.from({ length: Math.floor(chart.length / xStep) }, (_, i) => i * xStep);
  if (!xIdxs.includes(chart.length - 1)) xIdxs.push(chart.length - 1);

  const gradId = useRef(`sg-${Math.random().toString(36).slice(2, 6)}`).current;

  /* ── 드래그 팬 핸들러 ── */
  const startDrag = useCallback(
    (clientX: number) => {
      dragStartX.current = clientX;
      isDragging.current = false;
      onPanStart();
    },
    [onPanStart],
  );

  const moveDrag = useCallback(
    (clientX: number): boolean => {
      if (dragStartX.current === null) return false;
      const totalPx = clientX - dragStartX.current;
      if (Math.abs(totalPx) > 4) isDragging.current = true;
      if (isDragging.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const factor = (chart.length * W) / (rect.width * CW);
          onPanDelta(Math.round(-totalPx * factor));
        }
        return true; // consumed — skip hover
      }
      return false;
    },
    [chart.length, onPanDelta],
  );

  const endDrag = useCallback(() => {
    dragStartX.current = null;
    isDragging.current = false;
  }, []);

  /* ── 마우스 이벤트 ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => startDrag(e.clientX), [startDrag]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (moveDrag(e.clientX)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const frac = (relX * W - PAD_L) / CW;
      const idx  = Math.max(0, Math.min(chart.length - 1, Math.round(frac * (chart.length - 1))));
      onHover(idx);
    },
    [chart.length, moveDrag, onHover],
  );

  const handleMouseUp   = useCallback(() => endDrag(), [endDrag]);
  const handleMouseLeave= useCallback(() => { endDrag(); onHover(null); }, [endDrag, onHover]);

  /* ── 터치 이벤트 ── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => startDrag(e.touches[0].clientX), [startDrag]);
  const handleTouchMove  = useCallback((e: React.TouchEvent) => { moveDrag(e.touches[0].clientX); }, [moveDrag]);
  const handleTouchEnd   = useCallback(() => endDrag(), [endDrag]);

  const hov = hoveredIdx !== null ? chart[hoveredIdx] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H + PAD_B}`}
      style={{ width: "100%", height: "280px", cursor: isDragging.current ? "grabbing" : "crosshair" }}
      preserveAspectRatio="none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={lineClr} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineClr} stopOpacity="0"    />
        </linearGradient>
      </defs>

      {/* 그리드 + Y축 */}
      {yVals.map((p, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={cy(p)} y2={cy(p)} stroke={gridClr} strokeWidth={1} />
          <text x={W - PAD_R + 4} y={cy(p) + 3.5} fontSize={9} fill={lblClr} fontFamily="monospace">
            {p >= 1000 ? p.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) : p.toFixed(2)}
          </text>
        </g>
      ))}

      {chartType === "area" && <path d={areaPts} fill={`url(#${gradId})`} />}

      {ma25.some((v) => v != null) && (
        <path d={maPath(ma25)} fill="none" stroke={isDark ? "#a78bfa" : "#7c3aed"} strokeWidth={1} opacity={0.75} />
      )}
      {ma7.some((v) => v != null) && (
        <path d={maPath(ma7)} fill="none" stroke={isDark ? "#fbbf24" : "#d97706"} strokeWidth={1} opacity={0.9} />
      )}

      {/* Candlestick */}
      {chartType === "candlestick" && chart.map((d, i) => {
        const open    = d.open  ?? d.close;
        const high    = d.high  ?? d.close;
        const low     = d.low   ?? d.close;
        const isRed   = d.close >= open;
        const clr     = isRed ? upClr : dnClr;
        const bodyTop = cy(Math.max(open, d.close));
        const bodyBot = cy(Math.min(open, d.close));
        const bodyH   = Math.max(1, bodyBot - bodyTop);
        const alpha   = hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1;
        return (
          <g key={i} opacity={alpha}>
            <line x1={cx(i)} x2={cx(i)} y1={cy(high)} y2={cy(low)} stroke={clr} strokeWidth={1} />
            <rect
              x={cx(i) - bW / 2} y={bodyTop} width={bW} height={bodyH}
              fill={isRed ? clr : "transparent"} stroke={clr} strokeWidth={1}
            />
          </g>
        );
      })}

      {/* OHLC Bars */}
      {chartType === "bars" && chart.map((d, i) => {
        const open  = d.open  ?? d.close;
        const high  = d.high  ?? d.close;
        const low   = d.low   ?? d.close;
        const isRed = d.close >= open;
        const clr   = isRed ? upClr : dnClr;
        const alpha = hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1;
        const tickW = bW * 0.8;
        return (
          <g key={i} opacity={alpha} stroke={clr} strokeWidth={1.2} fill="none">
            <line x1={cx(i)}        x2={cx(i)}        y1={cy(high)}    y2={cy(low)} />
            <line x1={cx(i) - tickW} x2={cx(i)}       y1={cy(open)}    y2={cy(open)} />
            <line x1={cx(i)}        x2={cx(i) + tickW} y1={cy(d.close)} y2={cy(d.close)} />
          </g>
        );
      })}

      {/* Line / Area */}
      {(chartType === "line" || chartType === "area") && (
        <>
          <path d={linePts} fill="none" stroke={lineClr} strokeWidth={1.5} />
          <circle cx={cx(chart.length - 1)} cy={cy(chart[chart.length - 1].close)} r={3} fill={lineClr} />
        </>
      )}

      {/* 거래량 */}
      <line x1={PAD_L} x2={W - PAD_R} y1={volTop} y2={volTop} stroke={gridClr} strokeWidth={1} />
      <text x={W - PAD_R + 4} y={volTop + 10} fontSize={9} fill={lblClr} fontFamily="monospace">
        {fmtVol(maxVol)}
      </text>
      {chart.map((d, i) => {
        const vol    = d.volume ?? 0;
        const bH     = vol === 0 ? 0 : Math.max(1, (vol / maxVol) * volH);
        const bX     = PAD_L + (i / chart.length) * CW;
        const prevCl = i > 0 ? chart[i - 1].close : d.close;
        const barClr = d.close >= prevCl
          ? isDark ? "rgba(239,68,68,0.5)"  : "rgba(239,68,68,0.45)"
          : isDark ? "rgba(59,130,246,0.5)" : "rgba(59,130,246,0.45)";
        return (
          <rect
            key={i}
            x={bX} y={volTop + volH - bH + 6}
            width={Math.max(1, volBW)} height={bH}
            fill={hoveredIdx === i ? (d.close >= prevCl ? upClr : dnClr) : barClr}
            opacity={hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1}
          />
        );
      })}

      {/* X축 */}
      {xIdxs.map((i, rank) => (
        <text
          key={i}
          x={cx(i)} y={H + PAD_B - 4}
          textAnchor={rank === 0 ? "start" : rank === xIdxs.length - 1 ? "end" : "middle"}
          fontSize={9} fill={lblClr} fontFamily="monospace"
        >
          {chart[i]?.date?.slice(5).replace("-", "/")}
        </text>
      ))}

      {/* 크로스헤어 */}
      {hoveredIdx !== null && hov && (
        <>
          <line x1={cx(hoveredIdx)} x2={cx(hoveredIdx)} y1={PAD_T} y2={PH}
            stroke={crossClr} strokeWidth={1} strokeDasharray="3,3" />
          <line x1={PAD_L} x2={W - PAD_R} y1={cy(hov.close)} y2={cy(hov.close)}
            stroke={crossClr} strokeWidth={1} strokeDasharray="3,3" />
          <rect x={W - PAD_R + 1} y={cy(hov.close) - 8} width={PAD_R - 2} height={16} fill={lineClr} rx={2} />
          <text x={W - PAD_R + PAD_R / 2} y={cy(hov.close) + 4}
            textAnchor="middle" fontSize={9} fill="white" fontFamily="monospace" fontWeight="bold">
            {hov.close >= 1000
              ? hov.close.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
              : hov.close.toFixed(2)}
          </text>
          <rect
            x={Math.max(0, Math.min(W - PAD_R - 54, cx(hoveredIdx) - 27))}
            y={PH + 2} width={54} height={14}
            fill={isDark ? "#334155" : "#94a3b8"} rx={2}
          />
          <text
            x={Math.max(27, Math.min(W - PAD_R - 27, cx(hoveredIdx)))}
            y={PH + 12} textAnchor="middle" fontSize={8} fill="white" fontFamily="monospace">
            {hov.date.slice(5)}
          </text>
          <circle cx={cx(hoveredIdx)} cy={cy(hov.close)} r={4} fill={lineClr} stroke="white" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/* ── OHLCV 인포바 — 항상 고정 높이로 렌더링 ──────────────── */

interface InfoBarProps {
  hov:        Candle | null;
  ma7Val:     number | null;
  ma25Val:    number | null;
  currency:   string | null;
  isDark:     boolean;
  subtleText: string;
}

function OhlcvInfoBar({ hov, ma7Val, ma25Val, currency, isDark, subtleText }: InfoBarProps) {
  const lbl = (text: string, val: string, color?: string) => (
    <span className="flex items-center gap-1">
      <span className={subtleText}>{text}</span>
      <span className={`font-mono font-bold ${color ?? (isDark ? "text-white/80" : "text-slate-800")}`}>
        {val}
      </span>
    </span>
  );

  return (
    /* 항상 같은 높이를 차지 — hover 여부와 무관하게 레이아웃 고정 */
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-0 border-b px-3 py-1.5 text-xs transition-opacity
        ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"}
        ${hov ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      style={{ minHeight: "30px" }}
    >
      {hov ? (
        <>
          <span className={`font-mono font-semibold ${subtleText}`}>{hov.date}</span>
          {hov.open  != null && lbl("시가", fmtPrice(hov.open,  currency))}
          {hov.high  != null && lbl("고가", fmtPrice(hov.high,  currency), "text-red-500")}
          {hov.low   != null && lbl("저가", fmtPrice(hov.low,   currency), "text-blue-500")}
          {lbl("종가", fmtPrice(hov.close, currency))}
          {ma7Val  != null && lbl("MA7",  fmtPrice(ma7Val,  currency), isDark ? "text-amber-400"  : "text-amber-600")}
          {ma25Val != null && lbl("MA25", fmtPrice(ma25Val, currency), isDark ? "text-violet-400" : "text-violet-700")}
          {hov.volume != null && lbl("거래량", fmtVol(hov.volume))}
        </>
      ) : (
        /* 높이 유지용 빈 텍스트 */
        <span className="invisible text-xs">placeholder</span>
      )}
    </div>
  );
}

/* ── 메인 컴포넌트 ────────────────────────────────────────── */

interface StockChartProps {
  companyId:  string;
  isDark:     boolean;
  panelClass: string;
  mutedPanel: string;
  subtleText: string;
}

export function StockChart({ companyId, isDark, panelClass, mutedPanel: _mutedPanel, subtleText }: StockChartProps) {
  const [interval,   setIntervalKey] = useState<IntervalKey>("1d");
  const [chartType,  setChartType]   = useState<ChartType>("candlestick");
  const [stock,      setStock]       = useState<CompanyStockQuote | null>(null);
  const [loading,    setLoading]     = useState(true);
  const [error,      setError]       = useState("");
  const [hoveredIdx, setHoveredIdx]  = useState<number | null>(null);
  const [panOffset,  setPanOffset]   = useState(0);
  const panBaseRef = useRef(0);

  /* 데이터 로드 */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHoveredIdx(null);
    setPanOffset(0);
    getCompanyStock(companyId, interval)
      .then((s) => { if (!cancelled) { setStock(s); setError(s.error ?? ""); } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "오류"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, interval]);

  const chart    = stock?.chart ?? [];
  const ma7Full  = calcMA(chart, 7);
  const ma25Full = calcMA(chart, 25);
  const isUp     = (stock?.change ?? 0) >= 0;
  const currency = stock?.currency ?? null;

  /* 윈도우 슬라이싱 */
  const windowSize    = Math.min(chart.length, WINDOW_SIZE);
  const maxPanOffset  = Math.max(0, chart.length - windowSize);
  const clampedOffset = Math.max(0, Math.min(maxPanOffset, panOffset));
  const startIdx      = chart.length - windowSize - clampedOffset;
  const endIdx        = clampedOffset === 0 ? chart.length : chart.length - clampedOffset;
  const visibleChart  = chart.slice(startIdx, endIdx);
  const visibleMa7    = ma7Full.slice(startIdx, endIdx);
  const visibleMa25   = ma25Full.slice(startIdx, endIdx);

  /* 팬 콜백 */
  const handlePanStart = useCallback(() => { panBaseRef.current = clampedOffset; }, [clampedOffset]);
  const handlePanDelta = useCallback(
    (delta: number) => {
      setPanOffset(Math.max(0, Math.min(maxPanOffset, panBaseRef.current + delta)));
    },
    [maxPanOffset],
  );

  const priceClr  = isUp ? "text-red-500" : "text-blue-500";
  const monthHigh = chart.length ? Math.max(...chart.map((d) => d.close)) : null;
  const monthLow  = chart.length ? Math.min(...chart.map((d) => d.close)) : null;

  const hov     = hoveredIdx !== null ? visibleChart[hoveredIdx] ?? null : null;
  const ma7Val  = hoveredIdx !== null ? (visibleMa7[hoveredIdx]  ?? null) : null;
  const ma25Val = hoveredIdx !== null ? (visibleMa25[hoveredIdx] ?? null) : null;

  const tabBtn = (active: boolean) =>
    `rounded px-2.5 py-1 text-xs font-bold transition-colors ${
      active
        ? isDark ? "bg-white/15 text-white" : "bg-slate-200 text-slate-900"
        : isDark ? "text-white/40 hover:text-white/70" : "text-slate-400 hover:text-slate-700"
    }`;

  return (
    <section className={`rounded-md border overflow-hidden ${panelClass}`}>

      {/* ── 헤더 ── */}
      <div className={`border-b px-4 py-2.5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
        {loading && !stock ? (
          <div className={`h-9 text-sm ${subtleText}`}>주식 데이터를 불러오는 중...</div>
        ) : !stock || stock.regularMarketPrice == null ? (
          <div>
            <p className="text-sm font-bold">주식 데이터를 표시할 수 없습니다.</p>
            <p className={`mt-1 text-xs ${subtleText}`}>{error || "종목코드가 없거나 시세 제공 대상이 아닙니다."}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-black ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                  {stock.symbol ?? stock.stockCode}
                </span>
                <span className={`text-xs font-semibold ${subtleText}`}>
                  {[stock.exchangeName, currency].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-2xl font-black ${priceClr}`}>
                  {fmtPrice(stock.regularMarketPrice, currency)}
                </span>
                <span className={`font-mono text-sm font-bold ${priceClr}`}>
                  {fmtSigned(stock.change, currency === "KRW" ? 0 : 2)}{" "}
                  ({fmtSigned(stock.changePercent)}%)
                </span>
              </div>
            </div>
            <div className={`mt-1 flex flex-wrap gap-x-5 gap-y-0 font-mono text-xs ${subtleText}`}>
              <span>전일종가 <span className={isDark ? "font-bold text-white/70" : "font-bold text-slate-700"}>{fmtPrice(stock.previousClose, currency)}</span></span>
              {monthHigh != null && <span>고가 <span className="font-bold text-red-500">{fmtPrice(monthHigh, currency)}</span></span>}
              {monthLow  != null && <span>저가 <span className="font-bold text-blue-500">{fmtPrice(monthLow, currency)}</span></span>}
              {stock.fetchedAt && (
                <span className="ml-auto">
                  {new Date(stock.fetchedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 툴바 ── */}
      <div className={`flex items-center gap-2 border-b px-3 py-1 ${isDark ? "border-white/10" : "border-slate-100"}`}>
        <div className="flex gap-0.5">
          {INTERVALS.map((iv) => (
            <button key={iv.key} onClick={() => setIntervalKey(iv.key)} className={tabBtn(interval === iv.key)}>
              {iv.label}
            </button>
          ))}
        </div>
        <span className={`h-4 w-px ${isDark ? "bg-white/15" : "bg-slate-200"}`} />
        <div className="flex gap-0.5">
          {CHART_TYPES.map((ct) => (
            <button key={ct.key} onClick={() => setChartType(ct.key)} className={tabBtn(chartType === ct.key)}>
              {ct.label}
            </button>
          ))}
        </div>
        <div className={`ml-auto flex items-center gap-3 font-mono text-xs ${subtleText}`}>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: isDark ? "#fbbf24" : "#d97706" }} />
            <span className={isDark ? "text-amber-400" : "text-amber-600"}>MA7</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: isDark ? "#a78bfa" : "#7c3aed" }} />
            <span className={isDark ? "text-violet-400" : "text-violet-700"}>MA25</span>
          </span>
        </div>
      </div>

      {/* ── OHLCV 인포바 — 항상 고정 높이 ── */}
      <OhlcvInfoBar
        hov={hov}
        ma7Val={ma7Val}
        ma25Val={ma25Val}
        currency={currency}
        isDark={isDark}
        subtleText={subtleText}
      />

      {/* ── 차트 ── */}
      <div className="relative px-2 pb-1">
        {loading && (
          <div className={`absolute inset-0 z-10 flex items-center justify-center text-sm ${isDark ? "bg-slate-900/70" : "bg-white/70"} ${subtleText}`}>
            불러오는 중...
          </div>
        )}
        {visibleChart.length >= 2 ? (
          <PriceVolumeChart
            chart={visibleChart}
            ma7={visibleMa7}
            ma25={visibleMa25}
            isUp={isUp}
            isDark={isDark}
            chartType={chartType}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
            onPanStart={handlePanStart}
            onPanDelta={handlePanDelta}
          />
        ) : !loading ? (
          <div className={`flex h-64 items-center justify-center text-sm ${subtleText}`}>데이터 없음</div>
        ) : null}
      </div>

      {/* ── 스크롤 위치 인디케이터 ── */}
      {maxPanOffset > 0 && (
        <div className="mx-3 mb-1.5 mt-0.5">
          <div className={`relative h-1 rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
            <div
              className={`absolute h-full rounded-full transition-all ${isDark ? "bg-white/35" : "bg-slate-400"}`}
              style={{
                width:  `${(windowSize / chart.length) * 100}%`,
                right:  `${(clampedOffset / chart.length) * 100}%`,
              }}
            />
          </div>
          <p className={`mt-0.5 text-center font-mono text-2xs ${subtleText}`}>
            {clampedOffset > 0 ? `← ${clampedOffset}개 이전 캔들 보는 중` : "← 드래그하여 이전 데이터 탐색"}
          </p>
        </div>
      )}

    </section>
  );
}
