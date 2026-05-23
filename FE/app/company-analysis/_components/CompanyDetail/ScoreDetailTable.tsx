"use client";

import { useState } from "react";
import type { CompetencyScores, CompetencyReasons } from "@/lib/api/company-analysis";
import { COMPETENCY_LABELS } from "../../_constants";

export function ScoreDetailTable({ scores, reasons, isDark }: { scores: CompetencyScores; reasons: CompetencyReasons | null; isDark: boolean }) {
  const [openKey, setOpenKey] = useState<keyof CompetencyScores | null>(null);
  return (
    <div className={`rounded-sm border ${isDark ? "border-slate-600 bg-slate-800" : "border-slate-300 bg-white"}`}>
      <div className={`px-4 py-2 border-b ${isDark ? "border-slate-600 bg-slate-700/50" : "border-slate-300 bg-slate-50"}`}>
        <p className={`text-sm font-semibold tracking-wide ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          세부 분석 항목 {reasons && <span className="font-normal ml-2 text-blue-600 text-xs">상세 내역 보기</span>}
        </p>
      </div>
      <div className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-200"}`}>
        {COMPETENCY_LABELS.map(({ key, label }) => {
          const v = scores[key] ?? 0;
          const reason = reasons?.[key];
          const isOpen = openKey === key;
          return (
            <div key={key}>
              <button
                onClick={() => reason && setOpenKey(isOpen ? null : key)}
                className={`w-full flex items-center gap-4 px-4 py-3 text-sm transition-colors ${reason ? `cursor-pointer ${isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}` : "cursor-default"} ${isOpen ? (isDark ? "bg-slate-700" : "bg-blue-50/50") : ""}`}
              >
                <span className={`w-28 text-left shrink-0 font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{label}</span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-none overflow-hidden">
                  <div className={`h-full transition-all ${v >= 80 ? "bg-blue-700" : v >= 60 ? "bg-blue-500" : v >= 40 ? "bg-slate-500" : "bg-slate-400"}`} style={{ width: `${v}%` }} />
                </div>
                <span className={`w-12 text-right font-mono text-sm shrink-0 ${v >= 70 ? "text-blue-700 font-semibold" : isDark ? "text-slate-400" : "text-slate-600"}`}>{v}</span>
                {reason ? <span className={`text-xs shrink-0 transition-transform ${isOpen ? "rotate-180" : ""} ${isDark ? "text-slate-400" : "text-slate-400"}`}>▼</span> : <span className="w-2 shrink-0" />}
              </button>
              {isOpen && reason && (
                <div className={`px-4 py-3 ${isDark ? "bg-slate-700/80 border-t border-slate-600" : "bg-slate-50 border-t border-slate-200"}`}>
                  <div className="flex gap-3">
                    <div className="shrink-0 font-semibold text-xs text-blue-700 uppercase tracking-widest mt-0.5">평가 근거</div>
                    <div className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{reason}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
