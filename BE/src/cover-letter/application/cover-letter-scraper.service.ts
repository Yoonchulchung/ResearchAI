import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  CoverLetter,
  CoverLetterJobAnalysis,
  CoverLetterJobAnalysisRequest,
  CoverLetterListFilters,
  ScrapeOptions,
  ScrapeStatus,
} from '../domain/cover-letter.model';
import { LinkareerCrawler } from '../infrastructure/linkareer.crawler';
import { CatchCoverLetterCrawler } from '../infrastructure/catch.crawler';
import { CatchAuthService } from '../../shared/infrastructure/auth/catch-auth.service';
import { requestContext } from '../../shared/request-context';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';

const DATA_DIR = path.resolve(__dirname, '../../../data/cover-letters');
const JSONL_FILE = path.join(DATA_DIR, 'cover-letters.jsonl');
const IDS_FILE = path.join(DATA_DIR, 'collected-ids.json');

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
  ) {
    this.catchCrawler = new CatchCoverLetterCrawler(catchAuth);
  }

  async onModuleInit() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    await this.loadCollectedIds();
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
  ): Promise<{ items: CoverLetter[]; total: number }> {
    const all = (await this.readAllFromJsonl()).map((item) => this.normalizeCoverLetterForView(item));
    const filtered = this.applyFilters(all, filters);
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);
    return { items, total };
  }

  async getById(id: string): Promise<CoverLetter | null> {
    const all = await this.readAllFromJsonl();
    return all.find((item) => item.id === id) ?? null;
  }

  async analyzeJobsWithAi(
    request: CoverLetterJobAnalysisRequest = {},
  ): Promise<{ items: CoverLetterJobAnalysis[]; target: 'IT' | '전자' | 'all'; analyzedAt: string; model: string }> {
    const target = request.target ?? 'all';
    const limit = Math.min(Math.max(request.limit ?? 30, 1), 50);
    const idSet = new Set((request.ids ?? []).filter(Boolean));
    const all = (await this.readAllFromJsonl()).map((item) => this.normalizeCoverLetterForView(item));
    const candidates = (idSet.size > 0 ? all.filter((item) => idSet.has(item.id)) : all).slice(0, limit);

    if (candidates.length === 0) {
      return { items: [], target, analyzedAt: new Date().toISOString(), model: request.model || '' };
    }

    const model = request.model || '';
    const system = [
      '너는 채용 자기소개서 데이터를 분류하는 한국어 HR 데이터 분석 에이전트다.',
      '목표는 직무명이 IT/전자/기타 중 어디에 가까운지 보수적으로 판단하고, 지원자 스펙을 구조화하는 것이다.',
      '직무명이 애매하면 본문을 근거로 판단하되, 호텔/영업/서비스/인사/회계/마케팅/리서치 등은 IT나 전자로 과분류하지 않는다.',
      '반드시 JSON만 출력한다.',
    ].join('\n');
    const prompt = this.buildJobAnalysisPrompt(candidates, target);
    const { text } = await this.aiProvider.call(model, system, prompt, {
      caller: 'cover-letter-job-analysis',
    });
    const parsed = this.parseJobAnalysisJson(text);
    const validIds = new Set(candidates.map((item) => item.id));
    const items = parsed
      .filter((item) => validIds.has(item.id))
      .map((item) => this.normalizeJobAnalysis(item))
      .filter((item) => target === 'all' || item.jobCategory === target);

    return {
      items,
      target,
      analyzedAt: new Date().toISOString(),
      model: this.aiProvider.resolveEffectiveModel(model),
    };
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
    const line = JSON.stringify(cl) + '\n';
    fs.appendFileSync(JSONL_FILE, line, 'utf-8');
    this.collectedIds.add(cl.id);
    fs.writeFileSync(IDS_FILE, JSON.stringify([...this.collectedIds]), 'utf-8');
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
    };
  }

  private applyFilters(items: CoverLetter[], filters: CoverLetterListFilters): CoverLetter[] {
    const source = filters.source?.trim();
    const companyType = filters.companyType?.trim();
    const search = this.normalize(filters.search);

    return items.filter((item) => {
      if (source && item.source !== source) return false;
      if (companyType && companyType !== '전체' && item.companyType !== companyType) return false;
      if (!search) return true;

      return [
        item.company,
        item.position,
        item.season,
        item.spec,
        item.companyType,
        ...item.questions.flatMap((q) => [q.question, q.answer]),
      ].some((value) => this.normalize(value).includes(search));
    });
  }

  private buildJobAnalysisPrompt(items: CoverLetter[], target: 'IT' | '전자' | 'all'): string {
    const rows = items.map((item) => ({
      id: item.id,
      company: item.company,
      position: item.position,
      season: item.season,
      spec: item.spec,
      sampleQuestions: item.questions.slice(0, 3).map((q) => ({
        question: q.question,
        answerPreview: q.answer.slice(0, 900),
      })),
    }));

    return `
다음 자기소개서 목록을 분석해줘.

분류 기준:
- IT: 백엔드, 프론트엔드, 풀스택, 앱, 웹, 소프트웨어, 데이터, AI, ML, 보안, 클라우드, 인프라, 서버, 네트워크, QA, PM/서비스기획 중 디지털/플랫폼 중심 직무.
- 전자: 반도체, 회로, 하드웨어, 임베디드, 펌웨어, 디스플레이, 전기전자, 제어, 통신장비, 생산기술 중 전자/반도체/하드웨어 중심 직무.
- 기타: 위 둘에 명확히 해당하지 않는 직무.

target=${target}

응답 형식:
{
  "items": [
    {
      "id": "원본 id",
      "jobCategory": "IT" | "전자" | "기타",
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

  private normalizeJobAnalysis(item: CoverLetterJobAnalysis): CoverLetterJobAnalysis {
    const category = item.jobCategory === 'IT' || item.jobCategory === '전자' ? item.jobCategory : '기타';
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

  private normalize(value?: string | null): string {
    return (value ?? '').toLowerCase().replace(/\s+/g, '');
  }

  private async loadCollectedIds() {
    if (!fs.existsSync(IDS_FILE)) return;
    try {
      const raw = fs.readFileSync(IDS_FILE, 'utf-8');
      const arr: string[] = JSON.parse(raw);
      this.collectedIds = new Set(arr);
      this.logger.log(`기존 수집 ID ${this.collectedIds.size}개 로드`);
    } catch {
      this.logger.warn('collected-ids.json 로드 실패 — 초기화');
    }
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
