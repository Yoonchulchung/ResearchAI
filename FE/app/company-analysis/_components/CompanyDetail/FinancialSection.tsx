"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import type { YearlyFinancial } from "@/lib/api/company-analysis";

export function FinancialChart({ data, isDark }: { data: YearlyFinancial[]; isDark: boolean }) {
  const chartData = data.map((d) => ({ year: `${d.year}`, 매출액: d.revenue, 영업이익: d.operatingProfit, 순이익: d.netIncome, 영업이익률: d.operatingMargin }));
  const palette = {
    revenue: isDark ? "#9fb1c7" : "#1f3a5f", operatingProfit: isDark ? "#8fb7a5" : "#3f6f5a",
    netIncome: isDark ? "#b8a68b" : "#6f604b", margin: isDark ? "#d6a04b" : "#9a5a10",
    axis: isDark ? "#475569" : "#94a3b8", tick: isDark ? "#cbd5e1" : "#475569", grid: isDark ? "#334155" : "#d7dde6",
  };
  const tickStyle = { fill: palette.tick, fontSize: 11, fontFamily: "Georgia, 'Times New Roman', serif" };
  return (
    <div className={`border-y py-4 ${isDark ? "border-slate-700 bg-slate-900/30" : "border-slate-200 bg-zinc-50/60"}`}>
      <div className="mx-auto w-full max-w-4xl">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 2, bottom: 2 }} barGap={3} barCategoryGap="28%">
            <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tick={tickStyle} axisLine={{ stroke: palette.axis, strokeWidth: 1 }} tickLine={false} padding={{ left: 12, right: 12 }} />
            <YAxis yAxisId="left" tick={tickStyle} axisLine={{ stroke: palette.axis, strokeWidth: 1 }} tickLine={false} tickFormatter={(v) => `${v}억`} width={56} />
            <YAxis yAxisId="right" orientation="right" tick={tickStyle} axisLine={{ stroke: palette.axis, strokeWidth: 1 }} tickLine={false} tickFormatter={(v) => `${v}%`} width={40} />
            <Tooltip
              cursor={{ fill: isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.04)" }}
              contentStyle={{ backgroundColor: isDark ? "#111827" : "#fffdf8", borderColor: isDark ? "#475569" : "#cbd5e1", color: isDark ? "#f8fafc" : "#1f2937", fontSize: 12, borderRadius: 0, boxShadow: "none", fontFamily: "Georgia, 'Times New Roman', serif" }}
              formatter={(value, name) => {
                const v = value as number | null | undefined;
                return name === "영업이익률" ? [`${v ?? "—"}%`, name as string] : [`${v?.toLocaleString() ?? "—"}억`, name as string];
              }}
            />
            <Legend iconType="square" wrapperStyle={{ fontSize: 11, fontFamily: "Georgia, 'Times New Roman', serif", paddingTop: 12 }} />
            <Bar yAxisId="left" dataKey="매출액" fill={palette.revenue} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="영업이익" fill={palette.operatingProfit} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="순이익" fill={palette.netIncome} maxBarSize={28} />
            <Line yAxisId="right" dataKey="영업이익률" stroke={palette.margin} strokeWidth={2} dot={{ r: 3.5, fill: palette.margin, stroke: palette.margin }} activeDot={{ r: 5, fill: palette.margin, stroke: isDark ? "#111827" : "#fffdf8", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function FinancialTable({ data, isDark }: { data: YearlyFinancial[]; isDark: boolean }) {
  const cols = [
    { label: "연도", render: (d: YearlyFinancial) => d.year },
    { label: "매출액", render: (d: YearlyFinancial) => d.revenueFormatted ?? "—" },
    { label: "영업이익", render: (d: YearlyFinancial) => d.operatingProfitFormatted ?? "—" },
    { label: "순이익", render: (d: YearlyFinancial) => d.netIncomeFormatted ?? "—" },
    { label: "영업이익률", render: (d: YearlyFinancial) => d.operatingMargin != null ? `${d.operatingMargin}%` : "—" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className={`border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            {cols.map((c) => <th key={c.label} className={`pb-2 text-right first:text-left font-semibold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
          {data.map((d) => (
            <tr key={d.year}>{cols.map((c) => <td key={c.label} className={`py-2 text-right first:text-left ${isDark ? "text-slate-300" : "text-slate-700"}`}>{String(c.render(d))}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
