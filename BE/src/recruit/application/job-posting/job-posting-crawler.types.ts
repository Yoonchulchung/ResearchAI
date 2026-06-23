import type { JobPosting } from 'src/recruit/domain/job-posting.model';

export const JOB_POSTING_CRAWLER_SOURCES = [
  'linkareer',
  'jobkorea',
  'catch',
  'jobplanet',
  'jobda',
] as const;

export type JobPostingCrawlerSource =
  (typeof JOB_POSTING_CRAWLER_SOURCES)[number];

export type JobkoreaCompanyType =
  | '대기업'
  | '중견기업'
  | '외국계기업'
  | '공공기관';

export interface JobPostingPageRequest {
  page: number;
  pageSize?: number;
  jobType?: 'INTERN' | 'RECRUIT';
  status?: 'OPEN' | 'ALL';
  companyType?: JobkoreaCompanyType;
}

export interface JobPostingDetailRequest {
  id: string;
  url: string;
}

export type JobPostingDetail = Pick<
  JobPosting,
  'companyType' | 'jobs' | 'detailContent' | 'detailHtml'
>;
