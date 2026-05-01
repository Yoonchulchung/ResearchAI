"use client";

import { useState, useEffect } from "react";
import { WS_BASE } from "@/lib/api/base";
import { useSummaryProgress } from "@/contexts/SummaryProgressContext";
import {
  getQueueStatus,
  cancelSummary,
  cancelWriteAssist,
  cancelCompanyProfile,
  cancelCompanyAnalysis,
  QueueStatus,
} from "@/lib/api/queue";
import { stopResearchItem, cancelLightResearch } from "@/lib/api/research";

const WS_URL = WS_BASE;

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

const PHASE_LABEL: Record<string, string> = {
  searching: "검색 중",
  analyzing: "분석 중",
};

function isWriteAssistTask(taskType: string) {
  return taskType === "writeassist" || taskType.startsWith("writeassist_");
}

function getJobTitle(job: QueueStatus["jobs"][0]) {
  return job.displayTitle || job.itemId || job.sessionId || job.jobId;
}

function getJobSubtitle(job: QueueStatus["jobs"][0]) {
  const status = job.phase ? `${STATUS_LABEL[job.status]} · ${PHASE_LABEL[job.phase] ?? job.phase}` : STATUS_LABEL[job.status];
  return job.displaySubtitle ? `${job.displaySubtitle} · ${status}` : status;
}

export function QueueWidget() {
  const { items: summaryItems, dismiss: dismissSummary } = useSummaryProgress();
  const [collapsed, setCollapsed] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  // 초기 상태 1회 조회
  useEffect(() => {
    getQueueStatus().then(setQueueStatus).catch(() => {});
  }, []);

  // WebSocket으로 실시간 큐 상태 수신
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        ws!.send(JSON.stringify({ event: "subscribe:queue" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.event === "queue:update" && msg.data) {
            setQueueStatus(msg.data);
          }
        } catch {
          // 파싱 오류 무시
        }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const handleCancelJob = async (job: QueueStatus["jobs"][0]) => {
    try {
      if (job.taskType === "deepresearch") {
        await stopResearchItem(job.sessionId, job.itemId);
      } else if (job.taskType === "lightresearch") {
        await cancelLightResearch(job.sessionId);
      } else if (job.taskType === "summary") {
        await cancelSummary(job.sessionId);
      } else if (isWriteAssistTask(job.taskType)) {
        await cancelWriteAssist(job.jobId);
      } else if (job.taskType === "companyprofile") {
        await cancelCompanyProfile(job.jobId);
      } else if (job.taskType === "companyanalysis") {
        await cancelCompanyAnalysis(job.jobId);
      }
      setQueueStatus((prev) =>
        prev ? { ...prev, jobs: prev.jobs.filter((j) => j.jobId !== job.jobId) } : prev
      );
    } catch { /* 취소 실패 무시 */ }
  };

  const activeJobs = queueStatus?.jobs.filter((j) => j.status === "pending" || j.status === "running") ?? [];
  const hasQueue = activeJobs.length > 0;

  if (summaryItems.length === 0 && !hasQueue) return null;

  return (
    <div className="mx-2 mb-1 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 text-2xs font-bold text-indigo-500 uppercase tracking-wider hover:text-indigo-700 transition-colors"
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
                  <span className="text-indigo-400 animate-pulse text-2xs">●</span>
                ) : item.status === "done" ? (
                  <span className="text-green-500 text-2xs">✓</span>
                ) : (
                  <span className="text-red-400 text-2xs">✕</span>
                )}
                <span className="text-xs text-slate-600 truncate">{item.topic} 서머리</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-2xs font-medium ${
                  item.status === "streaming" ? "text-indigo-500" :
                  item.status === "done" ? "text-green-600" : "text-red-500"
                }`}>
                  {item.status === "streaming" ? "생성 중" : item.status === "done" ? "완료" : "오류"}
                </span>
                {(item.status === "done" || item.status === "error") && (
                  <button
                    onClick={() => dismissSummary(item.sessionId)}
                    className="text-2xs text-slate-400 hover:text-slate-600 px-1"
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
            <div key={job.jobId} className="flex items-center justify-between gap-2 rounded-md px-1 py-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {job.status === "running" ? (
                  <span className="text-indigo-400 animate-pulse text-xs">●</span>
                ) : (
                  <span className="text-yellow-400 text-xs">○</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-700 truncate" title={getJobTitle(job)}>
                    {getJobTitle(job)}
                  </div>
                  <div className={`text-2xs font-medium truncate ${STATUS_COLOR[job.status]}`}>
                    {getJobSubtitle(job)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleCancelJob(job)}
                  className="text-2xs text-slate-300 hover:text-red-400 px-1 transition-colors"
                  title="취소"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="text-2xs text-slate-400 text-right">
            대기 {queueStatus?.pending ?? 0} · 처리 중 {queueStatus?.running_jobs ?? 0}
          </div>
        </div>
      )}
    </div>
  );
}
