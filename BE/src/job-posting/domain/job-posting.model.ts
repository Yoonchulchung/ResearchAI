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
  source?: 'linkareer' | 'jobkorea' | 'catch' | 'jobplanet' | 'jobda';
}

export interface JobPostingScrapeOptions {
  startPage?: number;
  maxPages?: number;
  delayMs?: number;
  jobType?: 'INTERN' | 'RECRUIT';
  status?: 'OPEN' | 'ALL';
  fetchDetail?: boolean;
  source?: 'linkareer' | 'jobkorea' | 'catch' | 'jobplanet' | 'jobda' | 'all';
}

export interface JobPostingListFilters {
  source?: string;
  search?: string;
  job?: string;
  companyType?: string;
  type?: string;
  category?: string;
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
