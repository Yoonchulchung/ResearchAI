import { apiFetch } from "./base";

export type QueueJobStatus = "pending" | "running" | "done" | "error" | "stopped";
export type QueueJobPhase = "searching" | "analyzing";
export type QueueJobTaskType = "lightresearch" | "deepresearch" | "summary";

export interface WebSources {
  tavily?: string;
  serper?: string;
  naver?: string;
  brave?: string;
  ollama?: string;
}

export interface QueueJobSummary {
  jobId: string;
  sessionId: string;
  itemId: string;
  taskType: QueueJobTaskType;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  webSources?: WebSources;
}

export interface QueueStatus {
  running: boolean;
  total: number;
  pending: number;
  running_jobs: number;
  done: number;
  error: number;
  stopped: number;
  jobs: QueueJobSummary[];
}

export const getQueueStatus = () => apiFetch<QueueStatus>("/queue/status");

export const cancelSummary = (sessionId: string) =>
  apiFetch(`/queue/sessions/${sessionId}/summary`, { method: "DELETE" });
