import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  JobPosting,
  JobPostingFilterOptions,
  JobPostingListFilters,
} from 'src/recruit/domain/job-posting.model';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';
import { CatchJobCrawler } from 'src/recruit/infrastructure/job-posting/catch-job.crawler';
import { JobPostingCompanyProfileService } from './job-posting-company-profile.service';
import {
  applyFilters,
  entityToJobPosting,
  getFilterOptions,
  getSearchTerms,
  isIgnoredPosting,
  normalizePostingForView,
  sortPostings,
  sortPostingsBySearchRelevance,
} from './job-posting.utils';
import { deduplicatePostingsByDeadlineAndTitle } from './job-posting-dedup.utils';

@Injectable()
export class JobPostingQueryService {
  private readonly catchCrawler = new CatchJobCrawler();
  private postingDedupRevision = 0;
  private postingDedupCache = new Map<string, { expiresAt: number; items: JobPosting[] }>();

  constructor(
    @InjectRepository(RecruitJobPostingEntity)
    private readonly postingRepo: Repository<RecruitJobPostingEntity>,
    private readonly companyProfileSvc: JobPostingCompanyProfileService,
  ) {}

  async getData(
    page: number,
    limit: number,
    filters: JobPostingListFilters = {},
  ): Promise<{ items: JobPosting[]; total: number; filterOptions: JobPostingFilterOptions }> {
    const all = (await this.readAllFromDb()).map((p) => this.normalizeForView(p));

    const visible = all.filter((p) => !isIgnoredPosting(p));
    const sourceFiltered = filters.source ? visible.filter((p) => p.source === filters.source) : visible;
    const favoriteFiltered = filters.favorite ? sourceFiltered.filter((p) => !!p.favorite) : sourceFiltered;
    const searchTerms = getSearchTerms(filters.search);
    const filtered = applyFilters(favoriteFiltered, filters, searchTerms);
    const deduplicated = this.getDeduplicatedPostings(filtered, filters);
    const sorted =
      searchTerms.length > 0
        ? sortPostingsBySearchRelevance(deduplicated, searchTerms, filters.sort ?? 'latest')
        : sortPostings(deduplicated, filters.sort ?? 'latest');

    return {
      items: sorted.slice((page - 1) * limit, page * limit),
      total: sorted.length,
      filterOptions: getFilterOptions(favoriteFiltered),
    };
  }

  async getPostingById(id: string): Promise<JobPosting | null> {
    const posting = await this.readPostingFromDb(id);
    return posting ? this.normalizeForView(posting) : null;
  }

  async setFavorite(id: string, favorite: boolean): Promise<{ id: string; favorite: boolean }> {
    await this.postingRepo.update(id, { favorite });
    this.invalidateDedupCache();
    return { id, favorite };
  }

  async setApplied(id: string, appliedAt: string | null): Promise<{ id: string; appliedAt: string | null }> {
    await this.postingRepo.update(id, { appliedAt });
    this.invalidateDedupCache();
    return { id, appliedAt };
  }

  async getPopularPostings(): Promise<JobPosting[]> {
    const postings = await this.catchCrawler.getPopularPostings(30);
    return postings.map((p) => this.normalizeForView(p));
  }

  invalidateDedupCache(): void {
    this.postingDedupRevision++;
    this.postingDedupCache.clear();
  }

  async readAllFromDb(): Promise<JobPosting[]> {
    const rows = await this.postingRepo.find({ order: { collectedAt: 'DESC' } });
    return rows.map((e) => entityToJobPosting(e));
  }

  private async readPostingFromDb(id: string): Promise<JobPosting | null> {
    const e = await this.postingRepo.findOne({ where: { id } });
    return e ? entityToJobPosting(e) : null;
  }

  private normalizeForView(posting: JobPosting): JobPosting {
    return normalizePostingForView(posting, (p) => this.companyProfileSvc.resolveCompanyType(p));
  }

  private getDeduplicatedPostings(postings: JobPosting[], filters: JobPostingListFilters): JobPosting[] {
    const cacheKey = `${this.postingDedupRevision}:${JSON.stringify(filters)}`;
    const cached = this.postingDedupCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    const items = deduplicatePostingsByDeadlineAndTitle(postings);
    if (this.postingDedupCache.size >= 30) {
      const oldest = this.postingDedupCache.keys().next().value as string | undefined;
      if (oldest) this.postingDedupCache.delete(oldest);
    }
    this.postingDedupCache.set(cacheKey, { expiresAt: Date.now() + 30_000, items });
    return items;
  }
}
