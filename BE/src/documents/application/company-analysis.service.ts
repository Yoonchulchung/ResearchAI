import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CompanyAnalysisEntity, CompetencyScores } from '../domain/entity/company-analysis.entity';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { WebSearchService } from '../../research/application/web-search.service';
import { JobplanetScraperService } from '../infrastructure/jobplanet-scraper.service';
import { DartFinancialService, YearlyFinancial } from '../infrastructure/dart-financial.service';
import { requestContext } from '../../shared/request-context';

/** 검색 엔진이 반환하는 "[제목]\n내용\n출처: url" 형식에서 링크를 추출
 *  블록 내부 빈 줄이 있어도 안전하도록 전역 regex 방식 사용 */
function parseSearchLinks(text: string): { title: string; url: string }[] {
  if (!text) return [];
  const results: { title: string; url: string }[] = [];
  // [제목] 이후 임의의 내용을 거쳐 "출처: url"까지 매칭 (non-greedy)
  const re = /\[([^\]]+)\][\s\S]*?출처:\s*(https?:\/\/[^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ title: m[1].trim(), url: m[2].trim() });
  }
  return results;
}

const NEWS_SITE_PATTERNS = ['news', 'media', 'press', 'yna.co.kr', 'yonhap', 'kbs', 'mbc', 'sbs', 'jtbc', 'chosun', 'joongang', 'hani', 'khan', 'donga', 'heraldcorp', 'edaily', 'etnews', 'zdnet'];
const JOB_BOARD_PATTERNS = ['saramin', 'jobkorea', 'wanted', 'incruit', 'linkareer', 'catch.co', 'jumpit', 'rallit', 'programmers', 'rocketpunch', 'recruit', 'career', 'job', 'employ', 'hiring', '채용'];

function isJobPosting(url: string, title: string): boolean {
  const combined = (url + ' ' + title).toLowerCase();
  return JOB_BOARD_PATTERNS.some((p) => combined.includes(p));
}

function isNewsArticle(url: string): boolean {
  return NEWS_SITE_PATTERNS.some((p) => url.toLowerCase().includes(p));
}

const COMPETENCY_KEYS = [
  '성취지향', '도전정신', '주도성', '문제해결', '의사소통',
  '대인관계', '열정', '주인의식', '팀워크', '자원계획관리',
  '치밀성', '분석적사고', '전문성',
] as const;

const ZERO_SCORES: CompetencyScores = COMPETENCY_KEYS.reduce(
  (acc, k) => ({ ...acc, [k]: 0 }),
  {} as CompetencyScores,
);

export interface SwotAnalysis {
  S: string[];
  W: string[];
  O: string[];
  T: string[];
}

export type CompetencyReasons = Partial<Record<typeof COMPETENCY_KEYS[number], string>>;

export interface CompanyAnalysisProgress {
  type: 'log' | 'searching' | 'scoring' | 'done' | 'error';
  message?: string;
  result?: CompanyAnalysisDto;
}

export interface CompanyAnalysisDto {
  id: string;
  companyKey: string;
  companyName: string;
  scores: CompetencyScores;
  reasons: CompetencyReasons | null;
  summary: string | null;
  evidence: { title: string; url: string }[] | null;
  aiModel: string | null;
  // AI 생성
  swot: SwotAnalysis | null;
  competitors: string[] | null;
  businessSegments: string[] | null;
  industry: string | null;
  creditRating: string | null;
  report: string | null;
  // DART 기업 정보
  corpClass: string | null;
  homeUrl: string | null;
  address: string | null;
  dartUrl: string | null;
  ceoName: string | null;
  foundedDate: string | null;
  fiscalYear: string | null;
  multiYearFinancials: YearlyFinancial[] | null;
  financialSummary: string | null;
  disclosures: { title: string; date: string; url: string }[] | null;
  // 웹 수집
  recentNews: { title: string; url: string; date: string }[] | null;
  jobPostings: { title: string; url: string; date: string }[] | null;
  jobplanetSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SYSTEM_PROMPT = `당신은 기업 분석 전문가입니다. 주어진 자료를 분석하여 아래 JSON을 출력하세요.

## 13개 핵심 역량 (0~100 점수)
1. 성취지향 — 목표달성·성과추구·결과책임
2. 도전정신 — 새로운시도·리스크감수·실패극복
3. 주도성 — 자발적행동·문제발견·리더십
4. 문제해결 — 분석·대안도출·실행력
5. 의사소통 — 명확한표현·경청·설득
6. 대인관계 — 공감·신뢰·관계구축
7. 열정 — 몰입·헌신·에너지
8. 주인의식 — 책임감·당사자의식·장기관점
9. 팀워크 — 협업·집단성과·시너지
10. 자원계획관리 — 자원배분·계획·효율성
11. 치밀성 — 꼼꼼함·정확성·완결성
12. 분석적사고 — 데이터·논리·구조화·인사이트
13. 전문성 — 특정분야깊이·기술·지식

## 점수 기준
80~100: 매우 강조(인재상 명시·반복) | 60~79: 중요시(직무·문화반영) | 40~59: 평균 | 20~39: 낮음 | 0~19: 거의 무관

## 출력 형식 (JSON만, 다른 텍스트 금지)
\`\`\`json
{
  "summary": "인재상 핵심 2~3문장 (복지·재무 정보도 포함)",
  "industry": "업종명 (예: IT서비스, 반도체, 금융, 유통, 제조업 등)",
  "creditRating": "신용등급 (예: AAA, AA+, A0) — 알 수 없으면 null",
  "report": "## 1. 기업 개요\n(회사 소개·역사·규모 3~5문장)\n\n## 2. 핵심 사업 모델\n(주요 제품·서비스·수익구조 3~5문장)\n\n## 3. 재무 및 성장성\n(매출·이익 트렌드·재무 건전성 3~5문장)\n\n## 4. 조직문화 및 인재상\n(기업문화·복지·인재상 3~5문장)\n\n## 5. 투자 관점 평가\n(기회요인·위험요인·종합의견 3~5문장)",
  "scores": {
    "성취지향": 0, "도전정신": 0, "주도성": 0, "문제해결": 0,
    "의사소통": 0, "대인관계": 0, "열정": 0, "주인의식": 0,
    "팀워크": 0, "자원계획관리": 0, "치밀성": 0, "분석적사고": 0, "전문성": 0
  },
  "reasons": {
    "성취지향": "이 점수를 준 구체적 근거 1~2문장",
    "도전정신": "...", "주도성": "...", "문제해결": "...",
    "의사소통": "...", "대인관계": "...", "열정": "...", "주인의식": "...",
    "팀워크": "...", "자원계획관리": "...", "치밀성": "...", "분석적사고": "...", "전문성": "..."
  },
  "swot": {
    "S": ["강점1", "강점2", "강점3"],
    "W": ["약점1", "약점2"],
    "O": ["기회1", "기회2"],
    "T": ["위협1", "위협2"]
  },
  "competitors": ["경쟁사1", "경쟁사2", "경쟁사3"],
  "businessSegments": ["핵심사업부문1 — 간략설명", "사업부문2 — 간략설명"]
}
\`\`\``;

@Injectable()
export class CompanyAnalysisService {
  private readonly logger = new Logger(CompanyAnalysisService.name);

  constructor(
    @InjectRepository(CompanyAnalysisEntity)
    private readonly repo: Repository<CompanyAnalysisEntity>,
    private readonly aiProvider: AiProviderService,
    private readonly webSearch: WebSearchService,
    private readonly jobplanetScraper: JobplanetScraperService,
    private readonly dartFinancial: DartFinancialService,
  ) {}

  private normalizeKey(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  }

  async findAll(): Promise<CompanyAnalysisDto[]> {
    const rows = await this.repo.find({ order: { updatedAt: 'DESC' } });
    return rows.map((r) => this.toDto(r));
  }

  async findByKey(companyKey: string): Promise<CompanyAnalysisDto> {
    const row = await this.repo.findOne({ where: { companyKey } });
    if (!row) throw new NotFoundException(`기업 분석 결과 없음: ${companyKey}`);
    return this.toDto(row);
  }

  async findByName(companyName: string): Promise<CompanyAnalysisDto | null> {
    const key = this.normalizeKey(companyName);
    const row = await this.repo.findOne({ where: { companyKey: key } });
    return row ? this.toDto(row) : null;
  }

  async delete(companyKey: string): Promise<void> {
    await this.repo.delete({ companyKey });
  }

  async *analyzeStream(companyName: string, aiModel: string): AsyncGenerator<CompanyAnalysisProgress> {
    const key = this.normalizeKey(companyName);
    if (!key) { yield { type: 'error', message: '유효하지 않은 기업명' }; return; }

    const creds = requestContext.getStore()?.serviceCredentials ?? {};

    // ── 1. 인재상·채용 웹 검색 ─────────────────────────────────────────
    yield { type: 'log', message: `🔍 "${companyName}" 인재상·채용 정보 검색 중...` };
    yield { type: 'searching' };

    let webContext = '';
    let evidence: { title: string; url: string }[] = [];
    try {
      const { context, sources } = await this.webSearch.runSearch(`${companyName} 인재상 핵심가치 채용 공식`);
      webContext = context;
      const srcText = sources?.tavily ?? sources?.duckduckgo ?? sources?.serper ?? sources?.naver ?? sources?.brave ?? '';
      evidence = parseSearchLinks(srcText).slice(0, 8);
    } catch {}

    // ── 2. 최근 뉴스 검색 ──────────────────────────────────────────────
    yield { type: 'log', message: `📰 "${companyName}" 최근 뉴스 검색 중...` };
    let recentNews: { title: string; url: string; date: string }[] = [];
    try {
      // 뉴스 전용 쿼리 — 채용/인재상 관련어 제외
      const { sources: newsSrc } = await this.webSearch.runSearch(`${companyName} 뉴스`);
      const newsText = newsSrc?.naver ?? newsSrc?.tavily ?? newsSrc?.serper ?? newsSrc?.duckduckgo ?? newsSrc?.brave ?? '';
      recentNews = parseSearchLinks(newsText)
        .filter((n) => n.title && !isJobPosting(n.url, n.title))  // 채용 링크 제외
        .slice(0, 8)
        .map((n) => ({ ...n, date: '' }));
    } catch {}

    // ── 2-1. 채용 공고 검색 ────────────────────────────────────────────
    yield { type: 'log', message: `📋 "${companyName}" 채용 공고 검색 중...` };
    let jobPostings: { title: string; url: string; date: string }[] = [];
    try {
      const { sources: jobSrc } = await this.webSearch.runSearch(`${companyName} 채용 공고 입사지원`);
      const jobText = jobSrc?.tavily ?? jobSrc?.serper ?? jobSrc?.duckduckgo ?? jobSrc?.naver ?? jobSrc?.brave ?? '';
      jobPostings = parseSearchLinks(jobText)
        .filter((j) => j.title && (isJobPosting(j.url, j.title) || !isNewsArticle(j.url)))  // 뉴스 기사 제외
        .slice(0, 10)
        .map((j) => ({ ...j, date: '' }));
    } catch {}

    // ── 3. DART OpenAPI 재무 데이터 ────────────────────────────────────
    let dartText = '';
    let dartData: Awaited<ReturnType<DartFinancialService['fetchCompanyData']>> = null;
    if (creds.dartApiKey) {
      yield { type: 'log', message: '📊 DART OpenAPI 재무 데이터 수집 중...' };
      try {
        dartData = await this.dartFinancial.fetchCompanyData(companyName, creds.dartApiKey);
        if (dartData) {
          dartText = this.dartFinancial.formatForAnalysis(dartData);
          yield { type: 'log', message: `✅ DART 수집 완료 — ${dartData.multiYearFinancials.length}개년 재무·공시 ${dartData.disclosures.length}건` };
        } else {
          yield { type: 'log', message: '⚠️ DART 기업 조회 실패 (API 키 또는 기업명 확인)' };
        }
      } catch (err) {
        yield { type: 'log', message: '⚠️ DART 수집 오류' };
        this.logger.warn(`DART: ${(err as Error).message}`);
      }
    }

    // ── 4. 공식 웹사이트 탐색 (Puppeteer) ────────────────────────────────
    yield { type: 'log', message: `🌐 "${companyName}" 공식 웹사이트 탐색 중...` };
    let officialWebsiteUrl: string | null = null;
    try {
      officialWebsiteUrl = await this.jobplanetScraper.findOfficialWebsite(companyName);
      if (officialWebsiteUrl) {
        yield { type: 'log', message: `✅ 공식 웹사이트: ${officialWebsiteUrl}` };
      } else {
        yield { type: 'log', message: '⚠️ 공식 웹사이트 탐색 실패' };
      }
    } catch (err) {
      this.logger.warn(`공식 웹사이트 탐색 오류: ${(err as Error).message}`);
    }

    // ── 5. 잡플래닛 리뷰 ──────────────────────────────────────────────
    let jobplanetText = '';
    if (creds.jobplanetId && creds.jobplanetPassword) {
      yield { type: 'log', message: '💼 잡플래닛 기업 리뷰 수집 중...' };
      try {
        const jpData = await this.jobplanetScraper.scrapeCompany(companyName, creds.jobplanetId, creds.jobplanetPassword);
        if (jpData) {
          jobplanetText = this.jobplanetScraper.formatForAnalysis(jpData);
          yield { type: 'log', message: `✅ 잡플래닛 수집 완료 (리뷰 ${jpData.reviewCount}개, 평점 ${jpData.overallRating})` };
        } else {
          yield { type: 'log', message: '⚠️ 잡플래닛 수집 실패 (로그인 확인 필요)' };
        }
      } catch (err) {
        yield { type: 'log', message: '⚠️ 잡플래닛 수집 오류' };
        this.logger.warn(`Jobplanet: ${(err as Error).message}`);
      }
    }

    yield { type: 'log', message: '🤖 AI 종합 분석 시작...' };
    yield { type: 'scoring' };

    // ── 6. AI 분석 ─────────────────────────────────────────────────────
    const contextParts: string[] = [];
    if (webContext.trim()) contextParts.push(`## 인재상·채용 자료\n${webContext.slice(0, 10000)}`);
    if (dartText) contextParts.push(dartText);
    if (jobplanetText) contextParts.push(jobplanetText);

    const userPrompt = `## 분석 대상: ${companyName}\n\n${contextParts.join('\n\n---\n\n') || '(자료 부족 — 일반 지식 기반 추정)'}`;

    let parsedScores: CompetencyScores = { ...ZERO_SCORES };
    let parsedSummary = '';
    let parsedReasons: CompetencyReasons = {};
    let parsedSwot: SwotAnalysis | null = null;
    let parsedCompetitors: string[] | null = null;
    let parsedSegments: string[] | null = null;
    let parsedIndustry: string | null = null;
    let parsedCreditRating: string | null = null;
    let parsedReport: string | null = null;

    try {
      const { text } = await this.aiProvider.call(aiModel, SYSTEM_PROMPT, userPrompt, { caller: 'CompanyAnalysis' });
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('JSON 파싱 실패');

      let jsonStr = cleaned.slice(start, end + 1);

      // AI가 JSON 값 위치에 \"...\" (이스케이프 따옴표)를 출력하는 경우 수정
      try { JSON.parse(jsonStr); } catch {
        jsonStr = jsonStr
          .replace(/([:,{[]\s*)\\"/g, '$1"')   // :\" → :"
          .replace(/\\"(\s*[,}\]])/g, '"$1');  // \", → ",
      }

      const parsed = JSON.parse(jsonStr) as {
        summary?: string;
        industry?: string;
        creditRating?: string | null;
        report?: string;
        scores?: Partial<CompetencyScores>;
        reasons?: Partial<Record<string, string>>;
        swot?: { S?: string[]; W?: string[]; O?: string[]; T?: string[] };
        competitors?: string[];
        businessSegments?: string[];
      };

      parsedSummary = parsed.summary?.trim() ?? '';
      parsedIndustry = parsed.industry?.trim() || null;
      parsedCreditRating = parsed.creditRating?.trim() || null;
      parsedReport = parsed.report?.trim() || null;

      for (const k of COMPETENCY_KEYS) {
        const v = parsed.scores?.[k];
        parsedScores[k] = typeof v === 'number' ? Math.max(0, Math.min(100, Math.round(v))) : 50;
        const r = parsed.reasons?.[k];
        if (r && typeof r === 'string') parsedReasons[k] = r.trim();
      }

      if (parsed.swot) {
        parsedSwot = {
          S: parsed.swot.S?.filter(Boolean) ?? [],
          W: parsed.swot.W?.filter(Boolean) ?? [],
          O: parsed.swot.O?.filter(Boolean) ?? [],
          T: parsed.swot.T?.filter(Boolean) ?? [],
        };
      }

      if (Array.isArray(parsed.competitors)) parsedCompetitors = parsed.competitors.filter(Boolean);
      if (Array.isArray(parsed.businessSegments)) parsedSegments = parsed.businessSegments.filter(Boolean);
    } catch (err) {
      this.logger.error(`AI 분석 실패: ${(err as Error).message}`);
      yield { type: 'error', message: `AI 분석 실패: ${(err as Error).message}` };
      return;
    }

    yield { type: 'log', message: '💾 결과 저장 중...' };

    // ── 6. DB 저장 ──────────────────────────────────────────────────────
    const existing = await this.repo.findOne({ where: { companyKey: key } });
    const entity = await this.repo.save({
      id: existing?.id ?? randomUUID(),
      companyKey: key,
      companyName: companyName.trim(),
      scores: JSON.stringify(parsedScores),
      reasons: Object.keys(parsedReasons).length > 0 ? JSON.stringify(parsedReasons) : null,
      summary: parsedSummary || null,
      evidence: evidence.length > 0 ? JSON.stringify(evidence) : null,
      aiModel: aiModel || null,
      swot: parsedSwot ? JSON.stringify(parsedSwot) : null,
      competitors: parsedCompetitors?.length ? JSON.stringify(parsedCompetitors) : null,
      businessSegments: parsedSegments?.length ? JSON.stringify(parsedSegments) : null,
      industry: parsedIndustry,
      creditRating: parsedCreditRating,
      report: parsedReport,
      corpClass: dartData?.corpClass ?? null,
      homeUrl: officialWebsiteUrl ?? dartData?.homeUrl ?? null,
      address: dartData?.address ?? null,
      dartUrl: dartData?.dartUrl ?? null,
      ceoName: dartData?.ceoName ?? null,
      foundedDate: dartData?.foundedDate ?? null,
      disclosures: dartData?.disclosures?.length ? JSON.stringify(dartData.disclosures.slice(0, 5)) : null,
      multiYearFinancials: dartData?.multiYearFinancials?.length ? JSON.stringify(dartData.multiYearFinancials) : null,
      financialSummary: dartText || null,
      recentNews: recentNews.length > 0 ? JSON.stringify(recentNews) : null,
      jobPostings: jobPostings.length > 0 ? JSON.stringify(jobPostings) : null,
      jobplanetSummary: jobplanetText || null,
    });

    yield { type: 'done', result: this.toDto(entity) };
  }

  private toDto(e: CompanyAnalysisEntity): CompanyAnalysisDto {
    const parse = <T>(json: string | null): T | null => {
      if (!json) return null;
      try { return JSON.parse(json) as T; } catch { return null; }
    };

    return {
      id: e.id,
      companyKey: e.companyKey,
      companyName: e.companyName,
      scores: parse<CompetencyScores>(e.scores) ?? { ...ZERO_SCORES },
      reasons: parse<CompetencyReasons>(e.reasons),
      summary: e.summary,
      evidence: parse<{ title: string; url: string }[]>(e.evidence),
      aiModel: e.aiModel,
      swot: parse<SwotAnalysis>(e.swot),
      competitors: parse<string[]>(e.competitors),
      businessSegments: parse<string[]>(e.businessSegments),
      industry: e.industry,
      creditRating: e.creditRating,
      report: e.report,
      corpClass: e.corpClass,
      homeUrl: e.homeUrl,
      address: e.address,
      dartUrl: e.dartUrl,
      ceoName: e.ceoName,
      foundedDate: e.foundedDate,
      fiscalYear: (() => { const mf = parse<YearlyFinancial[]>(e.multiYearFinancials); return mf?.at(-1)?.year != null ? `${mf.at(-1)!.year}년` : null; })(),
      multiYearFinancials: parse<YearlyFinancial[]>(e.multiYearFinancials),
      financialSummary: e.financialSummary,
      disclosures: parse<{ title: string; date: string; url: string }[]>(e.disclosures),
      recentNews: parse<{ title: string; url: string; date: string }[]>(e.recentNews),
      jobPostings: parse<{ title: string; url: string; date: string }[]>(e.jobPostings),
      jobplanetSummary: e.jobplanetSummary,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
