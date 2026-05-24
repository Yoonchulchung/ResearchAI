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
  JobCategory,
  ScrapeOptions,
  ScrapeStatus,
} from '../../domain/cover-letter/cover-letter.model';
import { LinkareerCrawler } from '../../infrastructure/cover-letter/linkareer.crawler';
import { CatchCoverLetterCrawler } from '../../infrastructure/cover-letter/catch.crawler';
import { CatchAuthService } from '../../../shared/infrastructure/auth/catch-auth.service';
import { requestContext } from '../../../shared/request-context';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';
import { CoverLetterEntity } from '../../domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterSpecAnalysisEntity } from '../../domain/cover-letter/entity/cover-letter-spec-analysis.entity';

const DATA_DIR = path.resolve(__dirname, '../../../../data/cover-letters');
const JSONL_FILE = path.join(DATA_DIR, 'cover-letters.jsonl');
const SPEC_ANALYSIS_MAX_ITEMS = 20;
const SPEC_ANALYSIS_TOKEN_BUDGET = 120_000;
const SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS = 550;

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
    @InjectRepository(CoverLetterSpecAnalysisEntity)
    private readonly specAnalysisRepo: Repository<CoverLetterSpecAnalysisEntity>,
  ) {
    this.catchCrawler = new CatchCoverLetterCrawler(catchAuth);
  }

  async onModuleInit() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    await this.migrateJsonlToDb();
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

    const qb = this.coverLetterRepo.createQueryBuilder('coverLetter');
    if (source && source !== 'all' && source !== '전체') {
      qb.andWhere('coverLetter.source = :source', { source });
    }
    if (companyType && companyType !== '전체') {
      qb.andWhere('coverLetter.companyType = :companyType', { companyType });
    }
    if (search) {
      qb.andWhere('coverLetter.searchText LIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('coverLetter.collectedAt', filters.sort === 'latest' ? 'DESC' : 'DESC')
      .addOrderBy('coverLetter.createdAt', 'DESC')
      .skip(safeOffset)
      .take(safeLimit);

    const [entities, total] = await qb.getManyAndCount();
    const items = entities.map((entity) => this.toCoverLetter(entity));
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
    const entity = await this.coverLetterRepo.findOne({ where: { id } });
    return entity ? this.toCoverLetter(entity) : null;
  }

  async analyzeJobsWithAi(
    request: CoverLetterJobAnalysisRequest = {},
  ): Promise<{ items: CoverLetterJobAnalysis[]; target: JobCategory | 'all'; analyzedAt: string; model: string }> {
    const target = request.target ?? 'all';
    const limit = Math.min(Math.max(request.limit ?? 20, 1), SPEC_ANALYSIS_MAX_ITEMS);
    const idSet = new Set((request.ids ?? []).filter(Boolean));
    const entities = idSet.size > 0
      ? await this.coverLetterRepo.find({ where: { id: In([...idSet]) } })
      : await this.coverLetterRepo.find({
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
      .filter((item) => target === 'all' || item.jobCategory === target);

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
      const specEntities = newItems.map((item) =>
        this.specAnalysisRepo.create({
          coverLetterId: item.id,
          jobCategory: item.jobCategory,
          confidence: item.confidence / 100,
          reason: item.reason || null,
          extractedSpec: JSON.stringify(item.extractedSpec),
          model: effectiveModel || null,
        }),
      );
      await this.specAnalysisRepo.save(specEntities);
    }

    const filteredNew = newItems.filter((item) => target === 'all' || item.jobCategory === target);
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
    this.collectedIds.add(cl.id);
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
      company: normalized.company,
      position: normalized.position,
      season: normalized.season,
      spec: normalized.spec,
      viewCount: normalized.viewCount ?? null,
      questions: JSON.stringify(normalized.questions ?? []),
      searchText: this.buildSearchText(normalized),
      collectedAt: this.parseDate(normalized.collectedAt),
    });
  }

  private toCoverLetter(entity: CoverLetterEntity): CoverLetter {
    let questions: CoverLetter['questions'] = [];
    try {
      const parsed = JSON.parse(entity.questions || '[]');
      questions = Array.isArray(parsed) ? parsed : [];
    } catch {
      questions = [];
    }

    return this.normalizeCoverLetterForView({
      id: entity.id,
      url: entity.url,
      source: entity.source as CoverLetter['source'],
      companyType: entity.companyType ?? undefined,
      company: entity.company,
      position: entity.position,
      season: entity.season,
      spec: entity.spec,
      viewCount: entity.viewCount ?? undefined,
      questions,
      collectedAt: entity.collectedAt.toISOString(),
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

  private buildJobAnalysisPrompt(items: CoverLetter[], target: JobCategory | 'all'): string {
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

  private entityToJobAnalysis(row: CoverLetterSpecAnalysisEntity): CoverLetterJobAnalysis {
    let extractedSpec: CoverLetterJobAnalysis['extractedSpec'] = { summary: '' };
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
    } catch {
      // ignore
    }
    return {
      id: row.coverLetterId,
      jobCategory: row.jobCategory as CoverLetterJobAnalysis['jobCategory'],
      confidence: Math.round(row.confidence * 100),
      reason: row.reason ?? '',
      extractedSpec,
    };
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
