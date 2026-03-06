"use client";

import { useState } from "react";
import { useResearchQueue } from "@/contexts/ResearchQueueContext";

export function QueueWidget() {
  const { jobs, dismissCompleted } = useResearchQueue();
  const [collapsed, setCollapsed] = useState(false);

  if (jobs.length === 0) return null;

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const completedCount = jobs.filter(
    (j) => j.status === "done" || j.status === "error",
  ).length;
  const total = jobs.length;
  const progressPct = total > 0 ? (completedCount / total) * 100 : 0;

  return (
    <div className="mx-2 mb-1 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 uppercase tracking-wider hover:text-indigo-700 transition-colors"
        >
          <span
            className="inline-block transition-transform duration-200"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
          >
            ▾
          </span>
          리서치 큐
        </button>
        {!collapsed && completedCount > 0 && (
          <button
            onClick={dismissCompleted}
            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-600 transition-colors"
          >
            확인
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
            {runningCount > 0 && (
              <span className="flex items-center gap-0.5 text-indigo-600 font-medium">
                <span className="animate-pulse">▶</span> {runningCount} 실행
              </span>
            )}
            {pendingCount > 0 && (
              <span>⏳ {pendingCount} 대기</span>
            )}
            {completedCount > 0 && (
              <span className="text-green-600">{completedCount} 완료</span>
            )}
          </div>
          {total > 0 && (
            <div className="mt-2 h-1 bg-white rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
