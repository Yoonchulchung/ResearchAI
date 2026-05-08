import { apiFetch } from "./base";

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

export interface CoverLetterListResponse {
  items: CoverLetter[];
  total: number;
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

export const listCoverLetters = (page = 1, limit = 20) =>
  apiFetch<CoverLetterListResponse>(`/cover-letter-scraper/data?page=${page}&limit=${limit}`);

export const startScraping = (opts: { company?: string; role?: string; keyword?: string } = {}) =>
  apiFetch<{ message: string }>("/cover-letter-scraper/start", { method: "POST", body: JSON.stringify(opts) });

export const stopScraping = () =>
  apiFetch<{ message: string }>("/cover-letter-scraper/stop", { method: "POST" });

export const getScrapingStatus = () =>
  apiFetch<ScrapeStatus>("/cover-letter-scraper/status");
