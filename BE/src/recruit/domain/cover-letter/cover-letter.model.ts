export interface CoverLetterQuestion {
  number: number;
  question: string;
  answer: string;
}

export interface CoverLetter {
  id: string;
  url: string;
  source?: 'linkareer' | 'catch';
  companyType?: '대기업' | '중견기업' | '중소기업' | '금융권' | string;
  company: string;
  position: string;
  season: string;
  spec: string;
  viewCount?: number;
  questions: CoverLetterQuestion[];
  collectedAt: string;
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
  search?: string;
  sort?: 'latest';
}

export interface CoverLetterJobAnalysis {
  id: string;
  jobCategory: 'IT' | '전자' | '기타';
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
  target?: 'IT' | '전자' | 'all';
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
