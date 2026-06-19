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
  source?: 'linkareer' | 'catch';
  companyType?: '대기업' | '중견기업' | '중소기업' | '금융권' | string;
  jobCategory?: JobCategory | null;
  company: string;
  position: string;
  season: string;
  spec: string;
  viewCount?: number;
  isHidden?: boolean;
  questions: CoverLetterQuestion[];
  collectedAt: string;
  industry?: string | null;
}

export interface ScrapeOptions {
  startPage?: number;
  maxPages?: number;
  delayMs?: number;
  source?: 'linkareer' | 'catch' | 'all';
  company?: string;
  role?: string;
  keyword?: string;
}

export interface CoverLetterListFilters {
  source?: 'linkareer' | 'catch' | string;
  companyType?: '대기업' | '중견기업' | '중소기업' | '금융권' | string;
  jobCategory?: JobCategory | 'IT+전자' | string;
  search?: string;
  sort?: 'latest';
  hidden?: boolean;
}

export interface CoverLetterQuestionSearchItem extends CoverLetterQuestion {
  id: string;
  coverLetterId: string;
  coverLetter: Omit<CoverLetter, 'questions'>;
}

export type JobCategory =
  | 'IT'
  | '전자'
  | '영업'
  | '경영/기획'
  | '마케팅'
  | '인사/총무'
  | '재무/회계'
  | '생산/제조'
  | '기타';
export type JobCategoryTarget = JobCategory | 'all' | 'IT+전자';

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

export interface CoverLetterJobAnalysisRequest {
  ids?: string[];
  target?: JobCategoryTarget;
  model?: string;
  limit?: number;
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
