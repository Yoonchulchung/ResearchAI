import { apiFetch } from "./base";

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
