import { apiFetch } from "./base";

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
}: JobPostingListParams = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (source) params.set("source", source);
  if (search?.trim()) params.set("search", search.trim());
  if (job) params.set("job", job);
  if (companyType) params.set("companyType", companyType);
  if (type) params.set("type", type);
  if (category) params.set("category", category);
  return apiFetch<JobPostingListResponse>(`/job-posting-scraper/data?${params}`);
};

export const startJobScraping = (opts: { jobType?: "INTERN" | "RECRUIT"; fetchDetail?: boolean; source?: "linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all" } = {}) =>
  apiFetch<{ message: string }>("/job-posting-scraper/start", { method: "POST", body: JSON.stringify(opts) });

export const stopJobScraping = () =>
  apiFetch<{ message: string }>("/job-posting-scraper/stop", { method: "POST" });

export const getJobScrapingStatus = () =>
  apiFetch<JobScrapingStatus>("/job-posting-scraper/status");

export const fetchJobPostingDetail = (id: string, url: string, source: string) => {
  const params = new URLSearchParams({ id, url, source });
  return apiFetch<{ companyType?: string; jobs?: string; detailContent?: string; detailHtml?: string }>(
    `/job-posting-scraper/detail?${params}`,
  );
};
