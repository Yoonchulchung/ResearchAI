"use client";
import { useMemo } from "react";
import type { SubPanelData, Candle } from "./types";

const PAD_L = 4;
const PAD_R = 68;
const PAD_T = 18;
const PAD_B = 4;

interface Props {
  data:       SubPanelData;
  chart:      Candle[];
  width:      number;
  height:     number;
  hoveredIdx: number | null;
  isDark:     boolean;
}

function fmtVal(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(v) >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)         return `${(v / 1_000).toFixed(1)}K`;
  if (Math.abs(v) >= 10)            return v.toFixed(1);
  return v.toFixed(2);
}

export function SubIndicatorChart({ data, chart, width: W, height: H, hoveredIdx, isDark }: Props) {
  const lblClr  = isDark ? "rgba(255,255,255,0.35)" : "#94a3b8";
  const gridClr = isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)";
  const crossClr= isDark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.12)";
  const bgBorder= isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const sw1 = Math.max(0.5, 1 / dpr);
  const sw1_2 = Math.max(0.6, 1.2 / dpr);

  const CW = W - PAD_L - PAD_R;
  const IH = H - PAD_T - PAD_B;

  // Collect all values across lines + histBars for range
  const allValues = useMemo<number[]>(() => {
    const vs: number[] = [];
    data.lines.forEach((l) => l.values.forEach((v) => { if (v != null) vs.push(v); }));
    data.histBars?.values.forEach((v) => { if (v != null) vs.push(v); });
    data.levels?.forEach((lv) => vs.push(lv.value));
    return vs;
  }, [data]);

  const [rawMin, rawMax] = useMemo(() => {
    if (data.valueRange) return data.valueRange;
    if (!allValues.length) return [-1, 1];
    let lo = Math.min(...allValues);
    let hi = Math.max(...allValues);
    const span = hi - lo || Math.max(Math.abs(hi), 1);
    lo -= span * 0.08;
    hi += span * 0.08;
    return [lo, hi];
  }, [allValues, data.valueRange]);

  const yRange = rawMax - rawMin || 1;
  const cx = (i: number) => PAD_L + (chart.length <= 1 ? CW / 2 : (i / (chart.length - 1)) * CW);
  const cy = (v: number) => PAD_T + IH - ((v - rawMin) / yRange) * IH;
  const linePath = (values: (number | null)[]) => {
    const pts: string[] = [];
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      pts.push(`${!pen ? "M" : "L"}${cx(i).toFixed(1)},${cy(v).toFixed(1)}`);
      pen = true;
    });
    return pts.join(" ");
  };

  const zeroY = cy(0);
  const barW  = Math.max(1.2, CW / chart.length - 1);

  const yTickVals = [rawMax, (rawMax + rawMin) / 2, rawMin];

  // Hovered values
  const hovVals = hoveredIdx != null
    ? data.lines.map((l) => l.values[hoveredIdx] ?? null)
    : data.lines.map(() => null);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: `${H}px`, display: "block" }}
    >
      {/* 상단 경계선 */}
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T} y2={PAD_T} stroke={bgBorder} strokeWidth={sw1} />

      {/* Y축 grid + 틱 */}
      {yTickVals.map((tv, i) => (
        <g key={i}>
          {i === 1 && (
            <line x1={PAD_L} x2={W - PAD_R} y1={cy(tv)} y2={cy(tv)} stroke={gridClr} strokeWidth={sw1} strokeDasharray="3,6" />
          )}
          <text x={W - PAD_R + 6} y={cy(tv) + 3.5} fontSize={8} fill={lblClr} fontFamily="monospace" fontWeight="500">
            {fmtVal(tv)}
          </text>
        </g>
      ))}

      {/* 레벨 라인 (RSI 70/30 등) */}
      {data.levels?.map((lv, i) => (
        <line
          key={i}
          x1={PAD_L} x2={W - PAD_R}
          y1={cy(lv.value)} y2={cy(lv.value)}
          stroke={lv.color}
          strokeWidth={sw1}
          strokeDasharray={lv.dash ?? "3,4"}
          opacity={0.6}
        />
      ))}

      {/* 제로라인 (값이 0을 포함한 경우) */}
      {rawMin < 0 && rawMax > 0 && !data.levels?.some((l) => l.value === 0) && (
        <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke={isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"} strokeWidth={sw1} />
      )}

      {/* 히스토그램 */}
      {data.histBars && chart.map((_, i) => {
        const v = data.histBars!.values[i];
        if (v == null) return null;
        const y1  = cy(Math.max(v, 0));
        const y2  = cy(Math.min(v, 0));
        const bH  = Math.max(1, y2 - y1);
        const clr = v >= 0 ? data.histBars!.posColor : data.histBars!.negColor;
        return (
          <rect
            key={i}
            x={PAD_L + (i / chart.length) * CW}
            y={y1}
            width={Math.max(1, barW)}
            height={bH}
            fill={clr}
            opacity={hoveredIdx != null && hoveredIdx !== i ? 0.4 : 0.75}
          />
        );
      })}

      {/* 라인들 */}
      {data.lines.map((line, li) => (
        <path
          key={li}
          d={linePath(line.values)}
          fill="none"
          stroke={line.color}
          strokeWidth={line.width ?? sw1_2}
          opacity={0.85}
        />
      ))}

      {/* 지표 이름 라벨 */}
      <text x={PAD_L + 4} y={PAD_T - 4} fontSize={8} fill={lblClr} fontFamily="monospace" fontWeight="700">
        {data.label}
        {hoveredIdx != null && hovVals.map((v, i) =>
          v != null
            ? ` ${data.lines[i]?.label ?? ""} ${fmtVal(v)}`
            : ""
        ).join("")}
      </text>

      {/* 크로스헤어 */}
      {hoveredIdx != null && (() => {
        const hovLine0 = data.lines[0]?.values[hoveredIdx];
        const yPos = hovLine0 != null ? cy(hovLine0) : PAD_T + IH / 2;
        return (
          <g shapeRendering="crispEdges">
            <line x1={cx(hoveredIdx)} x2={cx(hoveredIdx)} y1={PAD_T} y2={PAD_T + IH} stroke={crossClr} strokeWidth={sw1} strokeDasharray="3,3" />
            {hovLine0 != null && (
              <>
                <line x1={PAD_L} x2={W - PAD_R} y1={yPos} y2={yPos} stroke={crossClr} strokeWidth={sw1} strokeDasharray="3,3" />
                <g transform={`translate(${W - PAD_R + 2}, ${yPos - 7})`}>
                  <rect width={PAD_R - 4} height={14} fill={data.lines[0].color} rx={2} />
                  <text x={(PAD_R - 4) / 2} y={10} textAnchor="middle" fontSize={8} fill="white" fontFamily="monospace" fontWeight="bold">
                    {fmtVal(hovLine0)}
                  </text>
                </g>
              </>
            )}
          </g>
        );
      })()}
    </svg>
  );
}
