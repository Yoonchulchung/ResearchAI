import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { CompanyAnalysisEntity } from '../domain/entity/company-analysis.entity';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { WebSearchService } from '../../research/application/web-search.service';
import type { SearchSources } from '../../research/domain/model/search-sources.model';
import { JobplanetScraperService } from '../infrastructure/jobplanet-scraper.service';
import { CareerPageUrlService } from '../infrastructure/career-page-url.service';
import { DartFinancialService, YearlyFinancial, EmployeeDetail } from '../infrastructure/dart-financial.service';
import { NeonetRealEstatePriceService } from '../infrastructure/neonet-real-estate-price.service';
import { ZippoomRealEstateUrlService } from '../infrastructure/zippoom-real-estate-url.service';
import { requestContext } from '../../shared/request-context';

import {
  COMPETENCY_KEYS, ZERO_SCORES,
  CompetencyScores, CompetencyReasons,
  SwotAnalysis, Competitor, BusinessSegment, CompanyProfile, HrAnalysis,
  CompanyAnalysisProgress, CompanyAnalysisDto,
} from '../domain/company-analysis.types';
import {
  SYSTEM_PROMPT_SCORING,
  SYSTEM_PROMPT_BUSINESS,
  SYSTEM_PROMPT_REPORT,
  SYSTEM_PROMPT_HR,
} from '../domain/company-analysis.prompts';
import {
  parseSearchLinks, cleanSearchTitle, isBadNewsTitle, isJobPosting, isNewsArticle, isLikelyNewsArticle, isNaverBlog, repairJsonStr,
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
    private readonly careerPageUrl: CareerPageUrlService,
    private readonly dartFinancial: DartFinancialService,
    private readonly neonetRealEstatePrice: NeonetRealEstatePriceService,
    private readonly zippoomRealEstateUrl: ZippoomRealEstateUrlService,
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

    let effectiveAiModel = '';
    try {
      effectiveAiModel = this.aiProvider.resolveEffectiveModel(this.aiProvider.resolveEffectiveModel(aiModel));
    } catch (e) {
      yield { type: 'error', message: this.formatErrorMessage(e, '요청한 AI 모델을 사용할 수 없습니다.') };
      return;
    }

    const creds = requestContext.getStore()?.serviceCredentials ?? {};

    // 1. 인재상·채용 웹 검색
    yield { type: 'log', message: `🔍 "${companyName}" 인재상·채용 정보 검색 중...` };
    yield { type: 'searching' };

    let webContext = '';
    let evidence: { title: string; url: string }[] = [];
    try {
      const { context, sources } = await this.webSearch.runSearch(`${companyName} 인재상 핵심가치 채용 공식`);
      webContext = context;
      const srcText = this.getDefaultSearchSourceText(sources);
      evidence = parseSearchLinks(srcText).filter((e) => !isNaverBlog(e.url)).slice(0, 8);
    } catch {}

    // 2. 최근 뉴스 검색
    yield { type: 'log', message: `📰 "${companyName}" 최근 뉴스 검색 중...` };
    let recentNews: { title: string; url: string; date: string }[] = [];
    try {
      const { sources: newsSrc } = await this.webSearch.runSearch(`${companyName} 뉴스`);
      const newsText = this.getDefaultSearchSourceText(newsSrc);
      recentNews = parseSearchLinks(newsText)
        .map((n) => ({ ...n, title: cleanSearchTitle(n.title) }))
        .filter((n) => n.title && !isBadNewsTitle(n.title) && !isJobPosting(n.url, n.title) && !isNaverBlog(n.url) && isLikelyNewsArticle(n.url, n.title))
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
      const segSrcText = this.getDefaultSearchSourceText(segSrc);
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
    let careerPageCandidates: { title: string; url: string }[] = [];
    try {
      const { sources: jobSrc } = await this.webSearch.runSearch(`${companyName} 채용 공고 입사지원`);
      const jobText = this.getDefaultSearchSourceText(jobSrc);
      jobPostings = parseSearchLinks(jobText)
        .filter((j) => j.title && !isNaverBlog(j.url) && (isJobPosting(j.url, j.title) || !isNewsArticle(j.url)))
        .slice(0, 10)
        .map((j) => ({ ...j, date: '' }));

      const { sources: careerSrc } = await this.webSearch.runSearch(`${companyName} 공식 채용 사이트 career jobs`);
      const careerText = this.getDefaultSearchSourceText(careerSrc);
      careerPageCandidates = parseSearchLinks(careerText)
        .filter((j) => j.title && !isNaverBlog(j.url) && isJobPosting(j.url, j.title))
        .slice(0, 10);
    } catch {}

    // 2-4. 경쟁사 후보 검색 — AI가 없는 회사를 만들지 않도록 크롤링 결과 기반 후보만 제공
    yield { type: 'log', message: `🧭 "${companyName}" 경쟁사 후보 크롤링 중...` };
    let competitorContext = '';
    let competitorSources: { title: string; url: string }[] = [];
    try {
      const queries = [
        `"${companyName}" 경쟁사 국내 시장 점유율`,
        `"${companyName}" competitors Korea market`,
        `"${companyName}" 경쟁 입찰 수주 해외 기업 국내`,
      ];
      const competitorParts: string[] = [];
      for (const query of queries) {
        const { context, sources } = await this.webSearch.runSearch(query);
        const sourceText = this.getDefaultSearchSourceText(sources);
        if (context?.trim()) competitorParts.push(`### 검색어: ${query}\n${context.slice(0, 5000)}`);
        competitorSources.push(...parseSearchLinks(sourceText).filter((s) => !isNaverBlog(s.url)));
      }
      competitorContext = competitorParts.join('\n\n---\n\n').slice(0, 14000);
      competitorSources = this.uniqueSources(competitorSources).slice(0, 12);
    } catch {}

    // 2-5. 공식 웹사이트 탐색 (기술 블로그·공식 채용 페이지 도메인 보조)
    yield { type: 'log', message: `🌐 "${companyName}" 공식 웹사이트 탐색 중...` };
    let officialWebsiteUrl: string | null = null;
    try {
      officialWebsiteUrl = await this.jobplanetScraper.findOfficialWebsite(companyName);
      yield { type: 'log', message: officialWebsiteUrl ? `✅ 공식 웹사이트: ${officialWebsiteUrl}` : '⚠️ 공식 웹사이트 탐색 실패' };
    } catch (err) {
      this.logger.warn(`공식 웹사이트 탐색 오류: ${(err as Error).message}`);
    }

    // 2-6. 기술 조직·HRD 신호 크롤링
    yield { type: 'log', message: `🧪 "${companyName}" 기술 조직·HRD 신호 크롤링 중...` };
    let hrTechContext = '';
    let hrTechSources: { category: string; title: string; url: string }[] = [];
    try {
      const { context, sources } = await this.collectHrTechContext(companyName, officialWebsiteUrl);
      hrTechContext = context;
      hrTechSources = sources;
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

    // 6. 아파트 시세 조회 (DART 주소 기반, 백그라운드)
    let apartmentPrices: CompanyAnalysisDto['apartmentPrices'] = null;
    const dartAddress = dartData?.address ?? null;
    if (dartAddress) {
      yield { type: 'log', message: `🏠 인근 아파트 시세 조회 중 (${this.neonetRealEstatePrice.extractDistrict(dartAddress) ?? dartAddress})...` };
      try {
        apartmentPrices = await this.neonetRealEstatePrice.fetchDistrictPrices(dartAddress);
        if (apartmentPrices) {
          apartmentPrices = {
            ...apartmentPrices,
            naverLandUrl: this.zippoomRealEstateUrl.buildApartmentUrl(dartAddress),
          };
          yield { type: 'log', message: `✅ 시세 조회 완료 — 단지 ${apartmentPrices.complexCount}개, 평균 매매 ${apartmentPrices.avgDealPrice ? (apartmentPrices.avgDealPrice / 10000).toFixed(1) + '억' : '-'}` };
        } else {
          yield { type: 'log', message: '⚠️ 시세 데이터 없음 (지원 지역 외 또는 부동산뱅크 목록 없음)' };
        }
      } catch (err) {
        this.logger.warn(`NeonetRealEstate: ${(err as Error).message}`);
      }
    }

    // 7. AI 분석 (4개 병렬 호출)
    yield { type: 'scoring' };

    const contextParts: string[] = [];
    if (webContext.trim()) contextParts.push(`## 인재상·채용 자료\n${webContext.slice(0, 10000)}`);
    if (jobIntroContext.trim()) contextParts.push(`## 직무소개 자료 (아래 내용을 최대한 그대로 반영하세요)\n${jobIntroContext}`);
    if (segmentContext.trim()) contextParts.push(`## 사업부문·종속회사 자료\n${segmentContext}`);
    if (competitorContext.trim()) {
      contextParts.push(`## 경쟁사 후보 크롤링 자료 (competitors는 아래 자료에 기업명과 출처 URL이 있는 경우만 작성)\n${competitorContext}`);
    } else {
      contextParts.push('## 경쟁사 후보 크롤링 자료\n경쟁사 후보를 확인할 크롤링 자료가 없습니다. competitors는 []로 작성하세요.');
    }
    if (hrTechContext.trim()) {
      contextParts.push(`## 기술 조직·HRD 신호 크롤링 자료 (HR 분석은 이 자료를 최우선 근거로 사용)\n${hrTechContext}`);
    } else {
      contextParts.push('## 기술 조직·HRD 신호 크롤링 자료\n테크 블로그, GitHub, 컨퍼런스, 기술스택, 기술 인터뷰 관련 크롤링 자료가 없습니다. HR 분석에서 기술 기반 성장·개발 문화는 확인 부족으로 보수적으로 평가하세요.');
    }
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
    let parsedHrAnalysis: HrAnalysis | null = null;
    let aiInputTokens: number | null = null;
    let aiOutputTokens: number | null = null;
    let aiEstimatedFees: number | null = null;

    yield { type: 'log', message: '🤖 AI 분석 시작 (4개 병렬 호출)...' };

    const [scoringRes, businessRes, reportRes, hrRes] = await Promise.allSettled([
      this.aiProvider.call(effectiveAiModel, SYSTEM_PROMPT_SCORING, userPrompt, { caller: 'CompanyAnalysis/scoring' }),
      this.aiProvider.call(effectiveAiModel, SYSTEM_PROMPT_BUSINESS, userPrompt, { caller: 'CompanyAnalysis/business' }),
      this.aiProvider.call(effectiveAiModel, SYSTEM_PROMPT_REPORT, userPrompt, { caller: 'CompanyAnalysis/report' }),
      this.aiProvider.call(effectiveAiModel, SYSTEM_PROMPT_HR, userPrompt, { caller: 'CompanyAnalysis/hr' }),
    ]);

    if (scoringRes.status === 'rejected') {
      const reason = this.formatSettledError(scoringRes);
      this.logger.error(`[AI] scoring 호출 실패: ${reason}`);
      yield { type: 'error', message: `AI 분석 실패: ${reason}` };
      return;
    }

    for (const r of [scoringRes, businessRes, reportRes, hrRes]) {
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
    }

    if (businessRes.status === 'fulfilled') {
      const p = this.parseAiJson(businessRes.value.text, 'business');
      if (p) {
        if (Array.isArray(p.competitors)) {
          const validLevels = new Set(['high', 'medium', 'low']);
          const validScopes = new Set(['domestic', 'global_affects_domestic']);
          parsedCompetitors = p.competitors
            .map((c: { name?: string; reason?: string; needed?: string; threatLevel?: string; siteUrl?: string; sourceTitle?: string; sourceUrl?: string; marketScope?: string }) => ({
              name: c.name?.trim() ?? '',
              reason: c.reason?.trim() ?? '',
              needed: c.needed?.trim() ?? '',
              threatLevel: validLevels.has(c.threatLevel ?? '') ? (c.threatLevel as 'high' | 'medium' | 'low') : 'medium',
              siteUrl: c.siteUrl?.trim() || null,
              sourceTitle: c.sourceTitle?.trim() || null,
              sourceUrl: c.sourceUrl?.trim() || null,
              marketScope: validScopes.has(c.marketScope ?? '') ? (c.marketScope as 'domestic' | 'global_affects_domestic') : null,
            }))
            .filter((c: Competitor) => this.isVerifiedCompetitor(c, companyName, competitorContext, competitorSources));
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

    if (hrRes.status === 'fulfilled') {
      const p = this.parseAiJson(hrRes.value.text, 'hr');
      if (p) {
        parsedHrAnalysis = {
          hrWheel: Array.isArray(p.hrWheel)
            ? p.hrWheel.map((w: { area?: string; score?: number; evidence?: string }) => ({
                area: w.area?.trim() ?? '',
                score: typeof w.score === 'number' ? Math.max(0, Math.min(100, Math.round(w.score))) : 50,
                evidence: w.evidence?.trim() ?? '',
              })).filter((w: { area: string }) => w.area)
            : null,
          competingValues: p.competingValues
            ? {
                clan: Number(p.competingValues.clan) || 0,
                adhocracy: Number(p.competingValues.adhocracy) || 0,
                market: Number(p.competingValues.market) || 0,
                hierarchy: Number(p.competingValues.hierarchy) || 0,
                dominant: p.competingValues.dominant ?? 'clan',
                description: p.competingValues.description?.trim() ?? '',
                evidence: p.competingValues.evidence
                  ? {
                      clan: p.competingValues.evidence.clan?.trim() || undefined,
                      adhocracy: p.competingValues.evidence.adhocracy?.trim() || undefined,
                      market: p.competingValues.evidence.market?.trim() || undefined,
                      hierarchy: p.competingValues.evidence.hierarchy?.trim() || undefined,
                    }
                  : null,
              }
            : null,
          ulrichModel: p.ulrichModel
            ? {
                strategicPartner: Number(p.ulrichModel.strategicPartner) || 0,
                changeAgent: Number(p.ulrichModel.changeAgent) || 0,
                adminExpert: Number(p.ulrichModel.adminExpert) || 0,
                employeeChampion: Number(p.ulrichModel.employeeChampion) || 0,
                dominant: p.ulrichModel.dominant?.trim() ?? '',
                description: p.ulrichModel.description?.trim() ?? '',
              }
            : null,
          harvardModel: p.harvardModel
            ? {
                situationalFactors: Array.isArray(p.harvardModel.situationalFactors) ? p.harvardModel.situationalFactors.filter(Boolean) : [],
                stakeholderInterests: Array.isArray(p.harvardModel.stakeholderInterests) ? p.harvardModel.stakeholderInterests.filter(Boolean) : [],
                hrPolicies: Array.isArray(p.harvardModel.hrPolicies) ? p.harvardModel.hrPolicies.filter(Boolean) : [],
                hrOutcomes: Array.isArray(p.harvardModel.hrOutcomes) ? p.harvardModel.hrOutcomes.filter(Boolean) : [],
                longTermConsequences: Array.isArray(p.harvardModel.longTermConsequences) ? p.harvardModel.longTermConsequences.filter(Boolean) : [],
                summary: p.harvardModel.summary?.trim() ?? '',
              }
            : null,
          careerPageUrl: this.careerPageUrl.normalize(
            companyName,
            p.careerPageUrl?.trim() || null,
            [...careerPageCandidates.map((candidate) => candidate.url), ...jobPostings.map((posting) => posting.url)],
            officialWebsiteUrl,
          ),
          dataCollectionNote: p.dataCollectionNote?.trim() || null,
        };
      }
    } else {
      this.logger.error(`[AI] hr 호출 실패: ${hrRes.reason}`);
    }

    if (!parsedSummary && this.areScoresEmpty(parsedScores)) {
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
      aiModel: effectiveAiModel || null,
      swot: parsedSwot ? JSON.stringify(parsedSwot) : null,
      competitors: parsedCompetitors?.length ? JSON.stringify(parsedCompetitors) : null,
      competitorSources: competitorSources.length > 0 ? JSON.stringify(competitorSources) : null,
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
      hrTechSources: hrTechSources.length > 0 ? JSON.stringify(hrTechSources) : null,
      jobplanetSummary: jobplanetText || null,
      hrAnalysis: parsedHrAnalysis ? JSON.stringify(parsedHrAnalysis) : null,
      apartmentPrices: apartmentPrices ? JSON.stringify(apartmentPrices) : null,
      sourceContext: userPrompt,
    });

    yield { type: 'done', result: this.toDto(entity) };
  }

  // ── 내부 유틸 ──────────────────────────────────────────────────────

  private normalizeKey(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  }

  private formatErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
  }

  private formatSettledError(result: PromiseRejectedResult): string {
    return this.formatErrorMessage(result.reason, 'AI 호출이 실패했습니다.');
  }

  private areScoresEmpty(scores: CompetencyScores): boolean {
    return COMPETENCY_KEYS.every((key) => !scores[key]);
  }

  async buildChatContext(companyKey: string): Promise<string> {
    const row = await this.repo.findOne({ where: { companyKey } });
    if (!row) throw new NotFoundException(`기업 분석 결과 없음: ${companyKey}`);
    return this.formatChatContext(this.toDto(row), row.sourceContext);
  }

  private formatChatContext(c: CompanyAnalysisDto, sourceContext: string | null): string {
    const parts: string[] = [
      `## 분석 대상\n회사명: ${c.companyName}\n분석일: ${c.updatedAt.toISOString()}\n모델: ${c.aiModel ?? 'unknown'}`,
    ];

    if (c.summary) parts.push(`## 인재상·조직문화 요약\n${c.summary}`);
    if (c.report) parts.push(`## 기업 분석 보고서\n${c.report}`);

    const scoreLines = COMPETENCY_KEYS.map((key) => {
      const reason = c.reasons?.[key];
      return `- ${key}: ${c.scores[key]}점${reason ? ` | 근거: ${reason}` : ''}`;
    });
    parts.push(`## 핵심 역량 점수와 근거\n${scoreLines.join('\n')}`);

    if (c.hrAnalysis) {
      const hrParts: string[] = [];
      if (c.hrAnalysis.hrWheel?.length) {
        const wheelLines = c.hrAnalysis.hrWheel.map((w) => {
          const category = this.getHrWheelCategory(w.area);
          return `- [${category}] ${w.area}: ${w.score}점 | 근거: ${w.evidence || '저장된 근거 없음'}`;
        });
        const averages = this.formatHrCategoryAverages(c.hrAnalysis.hrWheel);
        hrParts.push(`### HR Wheel\n${wheelLines.join('\n')}${averages ? `\n\n${averages}` : ''}`);
      }
      if (c.hrAnalysis.competingValues) {
        const v = c.hrAnalysis.competingValues;
        const evidenceLines = v.evidence
          ? [
              v.evidence.clan ? `- 클랜 ${v.clan}%: ${v.evidence.clan}` : null,
              v.evidence.adhocracy ? `- 아드호크라시 ${v.adhocracy}%: ${v.evidence.adhocracy}` : null,
              v.evidence.market ? `- 시장 ${v.market}%: ${v.evidence.market}` : null,
              v.evidence.hierarchy ? `- 위계 ${v.hierarchy}%: ${v.evidence.hierarchy}` : null,
            ].filter(Boolean).join('\n')
          : '';
        hrParts.push(`### 경쟁 가치 모델(CVF)\n클랜 ${v.clan}, 아드호크라시 ${v.adhocracy}, 시장 ${v.market}, 위계 ${v.hierarchy}, 지배 유형 ${v.dominant}\n${v.description}${evidenceLines ? `\n\n비율별 근거:\n${evidenceLines}` : ''}`);
      }
      if (c.hrAnalysis.ulrichModel) {
        const u = c.hrAnalysis.ulrichModel;
        hrParts.push(`### 울리치 모델\n전략적 파트너 ${u.strategicPartner}, 변화 관리자 ${u.changeAgent}, 행정 전문가 ${u.adminExpert}, 직원 후원자 ${u.employeeChampion}, 지배 역할 ${u.dominant}\n${u.description}`);
      }
      if (c.hrAnalysis.harvardModel) {
        const h = c.hrAnalysis.harvardModel;
        hrParts.push(`### 하버드 모델\n상황 요인: ${h.situationalFactors.join(', ')}\n이해관계자 관심사: ${h.stakeholderInterests.join(', ')}\nHR 정책: ${h.hrPolicies.join(', ')}\nHR 성과: ${h.hrOutcomes.join(', ')}\n장기 효과: ${h.longTermConsequences.join(', ')}\n요약: ${h.summary}`);
      }
      if (c.hrAnalysis.careerPageUrl) hrParts.push(`### 채용 페이지\n${c.hrAnalysis.careerPageUrl}`);
      if (c.hrAnalysis.dataCollectionNote) hrParts.push(`### HR 자료 수집 메모\n${c.hrAnalysis.dataCollectionNote}`);
      if (hrParts.length) parts.push(`## HR 분석 산출물\n${hrParts.join('\n\n')}`);
    }

    if (c.companyProfile) {
      const cp = c.companyProfile;
      const profileLines = [
        cp.businessArea ? `사업영역: ${cp.businessArea}` : null,
        cp.businessStatus ? `사업현황: ${cp.businessStatus}` : null,
        cp.coreValues.length ? `핵심가치: ${cp.coreValues.join(', ')}` : null,
        cp.jobIntroduction?.length ? `직무소개:\n${cp.jobIntroduction.map((j) => `- ${j.name}: ${j.description}`).join('\n')}` : null,
        cp.specialNotes ? `특기사항: ${cp.specialNotes}` : null,
        cp.historyAchievements ? `역사·주요 업적: ${cp.historyAchievements}` : null,
        cp.socialContribution ? `사회공헌: ${cp.socialContribution}` : null,
        cp.employeeCount ? `임직원수: ${cp.employeeCount}` : null,
        cp.brandImage ? `브랜드 이미지: ${cp.brandImage}` : null,
        cp.businessPromotion ? `사업 추진: ${cp.businessPromotion}` : null,
        cp.currentYearGoal ? `올해 목표: ${cp.currentYearGoal}` : null,
        cp.nextYearGoal ? `내년 목표: ${cp.nextYearGoal}` : null,
      ].filter(Boolean);
      if (profileLines.length) parts.push(`## 기업 프로파일\n${profileLines.join('\n')}`);
    }

    if (c.businessSegments?.length) {
      parts.push(`## 사업 부문\n${c.businessSegments.map((s) => [
        `- ${s.name}${s.revenueShare ? ` (매출비중 ${s.revenueShare})` : ''}: ${s.description}`,
        s.mainProducts ? `  주요제품: ${s.mainProducts}` : null,
        s.subsidiaries?.length ? `  종속회사: ${s.subsidiaries.join(', ')}` : null,
        s.facilities ? `  시설·거점: ${s.facilities}` : null,
      ].filter(Boolean).join('\n')).join('\n')}`);
    }

    if (c.competitors?.length) {
      parts.push(`## 검증된 경쟁사 분석\n${c.competitors.map((comp) => [
        `- ${comp.name} (${comp.threatLevel})`,
        `  경쟁 이유: ${comp.reason}`,
        `  필요 역량·전략: ${comp.needed}`,
        comp.marketScope ? `  시장 범위: ${comp.marketScope === 'domestic' ? '국내 경쟁' : '국내 시장에 영향을 주는 해외 기업'}` : null,
        comp.sourceTitle || comp.sourceUrl ? `  근거: ${comp.sourceTitle ?? comp.sourceUrl}${comp.sourceUrl ? ` (${comp.sourceUrl})` : ''}` : null,
      ].filter(Boolean).join('\n')).join('\n')}`);
    }

    if (c.hrTechSources?.length) {
      parts.push(`## HR 분석에 사용한 기술 조직·HRD 크롤링 출처\n${c.hrTechSources.map((source, i) => `${i + 1}. [${source.category}] ${source.title}\n   출처: ${source.url}`).join('\n')}`);
    }

    if (c.financialSummary) parts.push(`## DART 재무·공시 원자료 요약\n${c.financialSummary.slice(0, 6000)}`);
    if (c.jobplanetSummary) parts.push(`## 잡플래닛 리뷰 수집 자료\n${c.jobplanetSummary.slice(0, 6000)}`);

    const sources = [
      this.formatSources('인재상·채용 검색 출처', c.evidence),
      this.formatSources('경쟁사 후보 크롤링 출처', c.competitorSources),
      this.formatSources('기술 조직·HRD 크롤링 출처', c.hrTechSources),
      this.formatSources('사업부문 검색 출처', c.segmentSources),
      this.formatSources('DART 공시 출처', c.disclosures?.map((d) => ({ title: `${d.date} ${d.title}`, url: d.url })) ?? null),
      this.formatSources('최근 뉴스', c.recentNews?.map((n) => ({ title: `${n.title}${n.summary ? ` - ${n.summary}` : ''}`, url: n.url })) ?? null),
      this.formatSources('채용 공고', c.jobPostings),
    ].filter(Boolean);
    if (sources.length) parts.push(`## 저장된 출처 목록\n${sources.join('\n\n')}`);

    if (sourceContext?.trim()) {
      parts.push(`## 보고서 작성 당시 AI에 제공된 원자료 묶음\n${sourceContext.slice(0, 40000)}`);
    } else {
      parts.push('## 보고서 작성 당시 AI에 제공된 원자료 묶음\n이 분석은 원자료 전문 저장 기능이 추가되기 전에 생성되어 전문이 없습니다. 위의 저장된 산출물, 항목별 근거, 출처 목록, 재무·리뷰 요약을 기준으로 답변하세요.');
    }

    return parts.join('\n\n---\n\n');
  }

  private getHrWheelCategory(area: string): 'HRM' | 'HRD' | '공통' {
    const normalized = area.replace(/\s/g, '');
    if (/(교육|성장|개발|육성|학습|역량|리더십|승계|코칭|멘토링)/.test(normalized)) return 'HRD';
    if (/(채용|확보|선발|평가|성과|보상|복리|후생|인사관리|노무|배치|이동|제도|운영)/.test(normalized)) return 'HRM';
    return '공통';
  }

  private formatHrCategoryAverages(hrWheel: HrAnalysis['hrWheel']): string | null {
    if (!hrWheel?.length) return null;
    const grouped = new Map<'HRM' | 'HRD' | '공통', number[]>();
    for (const item of hrWheel) {
      const key = this.getHrWheelCategory(item.area);
      grouped.set(key, [...(grouped.get(key) ?? []), item.score]);
    }
    const lines = [...grouped.entries()].map(([category, scores]) => {
      const avg = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
      return `- ${category} 평균: ${avg}점 (${scores.length}개 항목 기준)`;
    });
    return `### HRM/HRD 분류별 평균\n${lines.join('\n')}`;
  }

  private formatSources(label: string, sources: { title: string; url: string }[] | null): string | null {
    if (!sources?.length) return null;
    return `### ${label}\n${sources.map((s, i) => `${i + 1}. ${s.title || s.url}\n   출처: ${s.url}`).join('\n')}`;
  }

  private getDefaultSearchSourceText(sources?: SearchSources): string {
    return sources?.duckduckgo ?? sources?.tavily ?? sources?.serper ?? sources?.naver ?? sources?.brave ?? '';
  }

  private uniqueSources(sources: { title: string; url: string }[]): { title: string; url: string }[] {
    const seen = new Set<string>();
    const unique: { title: string; url: string }[] = [];
    for (const source of sources) {
      const key = this.normalizeUrl(source.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push({ title: source.title, url: source.url });
    }
    return unique;
  }

  private uniqueHrTechSources(sources: { category: string; title: string; url: string }[]): { category: string; title: string; url: string }[] {
    const seen = new Set<string>();
    const unique: { category: string; title: string; url: string }[] = [];
    for (const source of sources) {
      const key = this.normalizeUrl(source.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push({ category: source.category, title: source.title, url: source.url });
    }
    return unique;
  }

  private async collectHrTechContext(companyName: string, officialWebsiteUrl: string | null): Promise<{
    context: string;
    sources: { category: string; title: string; url: string }[];
  }> {
    const officialHost = this.getHost(officialWebsiteUrl);
    const officialSiteQuery = officialHost ? `site:${officialHost}` : '';
    const categories = [
      {
        label: '테크 블로그',
        queries: [
          officialSiteQuery ? `"${companyName}" ${officialSiteQuery} 테크 블로그 기술 블로그 engineering blog developer` : '',
          `"${companyName}" 테크 블로그 기술 블로그 engineering blog`,
          `"${companyName}" 개발자 블로그 기술문화`,
        ].filter(Boolean),
      },
      {
        label: '오픈소스·GitHub',
        queries: [
          officialSiteQuery ? `"${companyName}" ${officialSiteQuery} GitHub open source 오픈소스` : '',
          `"${companyName}" GitHub open source`,
          `"${companyName}" 오픈소스 기여 GitHub`,
        ].filter(Boolean),
      },
      {
        label: '컨퍼런스·커뮤니티',
        queries: [
          officialSiteQuery ? `"${companyName}" ${officialSiteQuery} 컨퍼런스 발표 개발자 커뮤니티 세미나` : '',
          `"${companyName}" 컨퍼런스 발표 개발자 커뮤니티`,
          `"${companyName}" meetup seminar tech conference developer`,
        ].filter(Boolean),
      },
      {
        label: '기술 스택·아키텍처',
        queries: [
          officialSiteQuery ? `"${companyName}" ${officialSiteQuery} 기술 스택 아키텍처 클라우드 개발` : '',
          `"${companyName}" 기술 스택 아키텍처 마이크로서비스 클라우드 Kubernetes`,
          `"${companyName}" architecture modernization tech stack`,
        ].filter(Boolean),
      },
      {
        label: '기술 인터뷰',
        queries: [
          officialSiteQuery ? `"${companyName}" ${officialSiteQuery} 기술 인터뷰 개발자 인터뷰 CTO` : '',
          `"${companyName}" 기술 인터뷰 개발자 인터뷰 CTO`,
          `"${companyName}" engineering interview developer interview`,
        ].filter(Boolean),
      },
    ];

    const contextParts: string[] = [];
    const allSources: { category: string; title: string; url: string }[] = [];

    for (const category of categories) {
      const categoryContexts: string[] = [];
      for (const query of category.queries) {
        const { context, sources } = await this.webSearch.runSearch(query);
        const sourceText = this.getDefaultSearchSourceText(sources);
        if (context?.trim()) categoryContexts.push(`#### 검색어: ${query}\n${context.slice(0, 3500)}`);
        allSources.push(
          ...parseSearchLinks(sourceText)
            .filter((s) => s.title && !isNaverBlog(s.url))
            .map((s) => ({ category: category.label, title: s.title, url: s.url })),
        );
      }
      if (categoryContexts.length) {
        contextParts.push(`### ${category.label}\n${categoryContexts.join('\n\n')}`);
      }
    }

    return {
      context: contextParts.join('\n\n---\n\n').slice(0, 22000),
      sources: this.uniqueHrTechSources(allSources).slice(0, 20),
    };
  }

  private isVerifiedCompetitor(
    competitor: Competitor,
    companyName: string,
    competitorContext: string,
    competitorSources: { title: string; url: string }[],
  ): boolean {
    if (!competitor.name) return false;
    if (this.normalizeName(competitor.name) === this.normalizeName(companyName)) return false;
    if (!competitor.marketScope) return false;
    if (!competitor.sourceUrl) return false;

    const normalizedSourceUrl = this.normalizeUrl(competitor.sourceUrl);
    const hasKnownSource = competitorSources.some((source) => this.normalizeUrl(source.url) === normalizedSourceUrl);
    if (!hasKnownSource) return false;

    const normalizedContext = this.normalizeName(`${competitorContext}\n${competitorSources.map((s) => s.title).join('\n')}`);
    const normalizedName = this.normalizeName(competitor.name);
    return Boolean(normalizedName) && normalizedContext.includes(normalizedName);
  }

  private normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  }

  private normalizeUrl(value: string): string {
    return value.trim().replace(/[),.;\]]+$/g, '').replace(/\/+$/g, '');
  }

  private getHost(value: string | null): string | null {
    if (!value) return null;
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
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
      competitorSources: parse<{ title: string; url: string }[]>(e.competitorSources),
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
      hrTechSources: parse<{ category: string; title: string; url: string }[]>(e.hrTechSources),
      jobplanetSummary: e.jobplanetSummary,
      missionVision: parse<{ mission: string | null; vision: string | null; coreValues: string[]; talentProfile: string | null }>(e.missionVision),
      hrAnalysis: parse<HrAnalysis>(e.hrAnalysis),
      apartmentPrices: parse<CompanyAnalysisDto['apartmentPrices']>(e.apartmentPrices),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
