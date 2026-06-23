import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import type {
  JobPosting,
  JobPostingScrapeOptions,
  JobPostingScrapeStatus,
} from 'src/recruit/domain/job-posting.model';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';
import type {
  JobkoreaCompanyType,
  JobPostingCrawlerSource,
} from 'src/recruit/application/job-posting/job-posting-crawler.types';
import { JobPostingCrawlerRegistryPort } from 'src/recruit/application/job-posting/ports/job-posting-crawler.port';
import { RecruitDb } from 'src/recruit/infrastructure/database/recruit-db';
import { CompanyEnrichQueueService } from 'src/queue/application/company-enrich-queue.service';
import { JobPostingImageService } from './job-posting-image.service';
import { JobPostingCompanyProfileService } from './job-posting-company-profile.service';
import { JobPostingQueryService } from './job-posting-query.service';
import {
  cleanCompanyName,
  delay,
  extractEmployeesFromDetail,
  isIgnoredPosting,
  jobPostingToEntity,
  normalizeCompanyType,
  shuffled,
  today,
} from './job-posting.utils';

const DATA_DIR = path.resolve(__dirname, '../../../../data/job-postings');
const CHECKPOINT_FILE = path.join(DATA_DIR, 'crawl-checkpoint.json');
const CHECKPOINT_ID = 'job-posting-scraper';

interface CrawlSourceCheckpoint {
  lastCompletedPage: number;
  done: boolean;
  updatedAt: string;
}

interface CrawlCheckpointFile {
  date: string;
  sources: Record<string, CrawlSourceCheckpoint>;
}

@Injectable()
export class JobPostingScrapeEngineService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(JobPostingScrapeEngineService.name);

  private collectedIds = new Set<string>();
  private crawlCheckpoint: CrawlCheckpointFile = { date: '', sources: {} };
  private initialCatchSeedPromise: Promise<void> | null = null;
  private status: JobPostingScrapeStatus = {
    running: false,
    currentPage: 0,
    totalCollected: 0,
    totalSkipped: 0,
    errors: 0,
    startedAt: null,
    lastActivity: null,
  };

  constructor(
    private readonly recruitDb: RecruitDb,
    private readonly imageService: JobPostingImageService,
    private readonly companyProfileSvc: JobPostingCompanyProfileService,
    private readonly querySvc: JobPostingQueryService,
    private readonly companyEnrichQueue: CompanyEnrichQueueService,
    private readonly crawlerRegistry: JobPostingCrawlerRegistryPort,
    @InjectRepository(RecruitJobPostingEntity)
    private readonly postingRepo: Repository<RecruitJobPostingEntity>,
  ) {}

  async onModuleInit() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    await this.companyProfileSvc.init();
    await this.loadCheckpoint();
    this.recruitDb.pruneDetailCache();
    this.imageService.pruneImageCache();
    void this.ensureInitialCatchPostings().catch((err) => {
      this.logger.warn(
        `캐치 초기 공고 로드 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  onModuleDestroy() {
    this.status.running = false;
  }

  getStatus(): JobPostingScrapeStatus {
    return { ...this.status };
  }

  async startScraping(
    opts: JobPostingScrapeOptions = {},
  ): Promise<{ message: string }> {
    if (this.status.running) return { message: '이미 수집 중입니다.' };
    this.status = {
      running: true,
      currentPage: opts.startPage ?? 1,
      totalCollected: this.collectedIds.size,
      totalSkipped: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    this.runScraping(opts).catch((err) => {
      this.logger.error('스크래핑 중 오류', err);
      this.status.running = false;
    });
    return {
      message:
        (opts.source ?? 'linkareer') === 'all'
          ? '전체 사이트 병렬 수집을 시작했습니다.'
          : '채용공고 수집을 시작했습니다.',
    };
  }

  stopScraping(): { message: string } {
    if (!this.status.running)
      return { message: '실행 중인 수집 작업이 없습니다.' };
    this.status.running = false;
    return { message: '수집 중단 요청됨.' };
  }

  async ensureInitialCatchPostings(): Promise<void> {
    if (this.initialCatchSeedPromise) return this.initialCatchSeedPromise;
    this.initialCatchSeedPromise = this.seedInitialCatchPostings();
    return this.initialCatchSeedPromise;
  }

  private async seedInitialCatchPostings(): Promise<void> {
    const existingPostings = await this.querySvc.readAllFromDb();
    const hasCatchPostings = existingPostings.some(
      (p) => (p.source ?? '') === 'catch',
    );

    try {
      const postings = await this.crawlerRegistry
        .get('catch')
        .getPopularPostings(50);
      const existingIds = new Set(existingPostings.map((p) => p.id));
      let savedCount = 0;
      for (const posting of postings) {
        if (existingIds.has(posting.id) || isIgnoredPosting(posting)) continue;
        await this.savePosting(posting);
        existingIds.add(posting.id);
        savedCount++;
      }
      if (savedCount > 0) {
        this.status.totalCollected = this.collectedIds.size;
        this.logger.log(`[catch] 초기 화면용 인기 공고 ${savedCount}개 저장`);
      }
    } catch (err) {
      this.initialCatchSeedPromise = null;
      if (hasCatchPostings) {
        this.logger.warn(
          `캐치 인기 공고 갱신 실패 — 기존 캐치 공고를 사용합니다: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      throw err;
    }
  }

  private async runScraping(opts: JobPostingScrapeOptions) {
    const todayStr = today();
    if (this.crawlCheckpoint.date !== todayStr) {
      this.logger.log(`새 날짜(${todayStr}) 감지 — 체크포인트 초기화`);
      this.crawlCheckpoint = { date: todayStr, sources: {} };
      this.saveCheckpoint();
    }

    const source = opts.source ?? 'linkareer';
    if (source === 'all') {
      await Promise.allSettled([
        this.runCrawlerLoop(
          'linkareer',
          (page) =>
            this.fetchCrawlerPage('linkareer', page, {
              ...opts,
              jobType: 'RECRUIT',
            }),
          opts,
        ),
        this.runJobkoreaRoundRobin(
          ['대기업', '중견기업', '외국계기업', '공공기관'],
          opts,
        ),
        this.runCrawlerLoop(
          'catch',
          (page) => this.fetchCrawlerPage('catch', page, opts),
          opts,
        ),
        this.runCrawlerLoop(
          'jobplanet',
          (page) => this.fetchCrawlerPage('jobplanet', page, opts),
          opts,
        ),
        this.runCrawlerLoop(
          'jobda',
          (page) => this.fetchCrawlerPage('jobda', page, opts),
          opts,
        ),
      ]);
    } else if (source === 'jobkorea') {
      const types =
        ((opts.jobkoreaCompanyTypes ?? []) as JobkoreaCompanyType[]).length > 0
          ? (opts.jobkoreaCompanyTypes as JobkoreaCompanyType[])
          : ([
              '대기업',
              '중견기업',
              '외국계기업',
              '공공기관',
            ] as JobkoreaCompanyType[]);
      await this.runJobkoreaRoundRobin(types, opts);
    } else {
      const crawlerSource = this.resolveCrawlerSource(source);
      await this.runCrawlerLoop(
        crawlerSource,
        (page) => this.fetchCrawlerPage(crawlerSource, page, opts),
        opts,
      );
    }

    this.status.running = false;
    this.logger.log(
      `수집 종료 — 총 ${this.status.totalCollected}개 (에러 ${this.status.errors}개)`,
    );
  }

  private async runCrawlerLoop(
    label: string,
    fetchPage: (page: number) => Promise<JobPosting[]>,
    opts: JobPostingScrapeOptions,
  ) {
    const delayMs = opts.delayMs ?? 2000;
    const maxPages = opts.maxPages ?? Infinity;
    const sourceCheckpoint = this.crawlCheckpoint.sources[label];
    const startPage =
      opts.startPage ??
      (sourceCheckpoint && !sourceCheckpoint.done
        ? sourceCheckpoint.lastCompletedPage + 1
        : 1);

    if (
      opts.startPage === undefined &&
      sourceCheckpoint &&
      !sourceCheckpoint.done
    ) {
      this.logger.log(
        `[${label}] 체크포인트 복원: 페이지 ${startPage}부터 재개`,
      );
    }

    let page = startPage;
    let emptyPageCount = 0;
    let exhausted = false;

    while (this.status.running) {
      if (page - startPage >= maxPages) break;
      this.status.lastActivity = new Date().toISOString();
      this.status.currentPage = page;

      let postings: JobPosting[];
      try {
        postings = await fetchPage(page);
      } catch (err) {
        this.logger.warn(`[${label}] 페이지 ${page} 오류: ${err}`);
        this.status.errors++;
        break;
      }

      if (postings.length === 0) {
        if (++emptyPageCount >= 3) {
          this.logger.log(`[${label}] 빈 페이지 3회 연속 — 완료`);
          exhausted = true;
          break;
        }
      } else {
        emptyPageCount = 0;
      }

      const newPostings = postings.filter((p) => !this.collectedIds.has(p.id));
      this.logger.log(
        `[${label}] 페이지 ${page}: ${postings.length}개 중 신규 ${newPostings.length}개`,
      );

      for (const posting of newPostings) {
        if (!this.status.running) break;
        if (this.collectedIds.has(posting.id)) {
          this.status.totalSkipped++;
          continue;
        }
        if (isIgnoredPosting(posting)) {
          this.collectedIds.add(posting.id);
          this.status.totalSkipped++;
          continue;
        }
        if (label === 'linkareer' && opts.fetchDetail === true) {
          const detail = await this.crawlerRegistry
            .get('linkareer')
            .getDetail({ id: posting.id, url: posting.url });
          Object.assign(posting, detail);
          await delay(delayMs * 0.5);
        }
        if (this.collectedIds.has(posting.id)) continue;
        await this.savePosting(posting);
        this.status.totalCollected++;
      }

      this.status.totalSkipped += postings.length - newPostings.length;
      this.updateSourceCheckpoint(label, page, false);
      page++;
      await delay(delayMs);
    }

    this.updateSourceCheckpoint(label, page - 1, exhausted);
  }

  private async runJobkoreaRoundRobin(
    companyTypes: JobkoreaCompanyType[],
    opts: JobPostingScrapeOptions,
  ) {
    const delayMs = opts.delayMs ?? 2000;
    const pages: Record<string, number> = {};
    const emptyCount: Record<string, number> = {};
    const exhausted = new Set<string>();

    for (const ct of companyTypes) {
      pages[ct] = 1;
      emptyCount[ct] = 0;
    }

    while (this.status.running && exhausted.size < companyTypes.length) {
      const round = shuffled(companyTypes.filter((ct) => !exhausted.has(ct)));
      for (const ct of round) {
        if (!this.status.running) break;
        const page = pages[ct];
        this.status.lastActivity = new Date().toISOString();
        this.status.currentPage = page;

        let postings: JobPosting[];
        try {
          postings = await this.crawlerRegistry
            .get('jobkorea')
            .getPostingsFromPage({ page, companyType: ct });
        } catch (err) {
          this.logger.warn(`[jobkorea-${ct}] p.${page} 오류: ${err}`);
          this.status.errors++;
          exhausted.add(ct);
          continue;
        }

        if (postings.length === 0) {
          if (++emptyCount[ct] >= 3) {
            this.logger.log(`[jobkorea-${ct}] 빈 페이지 3회 — 완료`);
            exhausted.add(ct);
          }
        } else {
          emptyCount[ct] = 0;
        }

        const newPostings = postings.filter(
          (p) => !this.collectedIds.has(p.id),
        );
        this.logger.log(
          `[jobkorea-${ct}] p.${page}: ${postings.length}개 중 신규 ${newPostings.length}개`,
        );

        for (const posting of newPostings) {
          if (!this.status.running) break;
          if (this.collectedIds.has(posting.id)) {
            this.status.totalSkipped++;
            continue;
          }
          if (isIgnoredPosting(posting)) {
            this.collectedIds.add(posting.id);
            this.status.totalSkipped++;
            continue;
          }
          await this.savePosting(posting);
          this.status.totalCollected++;
        }

        this.status.totalSkipped += postings.length - newPostings.length;
        pages[ct]++;
        this.updateSourceCheckpoint(`jobkorea-${ct}`, page, false);
        await delay(delayMs * (0.8 + Math.random() * 0.8));
      }
    }

    for (const ct of companyTypes)
      this.updateSourceCheckpoint(`jobkorea-${ct}`, pages[ct] - 1, true);
  }

  private fetchCrawlerPage(
    source: JobPostingCrawlerSource,
    page: number,
    opts: JobPostingScrapeOptions,
  ): Promise<JobPosting[]> {
    return this.crawlerRegistry.get(source).getPostingsFromPage({
      page,
      jobType: opts.jobType,
      status: opts.status,
    });
  }

  private resolveCrawlerSource(source: string): JobPostingCrawlerSource {
    if (
      source === 'catch' ||
      source === 'jobplanet' ||
      source === 'jobda' ||
      source === 'jobkorea'
    ) {
      return source;
    }
    return 'linkareer';
  }

  private async savePosting(p: JobPosting) {
    await this.upsertPostingToDb(p);
    this.querySvc.invalidateDuplicateFilterCache();
    this.collectedIds.add(p.id);
    if (this.companyProfileSvc.upsertFromPosting(p))
      this.companyProfileSvc.save();
    if (p.company) {
      const knownType =
        normalizeCompanyType(p.companyType) ?? p.companyType ?? null;
      const knownEmployees = extractEmployeesFromDetail(
        p.detailContent ?? p.detailHtml,
      );
      this.companyEnrichQueue
        .enqueue(cleanCompanyName(p.company), knownType, knownEmployees)
        .catch(() => {});
    }
  }

  private async upsertPostingToDb(posting: JobPosting): Promise<void> {
    const entity = jobPostingToEntity(posting);
    await this.postingRepo
      .createQueryBuilder()
      .insert()
      .into(RecruitJobPostingEntity)
      .values(entity)
      .orUpdate(
        [
          'source',
          'source_type',
          'title',
          'company',
          'location',
          'url',
          'company_type',
          'type',
          'start_date',
          'end_date',
          'deadline',
          'jobs',
          'homepage',
          'view_count',
          'collected_at',
        ],
        ['id'],
      )
      .execute();
  }

  private async loadCheckpoint() {
    const row = this.recruitDb
      .get()
      .prepare(`SELECT data FROM job_posting_crawl_checkpoints WHERE id = ?`)
      .get(CHECKPOINT_ID) as { data: string } | undefined;

    if (row?.data) {
      try {
        this.crawlCheckpoint = JSON.parse(row.data) as CrawlCheckpointFile;
        const sources = Object.entries(this.crawlCheckpoint.sources)
          .map(
            ([k, v]) => `${k}:p${v.lastCompletedPage}${v.done ? '(완료)' : ''}`,
          )
          .join(', ');
        this.logger.log(
          `체크포인트 DB 로드 — ${this.crawlCheckpoint.date} [${sources || '없음'}]`,
        );
        return;
      } catch {
        this.logger.warn('체크포인트 DB 로드 실패 — 초기화');
      }
    }

    if (!fs.existsSync(CHECKPOINT_FILE)) return;
    try {
      this.crawlCheckpoint = JSON.parse(
        fs.readFileSync(CHECKPOINT_FILE, 'utf-8'),
      );
      const sources = Object.entries(this.crawlCheckpoint.sources)
        .map(
          ([k, v]) => `${k}:p${v.lastCompletedPage}${v.done ? '(완료)' : ''}`,
        )
        .join(', ');
      this.logger.log(
        `체크포인트 JSON 로드 — ${this.crawlCheckpoint.date} [${sources || '없음'}]`,
      );
      this.saveCheckpoint();
    } catch {
      this.logger.warn('체크포인트 로드 실패 — 초기화');
    }
  }

  private saveCheckpoint() {
    this.recruitDb
      .get()
      .prepare(
        `
        INSERT INTO job_posting_crawl_checkpoints (id, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      `,
      )
      .run(
        CHECKPOINT_ID,
        JSON.stringify(this.crawlCheckpoint),
        new Date().toISOString(),
      );
  }

  private updateSourceCheckpoint(
    label: string,
    lastPage: number,
    done: boolean,
  ) {
    this.crawlCheckpoint.sources[label] = {
      lastCompletedPage: lastPage,
      done,
      updatedAt: new Date().toISOString(),
    };
    this.saveCheckpoint();
  }
}
