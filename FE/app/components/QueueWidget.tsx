"use client";

import { useState } from "react";
import { useSummaryProgress } from "@/contexts/SummaryProgressContext";

export function QueueWidget() {
  const { items: summaryItems, dismiss: dismissSummary } = useSummaryProgress();
  const [collapsed, setCollapsed] = useState(false);

  if (summaryItems.length === 0) return null;

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
      </div>
      {!collapsed && summaryItems.length > 0 && (
        <div className="flex flex-col gap-1">
          {summaryItems.map((item) => (
            <div key={item.sessionId} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {item.status === "streaming" ? (
                  <span className="text-indigo-400 animate-pulse text-[10px]">●</span>
                ) : item.status === "done" ? (
                  <span className="text-green-500 text-[10px]">✓</span>
                ) : (
                  <span className="text-red-400 text-[10px]">✕</span>
                )}
                <span className="text-[11px] text-slate-600 truncate">{item.topic} 서머리</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[10px] font-medium ${
                  item.status === "streaming" ? "text-indigo-500" :
                  item.status === "done" ? "text-green-600" : "text-red-500"
                }`}>
                  {item.status === "streaming" ? "생성 중" : item.status === "done" ? "완료" : "오류"}
                </span>
                {(item.status === "done" || item.status === "error") && (
                  <button
                    onClick={() => dismissSummary(item.sessionId)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
