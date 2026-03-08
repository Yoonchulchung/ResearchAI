import { useEffect, useState, useCallback, useMemo } from "react";
import { deepResearch, stopResearchItem } from "@/lib/api/research";
import { deleteSessionItem } from "@/lib/api/sessions";
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
    const base: Record<string, TaskStatus> = {};
    for (const task of session?.items ?? []) {
      const rs = task.researchState;
      if (task.result || rs === TaskStatus.DONE) {
        base[String(task.id)] = TaskStatus.DONE;
      } else if (rs === TaskStatus.STOPPED) {
        base[String(task.id)] = TaskStatus.STOPPED;
      } else if (rs === TaskStatus.ABORTED) {
        base[String(task.id)] = TaskStatus.ABORTED;
      } else if (rs === TaskStatus.ERROR) {
        base[String(task.id)] = TaskStatus.ERROR;
      } else if (rs === TaskStatus.RUNNING) {
        base[String(task.id)] = TaskStatus.RUNNING;
      } else if (rs === TaskStatus.PENDING) {
        base[String(task.id)] = TaskStatus.PENDING;
      } else {
        base[String(task.id)] = TaskStatus.IDLE;
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
      if (state.status === TaskStatus.RUNNING && state.phase) p[key] = state.phase;
    }
    return p;
  }, [taskRunStates]);

  const results = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const task of session?.items ?? []) {
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

  const runTasks = useCallback(async (tasks: Task[]) => {
    if (!session || tasks.length === 0) return;
    const updates: Record<string, { status: TaskStatus; phase: Phase }> = {};
    for (const task of tasks) {
      updates[String(task.id)] = { status: TaskStatus.RUNNING, phase: "searching" };
    }
    setTaskRunStates((prev) => ({ ...prev, ...updates }));

    try {
      await deepResearch(
        id,
        tasks.map((t) => ({ itemId: t.itemId, prompt: t.prompt })),
        session.researchLocalAIModel,
        session.researchCloudAIModel,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "오류";
      setTaskRunStates((prev) => {
        const next = { ...prev };
        for (const task of tasks) {
          next[String(task.id)] = { status: TaskStatus.ERROR, result: msg };
        }
        return next;
      });
    }
  }, [session, id]);

  const handleRunTask = useCallback(async (task: Task) => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      await runTasks([task]);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, runTasks]);

  const handleRunAll = useCallback(async () => {
    if (isRunning || !session) return;
    const pendingTasks = (session.items ?? []).filter((t) => {
      const s = statuses[String(t.id)];
      return !s || s === TaskStatus.IDLE || s === TaskStatus.ERROR || s === TaskStatus.STOPPED || s === TaskStatus.ABORTED;
    });

    setIsRunning(true);
    try {
      await runTasks(pendingTasks);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, session, statuses, runTasks]);

  // ******* //
  // 작업 취소 //
  // ******* //
  const handleCancelItem = useCallback(async (task: Task) => {
    try {
      await stopResearchItem(id, task.itemId);
      setTaskRunStates((prev) => ({
        ...prev,
        [String(task.id)]: { status: TaskStatus.STOPPED },
      }));
    } catch {
      // 중단 실패 시 무시
    }
  }, [id]);

  const handleDeleteItem = useCallback(async (task: Task, onDeleted: () => void) => {
    await deleteSessionItem(id, task.itemId);
    setTaskRunStates((prev) => {
      const next = { ...prev };
      delete next[String(task.id)];
      return next;
    });
    onDeleted();
  }, [id]);

  return { statuses, phases, results, sources, isRunning, handleRunTask, handleRunAll, handleCancelItem, handleDeleteItem };
}
