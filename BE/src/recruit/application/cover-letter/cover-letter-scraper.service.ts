import { Injectable } from '@nestjs/common';
import {
  CoverLetter,
  CoverLetterJobAnalysis,
  CoverLetterJobAnalysisRequest,
  CoverLetterListFilters,
  CoverLetterQuestionSearchItem,
  ScrapeOptions,
  ScrapeStatus,
} from 'src/recruit/domain/cover-letter/cover-letter.model';
import { CoverLetterQueryService } from './cover-letter-query.service';
import {
  CoverLetterScrapeEngineService,
  ScrapeByCompanyEvent,
} from './cover-letter-scrape-engine.service';
import { CoverLetterSpecAnalysisService } from './cover-letter-spec-analysis.service';

/**
 * 얇은 파사드 — 컨트롤러가 단일 진입점으로 사용.
 * 비즈니스 로직은 Query / ScrapeEngine / SpecAnalysis 서비스에 있음.
 */
@Injectable()
export class CoverLetterScraperService {
  constructor(
    private readonly query: CoverLetterQueryService,
    private readonly engine: CoverLetterScrapeEngineService,
    private readonly specAnalysis: CoverLetterSpecAnalysisService,
  ) {}

  // ── Status / scraping ──────────────────────────────────────────────────────
  getStatus(): ScrapeStatus {
    return this.engine.getStatus();
  }
  startScraping(opts: ScrapeOptions = {}): Promise<{ message: string }> {
    return this.engine.startScraping(opts);
  }
  stopScraping(): { message: string } {
    return this.engine.stopScraping();
  }
  scrapeByCompany(
    company: string,
    maxPages?: number,
    delayMs?: number,
  ): Promise<{ collected: number; skipped: number; errors: number; company: string }> {
    return this.engine.scrapeByCompany(company, maxPages, delayMs);
  }
  scrapeByCompanyWithProgress(
    company: string,
    maxPages: number,
    delayMs: number,
    onProgress: (event: ScrapeByCompanyEvent) => void,
  ): Promise<{ collected: number; skipped: number; errors: number; company: string }> {
    return this.engine.scrapeByCompany(company, maxPages, delayMs, onProgress);
  }
  backfillJobCategories(): Promise<{ updated: number }> {
    return this.engine.backfillJobCategories();
  }
  backfillQuestionRows(): Promise<{ updated: number }> {
    return this.engine.backfillQuestionRows();
  }

  // ── Read ───────────────────────────────────────────────────────────────────
  getData(
    page: number,
    limit: number,
    filters: CoverLetterListFilters = {},
    offset?: number,
  ) {
    return this.query.getData(page, limit, filters, offset);
  }
  getById(id: string): Promise<CoverLetter | null> {
    return this.query.getById(id);
  }
  setHidden(id: string, isHidden: boolean): Promise<CoverLetter | null> {
    return this.query.setHidden(id, isHidden);
  }
  searchQuestions(
    query: string,
    limit = 20,
    offset = 0,
    sortDir: 'asc' | 'desc' = 'desc',
  ): Promise<{ items: CoverLetterQuestionSearchItem[]; total: number; hasMore: boolean }> {
    return this.query.searchQuestions(query, limit, offset, sortDir);
  }

  // ── Spec analysis ──────────────────────────────────────────────────────────
  analyzeJobsWithAi(request: CoverLetterJobAnalysisRequest = {}): Promise<{
    items: CoverLetterJobAnalysis[];
    target: import('src/recruit/domain/cover-letter/cover-letter.model').JobCategoryTarget;
    analyzedAt: string;
    model: string;
  }> {
    return this.specAnalysis.analyzeJobsWithAi(request);
  }
  getSpecAnalyses(ids: string[]): Promise<CoverLetterJobAnalysis[]> {
    return this.specAnalysis.getSpecAnalyses(ids);
  }
}
