"use client";

import { ANALYSIS_DETAIL_STEPS } from "../_constants";
import type { AnalysisRunProgress } from "../_hooks/useAnalysisRunner";

interface Props {
  error: string;
  isAnalyzing: boolean;
  analysisProgressItems: AnalysisRunProgress[];
  progressPercent: number;
  progressLogs: string[];
  logsVisible: boolean;
  setLogsVisible: (v: boolean | ((prev: boolean) => boolean)) => void;
  activeAnalysisNames: string[];
  isDark: boolean;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}

export function AnalysisProgressPanel({
  error, isAnalyzing, analysisProgressItems, progressPercent,
  progressLogs, logsVisible, setLogsVisible, activeAnalysisNames, isDark, logEndRef,
}: Props) {
  if (!isAnalyzing && analysisProgressItems.length === 0 && progressLogs.length === 0 && !error) return null;

  return (
    <div className={`mt-3 border rounded-sm text-sm font-mono ${isDark ? "bg-slate-900 text-slate-400 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-300"}`}>
      {error && (
        <div className={`px-4 py-2 border-b ${isDark ? "bg-red-950/30 text-red-300 border-red-900/60" : "bg-red-50 text-red-700 border-red-200"}`}>
          [오류] {error}
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="shrink-0">
          <span className={`text-xs font-semibold uppercase tracking-widest ${isDark ? "text-slate-300" : "text-slate-700"}`}>기업 분석 진행률</span>
          <span className="ml-2 text-[11px] opacity-60">
            {analysisProgressItems.length > 0 ? `${analysisProgressItems.length}개 작업 평균` : "대기"}
          </span>
        </div>
        <div className={`flex-1 h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-white border border-slate-200"}`}>
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-lg font-bold tabular-nums ${isDark ? "text-blue-300" : "text-blue-700"}`}>
            {Math.round(progressPercent)}%
          </span>
          <button
            onClick={() => setLogsVisible((v) => !v)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${isDark ? "border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300" : "border-slate-300 hover:border-slate-400 text-slate-400 hover:text-slate-600"}`}
          >
            {logsVisible ? "숨기기" : "펼치기"}
          </button>
        </div>
      </div>

      {logsVisible && analysisProgressItems.length > 0 && (
        <div className="px-4 pb-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
          {analysisProgressItems.map((item) => {
            const statusText =
              item.status === "done" ? "완료" :
              item.status === "error" ? "오류" :
              item.status === "pending" ? "대기" : "진행 중";
            const statusClass =
              item.status === "done" ? (isDark ? "text-emerald-300 border-emerald-900 bg-emerald-950/30" : "text-emerald-700 border-emerald-200 bg-emerald-50") :
              item.status === "error" ? (isDark ? "text-red-300 border-red-900 bg-red-950/30" : "text-red-700 border-red-200 bg-red-50") :
              item.status === "pending" ? (isDark ? "text-amber-300 border-amber-900 bg-amber-950/30" : "text-amber-700 border-amber-200 bg-amber-50") :
              (isDark ? "text-blue-300 border-blue-900 bg-blue-950/30" : "text-blue-700 border-blue-200 bg-blue-50");
            return (
              <div key={item.key} className={`rounded-sm border p-3 ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>{item.name}</div>
                    <div className="mt-0.5 text-xs truncate">{item.currentStep}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 border rounded-sm ${statusClass}`}>{statusText}</span>
                    <span className={`text-sm font-bold tabular-nums ${isDark ? "text-blue-300" : "text-blue-700"}`}>{Math.round(item.progress)}%</span>
                  </div>
                </div>
                <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${item.status === "error" ? "bg-red-500" : item.status === "done" ? "bg-emerald-500" : "bg-blue-600"}`}
                    style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ANALYSIS_DETAIL_STEPS.map((step) => {
                    const reached = item.progress >= step.threshold;
                    const current = !reached && item.progress >= step.threshold - 8;
                    const cls = reached
                      ? isDark ? "border-blue-800 bg-blue-950/40 text-blue-300" : "border-blue-200 bg-blue-50 text-blue-700"
                      : current
                      ? isDark ? "border-slate-600 bg-slate-800 text-slate-300" : "border-slate-300 bg-slate-50 text-slate-600"
                      : isDark ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400";
                    return (
                      <span key={step.label} className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${cls}`}>
                        {step.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logsVisible && (
        <div className="px-4 pb-2 max-h-36 overflow-y-auto flex flex-col gap-1 text-xs border-t border-current border-opacity-10 pt-2">
          {progressLogs.map((l, i) => <div key={i}>{">"} {l}</div>)}
          {isAnalyzing && (
            <div className="text-blue-600 mt-1">{">"} 대기/분석 중: {activeAnalysisNames.join(", ")}</div>
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
