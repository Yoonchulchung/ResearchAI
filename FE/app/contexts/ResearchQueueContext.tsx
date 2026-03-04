"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { Task, QueueJob } from "@/types";
import {
  queueGetJobs,
  queueEnqueueSession,
  queueEnqueueTask,
  queueCancelSession,
  queueDismissCompleted,
  QueueTaskPayload,
} from "@/lib/api";

// re-export for consumers that import from this file
export type { QueueJob };
export type { QueueJobStatus, QueueJobPhase } from "@/types";

const API_BASE = "http://localhost:3001/api";

interface ResearchQueueContextValue {
  jobs: QueueJob[];
  enqueueSession: (
    sessionId: string,
    sessionTopic: string,
    tasks: Task[],
    model: string,
    doneTaskIds?: number[],
  ) => void;
  enqueueTask: (
    sessionId: string,
    sessionTopic: string,
    task: Task,
    model: string,
  ) => void;
  cancelSession: (sessionId: string) => void;
  dismissCompleted: () => void;
  getSessionJobs: (sessionId: string) => QueueJob[];
}

const ResearchQueueContext = createContext<ResearchQueueContextValue | null>(null);

export function useResearchQueue() {
  const ctx = useContext(ResearchQueueContext);
  if (!ctx) throw new Error("useResearchQueue must be inside ResearchQueueProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ResearchQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<QueueJob[]>([]);

  // ── SSE 구독 ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // 초기 상태 로드
    queueGetJobs().then(setJobs).catch(() => {});

    // SSE 연결
    const es = new EventSource(`${API_BASE}/queue/events`);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "sync") setJobs(event.jobs);
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => {
      // 재연결은 브라우저가 자동으로 처리
    };
    return () => es.close();
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const toPayload = (
    sessionId: string,
    sessionTopic: string,
    task: Task,
    model: string,
  ): QueueTaskPayload => ({
    sessionId,
    sessionTopic,
    taskId: task.id,
    taskTitle: task.title,
    taskIcon: task.icon,
    taskPrompt: task.prompt,
    model,
  });

  const enqueueSession = useCallback(
    (
      sessionId: string,
      sessionTopic: string,
      tasks: Task[],
      model: string,
      doneTaskIds: number[] = [],
    ) => {
      const payloads = tasks.map((t) => toPayload(sessionId, sessionTopic, t, model));
      queueEnqueueSession(payloads, doneTaskIds).catch(() => {});
    },
    [],
  );

  const enqueueTask = useCallback(
    (sessionId: string, sessionTopic: string, task: Task, model: string) => {
      queueEnqueueTask(toPayload(sessionId, sessionTopic, task, model)).catch(() => {});
    },
    [],
  );

  const cancelSession = useCallback((sessionId: string) => {
    queueCancelSession(sessionId).catch(() => {});
  }, []);

  const dismissCompleted = useCallback(() => {
    queueDismissCompleted().catch(() => {});
  }, []);

  const getSessionJobs = useCallback(
    (sessionId: string) => jobs.filter((j) => j.sessionId === sessionId),
    [jobs],
  );

  const value = useMemo(
    () => ({
      jobs,
      enqueueSession,
      enqueueTask,
      cancelSession,
      dismissCompleted,
      getSessionJobs,
    }),
    [jobs, enqueueSession, enqueueTask, cancelSession, dismissCompleted, getSessionJobs],
  );

  return (
    <ResearchQueueContext.Provider value={value}>
      {children}
    </ResearchQueueContext.Provider>
  );
}
