import { apiFetch } from "../base";

export interface CompanyNewsItem {
  id: string;
  resumeId: string;
  companyName: string;
  searchId: string | null;
  itemId: string;
  title: string;
  searchQuery: string;
  detailJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyJdEval {
  id: string;
  resumeId: string;
  companyName: string;
  jdText: string;
  result: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export const getCompanyNews = (resumeId: string, companyName?: string) =>
  apiFetch<CompanyNewsItem[]>(
    `/resume/${encodeURIComponent(resumeId)}/company-news${companyName ? `?companyName=${encodeURIComponent(companyName)}` : ""}`,
  );

export const upsertCompanyNewsItem = (
  resumeId: string,
  data: { companyName: string; itemId: string; title: string; searchQuery: string; searchId?: string },
) =>
  apiFetch<CompanyNewsItem>(`/resume/${encodeURIComponent(resumeId)}/company-news`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateCompanyNewsDetail = (id: string, detailJson: string) =>
  apiFetch<{ ok: boolean }>(`/resume/company-news/${encodeURIComponent(id)}/detail`, {
    method: "PATCH",
    body: JSON.stringify({ detailJson }),
  });

export const deleteCompanyNews = (id: string) =>
  apiFetch<{ ok: boolean }>(`/resume/company-news/${encodeURIComponent(id)}`, { method: "DELETE" });

export const deepSearchCompanyNewsItem = (
  id: string,
  data: { query: string; model?: string },
  signal?: AbortSignal,
) =>
  apiFetch<{ aiResult: string; confidence: { score: number; reason: string } }>(
    `/resume/company-news/${encodeURIComponent(id)}/deep-search`,
    { method: "POST", body: JSON.stringify(data), signal },
  );

export const deleteCompanyNewsByResume = (resumeId: string, companyName?: string) =>
  apiFetch<{ ok: boolean }>(
    `/resume/${encodeURIComponent(resumeId)}/company-news${companyName ? `?companyName=${encodeURIComponent(companyName)}` : ""}`,
    { method: "DELETE" },
  );

// ── JD 관련 뉴스 검색 ─────────────────────────────────────────────────────────

export interface JdNewsItem {
  title: string;
  url: string;
  snippet: string;
  date: string;
  source: string;
}

export const searchJdNews = (query: string, limit = 10) =>
  apiFetch<{ items: JdNewsItem[] }>("/resume/jd-news-search", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });

export const scrapeJdNewsArticle = (url: string) =>
  apiFetch<{ title: string; text: string }>("/resume/jd-news-search/article", {
    method: "POST",
    body: JSON.stringify({ url }),
  });

export const getCompanyJdEval = (resumeId: string) =>
  apiFetch<CompanyJdEval | null>(`/resume/${encodeURIComponent(resumeId)}/jd-eval`);

export const upsertCompanyJdEval = (
  resumeId: string,
  data: { companyName: string; jdText: string; result: string; model?: string },
) =>
  apiFetch<CompanyJdEval>(`/resume/${encodeURIComponent(resumeId)}/jd-eval`, {
    method: "POST",
    body: JSON.stringify(data),
  });
