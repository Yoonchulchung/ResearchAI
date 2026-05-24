import { apiFetch, API_BASE, getAuthHeaders } from "./base";

export interface HotPaperSource {
  id: string;
  name: string;
  url: string;
}

export interface HotPaper {
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
}

export interface HotPaperListResult {
  sources: HotPaperSource[];
  papers: HotPaper[];
  errors: { sourceId: string; message: string }[];
  fetchedAt: string;
}

export const listHotPapers = (params?: { source?: string; limit?: number; refresh?: boolean }) => {
  const query = new URLSearchParams();
  if (params?.source) query.set("source", params.source);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.refresh) query.set("refresh", "true");

  const qs = query.toString();
  return apiFetch<HotPaperListResult>(`/hot-papers${qs ? `?${qs}` : ""}`);
};

export interface HotPaperAiSummaryResult {
  id: string;
  aiSummary: string;
  aiSummaryModel: string;
  aiSummaryAt: string;
  cached: boolean;
}

export const summarizeHotPaper = (
  id: string,
  params?: { model?: string; refresh?: boolean },
) =>
  apiFetch<HotPaperAiSummaryResult>(`/hot-papers/${encodeURIComponent(id)}/ai-summary`, {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });

export const enqueueHotPaperSummary = (
  id: string,
  params?: { model?: string; refresh?: boolean },
) =>
  apiFetch<{ jobId: string }>("/queue/hot-paper-summary", {
    method: "POST",
    body: JSON.stringify({ id, ...(params ?? {}) }),
  });

export function subscribeHotPaperSummary(
  jobId: string,
  onDone: (result: HotPaperAiSummaryResult) => void,
  onError: (msg: string) => void,
  onLog?: (msg: string) => void,
  signal?: AbortSignal,
): () => void {
  const url = `${API_BASE}/queue/hot-paper-summary/${jobId}/stream`;
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
        onDone(data.payload as HotPaperAiSummaryResult);
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

export const cancelHotPaperSummary = (jobId: string) =>
  fetch(`${API_BASE}/queue/hot-paper-summary/${jobId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
