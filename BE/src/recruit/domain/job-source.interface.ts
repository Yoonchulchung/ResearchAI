import { JobPosting } from './job-posting.model';

export interface CollectQuery {
  keyword: string;
  location?: string;
  limit?: number;
}

export interface JobSource {
  readonly name: string;
  readonly type: 'crawler' | 'api';
  isAvailable(): boolean;
  collect(query: CollectQuery): AsyncGenerator<JobPosting>;
}
