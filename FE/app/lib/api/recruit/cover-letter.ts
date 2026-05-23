import { apiFetch } from "../base";

export interface CoverLetterQuestion {
  number: number;
  question: string;
  answer: string;
}

export interface CoverLetter {
  id: string;
  url: string;
  source?: "linkareer" | "catch";
  companyType?: "대기업" | "중견기업" | "중소기업" | "금융권" | string;
  company: string;
  position: string;
  season: string;
  spec: string;
  viewCount?: number;
  questions: CoverLetterQuestion[];
  collectedAt: string;
}

export interface CoverLetterJobAnalysis {
  id: string;
  jobCategory: "IT" | "전자" | "기타";
  confidence: number;
  reason: string;
  extractedSpec: {
    school?: string;
    major?: string;
    gpa?: string;
    languages?: string[];
    certificates?: string[];
    internships?: string[];
    activities?: string[];
    awards?: string[];
    skills?: string[];
    summary: string;
  };
}

export interface CoverLetterJobAnalysisResponse {
  items: CoverLetterJobAnalysis[];
  target: "IT" | "전자" | "all";
  analyzedAt: string;
  model: string;
}

export interface CoverLetterListResponse {
  items: CoverLetter[];
  total: number;
}

export interface ScrapeStatus {
  running: boolean;
  currentPage: number;
  totalCollected: number;
  totalSkipped: number;
  errors: number;
  startedAt: string | null;
  lastActivity: string | null;
}

export const listCoverLetters = (
  page = 1,
  limit = 20,
  filters: { source?: string; companyType?: string; search?: string; sort?: "latest" } = {},
) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.source) params.set("source", filters.source);
  if (filters.companyType) params.set("companyType", filters.companyType);
  if (filters.search) params.set("search", filters.search);
  if (filters.sort) params.set("sort", filters.sort);
  return apiFetch<CoverLetterListResponse>(`/cover-letter-scraper/data?${params}`);
};

export const getCoverLetter = (id: string) =>
  apiFetch<CoverLetter>(`/cover-letter-scraper/data/${encodeURIComponent(id)}`);

export const startScraping = (opts: { source?: "linkareer" | "catch" | "all"; company?: string; role?: string; keyword?: string } = {}) =>
  apiFetch<{ message: string }>("/cover-letter-scraper/start", { method: "POST", body: JSON.stringify(opts) });

export const stopScraping = () =>
  apiFetch<{ message: string }>("/cover-letter-scraper/stop", { method: "POST" });

export const getScrapingStatus = () =>
  apiFetch<ScrapeStatus>("/cover-letter-scraper/status");

export const analyzeCoverLetterJobs = (opts: {
  ids?: string[];
  target?: "IT" | "전자" | "all";
  model?: string;
  limit?: number;
}) =>
  apiFetch<CoverLetterJobAnalysisResponse>("/cover-letter-scraper/ai-job-analysis", {
    method: "POST",
    body: JSON.stringify(opts),
  });
