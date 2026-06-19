"use client";

import { useState } from "react";
import type { YearlyFinancial } from "@/lib/api/company-analysis";
import {
  PERFORMANCE_METRICS,
  type PerformanceMetricKey,
  type PerformanceMode,
  type PerformanceRecord,
  comparePct,
  findComparisonRecord,
  findPreviousQuarterRecord,
  fmtKoreanEok,
  fmtSignedPct,
  fmtYTick,
  performanceBasisLabel,
} from "./financial-utils";

interface PerformanceStatusProps {
  data: PerformanceRecord[];
  mode: PerformanceMode;
  loading: boolean;
  error: string;
  helperText: string;
  onModeChange: (mode: PerformanceMode) => void;
  onRetry: () => void;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

export function PerformanceStatus({
  data,
  mode,
  loading,
  error,
  helperText,
  onModeChange,
  onRetry,
  isDark,
  panelClass,
  subtleText,
}: PerformanceStatusProps) {
  const [metricKey, setMetricKey] = useState<PerformanceMetricKey>("revenue");
  const [showChart, setShowChart] = useState(true);

  const sorted = [...data].sort((a, b) => a.year - b.year);
  const latest = sorted.at(-1) ?? null;
  const previous = latest ? findComparisonRecord(sorted, latest, mode) : null;
  const previousQuarter =
    latest && mode === "quarter"
      ? findPreviousQuarterRecord(sorted, latest)
      : null;
  const activeMetric =
    PERFORMANCE_METRICS.find((m) => m.key === metricKey) ??
    PERFORMANCE_METRICS[0];
  const chartData = sorted.filter((d) => d[metricKey] != null);
  const tableData = [...chartData].reverse();
  const values = chartData.map((d) => d[metricKey] as number);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 0;
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax), 1);
  const min = rawMin - span * 0.08;
  const max = rawMax + span * 0.08;

  const W = 720;
  const H = 220;
  const PAD_L = 68;
  const PAD_R = 24;
  const PAD_T = 20;
  const PAD_B = 34;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const x = (i: number) =>
    PAD_L +
    (chartData.length <= 1
      ? innerW / 2
      : (i / (chartData.length - 1)) * innerW);
  const y = (v: number) =>
    PAD_T + innerH - ((v - min) / (max - min || 1)) * innerH;
  const path = chartData
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[metricKey] as number).toFixed(1)}`,
    )
    .join(" ");
  const ticks = [max, (max + min) / 2, min];
  const lineColor = isDark ? "#e5e7eb" : "#202124";
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e8eaed";

  return (
    <section className={`rounded-md border p-4 ${panelClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-black">실적현황</h3>
          <label
            className={`relative rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`}
          >
            <span className="sr-only">실적 기간</span>
            <select
              value={mode}
              className={`appearance-none rounded-full bg-transparent py-1.5 pl-3 pr-8 text-sm font-bold outline-none ${
                isDark ? "text-white" : "text-slate-900"
              }`}
              onChange={(e) => onModeChange(e.target.value as PerformanceMode)}
            >
              <option value="annual">연간</option>
              <option value="quarter">분기</option>
            </select>
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-2/3 rotate-45 border-b-2 border-r-2 ${
                isDark ? "border-white/45" : "border-slate-400"
              }`}
            />
          </label>
        </div>
        <div
          className={`flex flex-wrap items-center justify-end gap-1.5 text-xs font-medium ${subtleText}`}
        >
          <span>
            {loading ? "불러오는 중..." : performanceBasisLabel(latest)}
          </span>
          {!loading && latest ? (
            <>
              <span aria-hidden="true">·</span>
              <a
                href="https://dart.fss.or.kr/"
                target="_blank"
                rel="noreferrer"
                className={`font-bold underline decoration-dotted underline-offset-2 transition-colors ${
                  isDark ? "hover:text-white" : "hover:text-slate-900"
                }`}
                title="금융감독원 전자공시시스템"
              >
                출처 DART 전자공시
              </a>
            </>
          ) : null}
        </div>
      </div>

      {!loading && (!latest || error) ? (
        <div
          className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-5 text-sm ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"} ${subtleText}`}
        >
          <span>{error || "표시할 실적 데이터가 없습니다."}</span>
          {mode === "quarter" ? (
            <button
              type="button"
              onClick={onRetry}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                isDark
                  ? "bg-white/10 text-white/75 hover:bg-white/20"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {loading && helperText ? (
        <p className={`mt-3 text-xs ${subtleText}`}>{helperText}</p>
      ) : null}

      {loading && !latest ? (
        <div className="mt-4 grid animate-pulse gap-3 md:grid-cols-3">
          {PERFORMANCE_METRICS.map((metric) => (
            <div
              key={metric.key}
              className={`rounded-xl border px-4 py-5 ${
                isDark
                  ? "border-white/10 bg-white/5"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              <div
                className={`mx-auto h-3 w-20 rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`}
              />
              <div
                className={`mx-auto mt-4 h-6 w-28 rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`}
              />
              <div
                className={`mx-auto mt-3 h-5 w-36 rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`}
              />
            </div>
          ))}
        </div>
      ) : null}

      {latest ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PERFORMANCE_METRICS.map((metric) => {
            const value = latest[metric.key] as number | null;
            const comparisons =
              mode === "quarter"
                ? [
                    {
                      label: "전분기",
                      value: comparePct(
                        value,
                        previousQuarter?.[metric.key] as
                          | number
                          | null
                          | undefined,
                      ),
                    },
                    {
                      label: "전년동기",
                      value: comparePct(
                        value,
                        previous?.[metric.key] as number | null | undefined,
                      ),
                    },
                  ]
                : [
                    {
                      label: "전년",
                      value: comparePct(
                        value,
                        previous?.[metric.key] as number | null | undefined,
                      ),
                    },
                  ];
            return (
              <div
                key={metric.key}
                className={`rounded-xl border px-4 py-4 text-center ${
                  isDark
                    ? "border-white/10 bg-white/[0.035]"
                    : "border-slate-100 bg-slate-50/70"
                }`}
              >
                <p className={`text-xs font-bold ${subtleText}`}>
                  {metric.summaryLabel}
                </p>
                <p className="mt-2 text-xl font-black tracking-tight">
                  {fmtKoreanEok(value)}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {comparisons.map((comparison) => (
                    <span
                      key={comparison.label}
                      className={`rounded-md px-2 py-1 text-xs font-bold ${
                        comparison.value == null
                          ? isDark
                            ? "bg-white/5 text-white/30"
                            : "bg-slate-100 text-slate-400"
                          : comparison.value >= 0
                            ? isDark
                              ? "bg-rose-400/10 text-rose-300"
                              : "bg-rose-50 text-rose-600"
                            : isDark
                              ? "bg-sky-400/10 text-sky-300"
                              : "bg-sky-50 text-sky-600"
                      }`}
                    >
                      {comparison.label} {fmtSignedPct(comparison.value)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {latest ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {PERFORMANCE_METRICS.map((metric) => {
              const selected = metric.key === metricKey;
              return (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => setMetricKey(metric.key)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    selected
                      ? isDark
                        ? "bg-white text-slate-950"
                        : "bg-slate-950 text-white"
                      : isDark
                        ? "bg-white/10 text-white/75 hover:bg-white/15"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  {metric.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${subtleText}`}>차트</span>
            <button
              type="button"
              aria-pressed={showChart}
              aria-label="실적 차트 표시"
              onClick={() => setShowChart((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                showChart
                  ? "bg-red-500"
                  : isDark
                    ? "bg-white/15"
                    : "bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  showChart ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      ) : null}

      {latest && showChart ? (
        <div className="mt-4">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", height: 230 }}
            role="img"
            aria-label={`${activeMetric.label} 추이`}
          >
            {ticks.map((tick, i) => {
              const yy = y(tick);
              return (
                <g key={`${tick}-${i}`}>
                  <line
                    x1={PAD_L}
                    x2={W - PAD_R}
                    y1={yy}
                    y2={yy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_L - 6}
                    y={yy + 4}
                    textAnchor="end"
                    fontSize={12}
                    fontWeight={600}
                    fill={isDark ? "rgba(255,255,255,0.72)" : "#202124"}
                  >
                    {fmtYTick(tick)}
                  </text>
                </g>
              );
            })}
            {path ? (
              <path
                d={path}
                fill="none"
                stroke={lineColor}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {chartData.map((d, i) => {
              const value = d[metricKey] as number;
              return (
                <g key={`${d.year}-${d.quarter ?? "annual"}`}>
                  <circle cx={x(i)} cy={y(value)} r={3.2} fill={lineColor} />
                  <text
                    x={x(i)}
                    y={H - 10}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={500}
                    fill={isDark ? "rgba(255,255,255,0.75)" : "#202124"}
                  >
                    {d.periodLabel ?? `${d.year}.12.`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : latest ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className={isDark ? "bg-white/10" : "bg-slate-100"}>
                <th
                  className={`px-4 py-2 text-center font-semibold ${subtleText}`}
                >
                  날짜
                </th>
                <th
                  className={`px-4 py-2 text-right font-semibold ${subtleText}`}
                >
                  {activeMetric.label}
                </th>
                <th
                  className={`px-4 py-2 text-right font-semibold ${subtleText}`}
                >
                  {activeMetric.label} 증가율
                </th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((d) => {
                const comparison = findComparisonRecord(sorted, d, mode);
                const previousQuarterRow =
                  mode === "quarter"
                    ? findPreviousQuarterRecord(sorted, d)
                    : null;
                const comparisons =
                  mode === "quarter"
                    ? [
                        {
                          label: "전분기",
                          value: comparePct(
                            d[metricKey] as number | null,
                            previousQuarterRow?.[metricKey] as
                              | number
                              | null
                              | undefined,
                          ),
                        },
                        {
                          label: "전년동기",
                          value: comparePct(
                            d[metricKey] as number | null,
                            comparison?.[metricKey] as
                              | number
                              | null
                              | undefined,
                          ),
                        },
                      ]
                    : [
                        {
                          label: "전년",
                          value: comparePct(
                            d[metricKey] as number | null,
                            comparison?.[metricKey] as
                              | number
                              | null
                              | undefined,
                          ),
                        },
                      ];
                return (
                  <tr
                    key={`${d.year}-${d.quarter ?? "annual"}`}
                    className={
                      isDark
                        ? "border-b border-white/5"
                        : "border-b border-slate-100"
                    }
                  >
                    <td
                      className={`px-4 py-2 text-center font-medium ${subtleText}`}
                    >
                      {d.periodLabel ?? `${d.year}.12.`}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${isDark ? "text-white/85" : "text-slate-900"}`}
                    >
                      {fmtKoreanEok(d[metricKey] as number | null)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {comparisons.map((item) => (
                          <span
                            key={item.label}
                            className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                              item.value == null
                                ? subtleText
                                : item.value >= 0
                                  ? isDark
                                    ? "text-rose-400"
                                    : "text-red-500"
                                  : isDark
                                    ? "text-sky-400"
                                    : "text-blue-500"
                            }`}
                          >
                            {item.label} {fmtSignedPct(item.value)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

// 미사용 타입 재-export (index.tsx에서 타입만 필요한 경우 대비)
export type { PerformanceRecord, PerformanceMode };
