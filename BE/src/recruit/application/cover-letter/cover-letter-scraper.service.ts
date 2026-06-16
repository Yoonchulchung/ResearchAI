import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { In, Repository } from 'typeorm';
import {
  CoverLetter,
  CoverLetterJobAnalysis,
  CoverLetterJobAnalysisRequest,
  CoverLetterListFilters,
  CoverLetterQuestion,
  CoverLetterQuestionSearchItem,
  JobCategory,
  JobCategoryTarget,
  ScrapeOptions,
  ScrapeStatus,
} from '../../domain/cover-letter/cover-letter.model';
import { LinkareerCrawler } from '../../infrastructure/cover-letter/linkareer.crawler';
import { CatchCoverLetterCrawler } from '../../infrastructure/cover-letter/catch.crawler';
import { CatchAuthService } from '../../../browse/infrastructure/auth/catch-auth.service';
import { requestContext } from '../../../shared/request-context';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';
import { CoverLetterEntity } from '../../domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterQuestionEntity } from '../../domain/cover-letter/entity/cover-letter-question.entity';
import { CoverLetterSpecAnalysisEntity } from '../../domain/cover-letter/entity/cover-letter-spec-analysis.entity';
import { CompanyEntity } from '../../../company/domain/entity/company.entity';
import { CompanyEnrichQueueService } from '../../../company/application/company-enrich-queue.service';

const DATA_DIR = path.resolve(__dirname, '../../../../data/cover-letters');
const JSONL_FILE = path.join(DATA_DIR, 'cover-letters.jsonl');
const SPEC_ANALYSIS_MAX_ITEMS = 20;
const SPEC_ANALYSIS_TOKEN_BUDGET = 120_000;
const SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS = 550;

const QUESTION_TAG_RULES: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: '성장과정', patterns: [/성장\s*과정/, /성장\s*배경/, /어린\s*시절/, /가정환경/, /인생관/, /가치관/] },
  { tag: '지원동기', patterns: [/지원\s*동기/, /지원한\s*이유/, /관심을\s*갖게/, /왜\s*(?:우리|당사|귀사)/] },
  { tag: '입사후포부', patterns: [/입사\s*후\s*포부/, /입사\s*후\s*계획/, /향후\s*계획/, /10년\s*후/, /비전/] },
  { tag: '직무역량', patterns: [/직무\s*역량/, /전문성/, /강점/, /역량/, /능력/, /경쟁력/, /skill/i] },
  { tag: '도전/실패', patterns: [/도전/, /실패/, /극복/, /어려움/, /난관/, /한계/, /위기/, /문제\s*해결/] },
  { tag: '협업/갈등', patterns: [/협업/, /팀워크/, /갈등/, /소통/, /의견\s*차이/, /조율/, /협력/, /팀\s*프로젝트/] },
  { tag: '리더십', patterns: [/리더십/, /주도/, /이끌/, /대표/, /책임자/, /팀장/, /initiative/i] },
  { tag: '창의/개선', patterns: [/창의/, /개선/, /아이디어/, /혁신/, /효율/, /변화/, /제안/] },
  { tag: '성과/경험', patterns: [/성과/, /경험/, /프로젝트/, /활동/, /인턴/, /공모전/, /수상/] },
  { tag: '성격/장단점', patterns: [/성격/, /장점/, /단점/, /보완점/, /생활\s*신조/] },
];

type CatchCredentials = { id: string; password: string };
type InternalScrapeOptions = ScrapeOptions & { catchCredentials?: CatchCredentials };

@Injectable()
export class CoverLetterScraperService implements OnModuleInit {
  private readonly logger = new Logger(CoverLetterScraperService.name);
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
    private readonly aiProvider: AiProviderService,
    @InjectRepository(CoverLetterEntity)
    private readonly coverLetterRepo: Repository<CoverLetterEntity>,
    @InjectRepository(CoverLetterQuestionEntity)
    private readonly questionRepo: Repository<CoverLetterQuestionEntity>,
    @InjectRepository(CoverLetterSpecAnalysisEntity)
    private readonly specAnalysisRepo: Repository<CoverLetterSpecAnalysisEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    private readonly enrichQueue: CompanyEnrichQueueService,
  ) {
    this.catchCrawler = new CatchCoverLetterCrawler(catchAuth);
  }

  async onModuleInit() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    await this.migrateJsonlToDb();
    await this.backfillQuestionRows();
    await this.loadCollectedIdsFromDb();
    this.status.totalCollected = this.collectedIds.size;
  }

  getStatus(): ScrapeStatus {
    return { ...this.status };
  }

  async startScraping(opts: ScrapeOptions = {}): Promise<{ message: string }> {
    if (this.status.running) {
      return { message: '이미 수집 중입니다.' };
    }
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
      catchCredentials: source === 'catch' || source === 'all'
        ? this.getCatchCredentials()
        : undefined,
    };

    if ((source === 'catch' || source === 'all') && !runOpts.catchCredentials) {
      this.logger.warn('[catch] 캐치 계정 정보가 없어 비로그인 요청으로 수집합니다.');
    }

    // 비동기로 실행 — 응답은 즉시 반환
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

  stopScraping(): { message: string } {
    if (!this.status.running) return { message: '실행 중인 수집 작업이 없습니다.' };
    this.status.running = false;
    return { message: '수집 중단 요청됨.' };
  }

  /** 수집된 자소서 목록 (페이지네이션) */
  async getData(
    page: number,
    limit: number,
    filters: CoverLetterListFilters = {},
    offset?: number,
  ): Promise<{ items: CoverLetter[]; total: number; page: number; limit: number; offset: number; hasNext: boolean }> {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = offset !== undefined && Number.isFinite(offset)
      ? Math.max(Number(offset), 0)
      : (safePage - 1) * safeLimit;
    const source = filters.source?.trim();
    const companyType = filters.companyType?.trim();
    const search = this.normalizeSearchText(filters.search);

    const jobCategory = filters.jobCategory?.trim();

    const qb = this.coverLetterRepo.createQueryBuilder('coverLetter');
    if (filters.hidden === true) {
      qb.andWhere('coverLetter.isHidden = :isHidden', { isHidden: true });
    } else {
      qb.andWhere('(coverLetter.isHidden = :isHidden OR coverLetter.isHidden IS NULL)', { isHidden: false });
    }
    if (source && source !== 'all' && source !== '전체') {
      qb.andWhere('coverLetter.source = :source', { source });
    }
    if (companyType && companyType !== '전체') {
      qb.andWhere('coverLetter.companyType = :companyType', { companyType });
    }
    if (jobCategory && jobCategory !== 'all' && jobCategory !== '전체') {
      if (jobCategory === 'IT+전자') {
        qb.andWhere('coverLetter.jobCategory IN (:...cats)', { cats: ['IT', '전자'] });
      } else {
        qb.andWhere('coverLetter.jobCategory = :jobCategory', { jobCategory });
      }
    }
    if (search) {
      qb.andWhere('coverLetter.searchText LIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('coverLetter.collectedAt', filters.sort === 'latest' ? 'DESC' : 'DESC')
      .addOrderBy('coverLetter.createdAt', 'DESC')
      .skip(safeOffset)
      .take(safeLimit);

    const [entities, total] = await qb.getManyAndCount();
    const industryMap = await this.lookupIndustries(entities.map((e) => e.company));
    const items = entities.map((entity) => this.toCoverLetter(entity, industryMap.get(entity.company)));
    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      offset: safeOffset,
      hasNext: safeOffset + items.length < total,
    };
  }

  async getById(id: string): Promise<CoverLetter | null> {
    const entity = await this.coverLetterRepo.findOne({
      where: { id },
      relations: { questionItems: true },
    });
    if (!entity) return null;
    const industryMap = await this.lookupIndustries([entity.company]);
    return this.toCoverLetter(entity, industryMap.get(entity.company));
  }

  async setHidden(id: string, isHidden: boolean): Promise<CoverLetter | null> {
    const entity = await this.coverLetterRepo.findOne({ where: { id } });
    if (!entity) return null;
    entity.isHidden = isHidden;
    await this.coverLetterRepo.save(entity);
    return this.getById(id);
  }

  async searchQuestions(
    query: string,
    limit = 20,
  ): Promise<{ items: CoverLetterQuestionSearchItem[]; total: number }> {
    const search = this.normalizeSearchText(query);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const qb = this.questionRepo
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.coverLetter', 'coverLetter')
      .orderBy('coverLetter.collectedAt', 'DESC')
      .addOrderBy('question.number', 'ASC')
      .take(safeLimit);
    qb.andWhere('(coverLetter.isHidden = :isHidden OR coverLetter.isHidden IS NULL)', { isHidden: false });

    if (search) {
      qb.andWhere('question.searchText LIKE :search', { search: `%${search}%` });
    }

    const [rows, total] = await qb.getManyAndCount();
    const companyNames = [...new Set(rows.map((row) => row.coverLetter?.company).filter(Boolean))] as string[];
    const industryMap = await this.lookupIndustries(companyNames);
    return {
      items: rows
        .filter((row) => row.coverLetter)
        .map((row) => {
          const coverLetter = this.toCoverLetter(row.coverLetter, industryMap.get(row.coverLetter.company));
          const coverLetterSummary = {
            id: coverLetter.id,
            url: coverLetter.url,
            source: coverLetter.source,
            companyType: coverLetter.companyType,
            jobCategory: coverLetter.jobCategory,
            company: coverLetter.company,
            position: coverLetter.position,
            season: coverLetter.season,
            spec: coverLetter.spec,
            viewCount: coverLetter.viewCount,
            collectedAt: coverLetter.collectedAt,
            industry: coverLetter.industry,
          };
          return {
            id: row.id,
            coverLetterId: row.coverLetterId,
            number: row.number,
            question: row.question,
            answer: row.answer,
            keywords: this.parseJsonArray(row.keywords),
            tags: this.parseJsonArray(row.tags),
            coverLetter: coverLetterSummary,
          };
        }),
      total,
    };
  }

  async analyzeJobsWithAi(
    request: CoverLetterJobAnalysisRequest = {},
  ): Promise<{ items: CoverLetterJobAnalysis[]; target: JobCategoryTarget; analyzedAt: string; model: string }> {
    const target: JobCategoryTarget = request.target ?? 'IT+전자';
    const limit = Math.min(Math.max(request.limit ?? 20, 1), SPEC_ANALYSIS_MAX_ITEMS);
    const idSet = new Set((request.ids ?? []).filter(Boolean));
    const entities = idSet.size > 0
      ? await this.coverLetterRepo.find({ where: { id: In([...idSet]) } })
      : await this.coverLetterRepo.find({
        where: { isHidden: false },
        order: { collectedAt: 'DESC', createdAt: 'DESC' },
        take: limit,
      });
    const allCoverLetters = entities.map((entity) => this.toCoverLetter(entity));

    // DB에서 이미 분석된 결과 조회
    const allIds = allCoverLetters.map((item) => item.id);
    const cached = allIds.length > 0
      ? await this.specAnalysisRepo.find({ where: { coverLetterId: In(allIds) } })
      : [];
    const cachedMap = new Map(cached.map((row) => [row.coverLetterId, row]));

    const cachedResults: CoverLetterJobAnalysis[] = cached
      .map((row) => this.entityToJobAnalysis(row))
      .filter((item) => this.matchesTarget(item.jobCategory, target));

    const unanalyzed = allCoverLetters.filter((item) => !cachedMap.has(item.id));
    const candidates = this.limitSpecAnalysisCandidates(unanalyzed, limit, SPEC_ANALYSIS_TOKEN_BUDGET);

    if (candidates.length === 0) {
      return { items: cachedResults, target, analyzedAt: new Date().toISOString(), model: request.model || '' };
    }

    const model = request.model || '';
    const system = [
      '너는 채용 자기소개서 데이터를 분류하는 한국어 HR 데이터 분석 에이전트다.',
      '목표는 자소서 본문과 메타 정보에서 지원자의 학력, 전공, 학점, 어학, 자격증, 인턴/경력, 대외활동, 수상, 직무 기술을 최대한 구조화하는 것이다.',
      '직무 분류는 보조 정보이며, 스펙 추출을 더 중요하게 처리한다.',
      '직무명이 애매하면 본문을 근거로 판단하되, 호텔/영업/서비스/인사/회계/마케팅/리서치 등은 IT나 전자로 과분류하지 않는다.',
      '반드시 JSON만 출력한다.',
    ].join('\n');
    const prompt = this.buildJobAnalysisPrompt(candidates, target);
    const effectiveModel = this.aiProvider.resolveEffectiveModel(model);
    const { text } = await this.aiProvider.call(model, system, prompt, {
      caller: 'cover-letter-job-analysis',
    });
    const parsed = this.parseJobAnalysisJson(text);
    const validIds = new Set(candidates.map((item) => item.id));
    const newItems = parsed
      .filter((item: CoverLetterJobAnalysis) => validIds.has(item.id))
      .map((item: CoverLetterJobAnalysis) => this.normalizeJobAnalysis(item));

    // 새 분석 결과 DB에 저장
    if (newItems.length > 0) {
      const specEntities = newItems.map((item) => {
        const spec = item.extractedSpec;
        return this.specAnalysisRepo.create({
          coverLetterId: item.id,
          jobCategory: item.jobCategory,
          confidence: item.confidence / 100,
          reason: item.reason || null,
          extractedSpec: null,
          school: spec.school || null,
          major: spec.major || null,
          gpa: spec.gpa || null,
          languages: spec.languages?.length ? JSON.stringify(spec.languages) : null,
          certificates: spec.certificates?.length ? JSON.stringify(spec.certificates) : null,
          internships: spec.internships?.length ? JSON.stringify(spec.internships) : null,
          activities: spec.activities?.length ? JSON.stringify(spec.activities) : null,
          awards: spec.awards?.length ? JSON.stringify(spec.awards) : null,
          skills: spec.skills?.length ? JSON.stringify(spec.skills) : null,
          specSummary: spec.summary || null,
          model: effectiveModel || null,
        });
      });
      await this.specAnalysisRepo.save(specEntities);
    }

    const filteredNew = newItems.filter((item) => this.matchesTarget(item.jobCategory, target));
    const items = [...cachedResults, ...filteredNew];

    return {
      items,
      target,
      analyzedAt: new Date().toISOString(),
      model: effectiveModel,
    };
  }

  async getSpecAnalyses(ids: string[]): Promise<CoverLetterJobAnalysis[]> {
    if (ids.length === 0) return [];
    const rows = await this.specAnalysisRepo.find({ where: { coverLetterId: In(ids) } });
    return rows.map((row) => this.entityToJobAnalysis(row));
  }

  // ────────────────────────────────────────────────────────
  // private
  // ────────────────────────────────────────────────────────

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

  private async runSourceLoop(source: 'linkareer' | 'catch', opts: InternalScrapeOptions) {
    const delayMs = opts.delayMs ?? 1500;
    const maxPages = opts.maxPages ?? Infinity;
    const crawler = source === 'catch' ? this.catchCrawler : this.linkareerCrawler;
    const catchCredentials = source === 'catch' ? opts.catchCredentials : undefined;
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
      this.logger.log(`[${source}] 페이지 ${page}: 총 ${ids.length}개, 신규 ${newIds.length}개`);

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
          const detail = await crawler.getDetail(id, { auth: catchCredentials });
          if (detail) {
            detail.source ??= source;
            detail.companyType ??= this.inferCompanyType(detail.company);
            await this.saveCoverLetter(detail);
            this.status.totalCollected++;
            this.logger.log(`[${source}] 수집 완료 [${id}] ${detail.company} / ${detail.position}`);
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
    const normalized = this.normalizeCoverLetterForView(cl);
    await this.coverLetterRepo.save(this.toEntity(normalized));
    await this.saveQuestionRows(normalized);
    this.collectedIds.add(cl.id);
    if (cl.company?.trim()) {
      const normalizedName = this.normalizeCompanyName(cl.company);
      const existing = await this.companyRepo.findOne({ where: { normalizedName } });
      if (!existing) {
        await this.enrichQueue.enqueue(cl.company, cl.companyType ?? null);
      }
    }
  }

  private normalizeCompanyName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  private async lookupIndustries(companyNames: string[]): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    if (companyNames.length === 0) return map;
    const normalizedNames = companyNames.map((n) => this.normalizeCompanyName(n));
    const companies = await this.companyRepo.find({ where: normalizedNames.map((n) => ({ normalizedName: n })) });
    const byNormalized = new Map(companies.map((c) => [c.normalizedName, c.industry ?? null]));
    for (const name of companyNames) {
      map.set(name, byNormalized.get(this.normalizeCompanyName(name)) ?? null);
    }
    return map;
  }

  private getCatchCredentials(): { id: string; password: string } | undefined {
    const credentials = requestContext.getStore()?.serviceCredentials;
    if (!credentials?.catchId || !credentials.catchPassword) return undefined;
    return {
      id: credentials.catchId,
      password: credentials.catchPassword,
    };
  }

  private normalizeCoverLetterForView(item: CoverLetter): CoverLetter {
    return {
      ...item,
      source: item.source ?? (item.id.startsWith('catch-') ? 'catch' : 'linkareer'),
      companyType: item.companyType ?? this.inferCompanyType(item.company),
      jobCategory: item.jobCategory ?? CoverLetterScraperService.inferJobCategory(item.position),
      questions: Array.isArray(item.questions) ? item.questions : [],
      collectedAt: item.collectedAt ?? new Date().toISOString(),
    };
  }

  private toEntity(item: CoverLetter): CoverLetterEntity {
    const normalized = this.normalizeCoverLetterForView(item);
    return this.coverLetterRepo.create({
      id: normalized.id,
      url: normalized.url,
      source: normalized.source ?? null,
      companyType: normalized.companyType ?? null,
      jobCategory: normalized.jobCategory ?? CoverLetterScraperService.inferJobCategory(normalized.position),
      company: normalized.company,
      position: normalized.position,
      season: normalized.season,
      spec: normalized.spec,
      viewCount: normalized.viewCount ?? null,
      questions: JSON.stringify(normalized.questions ?? []),
      searchText: this.buildSearchText(normalized),
      isHidden: normalized.isHidden ?? false,
      collectedAt: this.parseDate(normalized.collectedAt),
    });
  }

  private toQuestionEntities(item: CoverLetter): CoverLetterQuestionEntity[] {
    return (item.questions ?? []).map((question, index) => {
      const number = Number(question.number) || index + 1;
      const tags = this.classifyQuestionTags(question);
      const keywords = this.extractQuestionKeywords(question, tags);
      return this.questionRepo.create({
        id: `${item.id}:${index + 1}`,
        coverLetterId: item.id,
        number,
        question: question.question ?? '',
        answer: question.answer ?? '',
        tags: JSON.stringify(tags),
        keywords: JSON.stringify(keywords),
        searchText: this.normalizeSearchText([
          item.company,
          item.position,
          item.season,
          item.spec,
          question.question,
          question.answer,
          ...tags,
          ...keywords,
        ].filter(Boolean).join('\n')),
      });
    });
  }

  private async saveQuestionRows(item: CoverLetter): Promise<void> {
    await this.questionRepo.delete({ coverLetterId: item.id });
    const entities = this.toQuestionEntities(item);
    if (entities.length > 0) {
      await this.questionRepo.save(entities);
    }
  }

  private toCoverLetter(entity: CoverLetterEntity, industry?: string | null): CoverLetter {
    const relationQuestions = (entity.questionItems ?? [])
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((question): CoverLetterQuestion => ({
        number: question.number,
        question: question.question,
        answer: question.answer,
        keywords: this.parseJsonArray(question.keywords),
        tags: this.parseJsonArray(question.tags),
      }));
    const questions = relationQuestions.length > 0
      ? relationQuestions
      : this.parseLegacyQuestions(entity.questions);

    return this.normalizeCoverLetterForView({
      id: entity.id,
      url: entity.url,
      source: entity.source as CoverLetter['source'],
      companyType: entity.companyType ?? undefined,
      jobCategory: (entity.jobCategory as JobCategory) ?? undefined,
      company: entity.company,
      position: entity.position,
      season: entity.season,
      spec: entity.spec,
      viewCount: entity.viewCount ?? undefined,
      isHidden: entity.isHidden,
      questions,
      collectedAt: entity.collectedAt.toISOString(),
      industry: industry ?? null,
    });
  }

  private buildSearchText(item: CoverLetter): string {
    return this.normalizeSearchText([
      item.id,
      item.source,
      item.companyType,
      item.company,
      item.position,
      item.season,
      item.spec,
      ...item.questions.flatMap((question) => [question.question, question.answer]),
    ].filter(Boolean).join('\n'));
  }

  private parseLegacyQuestions(value?: string | null): CoverLetterQuestion[] {
    try {
      const parsed = JSON.parse(value || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map((question, index) => {
        const normalized: CoverLetterQuestion = {
          number: Number(question?.number) || index + 1,
          question: question?.question ?? '',
          answer: question?.answer ?? '',
        };
        const tags = this.classifyQuestionTags(normalized);
        return {
          ...normalized,
          tags,
          keywords: this.extractQuestionKeywords(normalized, tags),
        };
      });
    } catch {
      return [];
    }
  }

  private classifyQuestionTags(question: Pick<CoverLetterQuestion, 'question' | 'answer'>): string[] {
    const text = `${question.question ?? ''}\n${question.answer ?? ''}`;
    return QUESTION_TAG_RULES
      .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
      .map((rule) => rule.tag);
  }

  private extractQuestionKeywords(
    question: Pick<CoverLetterQuestion, 'question' | 'answer'>,
    tags: string[],
  ): string[] {
    const text = `${question.question ?? ''}\n${question.answer ?? ''}`;
    const words = text
      .match(/[가-힣A-Za-z0-9+#.]{2,}/g)
      ?.map((word) => word.toLowerCase())
      .filter((word) => !/^(그리고|하지만|입니다|합니다|있는|없는|제가|저는|이를|통해|대한|위해|에서|으로|하게|되어|하며|또한)$/.test(word))
      .slice(0, 80) ?? [];
    return [...new Set([...tags, ...words])].slice(0, 80);
  }

  private parseDate(value?: string | Date | null): Date {
    const date = value instanceof Date ? value : new Date(value ?? Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private limitSpecAnalysisCandidates(items: CoverLetter[], limit: number, tokenBudget: number): CoverLetter[] {
    const result: CoverLetter[] = [];
    let usedTokens = 0;

    for (const item of items) {
      if (result.length >= limit) break;
      const estimated = this.estimateCoverLetterAnalysisTokens(item);
      if (result.length > 0 && usedTokens + estimated > tokenBudget) break;
      result.push(item);
      usedTokens += estimated;
    }

    if (items.length > result.length) {
      this.logger.warn(
        `스펙 분석 입력 제한 적용: requested=${items.length}, selected=${result.length}, estimatedTokens=${usedTokens}, budget=${tokenBudget}`,
      );
    }

    return result;
  }

  private estimateCoverLetterAnalysisTokens(item: CoverLetter): number {
    const text = [
      item.company,
      item.position,
      item.season,
      item.spec,
      ...item.questions.slice(0, 3).flatMap((question) => [
        question.question,
        question.answer.slice(0, SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS),
      ]),
    ].filter(Boolean).join('\n');

    return this.estimateTokens(text);
  }

  private estimateTokens(text: string): number {
    let cjk = 0;
    let ascii = 0;
    let other = 0;

    for (const char of text) {
      if (/\s/.test(char)) continue;
      if (/[\u3131-\u318E\uAC00-\uD7A3\u3040-\u30FF\u3400-\u9FFF]/.test(char)) cjk++;
      else if (char.charCodeAt(0) < 128) ascii++;
      else other++;
    }

    return Math.ceil(cjk + other * 0.8 + ascii / 4);
  }

  private buildJobAnalysisPrompt(items: CoverLetter[], target: JobCategoryTarget): string {
    const rows = items.map((item) => ({
      id: item.id,
      company: item.company,
      position: item.position,
      season: item.season,
      spec: item.spec,
      sampleQuestions: item.questions.slice(0, 3).map((q) => ({
        question: q.question,
        answerPreview: q.answer.slice(0, SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS),
      })),
    }));

    return `
다음 자기소개서 목록을 분석해줘. 가장 중요한 작업은 합격자의 정량/정성 스펙을 뽑는 것이다.

직무 카테고리 분류 기준:
- IT: 백엔드, 프론트엔드, 풀스택, 앱, 웹, 소프트웨어, 데이터, AI, ML, 보안, 클라우드, 인프라, 서버, 네트워크, QA, 디지털/플랫폼 중심 서비스기획.
- 전자: 반도체, 회로, 하드웨어, 임베디드, 펌웨어, 디스플레이, 전기전자, 제어, 통신장비, 생산기술 중 전자/반도체/하드웨어 중심.
- 영업: 국내영업, 해외영업, B2B/B2C 영업, 세일즈, 거래처 관리, 고객 관리.
- 경영/기획: 전략기획, 사업기획, 사업개발, 경영기획, 컨설팅, 프로젝트 매니저(비IT), BM.
- 마케팅: 브랜드마케팅, 디지털마케팅, 콘텐츠, 광고, 홍보, PR, SNS, 퍼포먼스마케팅.
- 인사/총무: 채용, HR, 인재개발, 교육, 노무, 총무, 경영지원, 조직문화.
- 재무/회계: 회계, 세무, 재무, 자금, 원가, 재무분석, 금융, 투자.
- 생산/제조: 품질관리, 생산관리, 공정관리, SCM, 물류, 구매, 설비.
- 기타: 위 카테고리에 명확히 해당하지 않는 직무.

스펙 추출 지침:
- school: 학교명이 있으면 원문 그대로. 없으면 빈 문자열.
- major: 전공/학부/계열이 있으면 원문 그대로. 없으면 빈 문자열.
- gpa: "3.7/4.5", "학점 4.13", "3.6"처럼 학점만 간결히. 없으면 빈 문자열.
- languages: 토익, 토익스피킹, OPIC, 토플, JLPT, HSK 등 어학 성적/등급을 원문에 가깝게 배열로.
- certificates: 자격증/면허/기사/SQLD/ADsP/정보처리기사 등.
- internships: 인턴, 현장실습, 경력, 계약직, 산학 경험.
- activities: 프로젝트, 교육, 연구, 대외활동, 교내/사회/봉사, 해외연수/교환학생 등.
- awards: 수상/공모전/대회 입상.
- skills: 언어, 프레임워크, 툴, 직무 기술.
- summary: "학교 / 전공 / 학점 / 어학 / 인턴 / 활동 / 자격증" 형태의 한 줄 요약. 없는 항목은 생략.

target=${target}

응답 형식:
{
  "items": [
    {
      "id": "원본 id",
      "jobCategory": "IT" | "전자" | "영업" | "경영/기획" | "마케팅" | "인사/총무" | "재무/회계" | "생산/제조" | "기타",
      "confidence": 0부터 100 사이 숫자,
      "reason": "분류 근거 한 문장",
      "extractedSpec": {
        "school": "학교 또는 빈 문자열",
        "major": "전공 또는 빈 문자열",
        "gpa": "학점 또는 빈 문자열",
        "languages": ["어학"],
        "certificates": ["자격증"],
        "internships": ["인턴/경력"],
        "activities": ["활동/교육/프로젝트"],
        "awards": ["수상"],
        "skills": ["직무 관련 기술/도구"],
        "summary": "한 줄 스펙 요약"
      }
    }
  ]
}

입력:
${JSON.stringify(rows, null, 2)}
`.trim();
  }

  private parseJobAnalysisJson(raw: string): CoverLetterJobAnalysis[] {
    const json = this.extractJson(raw);
    const parsed = JSON.parse(json) as { items?: CoverLetterJobAnalysis[] } | CoverLetterJobAnalysis[];
    return Array.isArray(parsed) ? parsed : parsed.items ?? [];
  }

  private extractJson(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
    return raw.trim();
  }

  private parseJsonArray(value?: string | null): string[] {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private entityToJobAnalysis(row: CoverLetterSpecAnalysisEntity): CoverLetterJobAnalysis {
    // 새 개별 컬럼 우선, 없으면 레거시 JSON 파싱
    let extractedSpec: CoverLetterJobAnalysis['extractedSpec'];
    if (row.school !== undefined && row.school !== null || row.specSummary !== undefined && row.specSummary !== null) {
      extractedSpec = {
        school: row.school || '',
        major: row.major || '',
        gpa: row.gpa || '',
        languages: this.parseJsonArray(row.languages),
        certificates: this.parseJsonArray(row.certificates),
        internships: this.parseJsonArray(row.internships),
        activities: this.parseJsonArray(row.activities),
        awards: this.parseJsonArray(row.awards),
        skills: this.parseJsonArray(row.skills),
        summary: row.specSummary || '',
      };
    } else {
      extractedSpec = { summary: '' };
      try {
        const parsed = JSON.parse(row.extractedSpec || '{}');
        extractedSpec = {
          school: parsed.school || '',
          major: parsed.major || '',
          gpa: parsed.gpa || '',
          languages: Array.isArray(parsed.languages) ? parsed.languages : [],
          certificates: Array.isArray(parsed.certificates) ? parsed.certificates : [],
          internships: Array.isArray(parsed.internships) ? parsed.internships : [],
          activities: Array.isArray(parsed.activities) ? parsed.activities : [],
          awards: Array.isArray(parsed.awards) ? parsed.awards : [],
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
          summary: parsed.summary || '',
        };
      } catch { /* ignore */ }
    }
    return {
      id: row.coverLetterId,
      jobCategory: row.jobCategory as CoverLetterJobAnalysis['jobCategory'],
      confidence: Math.round(row.confidence * 100),
      reason: row.reason ?? '',
      extractedSpec,
    };
  }

  private matchesTarget(category: string, target: string): boolean {
    if (target === 'all') return true;
    if (target === 'IT+전자') return category === 'IT' || category === '전자';
    return category === target;
  }

  private static readonly VALID_CATEGORIES: JobCategory[] = ['IT', '전자', '영업', '경영/기획', '마케팅', '인사/총무', '재무/회계', '생산/제조', '기타'];

  private normalizeJobAnalysis(item: CoverLetterJobAnalysis): CoverLetterJobAnalysis {
    const category: JobCategory = CoverLetterScraperService.VALID_CATEGORIES.includes(item.jobCategory as JobCategory)
      ? item.jobCategory as JobCategory
      : '기타';
    const spec = item.extractedSpec ?? { summary: '' };
    return {
      id: item.id,
      jobCategory: category,
      confidence: Math.max(0, Math.min(100, Number(item.confidence) || 0)),
      reason: item.reason || '',
      extractedSpec: {
        school: spec.school || '',
        major: spec.major || '',
        gpa: spec.gpa || '',
        languages: Array.isArray(spec.languages) ? spec.languages : [],
        certificates: Array.isArray(spec.certificates) ? spec.certificates : [],
        internships: Array.isArray(spec.internships) ? spec.internships : [],
        activities: Array.isArray(spec.activities) ? spec.activities : [],
        awards: Array.isArray(spec.awards) ? spec.awards : [],
        skills: Array.isArray(spec.skills) ? spec.skills : [],
        summary: spec.summary || '',
      },
    };
  }

  static inferJobCategory(position: string): JobCategory {
    const p = position.toLowerCase().replace(/\s+/g, '');
    // 전자/반도체를 IT보다 먼저 검사 (HW 엔지니어링 키워드가 IT와 중복될 수 있음)
    if (/반도체|semiconductor|회로|하드웨어|hw|임베디드|embedded|펌웨어|firmware|디스플레이|display|전기전자|전자공학|제어공학|rf[엔공]|fpga|pcb|vlsi|fab공정|웨이퍼|패키지공정|메모리설계|아날로그|시스템반도체|파운드리|eda|소자/.test(p)) {
      return '전자';
    }
    if (/백엔드|프론트엔드|풀스택|fullstack|앱개발|모바일개발|소프트웨어|software|개발자|sw엔지니어|웹개발|데이터엔지니어|데이터분석|데이터사이언|dataengineer|datascienc|ai[엔개]|머신러닝|machinelearn|딥러닝|deeplearn|클라우드|cloud|보안|security|인프라|infra|서버|server|네트워크|network|sre|devops|dba|qa|정보보안|정보기술|it[엔개서]|플랫폼|platform|si[개업]|사이버|cyber|blockchain|블록체인/.test(p)) {
      return 'IT';
    }
    if (/영업|세일즈|sales|거래처|b2b|b2c|고객관리|채널영업|솔루션영업|기술영업|대리점/.test(p)) {
      return '영업';
    }
    if (/마케팅|marketing|광고|홍보|pr[팀담]|브랜드|brand|sns|콘텐츠|content|퍼포먼스|디지털마케팅|crm|그로스/.test(p)) {
      return '마케팅';
    }
    if (/재무|회계|accounting|세무|tax|자금|원가|financial|audit|감사|fp&a|cfr|irm/.test(p)) {
      return '재무/회계';
    }
    if (/인사|hr[팀담]|채용|인재|조직문화|노무|총무|hrd|교육훈련/.test(p)) {
      return '인사/총무';
    }
    if (/생산관리|생산기술|품질관리|공정관리|scm|물류|구매|설비|manufacturing|공장|제조|qc[팀담]|qm/.test(p)) {
      return '생산/제조';
    }
    if (/기획|전략|경영|컨설팅|consulting|사업개발|bizdev|프로젝트매니저|pm[^a-z]|사업기획|신사업|전략기획/.test(p)) {
      return '경영/기획';
    }
    return '기타';
  }

  private inferCompanyType(company: string): CoverLetter['companyType'] {
    const normalized = company.toLowerCase();
    if (/(금융|은행|뱅크|증권|보험|카드|캐피탈|자산운용|저축은행|신협|새마을금고|농협|수협|신한|국민|우리|하나|토스)/i.test(company)) {
      return '금융권';
    }
    if (/(삼성|현대|sk|lg|롯데|한화|포스코|cj|gs|ls|hd현대|신세계|kt|네이버|naver|카카오|kakao|쿠팡|대한항공|아모레|셀트리온|두산|효성)/i.test(normalized)) {
      return '대기업';
    }
    if (/(코리아|테크놀로지|솔루션|시스템즈|바이오|제약|산업|공업|건설|엔지니어링|푸드|미디어|커머스)/i.test(company)) {
      return '중견기업';
    }
    return '중소기업';
  }

  /** 기존 데이터 중 jobCategory 가 null 인 행을 규칙 기반으로 일괄 분류 */
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
        chunk.map((r) => ({ ...r, jobCategory: CoverLetterScraperService.inferJobCategory(r.position) })),
      );
      updated += chunk.length;
    }
    this.logger.log(`백필 완료: ${updated}건 jobCategory 분류`);
    return { updated };
  }

  async backfillQuestionRows(): Promise<{ updated: number }> {
    const rows = await this.coverLetterRepo.find();
    if (rows.length === 0) return { updated: 0 };

    await this.questionRepo.clear();

    let updated = 0;
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const questionRows = chunk.flatMap((row) => {
        const item = this.toCoverLetter(row);
        return this.toQuestionEntities(item);
      });
      if (questionRows.length > 0) {
        await this.questionRepo.save(questionRows);
        updated += questionRows.length;
      }
    }
    if (updated > 0) this.logger.log(`합격 자소서 문항 ${updated}건을 분리 테이블로 백필`);
    return { updated };
  }

  private normalizeSearchText(value?: string | null): string {
    return (value ?? '').toLowerCase().replace(/\s+/g, '');
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
      .map((item) => this.toEntity(item));

    if (entities.length === 0) return;

    const chunkSize = 100;
    for (let i = 0; i < entities.length; i += chunkSize) {
      await this.coverLetterRepo.save(entities.slice(i, i + chunkSize));
    }
    this.logger.log(`JSONL 자소서 ${entities.length}건을 DB로 마이그레이션 완료`);
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
        // 손상된 라인 무시
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
