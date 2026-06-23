import { API_BASE, apiFetch, getAuthHeaders, readSSE } from "../base";

export interface CoverLetterQuestion {
  number: number;
  question: string;
  answer: string;
  keywords?: string[];
  tags?: string[];
}

export interface CoverLetter {
  id: string;
  url: string;
  source?: "linkareer" | "catch";
  companyType?: "대기업" | "중견기업" | "중소기업" | "금융권" | string;
  jobCategory?: JobCategory | null;
  company: string;
  position: string;
  season: string;
  spec: string;
  viewCount?: number;
  isHidden?: boolean;
  questions: CoverLetterQuestion[];
  collectedAt: string;
}

export type JobCategory = "IT" | "전자" | "영업" | "경영/기획" | "마케팅" | "인사/총무" | "재무/회계" | "생산/제조" | "기타";
export type JobCategoryTarget = JobCategory | "all" | "IT+전자";

export interface CoverLetterJobAnalysis {
  id: string;
  jobCategory: JobCategory;
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
  target: JobCategory | "all";
  analyzedAt: string;
  model: string;
}

export interface CoverLetterListResponse {
  items: CoverLetter[];
  total: number;
  page?: number;
  limit?: number;
  offset?: number;
  hasNext?: boolean;
}

export interface CoverLetterQuestionSearchItem extends CoverLetterQuestion {
  id: string;
  coverLetterId: string;
  coverLetter: Omit<CoverLetter, "questions">;
}

export interface CoverLetterQuestionSearchResponse {
  items: CoverLetterQuestionSearchItem[];
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
  filters: { source?: string; companyType?: string; jobCategory?: JobCategoryTarget | string; search?: string; sort?: "latest"; offset?: number; hidden?: boolean } = {},
) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (typeof filters.offset === "number" && Number.isFinite(filters.offset)) params.set("offset", String(filters.offset));
  if (filters.source) params.set("source", filters.source);
  if (filters.companyType) params.set("companyType", filters.companyType);
  if (filters.jobCategory && filters.jobCategory !== "all") params.set("jobCategory", filters.jobCategory);
  if (filters.search) params.set("search", filters.search);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.hidden) params.set("hidden", "true");
  return apiFetch<CoverLetterListResponse>(`/cover-letter-scraper/data?${params}`);
};

export const getCoverLetter = (id: string) =>
  apiFetch<CoverLetter>(`/cover-letter-scraper/data/${encodeURIComponent(id)}`);

export const setCoverLetterHidden = (id: string, isHidden: boolean) =>
  apiFetch<CoverLetter>(`/cover-letter-scraper/data/${encodeURIComponent(id)}/hidden`, {
    method: "POST",
    body: JSON.stringify({ isHidden }),
  });

export const searchCoverLetterQuestions = (
  q: string,
  limit = 20,
  offset = 0,
  sortDir: 'asc' | 'desc' = 'desc',
) => {
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset), sortDir });
  return apiFetch<CoverLetterQuestionSearchResponse & { hasMore: boolean }>(
    `/cover-letter-scraper/questions?${params}`,
  );
};

export const backfillCategories = (): Promise<{ updated: number }> =>
  apiFetch<{ updated: number }>("/cover-letter-scraper/backfill-categories", { method: "POST" });

export type ScrapeByCompanyEvent =
  | { type: "page"; page: number; total: number; found: number }
  | { type: "item"; index: number; pageTotal: number; position: string; season: string; isNew: boolean }
  | { type: "done"; collected: number; skipped: number; errors: number; company: string }
  | { type: "error"; message: string };

export function createScrapeByCompanySSE(
  company: string,
  opts: { maxPages?: number; delayMs?: number } = {},
): EventSource {
  const qs = new URLSearchParams({ company });
  if (opts.maxPages) qs.set("maxPages", String(opts.maxPages));
  if (opts.delayMs) qs.set("delayMs", String(opts.delayMs));
  return new EventSource(`${API_BASE}/cover-letter-scraper/scrape-by-company/stream?${qs}`);
}

export const startScraping = (opts: { source?: "linkareer" | "catch" | "all"; company?: string; role?: string; keyword?: string } = {}) =>
  apiFetch<{ message: string }>("/cover-letter-scraper/start", { method: "POST", body: JSON.stringify(opts) });

export const stopScraping = () =>
  apiFetch<{ message: string }>("/cover-letter-scraper/stop", { method: "POST" });

export const getScrapingStatus = () =>
  apiFetch<ScrapeStatus>("/cover-letter-scraper/status");

export const analyzeCoverLetterJobs = (opts: {
  ids?: string[];
  target?: JobCategoryTarget;
  model?: string;
  limit?: number;
}) =>
  apiFetch<CoverLetterJobAnalysisResponse>("/cover-letter-scraper/ai-job-analysis", {
    method: "POST",
    body: JSON.stringify(opts),
  });

export const getSpecAnalyses = (ids: string[]) => {
  if (ids.length === 0) return Promise.resolve([] as CoverLetterJobAnalysis[]);
  const params = new URLSearchParams({ ids: ids.join(",") });
  return apiFetch<CoverLetterJobAnalysis[]>(`/cover-letter-scraper/spec-analyses?${params}`);
};

export type SpecAnalysisEvent =
  | { type: "log"; message: string }
  | { type: "done"; payload?: CoverLetterJobAnalysisResponse }
  | { type: "error"; message: string };

export const enqueueSpecAnalysis = (opts: {
  ids?: string[];
  target?: JobCategoryTarget;
  model?: string;
  limit?: number;
}): Promise<{ jobId: string }> =>
  apiFetch<{ jobId: string }>("/queue/spec-analysis", {
    method: "POST",
    body: JSON.stringify(opts),
  });

export async function streamSpecAnalysis(
  jobId: string,
  onEvent: (event: SpecAnalysisEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/spec-analysis/${jobId}/stream`, {
    headers: getAuthHeaders(),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("스펙 분석 스트림 연결에 실패했습니다.");
  await readSSE<SpecAnalysisEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done" || event.type === "error") return true;
  });
}
