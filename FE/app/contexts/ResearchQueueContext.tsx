"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { Task, SearchSources } from "../types";
import { searchPipelineStream, runResearch, saveTaskResult } from "../lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export type QueueJobStatus = "pending" | "running" | "done" | "error";
export type QueueJobPhase = "searching" | "analyzing";

export interface QueueJob {
  jobId: string;
  sessionId: string;
  sessionTopic: string;
  taskId: number;
  taskTitle: string;
  taskIcon: string;
  taskPrompt: string;
  model: string;
  status: QueueJobStatus;
  seen: boolean;
  phase?: QueueJobPhase;
  sources?: SearchSources;
  result?: string;
}

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

// ─── Context ─────────────────────────────────────────────────────────────────

const ResearchQueueContext = createContext<ResearchQueueContextValue | null>(null);

export function useResearchQueue() {
  const ctx = useContext(ResearchQueueContext);
  if (!ctx) throw new Error("useResearchQueue must be inside ResearchQueueProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ResearchQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [workerTick, setWorkerTick] = useState(0);
  const activeJobIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateJob = useCallback((jobId: string, updates: Partial<QueueJob>) => {
    setJobs((prev) => prev.map((j) => (j.jobId === jobId ? { ...j, ...updates } : j)));
  }, []);

  // ── job runner ───────────────────────────────────────────────────────────

  const runJob = useCallback(
    async (job: QueueJob) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      updateJob(job.jobId, { status: "running", phase: "searching" });

      let context = "";
      let localSources: SearchSources = {};

      // 1. Search pipeline
      try {
        const { context: ctx } = await searchPipelineStream(
          job.taskPrompt,
          (key, result) => {
            localSources = { ...localSources, [key]: result };
            setJobs((prev) =>
              prev.map((j) =>
                j.jobId === job.jobId ? { ...j, sources: localSources } : j,
              ),
            );
          },
          signal,
        );
        context = ctx;
      } catch (e: unknown) {
        if (signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        // search failure → proceed to AI without context
      }

      if (signal.aborted) return;

      // 2. AI analysis
      updateJob(job.jobId, { phase: "analyzing" });

      try {
        const { result } = await runResearch(
          job.taskPrompt,
          job.model,
          context || undefined,
          signal,
        );
        const sourcesToSave =
          Object.keys(localSources).length > 0 ? localSources : undefined;
        await saveTaskResult(job.sessionId, job.taskId, result, "done", sourcesToSave);
        updateJob(job.jobId, { status: "done", phase: undefined, result });
      } catch (e: unknown) {
        if (signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        const msg = e instanceof Error ? e.message : "오류";
        await saveTaskResult(job.sessionId, job.taskId, msg, "error").catch(() => {});
        updateJob(job.jobId, { status: "error", phase: undefined, result: msg });
      }
    },
    [updateJob],
  );

  // ── sequential worker ─────────────────────────────────────────────────────

  useEffect(() => {
    if (activeJobIdRef.current) return;
    const nextPending = jobs.find((j) => j.status === "pending");
    if (!nextPending) return;

    activeJobIdRef.current = nextPending.jobId;
    runJob(nextPending).finally(() => {
      activeJobIdRef.current = null;
      setWorkerTick((t) => t + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, workerTick]);

  // ── public API ────────────────────────────────────────────────────────────

  const enqueueSession = useCallback(
    (
      sessionId: string,
      sessionTopic: string,
      tasks: Task[],
      model: string,
      doneTaskIds: number[] = [],
    ) => {
      setJobs((prev) => {
        const newJobs: QueueJob[] = tasks
          .filter((t) => !doneTaskIds.includes(t.id))
          .filter(
            (t) =>
              !prev.some(
                (j) =>
                  j.sessionId === sessionId &&
                  j.taskId === t.id &&
                  (j.status === "pending" || j.status === "running"),
              ),
          )
          .map((t) => ({
            jobId: `${sessionId}-${t.id}-${Date.now()}`,
            sessionId,
            sessionTopic,
            taskId: t.id,
            taskTitle: t.title,
            taskIcon: t.icon,
            taskPrompt: t.prompt,
            model,
            status: "pending" as const,
            seen: false,
          }));
        return newJobs.length > 0 ? [...prev, ...newJobs] : prev;
      });
    },
    [],
  );

  const enqueueTask = useCallback(
    (sessionId: string, sessionTopic: string, task: Task, model: string) => {
      setJobs((prev) => {
        // If this task is currently running, abort it
        const runningThisTask = prev.find(
          (j) =>
            j.sessionId === sessionId &&
            j.taskId === task.id &&
            j.status === "running",
        );
        if (runningThisTask) {
          abortRef.current?.abort();
          abortRef.current = null;
          activeJobIdRef.current = null;
        }
        // Remove existing entry for this task, add new pending
        const filtered = prev.filter(
          (j) => !(j.sessionId === sessionId && j.taskId === task.id),
        );
        const newJob: QueueJob = {
          jobId: `${sessionId}-${task.id}-${Date.now()}`,
          sessionId,
          sessionTopic,
          taskId: task.id,
          taskTitle: task.title,
          taskIcon: task.icon,
          taskPrompt: task.prompt,
          model,
          status: "pending",
          seen: false,
        };
        return [...filtered, newJob];
      });
    },
    [],
  );

  const cancelSession = useCallback((sessionId: string) => {
    setJobs((prev) => {
      const hasRunning = prev.some(
        (j) => j.sessionId === sessionId && j.status === "running",
      );
      if (hasRunning) {
        abortRef.current?.abort();
        abortRef.current = null;
        // activeJobIdRef will be cleared by the runJob finally block
      }
      return prev.filter(
        (j) =>
          !(
            j.sessionId === sessionId &&
            (j.status === "pending" || j.status === "running")
          ),
      );
    });
  }, []);

  const dismissCompleted = useCallback(() => {
    setJobs((prev) =>
      prev.filter((j) => j.status === "pending" || j.status === "running"),
    );
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
