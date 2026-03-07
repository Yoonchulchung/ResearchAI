import { useEffect, useState, useCallback, useMemo } from "react";
import { deepResearch } from "@/lib/api/research";
import { Session, Task, TaskStatus, SearchSources } from "@/types";
import { type Phase } from "@/sessions/components/TaskCard";

export function useTaskRunner(session: Session | null, id: string) {
  const [taskRunStates, setTaskRunStates] = useState<Record<string, {
    status: TaskStatus;
    phase?: Phase;
    result?: string;
    sources?: SearchSources;
  }>>({});
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setTaskRunStates({});
  }, [id]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const statuses = useMemo<Record<string, TaskStatus>>(() => {
    const isInProgress = session?.researchState === "pending" || session?.researchState === "running";
    const base: Record<string, TaskStatus> = {};
    for (const task of session?.tasks ?? []) {
      if (task.result) {
        base[String(task.id)] = "done";
      } else {
        base[String(task.id)] = isInProgress ? "loading" : "idle";
      }
    }
    for (const [key, state] of Object.entries(taskRunStates)) {
      base[key] = state.status;
    }
    return base;
  }, [session, taskRunStates]);

  const phases = useMemo<Record<string, Phase>>(() => {
    const p: Record<string, Phase> = {};
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.status === "loading" && state.phase) p[key] = state.phase;
    }
    return p;
  }, [taskRunStates]);

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

  const enqueueTask = useCallback(async (task: Task) => {
    if (!session) return;
    const key = String(task.id);
    setTaskRunStates((prev) => ({ ...prev, [key]: { status: "loading", phase: "searching" } }));

    try {
      await deepResearch(id, task.id, task.prompt, session.researchCloudAIModel);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "오류";
      setTaskRunStates((prev) => ({ ...prev, [key]: { status: "error", result: msg } }));
    }
  }, [session, id]);

  const handleRunTask = useCallback(async (task: Task) => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      await enqueueTask(task);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, enqueueTask]);

  const handleRunAll = useCallback(async () => {
    if (isRunning || !session) return;
    const pendingTasks = (session.tasks ?? []).filter((t) => {
      const s = statuses[String(t.id)];
      return !s || s === "idle" || s === "error";
    });

    setIsRunning(true);
    try {
      await Promise.all(pendingTasks.map((task) => enqueueTask(task)));
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, session, statuses, enqueueTask]);

  const handleCancel = useCallback(() => {
    // 큐 기반으로 취소는 서버에서 처리됨
  }, []);

  return { statuses, phases, results, sources, isRunning, handleRunTask, handleRunAll, handleCancel };
}
