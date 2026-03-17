import { useEffect, useState, useCallback, useMemo } from "react";
import { deepResearch, stopResearch, stopResearchItem } from "@/lib/api/research";
import { deleteSessionItem } from "@/lib/api/sessions";
import { Session, Task, TaskStatus, WebModels } from "@/types";
import { type Phase } from "@/sessions/components/TaskCard";


export function useTaskRunner(session: Session | null, id: string) {
  const [taskRunStates, setTaskRunStates] = useState<Record<string, {
    status: TaskStatus;
    phase?: Phase;
    aiResult?: string;
    webResult?: string;
    webModel?: WebModels;
  }>>({});
  const [localRunning, setLocalRunning] = useState(false);

  useEffect(() => {
    setTaskRunStates({});
  }, [id]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const statuses = useMemo<Record<string, TaskStatus>>(() => {
    const base: Record<string, TaskStatus> = {};
    for (const task of session?.items ?? []) {
      const rs = task.researchState;
      if (task.aiResult || rs === TaskStatus.DONE) {
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
    const terminalStates: TaskStatus[] = [TaskStatus.DONE, TaskStatus.ERROR, TaskStatus.STOPPED, TaskStatus.ABORTED];
    for (const [key, state] of Object.entries(taskRunStates)) {
      // DB에 이미 terminal 상태가 있으면 로컬 상태로 덮어쓰지 않음
      if (base[key] && terminalStates.includes(base[key])) continue;
      base[key] = state.status;
    }
    return base;
  }, [session, taskRunStates]);

  // 로컬 전송 중이거나 DB에 실행 중인 태스크가 있으면 running
  const isRunning = localRunning || Object.values(statuses).some(
    (s) => s === TaskStatus.RUNNING || s === TaskStatus.PENDING
  );

  const phases = useMemo<Record<string, Phase>>(() => {
    const p: Record<string, Phase> = {};
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.status === TaskStatus.RUNNING && state.phase) p[key] = state.phase;
    }
    return p;
  }, [taskRunStates]);

  const aiResult = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const task of session?.items ?? []) {
      if (task.aiResult) base[String(task.id)] = task.aiResult;
    }
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.aiResult) base[key] = state.aiResult;
    }
    return base;
  }, [session, taskRunStates]);

  const webResult = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const task of session?.items ?? []) {
      if (task.webResult) base[String(task.id)] = task.webResult;
    }
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.webResult) base[key] = state.webResult;
    }
    return base;
  }, [session, taskRunStates]);

  const webModel = useMemo<Record<string, WebModels>>(() => {
    const base: Record<string, WebModels> = {};
    for (const task of session?.items ?? []) {
      if (task.webResult && task.webModel) {
        base[String(task.id)] = { [task.webModel]: task.webResult } as WebModels;
      }
    }
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.webModel) base[key] = state.webModel;
    }
    return base;
  }, [session, taskRunStates]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const runTasks = useCallback(async (tasks: Task[], cloudAiModel?: string, webModel?: string) => {
    if (!session || tasks.length === 0) return;
    const updates: Record<string, { status: TaskStatus; phase: Phase }> = {};
    for (const task of tasks) {
      updates[String(task.id)] = { status: TaskStatus.RUNNING, phase: "searching" };
    }
    setTaskRunStates((prev) => ({ ...prev, ...updates }));

    try {
      await deepResearch(
        id,
        tasks.map((t) => ({ itemId: t.itemId, prompt: t.webSearchPrompt })),
        session.researchLocalAIModel,
        cloudAiModel ?? session.researchCloudAIModel,
        webModel,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "오류";
      setTaskRunStates((prev) => {
        const next = { ...prev };
        for (const task of tasks) {
          next[String(task.id)] = { status: TaskStatus.ERROR, aiResult: msg };
        }
        return next;
      });
    }
  }, [session, id]);

  const handleRunTask = useCallback(async (task: Task, cloudAiModel?: string, webModel?: string) => {
    if (isRunning) return;
    setLocalRunning(true);
    try {
      await runTasks([task], cloudAiModel, webModel);
    } finally {
      setLocalRunning(false);
    }
  }, [isRunning, runTasks]);

  const handleRunAll = useCallback(async (cloudAiModel?: string, webModel?: string) => {
    if (isRunning || !session) return;
    const pendingTasks = (session.items ?? []).filter((t) => {
      const s = statuses[String(t.id)];
      return !s || s === TaskStatus.IDLE || s === TaskStatus.ERROR || s === TaskStatus.STOPPED || s === TaskStatus.ABORTED;
    });

    setLocalRunning(true);
    try {
      await runTasks(pendingTasks, cloudAiModel, webModel);
    } finally {
      setLocalRunning(false);
    }
  }, [isRunning, session, statuses, runTasks]);

  // ******* //
  // 작업 취소 //
  // ******* //
  const handleCancelAll = useCallback(async () => {
    try {
      await stopResearch(id);
      setTaskRunStates((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].status === TaskStatus.RUNNING || next[key].status === TaskStatus.PENDING) {
            next[key] = { ...next[key], status: TaskStatus.STOPPED };
          }
        }
        return next;
      });
    } catch {
      // 중단 실패 시 무시
    }
  }, [id]);

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

  return { statuses, phases, aiResult, webResult, webModel, isRunning, handleRunTask, handleRunAll, handleCancelAll, handleCancelItem, handleDeleteItem };
}
