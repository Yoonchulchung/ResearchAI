import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { In, Repository } from 'typeorm';
import {
  CoverLetter,
  ScrapeOptions,
  ScrapeStatus,
} from 'src/recruit/domain/cover-letter/cover-letter.model';
import { CoverLetterEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterQuestionEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-question.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { LinkareerCrawler } from 'src/recruit/infrastructure/cover-letter/linkareer.crawler';
import { CatchCoverLetterCrawler } from 'src/recruit/infrastructure/cover-letter/catch.crawler';
import { CatchAuthService } from 'src/browse/infrastructure/auth/catch-auth.service';
import { CompanyEnrichQueueService } from 'src/queue/application/company-enrich-queue.service';
import {
  DATA_DIR_NAME,
  JSONL_FILENAME,
  buildSearchText,
  classifyQuestionTags,
  extractQuestionKeywords,
  getCatchCredentials,
  inferCompanyType,
  inferJobCategory,
  normalizeCompanyName,
  normalizeCoverLetterForView,
  parseDate,
  toCoverLetter,
} from './cover-letter.utils';

const DATA_DIR = path.resolve(__dirname, `../../../../data/${DATA_DIR_NAME}`);
const JSONL_FILE = path.join(DATA_DIR, JSONL_FILENAME);

type InternalScrapeOptions = ScrapeOptions & {
  catchCredentials?: { id: string; password: string };
};

export type ScrapeByCompanyEvent =
  | { type: 'page'; page: number; total: number; found: number }
  | {
      type: 'item';
      index: number;
      pageTotal: number;
      position: string;
      season: string;
      isNew: boolean;
    }
  | {
      type: 'done';
      collected: number;
      skipped: number;
      errors: number;
      company: string;
    }
  | { type: 'error'; message: string };

@Injectable()
export class CoverLetterScrapeEngineService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CoverLetterScrapeEngineService.name);
  private readonly linkareerCrawler = new LinkareerCrawler();
  private readonly catchCrawler: CatchCoverLetterCrawler;

  private collectedIds = new Set<string>();
  private status: ScrapeStatus = {
    running: false,
    currentPage: 0,
    totalCollected: 0,
    totalSkipped: 0,
    errors: 0,
    startedAt: null,
    lastActivity: null,
  };

  constructor(
    private readonly catchAuth: CatchAuthService,
    private readonly enrichQueue: CompanyEnrichQueueService,
    @InjectRepository(CoverLetterEntity)
    private readonly coverLetterRepo: Repository<CoverLetterEntity>,
    @InjectRepository(CoverLetterQuestionEntity)
    private readonly questionRepo: Repository<CoverLetterQuestionEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
  ) {
    this.catchCrawler = new CatchCoverLetterCrawler(catchAuth);
  }

  async onModuleInit() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    await this.migrateJsonlToDb();
    try {
      await this.backfillQuestionRows();
    } catch (e) {
      this.logger.warn(`합격 자소서 문항 백필 건너뜀: ${(e as Error).message}`);
    }
    await this.loadCollectedIdsFromDb();
    this.status.totalCollected = this.collectedIds.size;
  }

  onModuleDestroy() {
    this.status.running = false;
  }

  getStatus(): ScrapeStatus {
    return { ...this.status };
  }

  async startScraping(opts: ScrapeOptions = {}): Promise<{ message: string }> {
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

    const source = opts.source ?? 'linkareer';
    const runOpts: InternalScrapeOptions = {
      ...opts,
      catchCredentials:
        source === 'catch' || source === 'all'
          ? getCatchCredentials()
          : undefined,
    };

    if ((source === 'catch' || source === 'all') && !runOpts.catchCredentials) {
      this.logger.warn(
        '[catch] 캐치 계정 정보가 없어 비로그인 요청으로 수집합니다.',
      );
    }

    this.runScraping(runOpts).catch((err) => {
      this.logger.error('스크래핑 중 오류', err);
      this.status.running = false;
    });

    return {
      message:
        source === 'all'
          ? '캐치와 링커리어 자소서 병렬 수집을 시작했습니다.'
          : source === 'catch'
            ? '캐치 자소서 수집을 시작했습니다.'
            : '수집을 시작했습니다.',
    };
  }

  /**
   * 기업명으로 린커리어 즉시 수집 (await 가능, 최대 maxPages 페이지)
   * onProgress 콜백으로 실시간 진행상황 스트리밍 지원
   */
  async scrapeByCompany(
    company: string,
    maxPages = 3,
    delayMs = 800,
    onProgress?: (event: ScrapeByCompanyEvent) => void,
  ): Promise<{
    collected: number;
    skipped: number;
    errors: number;
    company: string;
  }> {
    const trimmed = company.trim();
    if (!trimmed) throw new Error('기업명을 입력하세요.');

    this.logger.log(
      `[linkareer] 기업 즉시 수집 시작: "${trimmed}" (최대 ${maxPages}페이지)`,
    );

    let collected = 0;
    let skipped = 0;
    let errors = 0;

    const emit = (event: ScrapeByCompanyEvent) => onProgress?.(event);

    for (let page = 1; page <= maxPages; page++) {
      let ids: string[];
      try {
        ids = await this.linkareerCrawler.getIdsFromPage(page, {
          company: trimmed,
        });
      } catch (err) {
        this.logger.warn(`[linkareer] 페이지 ${page} 목록 오류: ${err}`);
        errors++;
        emit({
          type: 'error',
          message: `페이지 ${page} 목록 오류: ${(err as Error).message}`,
        });
        break;
      }

      if (ids.length === 0) break;

      const newIds = ids.filter((id) => !this.collectedIds.has(id));
      skipped += ids.length - newIds.length;
      emit({ type: 'page', page, total: maxPages, found: ids.length });

      for (let i = 0; i < newIds.length; i++) {
        const id = newIds[i];
        try {
          const detail = await this.linkareerCrawler.getDetail(id);
          if (detail) {
            detail.source ??= 'linkareer';
            detail.companyType ??= inferCompanyType(detail.company);
            await this.saveCoverLetter(detail);
            collected++;
            emit({
              type: 'item',
              index: i + 1,
              pageTotal: newIds.length,
              position: detail.position ?? '',
              season: detail.season ?? '',
              isNew: true,
            });
          } else {
            errors++;
          }
        } catch (err) {
          this.logger.warn(`[linkareer] [${id}] 상세 오류: ${err}`);
          errors++;
        }
        await this.delay(delayMs);
      }

      if (page < maxPages) await this.delay(delayMs);
    }

    this.logger.log(
      `[linkareer] 기업 수집 완료: "${trimmed}" — 신규 ${collected}건, 스킵 ${skipped}건, 오류 ${errors}건`,
    );
    emit({ type: 'done', collected, skipped, errors, company: trimmed });
    return { collected, skipped, errors, company: trimmed };
  }

  stopScraping(): { message: string } {
    if (!this.status.running)
      return { message: '실행 중인 수집 작업이 없습니다.' };
    this.status.running = false;
    return { message: '수집 중단 요청됨.' };
  }

  async backfillJobCategories(): Promise<{ updated: number }> {
    const rows = await this.coverLetterRepo.find({
      select: { id: true, position: true, jobCategory: true },
    });
    const toUpdate = rows.filter((r) => !r.jobCategory);
    if (toUpdate.length === 0) return { updated: 0 };

    const chunkSize = 200;
    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      const chunk = toUpdate.slice(i, i + chunkSize);
      await this.coverLetterRepo.save(
        chunk.map((r) => ({ ...r, jobCategory: inferJobCategory(r.position) })),
      );
      updated += chunk.length;
    }
    this.logger.log(`백필 완료: ${updated}건 jobCategory 분류`);
    return { updated };
  }

  async backfillQuestionRows(): Promise<{ updated: number }> {
    const rows = await this.coverLetterRepo.find();
    if (rows.length === 0) return { updated: 0 };

    let updated = 0;
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await this.questionRepo.delete({
        coverLetterId: In(chunk.map((r) => r.id)),
      });
      const questionRows = chunk.flatMap((row) => {
        const item = toCoverLetter(row);
        return this.toQuestionEntities(item);
      });
      if (questionRows.length > 0) {
        await this.questionRepo.upsert(questionRows, ['id']);
        updated += questionRows.length;
      }
    }
    if (updated > 0)
      this.logger.log(`합격 자소서 문항 ${updated}건을 분리 테이블로 백필`);
    return { updated };
  }

  private async runScraping(opts: InternalScrapeOptions) {
    const source = opts.source ?? 'linkareer';
    try {
      if (source === 'all') {
        await Promise.allSettled([
          this.runSourceLoop('catch', opts),
          this.runSourceLoop('linkareer', opts),
        ]);
      } else {
        await this.runSourceLoop(source, opts);
      }
    } finally {
      this.status.running = false;
      this.logger.log(
        `수집 종료 — 총 ${this.status.totalCollected}개 (에러 ${this.status.errors}개)`,
      );
    }
  }

  private async runSourceLoop(
    source: 'linkareer' | 'catch',
    opts: InternalScrapeOptions,
  ) {
    const delayMs = opts.delayMs ?? 1500;
    const maxPages = opts.maxPages ?? Infinity;
    const crawler =
      source === 'catch' ? this.catchCrawler : this.linkareerCrawler;
    const catchCredentials =
      source === 'catch' ? opts.catchCredentials : undefined;
    let page = opts.startPage ?? 1;
    let emptyPageCount = 0;

    while (this.status.running) {
      if (page - (opts.startPage ?? 1) >= maxPages) break;
      this.status.currentPage = page;
      this.status.lastActivity = new Date().toISOString();

      let ids: string[];
      try {
        ids = await crawler.getIdsFromPage(page, {
          company: opts.company,
          role: opts.role,
          keyword: opts.keyword,
          auth: catchCredentials,
        });
      } catch (err) {
        this.logger.warn(`[${source}] 페이지 ${page} 목록 오류: ${err}`);
        this.status.errors++;
        break;
      }

      const newIds = ids.filter((id) => !this.collectedIds.has(id));
      this.logger.log(
        `[${source}] 페이지 ${page}: 총 ${ids.length}개, 신규 ${newIds.length}개`,
      );

      if (ids.length === 0) {
        emptyPageCount++;
        if (emptyPageCount >= 3) {
          this.logger.log(`[${source}] 빈 페이지 3회 연속 — 수집 완료`);
          break;
        }
      } else {
        emptyPageCount = 0;
      }

      for (const id of newIds) {
        if (!this.status.running) break;
        try {
          const detail = await crawler.getDetail(id, {
            auth: catchCredentials,
          });
          if (detail) {
            detail.source ??= source;
            detail.companyType ??= inferCompanyType(detail.company);
            await this.saveCoverLetter(detail);
            this.status.totalCollected++;
            this.logger.log(
              `[${source}] 수집 완료 [${id}] ${detail.company} / ${detail.position}`,
            );
          } else {
            this.status.errors++;
          }
        } catch (err) {
          this.logger.warn(`[${source}] 자소서 [${id}] 오류: ${err}`);
          this.status.errors++;
        }
        this.status.lastActivity = new Date().toISOString();
        await this.delay(delayMs);
      }

      this.status.totalSkipped += ids.length - newIds.length;
      page++;
      await this.delay(delayMs);
    }
  }

  private async saveCoverLetter(cl: CoverLetter) {
    const normalized = normalizeCoverLetterForView(cl);
    await this.coverLetterRepo.save(this.toEntityData(normalized));
    await this.saveQuestionRows(normalized);
    this.collectedIds.add(cl.id);
    if (cl.company?.trim()) {
      const normalizedName = normalizeCompanyName(cl.company);
      const existing = await this.companyRepo.findOne({
        where: { normalizedName },
      });
      if (!existing) {
        await this.enrichQueue.enqueue(cl.company, cl.companyType ?? null);
      }
    }
  }

  private toEntityData(item: CoverLetter) {
    const normalized = normalizeCoverLetterForView(item);
    return this.coverLetterRepo.create({
      id: normalized.id,
      url: normalized.url,
      source: normalized.source ?? null,
      companyType: normalized.companyType ?? null,
      jobCategory:
        normalized.jobCategory ?? inferJobCategory(normalized.position),
      company: normalized.company,
      position: normalized.position,
      season: normalized.season,
      spec: normalized.spec,
      viewCount: normalized.viewCount ?? null,
      questions: JSON.stringify(normalized.questions ?? []),
      searchText: buildSearchText(normalized),
      isHidden: normalized.isHidden ?? false,
      collectedAt: parseDate(normalized.collectedAt),
    });
  }

  private toQuestionEntities(item: CoverLetter) {
    return (item.questions ?? []).map((question, index) => {
      const number = Number(question.number) || index + 1;
      const tags = classifyQuestionTags(question);
      const keywords = extractQuestionKeywords(question, tags);
      return this.questionRepo.create({
        id: `${item.id}:${index + 1}`,
        coverLetterId: item.id,
        number,
        question: question.question ?? '',
        answer: question.answer ?? '',
        tags: JSON.stringify(tags),
        keywords: JSON.stringify(keywords),
        searchText: [
          item.company,
          item.position,
          item.season,
          item.spec,
          question.question,
          question.answer,
          ...tags,
          ...keywords,
        ]
          .filter(Boolean)
          .join('\n')
          .toLowerCase()
          .replace(/\s+/g, ''),
      });
    });
  }

  private async saveQuestionRows(item: CoverLetter): Promise<void> {
    await this.questionRepo.delete({ coverLetterId: item.id });
    const entities = this.toQuestionEntities(item);
    if (entities.length > 0) {
      await this.questionRepo.upsert(entities, ['id']);
    }
  }

  private async loadCollectedIdsFromDb() {
    const rows = await this.coverLetterRepo.find({ select: { id: true } });
    this.collectedIds = new Set(rows.map((row) => row.id));
    this.logger.log(`자소서 DB 수집 ID ${this.collectedIds.size}개 로드`);
  }

  private async migrateJsonlToDb() {
    const dbCount = await this.coverLetterRepo.count();
    if (dbCount > 0) return;
    if (!fs.existsSync(JSONL_FILE)) return;

    const items = await this.readAllFromJsonl();
    if (items.length === 0) return;

    const seenIds = new Set<string>();
    const entities = items
      .filter((item) => {
        if (!item.id || seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      })
      .map((item) => this.toEntityData(item));

    if (entities.length === 0) return;

    const chunkSize = 100;
    for (let i = 0; i < entities.length; i += chunkSize) {
      await this.coverLetterRepo.save(entities.slice(i, i + chunkSize));
    }
    this.logger.log(
      `JSONL 자소서 ${entities.length}건을 DB로 마이그레이션 완료`,
    );
  }

  private async readAllFromJsonl(): Promise<CoverLetter[]> {
    if (!fs.existsSync(JSONL_FILE)) return [];
    const results: CoverLetter[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(JSONL_FILE, 'utf-8'),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        results.push(JSON.parse(line));
      } catch {
        /* 손상된 라인 무시 */
      }
    }
    return results;
  }

  private delay(ms: number) {
    const jitter = ms * 0.4;
    const actual = ms - jitter + Math.random() * jitter * 2;
    return new Promise((r) => setTimeout(r, actual));
  }
}
