import { JobPosting } from './job-posting.model';

export interface CollectQuery {
  keyword: string;
  location?: string;
  limit?: number;
  /** 기업 규모 필터 (대기업 | 중견기업 | 중소기업 | 스타트업 | 외국계 | 공기업) */
  companyType?: string;
}

export interface JobSource {
  readonly name: string;
  readonly type: 'crawler' | 'api';
  isAvailable(): boolean;
  collect(query: CollectQuery): AsyncGenerator<JobPosting>;
}
