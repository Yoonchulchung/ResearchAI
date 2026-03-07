import { QueueJob } from "@/types";
import { apiFetch } from "./base";

export interface QueueTaskPayload {
  sessionId: string;
  sessionTopic: string;
  taskId: number;
  taskTitle: string;
  taskIcon: string;
  taskPrompt: string;
  model: string;
}

export const queueGetJobs = () =>
  apiFetch<QueueJob[]>("/queue/jobs");

export const queueEnqueueSession = (tasks: QueueTaskPayload[], doneTaskIds?: number[]) =>
  apiFetch<{ ok: boolean }>("/queue/session", {
    method: "POST",
    body: JSON.stringify({ tasks, doneTaskIds }),
  });

export const queueEnqueueTask = (task: QueueTaskPayload) =>
  apiFetch<{ ok: boolean }>("/queue/task", {
    method: "POST",
    body: JSON.stringify(task),
  });

export const queueCancelSession = (sessionId: string) =>
  apiFetch<{ ok: boolean }>(`/queue/sessions/${sessionId}`, { method: "DELETE" });

export const queueDismissCompleted = () =>
  apiFetch<{ ok: boolean }>("/queue/completed", { method: "DELETE" });

// ── External tracking ─────────────────────────────────────────────────────────

export const queueRegisterJob = (task: QueueTaskPayload) =>
  apiFetch<QueueJob>("/queue/register", {
    method: "POST",
    body: JSON.stringify(task),
  });

export const queueUpdateJob = (jobId: string, updates: { status?: string; phase?: string }) =>
  apiFetch<{ ok: boolean }>(`/queue/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });

export const queueRemoveJob = (jobId: string) =>
  apiFetch<{ ok: boolean }>(`/queue/jobs/${jobId}`, { method: "DELETE" });
