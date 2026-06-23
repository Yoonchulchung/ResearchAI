import { apiFetch } from "../base";

const JOB_POSTING_API_BASE = "/recruit/job-postings";

export interface JobPosting {
  id: string;
  url: string;
  company: string;
  companyType?: string;
  title: string;
  type: string;
  location: string;
  startDate?: string;
  endDate?: string;
  deadline: string;
  jobs?: string;
  homepage?: string;
  category: string;
  viewCount: number;
  detailContent?: string;
  detailHtml?: string;
  favorite?: boolean;
  appliedAt?: string | null;
  collectedAt: string;
  source?: string;
}

export interface JobPostingListResponse {
  items: JobPosting[];
  total: number;
  filterOptions: JobPostingFilterOptions;
}

export interface JobPostingFilterOptions {
  jobs: string[];
  companyTypes: string[];
  types: string[];
  categories: string[];
}

export interface JobPostingListParams {
  page?: number;
  limit?: number;
  source?: string;
  company?: string;
  search?: string;
  job?: string;
  companyType?: string;
  excludeCompanyType?: string;
  type?: string;
  category?: string;
  scheduleFrom?: string;
  scheduleTo?: string;
  sort?: "latest" | "deadline";
  favorite?: boolean;
}

export interface JobScrapingStatus {
  running: boolean;
  currentPage: number;
  totalCollected: number;
  totalSkipped: number;
  errors: number;
  startedAt: string | null;
  lastActivity: string | null;
}

export const listJobPostings = ({
  page = 1,
  limit = 30,
  source,
  company,
  search,
  job,
  companyType,
  excludeCompanyType,
  type,
  category,
  scheduleFrom,
  scheduleTo,
  sort,
  favorite,
}: JobPostingListParams = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (source) params.set("source", source);
  if (company?.trim()) params.set("company", company.trim());
  if (search?.trim()) params.set("search", search.trim());
  if (job) params.set("job", job);
  if (companyType) params.set("companyType", companyType);
  if (excludeCompanyType) params.set("excludeCompanyType", excludeCompanyType);
  if (type) params.set("type", type);
  if (category) params.set("category", category);
  if (scheduleFrom) params.set("scheduleFrom", scheduleFrom);
  if (scheduleTo) params.set("scheduleTo", scheduleTo);
  if (sort) params.set("sort", sort);
  if (favorite) params.set("favorite", "true");
  return apiFetch<JobPostingListResponse>(`${JOB_POSTING_API_BASE}/data?${params}`);
};

export const getJobPosting = (id: string) =>
  apiFetch<JobPosting>(`${JOB_POSTING_API_BASE}/data/${encodeURIComponent(id)}`);

export const JOBKOREA_COMPANY_TYPES = ["대기업", "중견기업", "외국계기업", "공공기관"] as const;
export type JobkoreaCompanyType = (typeof JOBKOREA_COMPANY_TYPES)[number];

export const startJobScraping = (opts: {
  jobType?: "INTERN" | "RECRUIT";
  fetchDetail?: boolean;
  source?: "linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all";
  jobkoreaCompanyTypes?: JobkoreaCompanyType[];
} = {}) =>
  apiFetch<{ message: string }>(`${JOB_POSTING_API_BASE}/start`, { method: "POST", body: JSON.stringify(opts) });

export const stopJobScraping = () =>
  apiFetch<{ message: string }>(`${JOB_POSTING_API_BASE}/stop`, { method: "POST" });

export const getJobScrapingStatus = () =>
  apiFetch<JobScrapingStatus>(`${JOB_POSTING_API_BASE}/status`);

export const getPopularJobPostings = () =>
  apiFetch<JobPosting[]>(`${JOB_POSTING_API_BASE}/popular`);

export const fetchJobPostingDetail = (id: string, url: string, source: string) => {
  const params = new URLSearchParams({ id, url, source });
  return apiFetch<{ companyType?: string; jobs?: string; detailContent?: string; detailHtml?: string }>(
    `${JOB_POSTING_API_BASE}/detail?${params}`,
  );
};

export const setJobPostingFavorite = (id: string, favorite: boolean) =>
  apiFetch<{ id: string; favorite: boolean }>(`${JOB_POSTING_API_BASE}/data/${encodeURIComponent(id)}/favorite`, {
    method: favorite ? "POST" : "DELETE",
  });

export const setJobPostingApplied = (id: string, appliedAt: string | null) =>
  apiFetch<{ id: string; appliedAt: string | null }>(`${JOB_POSTING_API_BASE}/data/${encodeURIComponent(id)}/applied`, {
    method: "PATCH",
    body: JSON.stringify({ appliedAt }),
  });

export type AiAnalysisMode = "analysis" | "interview";

export const getJobPostingAiAnalysis = (id: string, mode: AiAnalysisMode) =>
  apiFetch<{ id: string; mode: AiAnalysisMode; text: string | null; docId: string | null }>(
    `${JOB_POSTING_API_BASE}/data/${encodeURIComponent(id)}/ai-analysis?mode=${mode}`,
  );

export const saveJobPostingAiAnalysis = (id: string, mode: AiAnalysisMode, text: string, docId?: string | null) =>
  apiFetch<{ ok: boolean }>(`${JOB_POSTING_API_BASE}/data/${encodeURIComponent(id)}/ai-analysis`, {
    method: "POST",
    body: JSON.stringify({ mode, text, docId }),
  });

export const getPostingImageFiles = (html: string) =>
  apiFetch<{ files: string[] }>(`${JOB_POSTING_API_BASE}/data/image-files`, {
    method: "POST",
    body: JSON.stringify({ html }),
  });

// ── 채용 상세 수집 ──────────────────────────────────────────────────────

export interface CollectDetailConfig {
  model?: string;
  enableVlm?: boolean;
  skipAiSteps?: boolean;
  maxItems?: number;
  skipExisting?: boolean;
  companyTypes?: string[];
  jobTypes?: string[];
  jobs?: string[];
}

export interface CollectDetailStatus {
  running: boolean;
  total: number;
  processed: number;
  startedAt: string | null;
  lastActivity: string | null;
  lastRunAt: string | null;
  model: string;
  enableVlm: boolean;
}

export const startCollectDetail = (config?: CollectDetailConfig) =>
  apiFetch<{ message: string }>(`${JOB_POSTING_API_BASE}/collect-detail/start`, {
    method: "POST",
    body: JSON.stringify(config ?? {}),
  });

export const previewCollectCount = (config: CollectDetailConfig) =>
  apiFetch<{ total: number }>(`${JOB_POSTING_API_BASE}/collect-detail/preview`, {
    method: "POST",
    body: JSON.stringify(config),
  });

export const stopCollectDetail = () =>
  apiFetch<{ message: string }>(`${JOB_POSTING_API_BASE}/collect-detail/stop`, { method: "POST" });

export const getCollectDetailStatus = () =>
  apiFetch<CollectDetailStatus>(`${JOB_POSTING_API_BASE}/collect-detail/status`);

export interface JobRecommendation {
  id: number;
  jobPostingId: string;
  score: number;
  reason: string | null;
  matchPoints: string[];
  recommendedAt: string;
  title: string;
  company: string;
  companyType: string | null;
  type: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  deadline: string | null;
  jobs: string | null;
  source: string | null;
  appliedAt: string | null;
  url: string;
}

export const getJobRecommendations = (limit = 20) =>
  apiFetch<JobRecommendation[]>(`${JOB_POSTING_API_BASE}/collect-detail/recommendations?limit=${limit}`);

export const deleteJobRecommendation = (id: number) =>
  apiFetch<{ message: string }>(`${JOB_POSTING_API_BASE}/collect-detail/recommendations/${id}`, { method: "DELETE" });
