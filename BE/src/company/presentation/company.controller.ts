import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  HttpException,
  HttpStatus,
  Res,
  Sse,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { NewsQueueService } from 'src/queue/application/queue/news-queue.service';
import { requestContext } from 'src/shared/request-context';
import { CompanyMissingRefreshService } from 'src/queue/application/company-missing-refresh.service';
import { CompanyEnrichQueueService } from 'src/queue/application/company-enrich-queue.service';
import { CompanyService } from 'src/company/application/company.service';
import { CompanyEnrichService } from 'src/company/application/company-enrich.service';
import { CompanyStockService } from 'src/company/application/company-stock.service';
import { CompanyFinancialInsightsService } from 'src/company/application/company-financial-insights.service';
import { CompanyInvestorTradingService } from 'src/company/infrastructure/company-investor-trading.service';
import { CompanyNewsService } from 'src/company/infrastructure/company-news.service';
import { CompanyNewsScraperService } from 'src/company/infrastructure/company-news-scraper.service';
import { CompanyNewsTimelineService } from 'src/company/infrastructure/company-news-timeline.service';
import { CompanyShortSellingService } from 'src/company/infrastructure/company-short-selling.service';
import { DartFinancialService } from 'src/company/infrastructure/dart/dart-financial.service';
import { SystemSettingsService } from 'src/shared/application/system-settings.service';

@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly companyEnrich: CompanyEnrichService,
    private readonly companyStock: CompanyStockService,
    private readonly companyFinancialInsights: CompanyFinancialInsightsService,
    private readonly missingRefresh: CompanyMissingRefreshService,
    private readonly enrichQueue: CompanyEnrichQueueService,
    private readonly systemSettings: SystemSettingsService,
    private readonly companyNews: CompanyNewsService,
    private readonly companyNewsScraper: CompanyNewsScraperService,
    private readonly companyNewsTimeline: CompanyNewsTimelineService,
    private readonly investorTrading: CompanyInvestorTradingService,
    private readonly shortSelling: CompanyShortSellingService,
    private readonly dartFinancial: DartFinancialService,
    private readonly newsQueue: NewsQueueService,
  ) {}

  @Get()
  listCompanies(
    @Query('q') q?: string,
    @Query('hasAnalysis') hasAnalysis?: string,
    @Query('limit') limit?: string,
    @Query('slim') slim?: string,
    @Query('industry') industry?: string,
  ) {
    const hasAnalysisBool =
      hasAnalysis == null ? undefined : hasAnalysis === 'true';
    const limitNum = limit ? Number(limit) : undefined;

    if (slim === 'true') {
      return this.companyService.listCompaniesSlim({
        hasAnalysis: hasAnalysisBool,
        limit: limitNum,
      });
    }
    return this.companyService.listCompanies({
      q,
      hasAnalysis: hasAnalysisBool,
      limit: limitNum,
      industry,
    });
  }

  @Get('missing-stats')
  getMissingStats() {
    return this.companyService.getMissingStats();
  }

  @Post('refresh-all-missing')
  startMissingRefresh() {
    return this.missingRefresh.start();
  }

  @Post('refresh-all-missing/stop')
  stopMissingRefresh() {
    this.missingRefresh.stop();
    return { ok: true };
  }

  @Get('refresh-all-missing/status')
  getMissingRefreshStatus() {
    return this.missingRefresh.getStatus();
  }

  @Get('enrich-queue/status')
  getEnrichQueueStatus() {
    return this.enrichQueue.getQueueStatus();
  }

  @Get('settings/collect-enabled')
  async getCollectEnabled() {
    const enabled = await this.systemSettings.isCompanyCollectEnabled();
    return { enabled };
  }

  @Post('settings/collect-enabled')
  async setCollectEnabled(@Body() body: { enabled: boolean }) {
    await this.systemSettings.setCompanyCollectEnabled(body.enabled);
    return { enabled: body.enabled };
  }

  /** DART 공시 PDF 프록시 — HTML 뷰어 URL에서 실제 PDF를 추출해 반환 */
  @Get('disclosures/pdf')
  async getDisclosurePdf(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      throw new HttpException('공시 URL이 필요합니다.', HttpStatus.BAD_REQUEST);
    }

    const pdf = await this.dartFinancial.fetchDisclosurePdf(url);
    if (!pdf) {
      throw new HttpException(
        '공시 PDF를 가져올 수 없습니다.',
        HttpStatus.NOT_FOUND,
      );
    }

    res.set({
      'Content-Type': pdf.contentType,
      'Content-Disposition': 'inline; filename="dart-disclosure.pdf"',
      'Content-Length': String(pdf.buffer.length),
      'Cache-Control': 'public, max-age=3600',
      'X-Frame-Options': 'ALLOWALL',
    });
    return res.send(pdf.buffer);
  }

  @Get(':id/stock')
  getCompanyStock(
    @Param('id') id: string,
    @Query('interval') interval?: string,
    @Query('before') before?: string,
  ) {
    return this.companyStock.getStockQuote(id, interval ?? '1d', before);
  }

  @Get(':id/financial-insights')
  getFinancialInsights(@Param('id') id: string) {
    return this.companyFinancialInsights.getFinancialInsights(id);
  }

  @Get(':id/financial-insights/ai-analysis')
  getFinancialAiAnalysisHistory(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.companyFinancialInsights.getAiAnalysisHistory(
      id,
      limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10,
    );
  }

  @Post(':id/financial-insights/ai-analysis')
  analyzeFinancialStatements(
    @Param('id') id: string,
    @Body() body: { model?: string },
  ) {
    return this.companyFinancialInsights.analyzeFinancialStatements(
      id,
      body.model ?? '',
    );
  }

  @Get(':id/investor-trading')
  async getInvestorTrading(
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    return this.investorTrading.getDailyInvestorTrading(
      id,
      days ? Number(days) : 30,
    );
  }

  @Get(':id/short-selling')
  async getShortSelling(@Param('id') id: string, @Query('days') days?: string) {
    return this.shortSelling.getDailyShortSelling(id, days ? Number(days) : 90);
  }

  /** 실시간 수집 + DB 자동 저장 */
  @Get(':id/news')
  async getCompanyNews(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sinceLatest') sinceLatest?: string,
  ) {
    const company = await this.companyService.findCompany(id);
    if (!company) return [];
    if (sinceLatest === 'true') {
      return this.companyNews.fetchLatestNewsSinceLastCollection(
        id,
        company.name,
      );
    }
    return this.companyNews.fetchAndSaveNews(
      id,
      company.name,
      limit ? Number(limit) : 12,
      offset ? Number(offset) : 0,
    );
  }

  /** DB에 저장된 뉴스 목록 조회 */
  @Get(':id/news/saved')
  async getSavedNews(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.companyNews.getSavedNews(
      id,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  /** 뉴스 제목만 기반으로 AI 키워드 추출 */
  @Post(':id/news/keywords')
  async detectNewsKeywords(
    @Param('id') id: string,
    @Body() body: { model: string; titles: string[] },
  ) {
    const company = await this.companyService.findCompany(id);
    if (!company)
      return { keywords: [], model: body.model, sourceTitleCount: 0 };
    return this.companyNews.detectTitleKeywords(
      id,
      company.name,
      Array.isArray(body.titles) ? body.titles : [],
      body.model,
    );
  }

  /** 저장된 최신 뉴스 키워드 조회 */
  @Get(':id/news/keywords')
  async getNewsKeywords(@Param('id') id: string) {
    return this.companyNews.getSavedTitleKeywords(id);
  }

  /** 대량 뉴스 수집 — round=0부터 순차적으로 과거 데이터 수집 */
  @Post(':id/news/bulk-fetch')
  async bulkFetchNews(
    @Param('id') id: string,
    @Body() body: { companyName?: string; round?: number },
  ) {
    const company = await this.companyService.findCompany(id);
    if (!company) return { fetched: 0, saved: 0, hasMore: false };
    return this.companyNews.bulkFetchAndSaveNews(
      id,
      body.companyName ?? company.name,
      typeof body.round === 'number' ? body.round : 0,
    );
  }

  /** Puppeteer로 Naver 뉴스 과거 데이터 스크래핑 (DB 가장 오래된 기사 이전 3개월) */
  @Post(':id/news/scrape-historical')
  async scrapeHistoricalNews(
    @Param('id') id: string,
    @Body() body: { companyName?: string },
  ) {
    const company = await this.companyService.findCompany(id);
    if (!company) return { fetched: 0, saved: 0, hasMore: false };
    return this.companyNewsScraper.scrapeHistorical(
      id,
      body.companyName ?? company.name,
    );
  }

  /** 저장된 뉴스 타임라인 조회 */
  @Get(':id/news/timeline')
  async getNewsTimeline(@Param('id') id: string) {
    const company = await this.companyService.findCompany(id);
    return this.companyNewsTimeline.getSaved(company?.id ?? id, company?.name);
  }

  /** 뉴스 타임라인 AI 입력 여부와 제외 사유 디버깅 */
  @Get(':id/news/timeline/sources')
  async getNewsTimelineSources(@Param('id') id: string) {
    const company = await this.companyService.findCompany(id);
    if (!company) {
      return {
        savedCount: 0,
        eligibleCount: 0,
        usedCount: 0,
        excludedCount: 0,
        items: [],
      };
    }
    return this.companyNewsTimeline.getSources(company.id, company.name);
  }

  /** 뉴스 타임라인 AI 분석 (재)실행 */
  @Post(':id/news/timeline/analyze')
  async analyzeNewsTimeline(
    @Param('id') id: string,
    @Body() body: { model: string; companyName: string; incremental?: boolean },
  ) {
    const company = await this.companyService.findCompany(id);
    return this.companyNewsTimeline.analyze(
      company?.id ?? id,
      company?.name ?? body.companyName,
      body.model,
      body.incremental ?? false,
    );
  }

  // ── 사업 로드맵 분석 큐 ──────────────────────────────────────────────────────

  @Post(':id/news/timeline/analyze-queue')
  async enqueueRoadmapAnalysis(
    @Param('id') id: string,
    @Body() body: { model: string; companyName: string },
  ): Promise<{ jobId: string }> {
    const company = await this.companyService.findCompany(id);
    const jobId = this.newsQueue.enqueue(
      company?.id ?? id,
      company?.name ?? body.companyName,
      body.model,
    );
    return { jobId };
  }

  @Sse(':id/news/timeline/queue/:jobId/stream')
  roadmapAnalysisStream(
    @Param('jobId') jobId: string,
  ): Observable<MessageEvent> {
    const stream = this.newsQueue.getStream(jobId);
    if (!stream) throw new NotFoundException(`jobId를 찾을 수 없습니다: ${jobId}`);
    return stream;
  }

  @Get(':id/news/timeline/queue/:jobId/status')
  getRoadmapJobStatus(@Param('jobId') jobId: string) {
    return this.newsQueue.getStatus(jobId) ?? { status: 'not_found' };
  }

  /** DART 재무 데이터 재수집 (DB 업데이트) */
  @Post(':id/refresh-financials')
  async refreshFinancials(@Param('id') id: string) {
    const dartApiKey =
      requestContext.getStore()?.serviceCredentials?.dartApiKey;
    if (!dartApiKey)
      throw new HttpException(
        'DART API 키가 설정되지 않았습니다.',
        HttpStatus.BAD_REQUEST,
      );
    try {
      const financials = await this.companyFinancialInsights.refreshFinancials(
        id,
        dartApiKey,
      );
      return { ok: true, count: financials.length, financials };
    } catch (e) {
      throw new HttpException(
        (e as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** DART 최근 분기 실적 조회 */
  @Get(':id/financials/quarterly')
  async getQuarterlyFinancials(@Param('id') id: string) {
    const dartApiKey =
      requestContext.getStore()?.serviceCredentials?.dartApiKey;
    if (!dartApiKey)
      throw new HttpException(
        'DART API 키가 설정되지 않았습니다.',
        HttpStatus.BAD_REQUEST,
      );
    try {
      return this.companyFinancialInsights.getQuarterlyFinancials(
        id,
        dartApiKey,
      );
    } catch (e) {
      throw new HttpException(
        (e as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  getCompany(@Param('id') id: string) {
    return this.companyService.findCompany(id);
  }

  @Post(':id/refresh-missing')
  refreshMissing(@Param('id') id: string) {
    return this.companyEnrich.refreshMissing(id);
  }
}
