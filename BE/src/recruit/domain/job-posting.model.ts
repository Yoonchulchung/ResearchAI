export type JobPostingSource = string;
export type JobPostingSourceType = 'crawler' | 'api';

export interface JobPosting {
  id: string;
  source?: JobPostingSource;
  sourceType?: JobPostingSourceType;
  title: string;
  company: string;
  location: string;
  description?: string;
  skills?: string[];
  url: string;

  companyType?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  deadline?: string;
  jobs?: string;
  homepage?: string;
  viewCount?: number;
  detailContent?: string;
  detailHtml?: string;
  postedAt?: string | null;
  favorite?: boolean;
  appliedAt?: string | null;
  collectedAt: string;
}

export interface JobPostingScrapeOptions {
  startPage?: number;
  maxPages?: number;
  delayMs?: number;
  jobType?: 'INTERN' | 'RECRUIT';
  status?: 'OPEN' | 'ALL';
  fetchDetail?: boolean;
  source?: JobPostingSource | 'all';
  jobkoreaCompanyTypes?: string[];
}

export interface JobPostingListFilters {
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
  sort?: 'latest' | 'deadline';
  favorite?: boolean;
}

export interface JobPostingFilterOptions {
  jobs: string[];
  companyTypes: string[];
  types: string[];
  categories: string[];
}

export interface JobPostingScrapeStatus {
  running: boolean;
  currentPage: number;
  totalCollected: number;
  totalSkipped: number;
  errors: number;
  startedAt: string | null;
  lastActivity: string | null;
}
