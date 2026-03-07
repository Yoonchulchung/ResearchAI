import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { deepResearchStream } from "@/lib/api/research";
import { updateTask } from "@/lib/api/sessions";
import { queueRegisterJob, queueUpdateJob, queueRemoveJob } from "@/lib/api/queue";
import { Session, Task, TaskStatus, SearchSources } from "@/types";
import { type Phase } from "@/sessions/components/TaskCard";
import { useResearchQueue } from "@/contexts/ResearchQueueContext";

export function useTaskRunner(session: Session | null, id: string) {
  const [taskRunStates, setTaskRunStates] = useState<Record<string, {
    status: TaskStatus;
    phase?: Phase;
    result?: string;
    sources?: SearchSources;
  }>>({});
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);

  const { jobs: queueJobs } = useResearchQueue();
  const sessionQueueJobs = useMemo(
    () => queueJobs.filter((j) => j.sessionId === id),
    [queueJobs, id],
  );

  useEffect(() => {
    setTaskRunStates({});
  }, [id]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const statuses = useMemo<Record<string, TaskStatus>>(() => {
    const base: Record<string, TaskStatus> = {};
    for (const task of session?.tasks ?? []) {
      base[String(task.id)] = task.result ? "done" : "idle";
    }
    for (const job of sessionQueueJobs) {
      const key = String(job.taskId);
      if (base[key] === "done" || base[key] === "error") continue;
      if (job.status === "running") base[key] = "loading";
      else if (job.status === "pending") base[key] = base[key] ?? "idle";
    }
    for (const [key, state] of Object.entries(taskRunStates)) {
      base[key] = state.status;
    }
    return base;
  }, [session, taskRunStates, sessionQueueJobs]);

  const phases = useMemo<Record<string, Phase>>(() => {
    const p: Record<string, Phase> = {};
    for (const job of sessionQueueJobs) {
      if (job.status === "running" && job.phase) p[String(job.taskId)] = job.phase;
    }
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.status === "loading" && state.phase) p[key] = state.phase;
    }
    return p;
  }, [taskRunStates, sessionQueueJobs]);

  const results = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const task of session?.tasks ?? []) {
      if (task.result) base[String(task.id)] = task.result;
    }
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.result) base[key] = state.result;
    }
    return base;
  }, [session, taskRunStates]);

  const sources = useMemo<Record<string, SearchSources>>(() => {
    const base: Record<string, SearchSources> = {};
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.sources) base[key] = state.sources;
    }
    return base;
  }, [taskRunStates]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const runTask = useCallback(async (task: Task, signal: AbortSignal) => {
    if (!session) return;
    const key = String(task.id);
    setTaskRunStates((prev) => ({ ...prev, [key]: { status: "loading", phase: "searching" } }));

    let queueJobId: string | null = null;
    queueRegisterJob({
      sessionId: id,
      sessionTopic: session.topic,
      taskId: task.id,
      taskTitle: task.title,
      taskIcon: task.icon,
      taskPrompt: task.prompt,
      model: session.researchAiModel,
    }).then((job) => { queueJobId = job.jobId; }).catch(() => {});

    try {
      await deepResearchStream(
        task.prompt,
        session.researchAiModel,
        undefined,
        (event) => {
          if (event.type === "log") {
            const phase: Phase = event.message.includes("AI 심층") ? "analyzing" : "searching";
            setTaskRunStates((prev) => ({ ...prev, [key]: { ...prev[key], status: "loading", phase } }));
            if (queueJobId) queueUpdateJob(queueJobId, { phase }).catch(() => {});
          } else if (event.type === "done") {
            const src = event.sources as unknown as SearchSources;
            setTaskRunStates((prev) => ({ ...prev, [key]: { status: "done", result: event.result, sources: src } }));
            updateTask(id, task.id, event.result, "done").catch(() => {});
            if (queueJobId) queueUpdateJob(queueJobId, { status: "done" }).catch(() => {});
          }
        },
        signal,
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setTaskRunStates((prev) => ({ ...prev, [key]: { ...prev[key], status: "idle" } }));
        if (queueJobId) queueRemoveJob(queueJobId).catch(() => {});
        throw e;
      }
      const msg = e instanceof Error ? e.message : "오류";
      setTaskRunStates((prev) => ({ ...prev, [key]: { status: "error", result: msg } }));
      updateTask(id, task.id, msg, "error").catch(() => {});
      if (queueJobId) queueUpdateJob(queueJobId, { status: "error" }).catch(() => {});
    }
  }, [session, id]);

  const handleRunTask = useCallback(async (task: Task) => {
    const queueJob = sessionQueueJobs.find((j) => j.taskId === task.id);
    if (queueJob?.status === "pending" || queueJob?.status === "running") return;
    if (isRunningRef.current) return;

    const abort = new AbortController();
    abortRef.current = abort;
    isRunningRef.current = true;
    setIsRunning(true);
    try {
      await runTask(task, abort.signal);
    } catch { /* AbortError는 runTask 내부에서 처리됨 */ }
    finally {
      isRunningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [runTask, sessionQueueJobs]);

  const handleRunAll = useCallback(async () => {
    if (isRunningRef.current || !session) return;
    const pendingTasks = (session.tasks ?? []).filter((t) => {
      const s = statuses[String(t.id)];
      if (s === "done" || s === "loading") return false;
      const queueJob = sessionQueueJobs.find((j) => j.taskId === t.id);
      if (queueJob?.status === "pending" || queueJob?.status === "running") return false;
      return !s || s === "idle" || s === "error";
    });

    const abort = new AbortController();
    abortRef.current = abort;
    isRunningRef.current = true;
    setIsRunning(true);
    try {
      for (const task of pendingTasks) {
        if (abort.signal.aborted) break;
        await runTask(task, abort.signal);
      }
    } catch { /* AbortError로 루프 중단 */ }
    finally {
      isRunningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [session, statuses, runTask, sessionQueueJobs]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { statuses, phases, results, sources, isRunning, handleRunTask, handleRunAll, handleCancel };
}
