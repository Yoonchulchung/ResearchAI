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

export const listTechBlogPosts = (params?: { source?: string; limit?: number; refresh?: boolean }) => {
  const query = new URLSearchParams();
  if (params?.source) query.set("source", params.source);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.refresh) query.set("refresh", "true");

  const qs = query.toString();
  return apiFetch<TechBlogListResult>(`/tech-blogs/posts${qs ? `?${qs}` : ""}`);
};
