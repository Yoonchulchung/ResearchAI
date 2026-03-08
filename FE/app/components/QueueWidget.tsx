"use client";

import { useState, useEffect } from "react";
import { useSummaryProgress } from "@/contexts/SummaryProgressContext";
import { getQueueStatus, QueueStatus } from "@/lib/api/queue";

const POLL_INTERVAL = 3000;

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  running: "처리 중",
  done: "완료",
  error: "오류",
  stopped: "중단",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-yellow-500",
  running: "text-indigo-500",
  done: "text-green-600",
  error: "text-red-500",
  stopped: "text-slate-400",
};

export function QueueWidget() {
  const { items: summaryItems, dismiss: dismissSummary } = useSummaryProgress();
  const [collapsed, setCollapsed] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await getQueueStatus();
        if (!cancelled) setQueueStatus(status);
      } catch {
        // 조회 실패 시 무시
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const activeJobs = queueStatus?.jobs.filter((j) => j.status === "pending" || j.status === "running") ?? [];
  const hasQueue = activeJobs.length > 0;

  if (summaryItems.length === 0 && !hasQueue) return null;

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
      {!collapsed && hasQueue && (
        <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-indigo-100">
          {activeJobs.map((job) => (
            <div key={job.jobId} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {job.status === "running" ? (
                  <span className="text-indigo-400 animate-pulse text-[10px]">●</span>
                ) : (
                  <span className="text-yellow-400 text-[10px]">○</span>
                )}
                <span className="text-[11px] text-slate-500 truncate font-mono">{job.itemId.slice(0, 8)}…</span>
              </div>
              <span className={`text-[10px] font-medium shrink-0 ${STATUS_COLOR[job.status]}`}>
                {job.phase ? `${STATUS_LABEL[job.status]} · ${job.phase}` : STATUS_LABEL[job.status]}
              </span>
            </div>
          ))}
          <div className="text-[10px] text-slate-400 text-right">
            대기 {queueStatus?.pending ?? 0} · 처리 중 {queueStatus?.running_jobs ?? 0}
          </div>
        </div>
      )}
    </div>
  );
}
