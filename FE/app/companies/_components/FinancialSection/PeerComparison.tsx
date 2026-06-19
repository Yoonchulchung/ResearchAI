"use client";

import type { CompanyFinancialInsights } from "@/lib/api/companies";
import { fmtValuation } from "./financial-utils";

interface Props {
  insights: CompanyFinancialInsights | null;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

export function PeerComparison({
  insights,
  isDark,
  panelClass,
  subtleText,
}: Props) {
  const rows =
    insights?.peerMetrics.filter(
      (m) => m.companyValue != null || m.peerAverage != null,
    ) ?? [];
  if (!insights || rows.length === 0) return null;

  return (
    <section className={`rounded-md border p-4 ${panelClass}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black">업종 비교</h3>
          <p className={`mt-0.5 text-xs ${subtleText}`}>
            {insights.industry
              ? `${insights.industry} · 비교 기업 ${insights.peerCount}개`
              : "업종 정보 없음"}
          </p>
          {insights.peerCompanies?.length ? (
            <p className={`mt-1 text-[11px] ${subtleText}`}>
              {insights.peerCompanies.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        {rows.map((metric) => {
          const better =
            metric.peerAverage != null &&
            metric.companyValue != null &&
            (metric.key === "debtRatio" ||
            metric.key === "per" ||
            metric.key === "pbr"
              ? metric.companyValue < metric.peerAverage
              : metric.companyValue > metric.peerAverage);
          return (
            <div
              key={metric.key}
              className={`rounded-md border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`min-w-0 truncate text-xs font-bold ${subtleText}`}
                >
                  {metric.label}
                </span>
                <span
                  className={`ml-auto shrink-0 text-xs font-bold ${better ? "text-emerald-500" : subtleText}`}
                >
                  {metric.peerCount ? "평균 비교" : "비교 부족"}
                </span>
              </div>
              <div className="mt-1 flex items-end gap-3 font-mono">
                <span
                  className={`shrink-0 text-base font-black ${isDark ? "text-white" : "text-slate-900"}`}
                >
                  {fmtValuation(metric.companyValue)}
                  {metric.unit}
                </span>
                <span
                  className={`ml-auto min-w-0 truncate text-xs ${subtleText}`}
                >
                  업종 {fmtValuation(metric.peerAverage)}
                  {metric.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
