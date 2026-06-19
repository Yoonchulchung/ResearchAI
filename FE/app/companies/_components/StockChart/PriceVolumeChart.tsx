import { useRef, useId, useCallback, useEffect, useMemo, useState } from "react";
import type { ChartProps, ChartAnnotation } from "./types";
import { fmtEok, fmtPct, markerColor, typeLabel, fmtVol, nearestCandleIndex } from "./utils";
import { PAD_L, PAD_R, PAD_T, PAD_B, GAP } from "./constants";

export function PriceVolumeChart({
  containerSize, chart, ma7, ma25, annotations, isUp, isDark, chartType,
  hoveredIdx, onHover, onPanStart, onPanDelta,
  overlays, showMa, showVolume,
}: ChartProps) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const sw1 = Math.max(0.5, 1 / dpr);
  const sw1_2 = Math.max(0.6, 1.2 / dpr);
  const sw1_5 = Math.max(0.75, 1.5 / dpr);
  const sw2 = Math.max(1, 2 / dpr);

  const W  = containerSize.w || 600;
  const SVG_H = containerSize.h || 432;
  const H  = SVG_H - PAD_B;
  const VH = Math.max(60, Math.floor(H * 0.2)); // 거래량은 전체의 20%
  const PH = H - VH - GAP;
  const CW = W - PAD_L - PAD_R;
  
  const svgRef      = useRef<SVGSVGElement>(null);
  const dragStartX  = useRef<number | null>(null);
  const isDragging  = useRef(false);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<{
    item: ChartAnnotation;
    x: number;
    y: number;
  } | null>(null);
  const [pinnedAnnotation, setPinnedAnnotation] = useState<{
    item: ChartAnnotation;
    x: number;
    y: number;
  } | null>(null);

  const reactId  = useId();
  const gradId   = `sg-${reactId.replace(/:/g, "")}`;

  const upClr    = isDark ? "#f43f5e" : "#e11d48"; // Premium rose-red
  const dnClr    = isDark ? "#38bdf8" : "#0284c7"; // Premium sky-blue
  const lineClr  = isUp ? upClr : dnClr;
  const gridClr  = isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)";
  const crossClr = isDark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.12)";
  const lblClr   = isDark ? "rgba(255,255,255,0.35)" : "#94a3b8";

  // 0은 미완성 캔들의 무효값 — 범위 계산에서 제외하고 close로 대체
  const validLow  = (v: number | null | undefined, fallback: number) => (v && v > 0 ? v : fallback);
  const validHigh = (v: number | null | undefined, fallback: number) => (v && v > 0 ? v : fallback);
  const validOpen = (v: number | null | undefined, fallback: number) => (v && v > 0 ? v : fallback);

  const useFull = chartType === "candlestick" || chartType === "bars";
  const allLow  = useFull
    ? Math.min(...chart.map((d) => validLow(d.low, d.close)))
    : Math.min(...chart.map((d) => d.close));
  const allHigh = useFull
    ? Math.max(...chart.map((d) => validHigh(d.high, d.close)))
    : Math.max(...chart.map((d) => d.close));
  const pSpan   = allHigh - allLow || 1;

  const cx = (i: number) =>
    PAD_L + (chart.length === 1 ? CW / 2 : (i / (chart.length - 1)) * CW);
  const cy = (p: number) =>
    PAD_T + (PH - PAD_T) - ((p - allLow) / pSpan) * (PH - PAD_T - 4);

  const bW = Math.max(2.5, Math.min(10, (CW / chart.length) * 0.65));

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
  const volBW  = Math.max(1.5, CW / chart.length - 1);
  const xStep  = Math.max(1, Math.floor(chart.length / 5));
  const xIdxs  = Array.from({ length: Math.floor(chart.length / xStep) }, (_, i) => i * xStep);
  if (!xIdxs.includes(chart.length - 1)) xIdxs.push(chart.length - 1);

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
          onPanDelta(Math.round(totalPx * factor * 2));
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
  const handleMouseLeave= useCallback(() => {
    endDrag();
    onHover(null);
    setHoveredAnnotation(null);
  }, [endDrag, onHover]);

  useEffect(() => {
    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!svgRef.current?.contains(event.target as Node)) {
        setPinnedAnnotation(null);
      }
    };
    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, []);

  /* ── 터치 이벤트 ── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    startDrag(e.touches[0].clientX);
  }, [startDrag]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    moveDrag(e.touches[0].clientX);
  }, [moveDrag]);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    endDrag();
  }, [endDrag]);

  const hov = hoveredIdx !== null ? chart[hoveredIdx] : null;
  const annotationGroups = useMemo(() => {
    const grouped = new Map<number, ChartAnnotation[]>();
    annotations.forEach((annotation) => {
      const idx = nearestCandleIndex(chart, annotation.date);
      if (idx == null) return;
      grouped.set(idx, [...(grouped.get(idx) ?? []), annotation]);
    });
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, items]) => ({ idx, items: items.slice(0, 4) }));
  }, [annotations, chart]);
  const activeAnnotation = pinnedAnnotation ?? hoveredAnnotation;
  const isTooltipPinned = pinnedAnnotation != null;
  const tooltipWidth = Math.min(420, Math.max(300, W - 16));
  const textLength =
    (activeAnnotation?.item.title.length ?? 0) +
    (activeAnnotation?.item.description?.length ?? 0);
  const estimatedTextLines = Math.max(2, Math.ceil(textLength / 34));
  const tooltipHeight = activeAnnotation?.item.financialDetails
    ? activeAnnotation.item.url ? 252 : 214
    : Math.min(
        Math.max(activeAnnotation?.item.url ? 184 : 146, 88 + estimatedTextLines * 16),
        SVG_H - 32,
      );
  const tooltipX = activeAnnotation
    ? Math.max(8, Math.min(W - tooltipWidth - 8, activeAnnotation.x - tooltipWidth / 2))
    : 0;
  const tooltipY = activeAnnotation
    ? Math.max(PAD_T + 8, Math.min(SVG_H - tooltipHeight - 8, activeAnnotation.y + 12))
    : 0;
  const linkLabel = activeAnnotation
    ? activeAnnotation.item.type === "news"
      ? "뉴스 원문 보기"
      : activeAnnotation.item.type === "disclosure"
        ? "공시 보고서 보기"
        : activeAnnotation.item.type === "financial"
          ? activeAnnotation.item.url?.startsWith("#")
            ? "재무제표 영역 보기"
            : "DART 재무제표 보기"
          : "관련 자료 보기"
    : "";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${SVG_H}`}
      style={{ width: "100%", height: `${SVG_H}px`, cursor: isDragging.current ? "grabbing" : "crosshair", touchAction: "none", display: "block" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={() => setPinnedAnnotation(null)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={lineClr} stopOpacity="0.22" />
          <stop offset="100%" stopColor={lineClr} stopOpacity="0"    />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor={lineClr} floodOpacity={isDark ? "0.3" : "0.15"} />
        </filter>
      </defs>

      {/* 그리드 + Y축 */}
      {yVals.map((p, i) => (
        <g key={i} shapeRendering="crispEdges">
          <line x1={PAD_L} x2={W - PAD_R} y1={cy(p)} y2={cy(p)} stroke={gridClr} strokeWidth={sw1} strokeDasharray="3,6" />
          <text x={W - PAD_R + 8} y={cy(p) + 3.5} fontSize={9} fill={lblClr} fontFamily="monospace" fontWeight="500">
            {p >= 1000 ? p.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) : p.toFixed(2)}
          </text>
        </g>
      ))}

      {chartType === "area" && <path d={areaPts} fill={`url(#${gradId})`} />}

      {/* ── MA (이동평균선) ── */}
      {showMa && ma25.some((v) => v != null) && (
        <path d={maPath(ma25)} fill="none" stroke={isDark ? "#a78bfa" : "#7c3aed"} strokeWidth={sw1_2} opacity={0.7} />
      )}
      {showMa && ma7.some((v) => v != null) && (
        <path d={maPath(ma7)} fill="none" stroke={isDark ? "#f59e0b" : "#d97706"} strokeWidth={sw1_2} opacity={0.85} />
      )}

      {/* ── 볼린저밴드 ── */}
      {overlays.bb && (() => {
        const { upper, lower, middle, color } = overlays.bb!;
        const fillPts: string[] = [];
        upper.forEach((u, i) => { if (u != null) fillPts.push(`${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(u).toFixed(1)}`); });
        [...lower].reverse().forEach((l, ri) => {
          const i = lower.length - 1 - ri;
          if (l != null) fillPts.push(`L${cx(i).toFixed(1)},${cy(l).toFixed(1)}`);
        });
        return (
          <g>
            {fillPts.length > 0 && <path d={fillPts.join(" ") + " Z"} fill={color} opacity={0.08} />}
            <path d={maPath(upper)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.5} />
            <path d={maPath(lower)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.5} />
            {middle && <path d={maPath(middle)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.4} strokeDasharray="3,3" />}
          </g>
        );
      })()}

      {/* ── Envelope ── */}
      {overlays.envelope && (() => {
        const { upper, lower, middle, color } = overlays.envelope!;
        const fillPts: string[] = [];
        upper.forEach((u, i) => { if (u != null) fillPts.push(`${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(u).toFixed(1)}`); });
        [...lower].reverse().forEach((l, ri) => {
          const i = lower.length - 1 - ri;
          if (l != null) fillPts.push(`L${cx(i).toFixed(1)},${cy(l).toFixed(1)}`);
        });
        return (
          <g>
            {fillPts.length > 0 && <path d={fillPts.join(" ") + " Z"} fill={color} opacity={0.06} />}
            <path d={maPath(upper)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.5} />
            <path d={maPath(lower)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.5} />
            {middle && <path d={maPath(middle)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.35} strokeDasharray="3,3" />}
          </g>
        );
      })()}

      {/* ── Price Channel ── */}
      {overlays.priceChannel && (() => {
        const { upper, lower, color } = overlays.priceChannel!;
        const fillPts: string[] = [];
        upper.forEach((u, i) => { if (u != null) fillPts.push(`${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(u).toFixed(1)}`); });
        [...lower].reverse().forEach((l, ri) => {
          const i = lower.length - 1 - ri;
          if (l != null) fillPts.push(`L${cx(i).toFixed(1)},${cy(l).toFixed(1)}`);
        });
        return (
          <g>
            {fillPts.length > 0 && <path d={fillPts.join(" ") + " Z"} fill={color} opacity={0.06} />}
            <path d={maPath(upper)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.55} />
            <path d={maPath(lower)} fill="none" stroke={color} strokeWidth={sw1} opacity={0.55} />
          </g>
        );
      })()}

      {/* ── 일목균형표 ── */}
      {overlays.ichimoku && (() => {
        const { tenkan, kijun, senkouA, senkouB } = overlays.ichimoku!;
        const cloudPts: string[] = [];
        senkouA.forEach((a, i) => { if (a != null) cloudPts.push(`${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(a).toFixed(1)}`); });
        [...senkouB].reverse().forEach((b, ri) => {
          const i = senkouB.length - 1 - ri;
          if (b != null) cloudPts.push(`L${cx(i).toFixed(1)},${cy(b).toFixed(1)}`);
        });
        const upClrIchi  = isDark ? "#10b981" : "#059669";
        const dnClrIchi  = isDark ? "#f43f5e" : "#e11d48";
        const tenkanClr  = isDark ? "#f43f5e" : "#e11d48";
        const kijunClr   = isDark ? "#60a5fa" : "#2563eb";
        return (
          <g>
            {cloudPts.length > 0 && (
              <path d={cloudPts.join(" ") + " Z"} fill={upClrIchi} opacity={0.1} />
            )}
            <path d={maPath(senkouA)} fill="none" stroke={upClrIchi} strokeWidth={sw1} opacity={0.5} />
            <path d={maPath(senkouB)} fill="none" stroke={dnClrIchi} strokeWidth={sw1} opacity={0.5} />
            <path d={maPath(tenkan)} fill="none" stroke={tenkanClr} strokeWidth={sw1_2} opacity={0.75} />
            <path d={maPath(kijun)}  fill="none" stroke={kijunClr}  strokeWidth={sw1_2} opacity={0.75} />
          </g>
        );
      })()}

      {/* ── VWAP ── */}
      {overlays.vwap && overlays.vwap.some((v) => v != null) && (
        <path d={maPath(overlays.vwap)} fill="none" stroke={isDark ? "#c084fc" : "#9333ea"} strokeWidth={sw1_2} opacity={0.8} strokeDasharray="4,2" />
      )}

      {/* ── Parabolic SAR (dots) ── */}
      {overlays.sar && overlays.sar.map((s, i) => {
        if (s == null) return null;
        const above = s > chart[i].close;
        return (
          <circle
            key={i}
            cx={cx(i)}
            cy={cy(s)}
            r={2}
            fill={above ? (isDark ? "#38bdf8" : "#0284c7") : (isDark ? "#f43f5e" : "#e11d48")}
            opacity={0.8}
          />
        );
      })}

      {/* Candlestick */}
      {chartType === "candlestick" && chart.map((d, i) => {
        const open    = validOpen(d.open,  d.close);
        const high    = validHigh(d.high,  d.close);
        const low     = validLow(d.low,    d.close);
        const isRed   = d.close >= open;
        const clr     = isRed ? upClr : dnClr;
        const bodyTop = cy(Math.max(open, d.close));
        const bodyBot = cy(Math.min(open, d.close));
        const bodyH   = Math.max(1, bodyBot - bodyTop);
        const alpha   = hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1;
        return (
          <g key={i} opacity={alpha} shapeRendering="crispEdges">
            <line x1={cx(i)} x2={cx(i)} y1={cy(high)} y2={cy(low)} stroke={clr} strokeWidth={sw1_2} />
            <rect
              x={cx(i) - bW / 2} y={bodyTop} width={bW} height={bodyH} rx="1"
              fill={isRed ? clr : (isDark ? "#0f172a" : "#ffffff")} stroke={clr} strokeWidth={sw1_2}
            />
          </g>
        );
      })}

      {/* OHLC Bars */}
      {chartType === "bars" && chart.map((d, i) => {
        const open  = validOpen(d.open,  d.close);
        const high  = validHigh(d.high,  d.close);
        const low   = validLow(d.low,    d.close);
        const isRed = d.close >= open;
        const clr   = isRed ? upClr : dnClr;
        const alpha = hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1;
        const tickW = bW * 0.8;
        return (
          <g key={i} opacity={alpha} stroke={clr} strokeWidth={sw1_5} fill="none" shapeRendering="crispEdges">
            <line x1={cx(i)}        x2={cx(i)}        y1={cy(high)}    y2={cy(low)} />
            <line x1={cx(i) - tickW} x2={cx(i)}       y1={cy(open)}    y2={cy(open)} />
            <line x1={cx(i)}        x2={cx(i) + tickW} y1={cy(d.close)} y2={cy(d.close)} />
          </g>
        );
      })}

      {/* Line / Area */}
      {(chartType === "line" || chartType === "area") && (
        <>
          <path d={linePts} fill="none" stroke={lineClr} strokeWidth={sw2} filter="url(#glow)" />
          <circle cx={cx(chart.length - 1)} cy={cy(chart[chart.length - 1].close)} r={4} fill={lineClr} stroke={isDark ? "#0f172a" : "#ffffff"} strokeWidth={sw1_5} />
        </>
      )}

      {/* 거래량 */}
      {showVolume && (
        <>
          <line x1={PAD_L} x2={W - PAD_R} y1={volTop} y2={volTop} stroke={gridClr} strokeWidth={sw1} strokeDasharray="3,6" shapeRendering="crispEdges" />
          <text x={W - PAD_R + 8} y={volTop + 10} fontSize={9} fill={lblClr} fontFamily="monospace" fontWeight="500">
            {fmtVol(maxVol)}
          </text>
          <g shapeRendering="crispEdges">
            {chart.map((d, i) => {
              const vol    = d.volume ?? 0;
              const bH     = vol === 0 ? 0 : Math.max(1, (vol / maxVol) * volH);
              const bX     = PAD_L + (i / chart.length) * CW;
              const prevCl = i > 0 ? chart[i - 1].close : d.close;
              const barClr = d.close >= prevCl
                ? (isDark ? "rgba(244,63,94,0.4)" : "rgba(225,29,72,0.35)")
                : (isDark ? "rgba(56,189,248,0.4)" : "rgba(2,132,199,0.35)");
              const actClr = d.close >= prevCl ? upClr : dnClr;
              return (
                <rect
                  key={i}
                  x={bX} y={volTop + volH - bH + 6}
                  width={Math.max(1.2, volBW)} height={bH} rx="1"
                  fill={hoveredIdx === i ? actClr : barClr}
                  opacity={hoveredIdx !== null && hoveredIdx !== i ? 0.3 : 1}
                />
              );
            })}
          </g>
        </>
      )}

      {/* X축 */}
      {xIdxs.map((i, rank) => (
        <text
          key={i}
          x={cx(i)} y={H + PAD_B - 4}
          textAnchor={rank === 0 ? "start" : rank === xIdxs.length - 1 ? "end" : "middle"}
          fontSize={9} fill={lblClr} fontFamily="monospace" fontWeight="500"
        >
          {chart[i]?.date?.slice(5).replace("-", "/")}
        </text>
      ))}

      {/* 이벤트/리스크 마커 */}
      {annotationGroups.map(({ idx, items }) => (
        <g key={`annotation-${idx}`}>
          <line
            x1={cx(idx)}
            x2={cx(idx)}
            y1={PAD_T}
            y2={PH}
            stroke={isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)"}
            strokeWidth={sw1}
            strokeDasharray="2,6"
            shapeRendering="crispEdges"
          />
          {items.map((item, stackIdx) => {
            const color = markerColor(item.type, item.severity, isDark);
            const y = PAD_T + 8 + stackIdx * 12;
            return (
              <g
                key={`${item.type}-${item.date}-${stackIdx}`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setPinnedAnnotation((current) => {
                    const same =
                      current?.item.type === item.type &&
                      current.item.date === item.date &&
                      current.item.title === item.title;
                    return same ? null : { item, x: cx(idx), y };
                  });
                }}
                onMouseEnter={(event) => {
                  event.stopPropagation();
                  setHoveredAnnotation({ item, x: cx(idx), y });
                }}
                onMouseLeave={() => setHoveredAnnotation(null)}
                onClick={(event) => event.stopPropagation()}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={cx(idx)}
                  cy={y}
                  r={pinnedAnnotation?.item === item ? 5.6 : 4.2}
                  fill={color}
                  stroke={isDark ? "#0f172a" : "#ffffff"}
                  strokeWidth={pinnedAnnotation?.item === item ? sw2 : sw1_2}
                />
              </g>
            );
          })}
        </g>
      ))}

      {activeAnnotation ? (
        <foreignObject
          x={tooltipX}
          y={tooltipY}
          width={tooltipWidth}
          height={tooltipHeight}
          pointerEvents={isTooltipPinned ? "auto" : "none"}
          style={{ overflow: "visible" }}
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            className={`flex h-full flex-col overflow-hidden rounded-xl border shadow-2xl ${
              isDark
                ? "border-white/15 bg-slate-950/95 text-white"
                : "border-slate-200 bg-white/97 text-slate-950"
            }`}
            style={{ backdropFilter: "blur(14px)" }}
          >
            <div className={`flex items-center justify-between border-b px-3.5 py-2.5 ${
              isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"
            }`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  activeAnnotation.item.type === "financial"
                    ? isDark ? "bg-emerald-400/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                    : isDark ? "bg-sky-400/15 text-sky-300" : "bg-sky-50 text-sky-700"
                }`}>
                  {typeLabel(activeAnnotation.item.type)}
                </span>
                <strong className="truncate text-[12px]">
                  {activeAnnotation.item.financialDetails?.periodLabel ?? activeAnnotation.item.title}
                </strong>
              </div>
              <span className={`ml-3 shrink-0 font-mono text-[10px] ${isDark ? "text-white/45" : "text-slate-400"}`}>
                {activeAnnotation.item.date}
              </span>
            </div>

            {activeAnnotation.item.financialDetails ? (
              <div className="grid gap-1.5 px-3 py-2.5">
                {activeAnnotation.item.financialDetails.metrics.map((metric) => (
                  <div
                    key={metric.key}
                    className={`grid grid-cols-[58px_86px_1fr] items-center gap-2 rounded-lg px-2 py-1.5 ${
                      isDark ? "bg-white/[0.04]" : "bg-slate-50"
                    }`}
                  >
                    <span className={`text-[10px] font-bold ${isDark ? "text-white/55" : "text-slate-500"}`}>
                      {metric.label}
                    </span>
                    <strong className="text-right font-mono text-[12px]">{fmtEok(metric.value)}</strong>
                    <div className="flex flex-wrap justify-end gap-1">
                      {metric.comparisons.map((comparison) => (
                        <span
                          key={comparison.label}
                          className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black ${
                            comparison.value == null
                              ? isDark ? "bg-white/5 text-white/30" : "bg-slate-100 text-slate-400"
                              : comparison.value >= 0
                                ? isDark ? "bg-rose-400/10 text-rose-300" : "bg-rose-50 text-rose-600"
                                : isDark ? "bg-sky-400/10 text-sky-300" : "bg-sky-50 text-sky-600"
                          }`}
                        >
                          {comparison.label} {fmtPct(comparison.value, 1)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <p className={`px-1 text-[9px] ${isDark ? "text-white/35" : "text-slate-400"}`}>
                  증가율은 비교 기간의 절대값을 기준으로 계산
                </p>
              </div>
            ) : (
              <div className={`min-h-0 flex-1 px-3.5 py-3 ${isTooltipPinned ? "overflow-y-auto" : "overflow-hidden"}`}>
                <p className="text-[12px] font-bold leading-5">{activeAnnotation.item.title}</p>
                {activeAnnotation.item.description ? (
                  <p className={`mt-1 text-[10px] leading-4 ${isDark ? "text-white/55" : "text-slate-500"}`}>
                    {activeAnnotation.item.description}
                  </p>
                ) : null}
              </div>
            )}

            {activeAnnotation.item.url ? (
              <div className={`mt-auto border-t px-3 py-2.5 ${
                isDark ? "border-white/10 bg-white/[0.025]" : "border-slate-100 bg-slate-50/80"
              }`}>
                {isTooltipPinned ? (
                  <a
                    href={activeAnnotation.item.url}
                    target={activeAnnotation.item.url.startsWith("#") ? undefined : "_blank"}
                    rel={activeAnnotation.item.url.startsWith("#") ? undefined : "noreferrer"}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black transition-colors ${
                      isDark
                        ? "bg-white text-slate-950 hover:bg-white/90"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                    }`}
                  >
                    {linkLabel}
                    <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <p className={`text-center text-[10px] font-semibold ${
                    isDark ? "text-white/40" : "text-slate-400"
                  }`}>
                    마커를 클릭하면 {linkLabel} 링크가 활성화됩니다.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </foreignObject>
      ) : null}

      {/* 크로스헤어 */}
      {hoveredIdx !== null && hov && (
        <g shapeRendering="crispEdges">
          <line x1={cx(hoveredIdx)} x2={cx(hoveredIdx)} y1={PAD_T} y2={PH}
            stroke={crossClr} strokeWidth={sw1} strokeDasharray="3,3" />
          <line x1={PAD_L} x2={W - PAD_R} y1={cy(hov.close)} y2={cy(hov.close)}
            stroke={crossClr} strokeWidth={sw1} strokeDasharray="3,3" />
          
          {/* Y축 호버 라벨 */}
          <g transform={`translate(${W - PAD_R + 4}, ${cy(hov.close) - 8})`}>
            <rect width={PAD_R - 6} height={16} fill={lineClr} rx={3} />
            <text x={(PAD_R - 6) / 2} y={11}
              textAnchor="middle" fontSize={9} fill="white" fontFamily="monospace" fontWeight="bold">
              {hov.close >= 1000
                ? hov.close.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
                : hov.close.toFixed(2)}
            </text>
          </g>

          {/* X축 호버 라벨 */}
          <g transform={`translate(${Math.max(0, Math.min(W - PAD_R - 56, cx(hoveredIdx) - 28))}, ${PH + 2})`}>
            <rect width={56} height={14} fill={isDark ? "#334155" : "#64748b"} rx={3} />
            <text x={28} y={10} textAnchor="middle" fontSize={8} fill="white" fontFamily="monospace" fontWeight="bold">
              {hov.date.slice(5)}
            </text>
          </g>
          <circle cx={cx(hoveredIdx)} cy={cy(hov.close)} r={4} fill={lineClr} stroke={isDark ? "#0f172a" : "#ffffff"} strokeWidth={sw1_5} shapeRendering="auto" />
        </g>
      )}
    </svg>
  );
}
