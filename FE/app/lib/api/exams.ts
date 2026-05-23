import { apiFetch } from "./base";

export interface ExamEvent {
  id: string;
  source: "dataq";
  groupId: string;
  phase: string;
  title: string;
  shortTitle: string;
  start: string;
  end: string;
  examOperationSeq: number | null;
  description: string;
  sourceUrl: string;
  collectedAt: string;
}

export interface ExamEventListResponse {
  items: ExamEvent[];
  total: number;
  fetchedAt: string | null;
  errors: string[];
}

export const listExamEvents = (params: { from?: string; to?: string; refresh?: boolean } = {}) => {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.refresh) search.set("refresh", "true");
  const suffix = search.toString() ? `?${search}` : "";
  return apiFetch<ExamEventListResponse>(`/exams${suffix}`);
};

