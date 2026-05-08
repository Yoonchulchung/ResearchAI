export interface CoverLetterQuestion {
  number: number;
  question: string;
  answer: string;
}

export interface CoverLetter {
  id: string;
  url: string;
  company: string;
  position: string;
  season: string;
  spec: string;
  questions: CoverLetterQuestion[];
  collectedAt: string;
}

export interface ScrapeOptions {
  startPage?: number;
  maxPages?: number;
  delayMs?: number;
  company?: string;
  role?: string;
  keyword?: string;
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
