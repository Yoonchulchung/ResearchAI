import { Injectable } from '@nestjs/common';
import type {
  JobPosting,
  JobPostingFilterOptions,
  JobPostingListFilters,
  JobPostingScrapeOptions,
  JobPostingScrapeStatus,
} from 'src/recruit/domain/job-posting.model';
import { JobPostingImageService } from './job-posting/job-posting-image.service';
import { JobPostingDetailService } from './job-posting/job-posting-detail.service';
import { JobPostingQueryService } from './job-posting/job-posting-query.service';
import { JobPostingScrapeEngineService } from './job-posting/job-posting-scrape-engine.service';
import { matchesCategoryFilter } from './job-posting/job-posting.utils';

export { matchesCategoryFilter } from './job-posting/job-posting.utils';

/**
 * 얇은 파사드 — 컨트롤러가 단일 진입점으로 사용.
 * 비즈니스 로직은 Image / Detail / Query / ScrapeEngine 서비스에 있음.
 */
@Injectable()
export class JobPostingScraperService {
  constructor(
    private readonly imageService: JobPostingImageService,
    private readonly detailService: JobPostingDetailService,
    private readonly querySvc: JobPostingQueryService,
    private readonly engineSvc: JobPostingScrapeEngineService,
  ) {}

  // ── Status / scraping ──────────────────────────────────────────────────────
  getStatus(): JobPostingScrapeStatus {
    return this.engineSvc.getStatus();
  }
  startScraping(
    opts: JobPostingScrapeOptions = {},
  ): Promise<{ message: string }> {
    return this.engineSvc.startScraping(opts);
  }
  stopScraping(): { message: string } {
    return this.engineSvc.stopScraping();
  }

  // ── Read ───────────────────────────────────────────────────────────────────
  getData(
    page: number,
    limit: number,
    filters: JobPostingListFilters = {},
  ): Promise<{
    items: JobPosting[];
    total: number;
    filterOptions: JobPostingFilterOptions;
  }> {
    return this.querySvc.getData(page, limit, filters);
  }
  getPostingById(id: string): Promise<JobPosting | null> {
    return this.querySvc.getPostingById(id);
  }
  setFavorite(id: string, favorite: boolean) {
    return this.querySvc.setFavorite(id, favorite);
  }
  setApplied(id: string, appliedAt: string | null) {
    return this.querySvc.setApplied(id, appliedAt);
  }
  getPopularPostings(): Promise<JobPosting[]> {
    return this.querySvc.getPopularPostings();
  }

  // ── Detail & AI ───────────────────────────────────────────────────────────
  fetchDetailContent(id: string, url: string, source: string) {
    return this.detailService.fetchDetailContent(id, url, source);
  }
  getAiAnalysis(id: string, mode: 'analysis' | 'interview') {
    return this.detailService.getAiAnalysis(id, mode);
  }
  setAiAnalysis(
    id: string,
    mode: 'analysis' | 'interview',
    text: string,
    docId?: string | null,
  ) {
    return this.detailService.setAiAnalysis(id, mode, text, docId);
  }

  // ── Image ─────────────────────────────────────────────────────────────────
  serveImage(filename: string) {
    return this.imageService.serveImage(filename);
  }
  getPostingImageFiles(html: string): string[] {
    return this.imageService.getPostingImageFiles(html);
  }
  getImageCacheStats() {
    return this.imageService.getImageCacheStats();
  }

  // ── Category (util re-export for external consumers) ─────────────────────
  matchesCategoryFilter(
    p: { title: string; jobs?: string | null },
    category: string,
  ): boolean {
    return matchesCategoryFilter(p, category);
  }
}
