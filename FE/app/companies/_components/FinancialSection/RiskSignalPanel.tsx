"use client";

import type { CompanyRiskSignal } from "@/lib/api/companies";

interface Props {
  signals:    CompanyRiskSignal[];
  isDark:     boolean;
  panelClass: string;
  subtleText: string;
}

export function RiskSignalPanel({ signals, isDark, panelClass, subtleText }: Props) {
  if (!signals.length) return null;

  return (
    <section className={`rounded-md border p-4 ${panelClass}`}>
      <h3 className="text-sm font-black">주의 신호</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {signals.map((signal) => (
          <div
            key={signal.key}
            className={`rounded-md border px-3 py-2 ${
              signal.severity === "danger"
                ? isDark ? "border-rose-400/20 bg-rose-400/10"   : "border-rose-100 bg-rose-50"
                : isDark ? "border-amber-400/20 bg-amber-400/10" : "border-amber-100 bg-amber-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-black ${signal.severity === "danger" ? "text-rose-500" : "text-amber-600"}`}>
                {signal.label}
              </span>
              {signal.date ? <span className={`text-xs ${subtleText}`}>{signal.date}</span> : null}
            </div>
            <p className={`mt-1 text-xs leading-relaxed ${subtleText}`}>{signal.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
