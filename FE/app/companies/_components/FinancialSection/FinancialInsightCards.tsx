"use client";

import type { YearlyFinancial } from "@/lib/api/company-analysis";
import { fmtKoreanEok, fmtPct } from "./financial-utils";

interface Props {
  latest:    YearlyFinancial | undefined;
  isDark:    boolean;
  subtleText: string;
}

export function FinancialInsightCards({ latest, isDark, subtleText }: Props) {
  if (!latest) return null;

  const cards = [
    { label: "매출",       value: fmtKoreanEok(latest.revenue),           hint: "최근 연도",      tone: "" },
    { label: "영업이익률",  value: `${fmtPct(latest.operatingMargin)}%`,   hint: "수익성",        tone: latest.operatingMargin  != null && latest.operatingMargin  < 0   ? "bad" : "good" },
    { label: "부채비율",   value: `${fmtPct(latest.debtRatio)}%`,          hint: "안정성",        tone: latest.debtRatio        != null && latest.debtRatio        >= 200 ? "bad" : "" },
    { label: "유동비율",   value: `${fmtPct(latest.currentRatio)}%`,       hint: "단기 지급능력",  tone: latest.currentRatio     != null && latest.currentRatio     < 100  ? "bad" : "good" },
    { label: "영업현금흐름", value: fmtKoreanEok(latest.operatingCashFlow), hint: "현금 창출",     tone: latest.operatingCashFlow != null && latest.operatingCashFlow < 0   ? "bad" : "good" },
    { label: "ROE",        value: `${fmtPct(latest.roe)}%`,               hint: "자본 효율",      tone: latest.roe              != null && latest.roe              < 0    ? "bad" : "" },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-md border px-3 py-3 ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-white"}`}>
          <p className={`text-[11px] font-bold whitespace-nowrap ${subtleText}`}>{card.label}</p>
          <p className={`mt-1 font-mono text-base font-black whitespace-nowrap ${
            card.tone === "bad"
              ? "text-rose-500"
              : card.tone === "good"
                ? isDark ? "text-emerald-300" : "text-emerald-700"
                : isDark ? "text-white" : "text-slate-900"
          }`}>
            {card.value}
          </p>
          <p className={`mt-0.5 text-[10px] whitespace-nowrap ${subtleText}`}>{card.hint}</p>
        </div>
      ))}
    </section>
  );
}
