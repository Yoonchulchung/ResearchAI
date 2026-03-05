import { JobPosting } from './job-posting.model';

export interface CollectQuery {
  keyword: string;
  location?: string;
  limit?: number;
  /** 기업 규모 필터 (OR 조건) — 예: ['대기업', '중견기업', '외국계'] */
  companyTypes?: string[];
  /** 경력 구분 필터 (OR 조건) — 예: ['신입', '경력', '인턴'] */
  jobTypes?: string[];
}

export interface JobSource {
  readonly name: string;
  readonly type: 'crawler' | 'api';
  isAvailable(): boolean;
  collect(query: CollectQuery): AsyncGenerator<JobPosting>;
}
