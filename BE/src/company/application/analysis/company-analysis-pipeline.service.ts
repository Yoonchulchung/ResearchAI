import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyRateEntity } from 'src/company/domain/entity/company-rate.entity';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { WebSearchService } from 'src/research/application/web-search.service';
import {
  JobplanetScraperService,
  JobplanetCompanyData,
} from 'src/company/infrastructure/jobplanet/jobplanet-scraper.service';
import { CareerPageUrlService } from 'src/company/infrastructure/career-page-url.service';
import { DartFinancialService } from 'src/company/infrastructure/dart/dart-financial.service';
import { NeonetRealEstatePriceService } from 'src/company/infrastructure/neonet-real-estate-price.service';
import { ZippoomRealEstateUrlService } from 'src/company/infrastructure/zippoom-real-estate-url.service';
import { requestContext } from 'src/shared/request-context';

import {
  COMPETENCY_KEYS,
  ZERO_SCORES,
  CompetencyScores,
  CompetencyReasons,
  SwotAnalysis,
  Competitor,
  BusinessSegment,
  CompanyProfile,
  HrAnalysis,
  CompanyAnalysisProgress,
  CompanyAnalysisDto,
} from 'src/company/domain/company-analysis.types';
import {
  SYSTEM_PROMPT_SCORING,
  SYSTEM_PROMPT_BUSINESS,
  SYSTEM_PROMPT_REPORT,
  SYSTEM_PROMPT_HR,
} from 'src/company/domain/company-analysis.prompts';
import { CompanyService } from 'src/company/application/company.service';
import { CompanyEnrichService } from 'src/company/application/company-enrich.service';
import { CompanyAnalysisHrTechService } from './company-analysis-hr-tech.service';
import {
  normalizeKey,
  normalizeUrl,
  getDefaultSearchSourceText,
  parseSearchLinks,
  cleanSearchTitle,
  isBadNewsTitle,
  isJobPosting,
  isNewsArticle,
  isLikelyNewsArticle,
  isNaverBlog,
  repairJsonStr,
  toDto,
} from './company-analysis.utils';

@Injectable()
export class CompanyAnalysisPipelineService {
  private readonly logger = new Logger(CompanyAnalysisPipelineService.name);

  constructor(
    @InjectRepository(CompanyAnalysisEntity)
    private readonly repo: Repository<CompanyAnalysisEntity>,
    @InjectRepository(CompanyRateEntity)
    private readonly rateRepo: Repository<CompanyRateEntity>,
    private readonly aiProvider: AiProviderService,
    private readonly webSearch: WebSearchService,
    private readonly jobplanetScraper: JobplanetScraperService,
    private readonly dartFinancial: DartFinancialService,
    private readonly neonetRealEstatePrice: NeonetRealEstatePriceService,
    private readonly zippoomRealEstateUrl: ZippoomRealEstateUrlService,
    private readonly careerPageUrl: CareerPageUrlService,
    private readonly companyService: CompanyService,
    private readonly companyEnrich: CompanyEnrichService,
    private readonly hrTech: CompanyAnalysisHrTechService,
  ) {}

  async *analyzeStream(
    companyName: string,
    aiModel: string,
    signal?: AbortSignal,
  ): AsyncGenerator<CompanyAnalysisProgress> {
    const key = normalizeKey(companyName);
    if (!key) {
      yield { type: 'error', message: '유효하지 않은 기업명' };
      return;
    }

    let effectiveAiModel = '';
    try {
      effectiveAiModel = this.aiProvider.resolveEffectiveModel(
        this.aiProvider.resolveEffectiveModel(aiModel),
      );
    } catch (e) {
      yield {
        type: 'error',
        message: this.formatErrorMessage(
          e,
          '요청한 AI 모델을 사용할 수 없습니다.',
        ),
      };
      return;
    }

    const creds = requestContext.getStore()?.serviceCredentials ?? {};

    // 1. 인재상·채용 웹 검색
    yield {
      type: 'log',
      message: `🔍 "${companyName}" 인재상·채용 정보 검색 중...`,
    };
    yield { type: 'searching' };

    let webContext = '';
    let evidence: { title: string; url: string }[] = [];
    try {
      const { context, sources } = await this.webSearch.runSearch(
        `${companyName} 인재상 핵심가치 채용 공식`,
      );
      webContext = context;
      const srcText = getDefaultSearchSourceText(sources);
      evidence = parseSearchLinks(srcText)
        .filter((e) => !isNaverBlog(e.url))
        .slice(0, 8);
    } catch {}

    // 2. 최근 뉴스 검색
    yield { type: 'log', message: `📰 "${companyName}" 최근 뉴스 검색 중...` };
    let recentNews: { title: string; url: string; date: string }[] = [];
    try {
      const { sources: newsSrc } = await this.webSearch.runSearch(
        `${companyName} 뉴스`,
      );
      const newsText = getDefaultSearchSourceText(newsSrc);
      recentNews = parseSearchLinks(newsText)
        .map((n) => ({ ...n, title: cleanSearchTitle(n.title) }))
        .filter(
          (n) =>
            n.title &&
            !isBadNewsTitle(n.title) &&
            !isJobPosting(n.url, n.title) &&
            !isNaverBlog(n.url) &&
            isLikelyNewsArticle(n.url, n.title),
        )
        .slice(0, 8)
        .map((n) => ({ ...n, date: '' }));
    } catch {}

    // 2-1. 사업부문 검색
    yield { type: 'log', message: `🏭 "${companyName}" 사업부문 검색 중...` };
    let segmentContext = '';
    let segmentSources: { title: string; url: string }[] = [];
    try {
      const searchYear = new Date().getFullYear() - 1;
      const { context: segCtx, sources: segSrc } =
        await this.webSearch.runSearch(
          `"${companyName}" 사업보고서 사업부문 매출비중 ${searchYear}년 연결재무`,
        );
      segmentContext = segCtx?.slice(0, 4000) ?? '';
      const segSrcText = getDefaultSearchSourceText(segSrc);
      segmentSources = parseSearchLinks(segSrcText).slice(0, 6);
    } catch {}

    // 2-2. 직무소개 검색
    yield { type: 'log', message: `📋 "${companyName}" 직무소개 검색 중...` };
    let jobIntroContext = '';
    try {
      const { context: jiCtx } = await this.webSearch.runSearch(
        `"${companyName}" 직무소개 직무별 업무 site:${companyName.replace(/\s/g, '').toLowerCase()}.com OR site:recruit.${companyName.replace(/\s/g, '').toLowerCase()}.com`,
      );
      if (!jiCtx?.trim()) {
        const { context: jiCtx2 } = await this.webSearch.runSearch(
          `"${companyName}" 직무소개 직무별 하는 일 채용 공식`,
        );
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
      const { sources: jobSrc } = await this.webSearch.runSearch(
        `${companyName} 채용 공고 입사지원`,
      );
      const jobText = getDefaultSearchSourceText(jobSrc);
      jobPostings = parseSearchLinks(jobText)
        .filter(
          (j) =>
            j.title &&
            !isNaverBlog(j.url) &&
            (isJobPosting(j.url, j.title) || !isNewsArticle(j.url)),
        )
        .slice(0, 10)
        .map((j) => ({ ...j, date: '' }));

      const { sources: careerSrc } = await this.webSearch.runSearch(
        `${companyName} 공식 채용 사이트 career jobs`,
      );
      const careerText = getDefaultSearchSourceText(careerSrc);
      careerPageCandidates = parseSearchLinks(careerText)
        .filter(
          (j) => j.title && !isNaverBlog(j.url) && isJobPosting(j.url, j.title),
        )
        .slice(0, 10);
    } catch {}

    // 2-4. 경쟁사 후보 검색
    yield {
      type: 'log',
      message: `🧭 "${companyName}" 경쟁사 후보 크롤링 중...`,
    };
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
        const sourceText = getDefaultSearchSourceText(sources);
        if (context?.trim())
          competitorParts.push(
            `### 검색어: ${query}\n${context.slice(0, 5000)}`,
          );
        competitorSources.push(
          ...parseSearchLinks(sourceText).filter((s) => !isNaverBlog(s.url)),
        );
      }
      competitorContext = competitorParts.join('\n\n---\n\n').slice(0, 14000);
      competitorSources = this.uniqueSources(competitorSources).slice(0, 12);
    } catch {}

    // 2-5. 공식 웹사이트 탐색
    yield {
      type: 'log',
      message: `🌐 "${companyName}" 공식 웹사이트 탐색 중...`,
    };
    let officialWebsiteUrl: string | null = null;
    try {
      officialWebsiteUrl =
        await this.jobplanetScraper.findOfficialWebsite(companyName);
      yield {
        type: 'log',
        message: officialWebsiteUrl
          ? `✅ 공식 웹사이트: ${officialWebsiteUrl}`
          : '⚠️ 공식 웹사이트 탐색 실패',
      };
    } catch (err) {
      this.logger.warn(`공식 웹사이트 탐색 오류: ${(err as Error).message}`);
    }

    // 2-6. 기술 조직·HRD 신호 크롤링
    yield {
      type: 'log',
      message: `🧪 "${companyName}" 기술 조직·HRD 신호 크롤링 중...`,
    };
    let hrTechContext = '';
    let hrTechSources: { category: string; title: string; url: string }[] = [];
    try {
      const { context, sources } = await this.hrTech.collectHrTechContext(
        companyName,
        officialWebsiteUrl,
      );
      hrTechContext = context;
      hrTechSources = sources;
    } catch {}

    // 3. DART OpenAPI
    let dartText = '';
    let dartData: Awaited<
      ReturnType<DartFinancialService['fetchCompanyData']>
    > = null;
    if (creds.dartApiKey) {
      yield { type: 'log', message: '📊 DART OpenAPI 재무 데이터 수집 중...' };
      try {
        dartData = await this.dartFinancial.fetchCompanyData(
          companyName,
          creds.dartApiKey,
        );
        if (dartData) {
          dartText = this.dartFinancial.formatForAnalysis(dartData);
          yield {
            type: 'log',
            message: `✅ DART 수집 완료 — ${dartData.multiYearFinancials.length}개년 재무·공시 ${dartData.disclosures.length}건${dartData.businessContent ? '·사업내용 파싱 완료' : ''}`,
          };
        } else {
          yield {
            type: 'log',
            message: '⚠️ DART 기업 조회 실패 (API 키 또는 기업명 확인)',
          };
        }
      } catch (err) {
        yield { type: 'log', message: '⚠️ DART 수집 오류' };
        this.logger.warn(`DART: ${(err as Error).message}`);
      }
    }

    // 4. 잡플래닛 리뷰
    let jobplanetText = '';
    let jpData: JobplanetCompanyData | null = null;
    if (creds.jobplanetId && creds.jobplanetPassword) {
      yield { type: 'log', message: '💼 잡플래닛 기업 리뷰 수집 중...' };
      try {
        jpData = await this.jobplanetScraper.scrapeCompany(
          companyName,
          creds.jobplanetId,
          creds.jobplanetPassword,
        );
        if (jpData) {
          jobplanetText = this.jobplanetScraper.formatForAnalysis(jpData);
          yield {
            type: 'log',
            message: `✅ 잡플래닛 수집 완료 (리뷰 ${jpData.reviewCount}개, 평점 ${jpData.overallRating})`,
          };
        } else {
          yield {
            type: 'log',
            message: '⚠️ 잡플래닛 수집 실패 (로그인 확인 필요)',
          };
        }
      } catch (err) {
        yield { type: 'log', message: '⚠️ 잡플래닛 수집 오류' };
        this.logger.warn(`Jobplanet: ${(err as Error).message}`);
      }
    }

    // 5. 아파트 시세 조회
    let apartmentPrices: CompanyAnalysisDto['apartmentPrices'] = null;
    const dartAddress = dartData?.address ?? null;
    if (dartAddress) {
      yield {
        type: 'log',
        message: `🏠 인근 아파트 시세 조회 중 (${this.neonetRealEstatePrice.extractDistrict(dartAddress) ?? dartAddress})...`,
      };
      try {
        apartmentPrices =
          await this.neonetRealEstatePrice.fetchDistrictPrices(dartAddress);
        if (apartmentPrices) {
          apartmentPrices = {
            ...apartmentPrices,
            naverLandUrl:
              this.zippoomRealEstateUrl.buildApartmentUrl(dartAddress),
          };
          yield {
            type: 'log',
            message: `✅ 시세 조회 완료 — 단지 ${apartmentPrices.complexCount}개, 평균 매매 ${apartmentPrices.avgDealPrice ? (apartmentPrices.avgDealPrice / 10000).toFixed(1) + '억' : '-'}`,
          };
        } else {
          yield {
            type: 'log',
            message:
              '⚠️ 시세 데이터 없음 (지원 지역 외 또는 부동산뱅크 목록 없음)',
          };
        }
      } catch (err) {
        this.logger.warn(`NeonetRealEstate: ${(err as Error).message}`);
      }
    }

    // 6. AI 분석 (4개 병렬 호출)
    yield { type: 'scoring' };

    const contextParts: string[] = [];
    if (webContext.trim())
      contextParts.push(`## 인재상·채용 자료\n${webContext.slice(0, 10000)}`);
    if (jobIntroContext.trim())
      contextParts.push(
        `## 직무소개 자료 (아래 내용을 최대한 그대로 반영하세요)\n${jobIntroContext}`,
      );
    if (segmentContext.trim())
      contextParts.push(`## 사업부문·종속회사 자료\n${segmentContext}`);
    if (competitorContext.trim()) {
      contextParts.push(
        `## 경쟁사 후보 크롤링 자료 (competitors는 아래 자료에 기업명과 출처 URL이 있는 경우만 작성)\n${competitorContext}`,
      );
    } else {
      contextParts.push(
        '## 경쟁사 후보 크롤링 자료\n경쟁사 후보를 확인할 크롤링 자료가 없습니다. competitors는 []로 작성하세요.',
      );
    }
    if (hrTechContext.trim()) {
      contextParts.push(
        `## 기술 조직·HRD 신호 크롤링 자료 (HR 분석은 이 자료를 최우선 근거로 사용)\n${hrTechContext}`,
      );
    } else {
      contextParts.push(
        '## 기술 조직·HRD 신호 크롤링 자료\n테크 블로그, GitHub, 컨퍼런스, 기술스택, 기술 인터뷰 관련 크롤링 자료가 없습니다. HR 분석에서 기술 기반 성장·개발 문화는 확인 부족으로 보수적으로 평가하세요.',
      );
    }
    if (dartText) contextParts.push(dartText);
    if (jobplanetText) contextParts.push(jobplanetText);
    if (recentNews.length > 0) {
      contextParts.push(
        `## 최근 뉴스 목록\n${recentNews.map((n, i) => `${i + 1}. ${n.title}`).join('\n')}`,
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const userPrompt = `오늘 날짜: ${today}\n\n## 분석 대상: ${companyName}\n\n${contextParts.join('\n\n---\n\n') || '(자료 부족 — 일반 지식 기반 추정)'}`;

    const parsedScores: CompetencyScores = { ...ZERO_SCORES };
    let parsedSummary = '';
    const parsedReasons: CompetencyReasons = {};
    let parsedSwot: SwotAnalysis | null = null;
    let parsedCompetitors: Competitor[] | null = null;
    let parsedSegments: BusinessSegment[] | null = null;
    let parsedCompanyProfile: CompanyProfile | null = null;
    let parsedIndustry: string | null = null;
    let parsedCreditRating: string | null = null;
    let parsedReport: string | null = null;
    let parsedCompanySize: string | null = null;
    let parsedMissionVision: {
      mission: string | null;
      vision: string | null;
      coreValues: string[];
      talentProfile: string | null;
    } | null = null;
    let parsedHrAnalysis: HrAnalysis | null = null;
    let aiInputTokens: number | null = null;
    let aiOutputTokens: number | null = null;
    let aiEstimatedFees: number | null = null;

    yield { type: 'log', message: '🤖 AI 분석 시작 (4개 병렬 호출)...' };

    const [scoringRes, businessRes, reportRes, hrRes] =
      await Promise.allSettled([
        this.aiProvider.call(
          effectiveAiModel,
          SYSTEM_PROMPT_SCORING,
          userPrompt,
          { caller: 'CompanyAnalysis/scoring' },
        ),
        this.aiProvider.call(
          effectiveAiModel,
          SYSTEM_PROMPT_BUSINESS,
          userPrompt,
          { caller: 'CompanyAnalysis/business' },
        ),
        this.aiProvider.call(
          effectiveAiModel,
          SYSTEM_PROMPT_REPORT,
          userPrompt,
          { caller: 'CompanyAnalysis/report' },
        ),
        this.aiProvider.call(effectiveAiModel, SYSTEM_PROMPT_HR, userPrompt, {
          caller: 'CompanyAnalysis/hr',
        }),
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
          parsedScores[k] =
            typeof v === 'number'
              ? Math.max(0, Math.min(100, Math.round(v)))
              : 50;
          const reason = p.reasons?.[k];
          if (reason && typeof reason === 'string')
            parsedReasons[k] = reason.trim();
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
            .map(
              (c: {
                name?: string;
                reason?: string;
                needed?: string;
                threatLevel?: string;
                siteUrl?: string;
                sourceTitle?: string;
                sourceUrl?: string;
                marketScope?: string;
              }) => ({
                name: c.name?.trim() ?? '',
                reason: c.reason?.trim() ?? '',
                needed: c.needed?.trim() ?? '',
                threatLevel: validLevels.has(c.threatLevel ?? '')
                  ? (c.threatLevel as 'high' | 'medium' | 'low')
                  : 'medium',
                siteUrl: c.siteUrl?.trim() || null,
                sourceTitle: c.sourceTitle?.trim() || null,
                sourceUrl: c.sourceUrl?.trim() || null,
                marketScope: validScopes.has(c.marketScope ?? '')
                  ? (c.marketScope as 'domestic' | 'global_affects_domestic')
                  : null,
              }),
            )
            .filter((c: Competitor) =>
              this.hrTech.isVerifiedCompetitor(
                c,
                companyName,
                competitorContext,
                competitorSources,
              ),
            );
        }
        if (Array.isArray(p.businessSegments)) {
          parsedSegments = p.businessSegments
            .map(
              (s: {
                name?: string;
                revenueShare?: string;
                description?: string;
                subsidiaries?: string[];
                mainProducts?: string;
                facilities?: string;
                corporateCount?: string;
              }) => ({
                name: s.name?.trim() ?? '',
                revenueShare: s.revenueShare?.trim() || null,
                description: s.description?.trim() ?? '',
                subsidiaries: Array.isArray(s.subsidiaries)
                  ? s.subsidiaries.filter(Boolean)
                  : null,
                mainProducts: s.mainProducts?.trim() || null,
                facilities: s.facilities?.trim() || null,
                corporateCount: s.corporateCount?.trim() || null,
              }),
            )
            .filter((s: { name: string }) => s.name);
        }
        if (p.companyProfile) {
          const cp = p.companyProfile;
          parsedCompanyProfile = {
            businessArea: cp.businessArea?.trim() || null,
            businessStatus: cp.businessStatus?.trim() || null,
            coreValues: Array.isArray(cp.coreValues)
              ? cp.coreValues.filter(Boolean)
              : [],
            jobIntroduction: (() => {
              if (!Array.isArray(cp.jobIntroduction)) return null;
              return (
                cp.jobIntroduction as { name?: string; description?: string }[]
              )
                .map((j) => ({
                  name: (j.name ?? '').trim(),
                  description: (j.description ?? '').trim(),
                }))
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
            coreValues: Array.isArray(p.missionVision.coreValues)
              ? p.missionVision.coreValues.filter(Boolean)
              : [],
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
            const match = p.categorizedNews.find(
              (cn: { title?: string; category?: string; summary?: string }) =>
                cn.title &&
                (cn.title === n.title ||
                  n.title.includes(cn.title) ||
                  cn.title.includes(n.title)),
            );
            if (match)
              return {
                ...n,
                category: match.category ?? undefined,
                summary: match.summary ?? undefined,
              };
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
            ? p.hrWheel
                .map(
                  (w: {
                    area?: string;
                    score?: number;
                    evidence?: string;
                  }) => ({
                    area: w.area?.trim() ?? '',
                    score:
                      typeof w.score === 'number'
                        ? Math.max(0, Math.min(100, Math.round(w.score)))
                        : 50,
                    evidence: w.evidence?.trim() ?? '',
                  }),
                )
                .filter((w: { area: string }) => w.area)
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
                      clan:
                        p.competingValues.evidence.clan?.trim() || undefined,
                      adhocracy:
                        p.competingValues.evidence.adhocracy?.trim() ||
                        undefined,
                      market:
                        p.competingValues.evidence.market?.trim() || undefined,
                      hierarchy:
                        p.competingValues.evidence.hierarchy?.trim() ||
                        undefined,
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
                situationalFactors: Array.isArray(
                  p.harvardModel.situationalFactors,
                )
                  ? p.harvardModel.situationalFactors.filter(Boolean)
                  : [],
                stakeholderInterests: Array.isArray(
                  p.harvardModel.stakeholderInterests,
                )
                  ? p.harvardModel.stakeholderInterests.filter(Boolean)
                  : [],
                hrPolicies: Array.isArray(p.harvardModel.hrPolicies)
                  ? p.harvardModel.hrPolicies.filter(Boolean)
                  : [],
                hrOutcomes: Array.isArray(p.harvardModel.hrOutcomes)
                  ? p.harvardModel.hrOutcomes.filter(Boolean)
                  : [],
                longTermConsequences: Array.isArray(
                  p.harvardModel.longTermConsequences,
                )
                  ? p.harvardModel.longTermConsequences.filter(Boolean)
                  : [],
                summary: p.harvardModel.summary?.trim() ?? '',
              }
            : null,
          careerPageUrl: this.careerPageUrl.normalize(
            companyName,
            p.careerPageUrl?.trim() || null,
            [
              ...careerPageCandidates.map((candidate) => candidate.url),
              ...jobPostings.map((posting) => posting.url),
            ],
            officialWebsiteUrl,
          ),
          dataCollectionNote: p.dataCollectionNote?.trim() || null,
        };
      }
    } else {
      this.logger.error(`[AI] hr 호출 실패: ${hrRes.reason}`);
    }

    if (!parsedSummary && this.areScoresEmpty(parsedScores)) {
      yield {
        type: 'error',
        message: 'AI 분석 실패: scoring 호출이 결과를 반환하지 않았습니다',
      };
      return;
    }

    // DB 저장
    yield { type: 'log', message: '💾 결과 저장 중...' };
    const existing = await this.repo.findOne({ where: { companyKey: key } });
    const company = await this.companyEnrich.findOrCreate(
      companyName,
      parsedCompanySize ?? null,
      dartData?.employees ?? null,
      signal,
    );
    if (company) {
      await this.companyService.patchFromAnalysis(company.id, {
        homeUrl: officialWebsiteUrl ?? dartData?.homeUrl ?? null,
        address: dartData?.address ?? null,
        dartUrl: dartData?.dartUrl ?? null,
        ceoName: dartData?.ceoName ?? null,
        foundedDate: dartData?.foundedDate ?? null,
        industry: parsedIndustry ?? null,
      });
      if (dartData) {
        await this.companyService.upsertFinancial(company.id, {
          stockCode: dartData.stockCode ?? null,
          corpClass: dartData.corpClass ?? null,
          capital: dartData.capital ?? null,
          revenue: dartData.revenue ?? null,
          financialSummary: dartText || null,
          multiYearFinancials: dartData.multiYearFinancials?.length
            ? JSON.stringify(dartData.multiYearFinancials)
            : null,
          disclosures: dartData.disclosures?.length
            ? JSON.stringify(dartData.disclosures.slice(0, 5))
            : null,
          employeeDetail: dartData.employeeHistory?.length
            ? JSON.stringify(dartData.employeeHistory)
            : null,
        });
      }
    }

    const entity = await this.repo.save({
      id: existing?.id ?? randomUUID(),
      companyKey: key,
      companyName: companyName.trim(),
      companyId: company?.id ?? existing?.companyId ?? null,
      scores: JSON.stringify(parsedScores),
      reasons:
        Object.keys(parsedReasons).length > 0
          ? JSON.stringify(parsedReasons)
          : null,
      inputTokens: aiInputTokens,
      outputTokens: aiOutputTokens,
      estimatedFees: aiEstimatedFees,
      summary: parsedSummary || null,
      evidence: evidence.length > 0 ? JSON.stringify(evidence) : null,
      aiModel: effectiveAiModel || null,
      swot: parsedSwot ? JSON.stringify(parsedSwot) : null,
      competitors: parsedCompetitors?.length
        ? JSON.stringify(parsedCompetitors)
        : null,
      competitorSources:
        competitorSources.length > 0 ? JSON.stringify(competitorSources) : null,
      businessSegments: parsedSegments?.length
        ? JSON.stringify(parsedSegments)
        : null,
      segmentSources:
        segmentSources.length > 0 ? JSON.stringify(segmentSources) : null,
      companyProfile: parsedCompanyProfile
        ? JSON.stringify(parsedCompanyProfile)
        : null,
      creditRating: parsedCreditRating,
      report: parsedReport,
      missionVision: parsedMissionVision
        ? JSON.stringify(parsedMissionVision)
        : null,
      recentNews: recentNews.length > 0 ? JSON.stringify(recentNews) : null,
      jobPostings: jobPostings.length > 0 ? JSON.stringify(jobPostings) : null,
      hrTechSources:
        hrTechSources.length > 0 ? JSON.stringify(hrTechSources) : null,
      hrAnalysis: parsedHrAnalysis ? JSON.stringify(parsedHrAnalysis) : null,
      apartmentPrices: apartmentPrices ? JSON.stringify(apartmentPrices) : null,
      sourceContext: userPrompt,
    });

    const rateEntity = jpData
      ? await this.upsertCompanyRate(key, companyName, jpData, jobplanetText)
      : await this.rateRepo.findOne({ where: { companyKey: key } });

    const entityWithCompany =
      (await this.repo.findOne({
        where: { id: entity.id },
        relations: ['company', 'company.financial'],
      })) ?? entity;

    yield {
      type: 'done',
      result: toDto(entityWithCompany, rateEntity ?? null),
    };
  }

  private areScoresEmpty(scores: CompetencyScores): boolean {
    return COMPETENCY_KEYS.every((key) => !scores[key]);
  }

  private formatErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
  }

  private formatSettledError(result: PromiseRejectedResult): string {
    return this.formatErrorMessage(result.reason, 'AI 호출이 실패했습니다.');
  }

  private parseAiJson(text: string, label: string): Record<string, any> | null {
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      this.logger.warn(`[AI/${label}] JSON 블록 없음`);
      return null;
    }

    let jsonStr = cleaned.slice(start, end + 1);
    jsonStr = repairJsonStr(jsonStr);
    jsonStr = jsonStr.replace(/\}(\s*\n+\s*)\{/g, '},$1{');
    try {
      return JSON.parse(jsonStr);
    } catch {}

    jsonStr = jsonStr
      .replace(/([:,{[]\s*)\\"/g, '$1"')
      .replace(/\\"(\s*[,}\]])/g, '"$1');
    try {
      return JSON.parse(jsonStr);
    } catch (err) {
      const msg = (err as Error).message;
      const pos = parseInt(msg.match(/position (\d+)/)?.[1] ?? '-1', 10);
      if (pos >= 0) {
        this.logger.error(
          `[AI/${label}] 파싱 오류 pos=${pos}:\n${jsonStr.slice(Math.max(0, pos - 150), pos + 150)}`,
        );
      } else {
        this.logger.error(`[AI/${label}] 파싱 오류: ${msg}`);
      }
      return null;
    }
  }

  private uniqueSources(
    sources: { title: string; url: string }[],
  ): { title: string; url: string }[] {
    const seen = new Set<string>();
    const unique: { title: string; url: string }[] = [];
    for (const source of sources) {
      const key = normalizeUrl(source.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push({ title: source.title, url: source.url });
    }
    return unique;
  }

  private async upsertCompanyRate(
    companyKey: string,
    companyName: string,
    jpData: JobplanetCompanyData,
    summary: string,
  ): Promise<CompanyRateEntity> {
    const existing = await this.rateRepo.findOne({ where: { companyKey } });
    return this.rateRepo.save({
      id: existing?.id ?? randomUUID(),
      companyKey,
      companyName,
      source: 'jobplanet',
      summary: summary || null,
      overallRating: jpData.overallRating ?? null,
      reviewCount: jpData.reviewCount ?? null,
      welfare: jpData.welfare ?? null,
      cultureRating: jpData.cultureRating ?? null,
      wlbRating: jpData.wlbRating ?? null,
      reviews: jpData.reviews?.length ? JSON.stringify(jpData.reviews) : null,
    });
  }
}
