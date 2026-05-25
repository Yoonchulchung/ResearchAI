import { apiFetch, API_BASE, getAuthHeaders } from "./base";

export interface PaperSource {
  id: string;
  name: string;
  url: string;
}

export interface Paper {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  authors: string[];
  publishedAt?: string;
  venue?: string;
  upvotes?: number;
  pdfUrl?: string;
  codeUrl?: string;
  tags: string[];
  aiSummary?: string;
  aiSummaryModel?: string;
  aiSummaryAt?: string;
  bookmarked?: boolean;
  readAt?: string;
}

export interface PaperListResult {
  sources: PaperSource[];
  papers: Paper[];
  errors: { sourceId: string; message: string }[];
  fetchedAt: string;
}

export const getPaperById = (id: string) =>
  apiFetch<Paper>(`/papers/${encodeURIComponent(id)}`);

export const listPapers = (params?: { source?: string; limit?: number; refresh?: boolean; bookmarked?: boolean }) => {
  const query = new URLSearchParams();
  if (params?.source) query.set("source", params.source);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.refresh) query.set("refresh", "true");
  if (params?.bookmarked) query.set("bookmarked", "true");

  const qs = query.toString();
  return apiFetch<PaperListResult>(`/papers${qs ? `?${qs}` : ""}`);
};

export const updatePaperBookmark = (id: string, bookmarked: boolean) =>
  apiFetch<Paper>(`/papers/${encodeURIComponent(id)}/bookmark`, {
    method: "PATCH",
    body: JSON.stringify({ bookmarked }),
  });

export const markPaperRead = (id: string, read = true) =>
  apiFetch<Paper>(`/papers/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });

export interface PaperAiSummaryResult {
  id: string;
  aiSummary: string;
  aiSummaryModel: string;
  aiSummaryAt: string;
  cached: boolean;
}

export const summarizePaper = (
  id: string,
  params?: { model?: string; refresh?: boolean },
) =>
  apiFetch<PaperAiSummaryResult>(`/papers/${encodeURIComponent(id)}/ai-summary`, {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });

export const enqueuePaperSummary = (
  id: string,
  params?: { model?: string; refresh?: boolean },
) =>
  apiFetch<{ jobId: string }>("/queue/paper-summary", {
    method: "POST",
    body: JSON.stringify({ id, ...(params ?? {}) }),
  });

export function subscribePaperSummary(
  jobId: string,
  onDone: (result: PaperAiSummaryResult) => void,
  onError: (msg: string) => void,
  onLog?: (msg: string) => void,
  signal?: AbortSignal,
): () => void {
  const url = `${API_BASE}/queue/paper-summary/${jobId}/stream`;
  const es = new EventSource(url);
  let closed = false;

  const close = () => {
    if (!closed) {
      closed = true;
      es.close();
    }
  };

  signal?.addEventListener("abort", close);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "log" && typeof data.message === "string") onLog?.(data.message);
      else if (data.type === "done") {
        onDone(data.payload as PaperAiSummaryResult);
        close();
      } else if (data.type === "error") {
        onError(data.message ?? "오류");
        close();
      }
    } catch {
      // ignore malformed SSE payloads
    }
  };

  es.onerror = () => {
    onError("스트림 연결이 끊겼습니다.");
    close();
  };

  return close;
}

export const cancelPaperSummary = (jobId: string) =>
  fetch(`${API_BASE}/queue/paper-summary/${jobId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

// ---- Trend Summary ----

export interface PaperTrendKeyword {
  keyword: string;
  count: number;
}

export interface PaperTrendSummary {
  summary: string;
  keywords: PaperTrendKeyword[];
  paperCount: number;
  sourceCount: number;
  generatedAt: string;
  cached: boolean;
  model: string;
}

export const getLatestPaperTrendSummary = (params?: { model?: string }) => {
  const query = new URLSearchParams();
  if (params?.model) query.set("model", params.model);
  const qs = query.toString();
  return apiFetch<PaperTrendSummary | null>(`/papers/trends/latest${qs ? `?${qs}` : ""}`);
};

export const enqueuePaperTrend = (params?: { model?: string; refresh?: boolean }) =>
  apiFetch<{ jobId: string }>("/queue/paper-trend", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });

export function subscribePaperTrend(
  jobId: string,
  onChunk: (chunk: string) => void,
  onDone: (result: PaperTrendSummary) => void,
  onError: (msg: string) => void,
  signal?: AbortSignal,
): () => void {
  const url = `${API_BASE}/queue/paper-trend/${jobId}/stream`;
  const es = new EventSource(url);
  let closed = false;

  const close = () => {
    if (!closed) { closed = true; es.close(); }
  };

  signal?.addEventListener("abort", close);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "chunk" && typeof data.text === "string") onChunk(data.text);
      else if (data.type === "done") { onDone(data.payload as PaperTrendSummary); close(); }
      else if (data.type === "error") { onError(data.message ?? "오류"); close(); }
    } catch { /* 무시 */ }
  };

  es.onerror = () => { onError("스트림 연결이 끊겼습니다."); close(); };

  return close;
}

export const cancelPaperTrend = (jobId: string) =>
  fetch(`${API_BASE}/queue/paper-trend/${jobId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
