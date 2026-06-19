"use client";

import type { YearlyFinancial } from "@/lib/api/company-analysis";
import { fmtEok } from "./financial-utils";

interface Props {
  data:       YearlyFinancial[];
  isDark:     boolean;
  panelClass: string;
  subtleText: string;
}

export function CashFlowChart({ data, isDark, panelClass, subtleText }: Props) {
  const sorted = [...data].sort((a, b) => a.year - b.year);
  const values = sorted
    .flatMap((d) => [d.operatingCashFlow, d.investingCashFlow, d.financingCashFlow])
    .filter((v): v is number => v != null);
  if (!values.length) return null;

  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const rows = [
    { key: "operatingCashFlow"  as const, label: "영업", color: isDark ? "bg-emerald-400" : "bg-emerald-600" },
    { key: "investingCashFlow"  as const, label: "투자", color: isDark ? "bg-sky-400"     : "bg-sky-600"     },
    { key: "financingCashFlow"  as const, label: "재무", color: isDark ? "bg-violet-400"  : "bg-violet-600"  },
  ];

  return (
    <section className={`rounded-md border p-4 ${panelClass}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black">현금흐름</h3>
        <span className={`text-xs ${subtleText}`}>억원 기준</span>
      </div>
      <div className="flex h-48 items-end gap-4">
        {sorted.map((item) => (
          <div key={item.year} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-center justify-center gap-1">
              {rows.map((row) => {
                const value  = item[row.key];
                const height = value == null ? 0 : Math.max(3, (Math.abs(value) / maxAbs) * 64);
                return (
                  <div key={row.key} className="flex h-full w-4 items-center justify-center">
                    <div
                      title={`${item.year} ${row.label}: ${fmtEok(value)}억`}
                      className={`w-3 rounded-sm ${row.color} ${value != null && value < 0 ? "self-end opacity-50" : "self-start"}`}
                      style={{ height }}
                    />
                  </div>
                );
              })}
            </div>
            <span className={`font-mono text-xs ${subtleText}`}>{item.year}</span>
          </div>
        ))}
      </div>
      <div className={`mt-2 flex flex-wrap gap-3 text-xs ${subtleText}`}>
        {rows.map((row) => (
          <span key={row.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${row.color}`} />
            {row.label}
          </span>
        ))}
      </div>
    </section>
  );
}
