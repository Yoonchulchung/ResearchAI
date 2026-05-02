import { apiFetch } from "./base";

export type QueueJobStatus = "pending" | "running" | "done" | "error" | "stopped";
export type QueueJobPhase = "searching" | "analyzing";
export type QueueJobTaskType =
  | "lightresearch"
  | "deepresearch"
  | "summary"
  | "writeassist"
  | "writeassist_evaluate"
  | "writeassist_plagiarism"
  | "writeassist_continue"
  | "writeassist_section"
  | "writeassist_improve"
  | "writeassist_spellcheck"
  | "writeassist_summarize"
  | "writeassist_example"
  | "companyprofile"
  | "companyanalysis"
  | "docparse_ask"
  | "docparse_action";

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
  displayTitle?: string;
  displaySubtitle?: string;
  companyName?: string;
  result?: string;
  errorMessage?: string;
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

export const cancelWriteAssist = (jobId: string) =>
  apiFetch(`/queue/write-assist/${jobId}`, { method: "DELETE" });

export const cancelCompanyProfile = (jobId: string) =>
  apiFetch(`/queue/company-profile/${jobId}`, { method: "DELETE" });

export const cancelCompanyAnalysis = (jobId: string) =>
  apiFetch(`/queue/company-analysis/${jobId}`, { method: "DELETE" });

export const cancelDocParse = (jobId: string) =>
  apiFetch(`/queue/doc-parse/${jobId}`, { method: "DELETE" });
