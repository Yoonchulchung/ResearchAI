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
  collectedAt: string;
  source?: "linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda";
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
  search?: string;
  job?: string;
  companyType?: string;
  type?: string;
  category?: string;
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
  search,
  job,
  companyType,
  type,
  category,
  sort,
  favorite,
}: JobPostingListParams = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (source) params.set("source", source);
  if (search?.trim()) params.set("search", search.trim());
  if (job) params.set("job", job);
  if (companyType) params.set("companyType", companyType);
  if (type) params.set("type", type);
  if (category) params.set("category", category);
  if (sort) params.set("sort", sort);
  if (favorite) params.set("favorite", "true");
  return apiFetch<JobPostingListResponse>(`${JOB_POSTING_API_BASE}/data?${params}`);
};

export const getJobPosting = (id: string) =>
  apiFetch<JobPosting>(`${JOB_POSTING_API_BASE}/data/${encodeURIComponent(id)}`);

export const startJobScraping = (opts: { jobType?: "INTERN" | "RECRUIT"; fetchDetail?: boolean; source?: "linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all" } = {}) =>
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
