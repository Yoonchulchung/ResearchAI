import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { CompanyAnalysisEntity } from '../domain/entity/company-analysis.entity';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { WebSearchService } from '../../research/application/web-search.service';
import { JobplanetScraperService } from '../infrastructure/jobplanet-scraper.service';
import { DartFinancialService, YearlyFinancial, EmployeeDetail } from '../infrastructure/dart-financial.service';
import { requestContext } from '../../shared/request-context';

import {
  COMPETENCY_KEYS, ZERO_SCORES,
  CompetencyScores, CompetencyReasons,
  SwotAnalysis, Competitor, BusinessSegment, CompanyProfile,
  CompanyAnalysisProgress, CompanyAnalysisDto,
} from '../domain/company-analysis.types';
import {
  SYSTEM_PROMPT_SCORING,
  SYSTEM_PROMPT_BUSINESS,
  SYSTEM_PROMPT_REPORT,
} from '../domain/company-analysis.prompts';
import {
  parseSearchLinks, isJobPosting, isNewsArticle, isNaverBlog, repairJsonStr,
} from './company-analysis.utils';

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

  // ── 조회 / 삭제 ────────────────────────────────────────────────────

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

  // ── 분석 스트림 ────────────────────────────────────────────────────

  async *analyzeStream(companyName: string, aiModel: string): AsyncGenerator<CompanyAnalysisProgress> {
    const key = this.normalizeKey(companyName);
    if (!key) { yield { type: 'error', message: '유효하지 않은 기업명' }; return; }

    const creds = requestContext.getStore()?.serviceCredentials ?? {};

    // 1. 인재상·채용 웹 검색
    yield { type: 'log', message: `🔍 "${companyName}" 인재상·채용 정보 검색 중...` };
    yield { type: 'searching' };

    let webContext = '';
    let evidence: { title: string; url: string }[] = [];
    try {
      const { context, sources } = await this.webSearch.runSearch(`${companyName} 인재상 핵심가치 채용 공식`);
      webContext = context;
      const srcText = sources?.tavily ?? sources?.duckduckgo ?? sources?.serper ?? sources?.naver ?? sources?.brave ?? '';
      evidence = parseSearchLinks(srcText).filter((e) => !isNaverBlog(e.url)).slice(0, 8);
    } catch {}

    // 2. 최근 뉴스 검색
    yield { type: 'log', message: `📰 "${companyName}" 최근 뉴스 검색 중...` };
    let recentNews: { title: string; url: string; date: string }[] = [];
    try {
      const { sources: newsSrc } = await this.webSearch.runSearch(`${companyName} 뉴스`);
      const newsText = newsSrc?.naver ?? newsSrc?.tavily ?? newsSrc?.serper ?? newsSrc?.duckduckgo ?? newsSrc?.brave ?? '';
      recentNews = parseSearchLinks(newsText)
        .filter((n) => n.title && !isJobPosting(n.url, n.title) && !isNaverBlog(n.url))
        .slice(0, 8)
        .map((n) => ({ ...n, date: '' }));
    } catch {}

    // 2-1. 사업부문 검색 (DART HTML 파싱 보조)
    yield { type: 'log', message: `🏭 "${companyName}" 사업부문 검색 중...` };
    let segmentContext = '';
    let segmentSources: { title: string; url: string }[] = [];
    try {
      const searchYear = new Date().getFullYear() - 1;
      const { context: segCtx, sources: segSrc } = await this.webSearch.runSearch(
        `"${companyName}" 사업보고서 사업부문 매출비중 ${searchYear}년 연결재무`,
      );
      segmentContext = segCtx?.slice(0, 4000) ?? '';
      const segSrcText = segSrc?.tavily ?? segSrc?.serper ?? segSrc?.duckduckgo ?? segSrc?.naver ?? segSrc?.brave ?? '';
      segmentSources = parseSearchLinks(segSrcText).slice(0, 6);
    } catch {}

    // 2-2. 직무소개 검색 (공식 채용 페이지 직무별 설명)
    yield { type: 'log', message: `📋 "${companyName}" 직무소개 검색 중...` };
    let jobIntroContext = '';
    try {
      const { context: jiCtx } = await this.webSearch.runSearch(
        `"${companyName}" 직무소개 직무별 업무 site:${companyName.replace(/\s/g, '').toLowerCase()}.com OR site:recruit.${companyName.replace(/\s/g, '').toLowerCase()}.com`,
      );
      if (!jiCtx?.trim()) {
        const { context: jiCtx2 } = await this.webSearch.runSearch(`"${companyName}" 직무소개 직무별 하는 일 채용 공식`);
        jobIntroContext = jiCtx2?.slice(0, 3000) ?? '';
      } else {
        jobIntroContext = jiCtx.slice(0, 3000);
      }
    } catch {}

    // 2-3. 채용 공고 검색
    yield { type: 'log', message: `📋 "${companyName}" 채용 공고 검색 중...` };
    let jobPostings: { title: string; url: string; date: string }[] = [];
    try {
      const { sources: jobSrc } = await this.webSearch.runSearch(`${companyName} 채용 공고 입사지원`);
      const jobText = jobSrc?.tavily ?? jobSrc?.serper ?? jobSrc?.duckduckgo ?? jobSrc?.naver ?? jobSrc?.brave ?? '';
      jobPostings = parseSearchLinks(jobText)
        .filter((j) => j.title && !isNaverBlog(j.url) && (isJobPosting(j.url, j.title) || !isNewsArticle(j.url)))
        .slice(0, 10)
        .map((j) => ({ ...j, date: '' }));
    } catch {}

    // 3. DART OpenAPI
    let dartText = '';
    let dartData: Awaited<ReturnType<DartFinancialService['fetchCompanyData']>> = null;
    if (creds.dartApiKey) {
      yield { type: 'log', message: '📊 DART OpenAPI 재무 데이터 수집 중...' };
      try {
        dartData = await this.dartFinancial.fetchCompanyData(companyName, creds.dartApiKey);
        if (dartData) {
          dartText = this.dartFinancial.formatForAnalysis(dartData);
          yield { type: 'log', message: `✅ DART 수집 완료 — ${dartData.multiYearFinancials.length}개년 재무·공시 ${dartData.disclosures.length}건${dartData.businessContent ? '·사업내용 파싱 완료' : ''}` };
        } else {
          yield { type: 'log', message: '⚠️ DART 기업 조회 실패 (API 키 또는 기업명 확인)' };
        }
      } catch (err) {
        yield { type: 'log', message: '⚠️ DART 수집 오류' };
        this.logger.warn(`DART: ${(err as Error).message}`);
      }
    }

    // 4. 공식 웹사이트 탐색
    yield { type: 'log', message: `🌐 "${companyName}" 공식 웹사이트 탐색 중...` };
    let officialWebsiteUrl: string | null = null;
    try {
      officialWebsiteUrl = await this.jobplanetScraper.findOfficialWebsite(companyName);
      yield { type: 'log', message: officialWebsiteUrl ? `✅ 공식 웹사이트: ${officialWebsiteUrl}` : '⚠️ 공식 웹사이트 탐색 실패' };
    } catch (err) {
      this.logger.warn(`공식 웹사이트 탐색 오류: ${(err as Error).message}`);
    }

    // 5. 잡플래닛 리뷰
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

    // 6. AI 분석 (3개 병렬 호출)
    yield { type: 'log', message: '🤖 AI 분석 시작 (3개 병렬 호출)...' };
    yield { type: 'scoring' };

    const contextParts: string[] = [];
    if (webContext.trim()) contextParts.push(`## 인재상·채용 자료\n${webContext.slice(0, 10000)}`);
    if (jobIntroContext.trim()) contextParts.push(`## 직무소개 자료 (아래 내용을 최대한 그대로 반영하세요)\n${jobIntroContext}`);
    if (segmentContext.trim()) contextParts.push(`## 사업부문·종속회사 자료\n${segmentContext}`);
    if (dartText) contextParts.push(dartText);
    if (jobplanetText) contextParts.push(jobplanetText);
    if (recentNews.length > 0) {
      contextParts.push(`## 최근 뉴스 목록\n${recentNews.map((n, i) => `${i + 1}. ${n.title}`).join('\n')}`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const userPrompt = `오늘 날짜: ${today}\n\n## 분석 대상: ${companyName}\n\n${contextParts.join('\n\n---\n\n') || '(자료 부족 — 일반 지식 기반 추정)'}`;

    let parsedScores: CompetencyScores = { ...ZERO_SCORES };
    let parsedSummary = '';
    let parsedReasons: CompetencyReasons = {};
    let parsedSwot: SwotAnalysis | null = null;
    let parsedCompetitors: Competitor[] | null = null;
    let parsedSegments: BusinessSegment[] | null = null;
    let parsedCompanyProfile: CompanyProfile | null = null;
    let parsedIndustry: string | null = null;
    let parsedCreditRating: string | null = null;
    let parsedReport: string | null = null;
    let parsedCompanySize: string | null = null;
    let parsedMissionVision: { mission: string | null; vision: string | null; coreValues: string[]; talentProfile: string | null } | null = null;
    let aiInputTokens: number | null = null;
    let aiOutputTokens: number | null = null;
    let aiEstimatedFees: number | null = null;

    const [scoringRes, businessRes, reportRes] = await Promise.allSettled([
      this.aiProvider.call(aiModel, SYSTEM_PROMPT_SCORING, userPrompt, { caller: 'CompanyAnalysis/scoring' }),
      this.aiProvider.call(aiModel, SYSTEM_PROMPT_BUSINESS, userPrompt, { caller: 'CompanyAnalysis/business' }),
      this.aiProvider.call(aiModel, SYSTEM_PROMPT_REPORT, userPrompt, { caller: 'CompanyAnalysis/report' }),
    ]);

    for (const r of [scoringRes, businessRes, reportRes]) {
      if (r.status === 'fulfilled') {
        aiInputTokens = (aiInputTokens ?? 0) + (r.value.inputTokens ?? 0);
        aiOutputTokens = (aiOutputTokens ?? 0) + (r.value.outputTokens ?? 0);
        aiEstimatedFees = (aiEstimatedFees ?? 0) + (r.value.estimatedFees ?? 0);
      }
    }

    if (scoringRes.status === 'fulfilled') {
      const p = this.parseAiJson(scoringRes.value.text, 'scoring');
      if (p) {
        parsedSummary = p.summary?.trim() ?? '';
        parsedIndustry = p.industry?.trim() || null;
        parsedCreditRating = p.creditRating?.trim() || null;
        parsedCompanySize = p.companySize?.trim() || null;
        for (const k of COMPETENCY_KEYS) {
          const v = p.scores?.[k];
          parsedScores[k] = typeof v === 'number' ? Math.max(0, Math.min(100, Math.round(v))) : 50;
          const reason = p.reasons?.[k];
          if (reason && typeof reason === 'string') parsedReasons[k] = reason.trim();
        }
        if (p.swot) {
          parsedSwot = {
            S: p.swot.S?.filter(Boolean) ?? [],
            W: p.swot.W?.filter(Boolean) ?? [],
            O: p.swot.O?.filter(Boolean) ?? [],
            T: p.swot.T?.filter(Boolean) ?? [],
          };
        }
      }
    } else {
      this.logger.error(`[AI] scoring 호출 실패: ${scoringRes.reason}`);
    }

    if (businessRes.status === 'fulfilled') {
      const p = this.parseAiJson(businessRes.value.text, 'business');
      if (p) {
        if (Array.isArray(p.competitors)) {
          const validLevels = new Set(['high', 'medium', 'low']);
          parsedCompetitors = p.competitors
            .map((c: { name?: string; reason?: string; needed?: string; threatLevel?: string }) => ({
              name: c.name?.trim() ?? '',
              reason: c.reason?.trim() ?? '',
              needed: c.needed?.trim() ?? '',
              threatLevel: validLevels.has(c.threatLevel ?? '') ? (c.threatLevel as 'high' | 'medium' | 'low') : 'medium',
            }))
            .filter((c: { name: string }) => c.name);
        }
        if (Array.isArray(p.businessSegments)) {
          parsedSegments = p.businessSegments
            .map((s: { name?: string; revenueShare?: string; description?: string; subsidiaries?: string[]; mainProducts?: string; facilities?: string; corporateCount?: string }) => ({
              name: s.name?.trim() ?? '',
              revenueShare: s.revenueShare?.trim() || null,
              description: s.description?.trim() ?? '',
              subsidiaries: Array.isArray(s.subsidiaries) ? s.subsidiaries.filter(Boolean) : null,
              mainProducts: s.mainProducts?.trim() || null,
              facilities: s.facilities?.trim() || null,
              corporateCount: s.corporateCount?.trim() || null,
            }))
            .filter((s: { name: string }) => s.name);
        }
        if (p.companyProfile) {
          const cp = p.companyProfile;
          parsedCompanyProfile = {
            businessArea: cp.businessArea?.trim() || null,
            businessStatus: cp.businessStatus?.trim() || null,
            coreValues: Array.isArray(cp.coreValues) ? cp.coreValues.filter(Boolean) : [],
            jobIntroduction: (() => {
              if (!Array.isArray(cp.jobIntroduction)) return null;
              return (cp.jobIntroduction as { name?: string; description?: string }[])
                .map((j) => ({ name: (j.name ?? '').trim(), description: (j.description ?? '').trim() }))
                .filter((j) => j.name);
            })(),
            specialNotes: cp.specialNotes?.trim() || null,
            historyAchievements: cp.historyAchievements?.trim() || null,
            socialContribution: cp.socialContribution?.trim() || null,
            employeeCount: cp.employeeCount?.trim() || null,
            brandImage: cp.brandImage?.trim() || null,
            businessPromotion: cp.businessPromotion?.trim() || null,
            currentYearGoal: cp.currentYearGoal?.trim() || null,
            nextYearGoal: cp.nextYearGoal?.trim() || null,
          };
        }
        if (p.missionVision) {
          parsedMissionVision = {
            mission: p.missionVision.mission?.trim() || null,
            vision: p.missionVision.vision?.trim() || null,
            coreValues: Array.isArray(p.missionVision.coreValues) ? p.missionVision.coreValues.filter(Boolean) : [],
            talentProfile: p.missionVision.talentProfile?.trim() || null,
          };
        }
      }
    } else {
      this.logger.error(`[AI] business 호출 실패: ${businessRes.reason}`);
    }

    if (reportRes.status === 'fulfilled') {
      const p = this.parseAiJson(reportRes.value.text, 'report');
      if (p) {
        parsedReport = p.report?.trim() || null;
        if (Array.isArray(p.categorizedNews)) {
          recentNews = recentNews.map((n) => {
            const match = p.categorizedNews.find((cn: { title?: string; category?: string; summary?: string }) =>
              cn.title && (cn.title === n.title || n.title.includes(cn.title) || cn.title.includes(n.title)),
            );
            if (match) return { ...n, category: match.category ?? undefined, summary: match.summary ?? undefined };
            return n;
          });
        }
      }
    } else {
      this.logger.error(`[AI] report 호출 실패: ${reportRes.reason}`);
    }

    if (!parsedSummary && parsedScores === ZERO_SCORES) {
      yield { type: 'error', message: 'AI 분석 실패: scoring 호출이 결과를 반환하지 않았습니다' };
      return;
    }

    // 7. DB 저장
    yield { type: 'log', message: '💾 결과 저장 중...' };
    const existing = await this.repo.findOne({ where: { companyKey: key } });
    const entity = await this.repo.save({
      id: existing?.id ?? randomUUID(),
      companyKey: key,
      companyName: companyName.trim(),
      scores: JSON.stringify(parsedScores),
      reasons: Object.keys(parsedReasons).length > 0 ? JSON.stringify(parsedReasons) : null,
      inputTokens: aiInputTokens,
      outputTokens: aiOutputTokens,
      estimatedFees: aiEstimatedFees,
      summary: parsedSummary || null,
      evidence: evidence.length > 0 ? JSON.stringify(evidence) : null,
      aiModel: aiModel || null,
      swot: parsedSwot ? JSON.stringify(parsedSwot) : null,
      competitors: parsedCompetitors?.length ? JSON.stringify(parsedCompetitors) : null,
      businessSegments: parsedSegments?.length ? JSON.stringify(parsedSegments) : null,
      segmentSources: segmentSources.length > 0 ? JSON.stringify(segmentSources) : null,
      companyProfile: parsedCompanyProfile ? JSON.stringify(parsedCompanyProfile) : null,
      industry: parsedIndustry,
      companySize: parsedCompanySize,
      creditRating: parsedCreditRating,
      report: parsedReport,
      missionVision: parsedMissionVision ? JSON.stringify(parsedMissionVision) : null,
      corpClass: dartData?.corpClass ?? null,
      stockCode: dartData?.stockCode ?? null,
      employees: dartData?.employees ?? null,
      employeeDetail: dartData?.employeeHistory?.length ? JSON.stringify(dartData.employeeHistory) : null,
      capital: dartData?.capital ?? null,
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

  // ── 내부 유틸 ──────────────────────────────────────────────────────

  private normalizeKey(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseAiJson(text: string, label: string): Record<string, any> | null {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) { this.logger.warn(`[AI/${label}] JSON 블록 없음`); return null; }

    let jsonStr = cleaned.slice(start, end + 1);
    jsonStr = repairJsonStr(jsonStr);
    jsonStr = jsonStr.replace(/\}(\s*\n+\s*)\{/g, '},$1{');
    try { return JSON.parse(jsonStr); } catch {}

    jsonStr = jsonStr
      .replace(/([:,{[]\s*)\\"/g, '$1"')
      .replace(/\\"(\s*[,}\]])/g, '"$1');
    try { return JSON.parse(jsonStr); } catch (err) {
      const msg = (err as Error).message;
      const pos = parseInt(msg.match(/position (\d+)/)?.[1] ?? '-1', 10);
      if (pos >= 0) {
        this.logger.error(`[AI/${label}] 파싱 오류 pos=${pos}:\n${jsonStr.slice(Math.max(0, pos - 150), pos + 150)}`);
      } else {
        this.logger.error(`[AI/${label}] 파싱 오류: ${msg}`);
      }
      return null;
    }
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
      inputTokens: e.inputTokens ?? null,
      outputTokens: e.outputTokens ?? null,
      estimatedFees: e.estimatedFees ?? null,
      swot: parse<SwotAnalysis>(e.swot),
      competitors: (() => {
        const raw = parse<unknown[]>(e.competitors);
        if (!raw?.length) return null;
        if (typeof raw[0] === 'string') return null;
        return raw as Competitor[];
      })(),
      businessSegments: (() => {
        const raw = parse<unknown[]>(e.businessSegments);
        if (!raw?.length) return null;
        if (typeof raw[0] === 'string') return null;
        return raw as BusinessSegment[];
      })(),
      segmentSources: parse<{ title: string; url: string }[]>(e.segmentSources),
      companyProfile: parse<CompanyProfile>(e.companyProfile),
      industry: e.industry,
      companySize: e.companySize ?? null,
      creditRating: e.creditRating,
      report: e.report,
      corpClass: e.corpClass,
      stockCode: e.stockCode ?? null,
      employees: e.employees ?? null,
      employeeHistory: (() => {
        const raw = parse<EmployeeDetail | EmployeeDetail[]>(e.employeeDetail);
        if (!raw) return null;
        return Array.isArray(raw) ? raw : [raw];
      })(),
      capital: e.capital ?? null,
      homeUrl: e.homeUrl,
      address: e.address,
      dartUrl: e.dartUrl,
      ceoName: e.ceoName,
      foundedDate: e.foundedDate,
      fiscalYear: (() => {
        const mf = parse<YearlyFinancial[]>(e.multiYearFinancials);
        return mf?.at(-1)?.year != null ? `${mf.at(-1)!.year}년` : null;
      })(),
      multiYearFinancials: parse<YearlyFinancial[]>(e.multiYearFinancials),
      financialSummary: e.financialSummary,
      disclosures: parse<{ title: string; date: string; url: string }[]>(e.disclosures),
      recentNews: parse<{ title: string; url: string; date: string; category?: string; summary?: string }[]>(e.recentNews),
      jobPostings: parse<{ title: string; url: string; date: string }[]>(e.jobPostings),
      jobplanetSummary: e.jobplanetSummary,
      missionVision: parse<{ mission: string | null; vision: string | null; coreValues: string[]; talentProfile: string | null }>(e.missionVision),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
