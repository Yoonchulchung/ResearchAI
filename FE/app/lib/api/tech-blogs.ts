import { apiFetch, API_BASE, getAuthHeaders } from "./base";

export interface TechBlogSource {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  category?: string;
  description?: string[];
}

export interface TechBlogPost {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  thumbnail?: string;
  tags: string[];
}

export interface TechBlogListResult {
  sources: TechBlogSource[];
  posts: TechBlogPost[];
  errors: { sourceId: string; message: string }[];
  fetchedAt: string;
}

export interface TechBlogTrendKeyword {
  keyword: string;
  count: number;
}

export interface TechBlogTrendSummary {
  summary: string;
  keywords: TechBlogTrendKeyword[];
  postCount: number;
  sourceCount: number;
  from: string;
  to: string;
  generatedAt: string;
  cached: boolean;
  model: string;
}

export const listTechBlogPosts = (params?: { source?: string; limit?: number; refresh?: boolean }) => {
  const query = new URLSearchParams();
  if (params?.source) query.set("source", params.source);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.refresh) query.set("refresh", "true");

  const qs = query.toString();
  return apiFetch<TechBlogListResult>(`/tech-blogs/posts${qs ? `?${qs}` : ""}`);
};

export const getTechBlogTrendSummary = (params?: { days?: number; source?: string; model?: string; refresh?: boolean }) => {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.source) query.set("source", params.source);
  if (params?.model) query.set("model", params.model);
  if (params?.refresh) query.set("refresh", "true");

  const qs = query.toString();
  return apiFetch<TechBlogTrendSummary>(`/tech-blogs/trends${qs ? `?${qs}` : ""}`);
};

export const getLatestTechBlogTrendSummary = (params?: { days?: number; source?: string; model?: string }) => {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.source) query.set("source", params.source);
  if (params?.model) query.set("model", params.model);

  const qs = query.toString();
  return apiFetch<TechBlogTrendSummary | null>(`/tech-blogs/trends/latest${qs ? `?${qs}` : ""}`);
};

export const enqueueTechBlogTrend = (params?: {
  days?: number;
  source?: string;
  model?: string;
  refresh?: boolean;
}) =>
  apiFetch<{ jobId: string }>("/queue/tech-blog-trend", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });

export function subscribeTechBlogTrend(
  jobId: string,
  onChunk: (chunk: string) => void,
  onDone: (result: TechBlogTrendSummary) => void,
  onError: (msg: string) => void,
  signal?: AbortSignal,
): () => void {
  const url = `${API_BASE}/queue/tech-blog-trend/${jobId}/stream`;
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
      else if (data.type === "done") { onDone(data.payload as TechBlogTrendSummary); close(); }
      else if (data.type === "error") { onError(data.message ?? "오류"); close(); }
    } catch { /* 무시 */ }
  };

  es.onerror = () => { onError("스트림 연결이 끊겼습니다."); close(); };

  return close;
}

export const cancelTechBlogTrend = (jobId: string) =>
  fetch(`${API_BASE}/queue/tech-blog-trend/${jobId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
