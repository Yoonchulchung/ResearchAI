import { apiFetch } from "./base";

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
