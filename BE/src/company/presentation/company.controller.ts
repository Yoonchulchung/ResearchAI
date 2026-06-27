import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CompanyMissingRefreshService } from 'src/queue/application/company-missing-refresh.service';
import { CompanyEnrichQueueService } from 'src/queue/application/company-enrich-queue.service';
import { CompanyService } from 'src/company/application/company.service';
import { CompanyInfoService } from 'src/company/application/company-info.service';
import { CompanyMergeService } from 'src/company/application/company-merge.service';
import { CompanyNewsService } from 'src/company/application/company-news.service';
import { SystemSettingsService } from 'src/shared/application/system-settings.service';

@Controller('companies')
export class CompanyController {
  private readonly historicalScrapeControllers = new Map<
    string,
    AbortController
  >();

  constructor(
    private readonly companyService: CompanyService,
    private readonly companyEnrich: CompanyInfoService,
    private readonly missingRefresh: CompanyMissingRefreshService,
    private readonly enrichQueue: CompanyEnrichQueueService,
    private readonly systemSettings: SystemSettingsService,
    private readonly companyNews: CompanyNewsService,
    private readonly companyMerge: CompanyMergeService,
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
      limit ? Number(limit) : 50,
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

  /** 저장된 뉴스, 키워드, 뉴스 타임라인 초기화 */
  @Delete(':id/news')
  async resetCompanyNews(@Param('id') id: string) {
    const company = await this.companyService.findCompany(id);
    if (!company) {
      return { deletedNews: 0, deletedKeywords: 0, deletedTimeline: 0 };
    }
    return this.companyNews.resetSavedNews(company.id);
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
    @Body() body: { companyName?: string; stopDate?: string },
  ) {
    const company = await this.companyService.findCompany(id);
    if (!company) return { fetched: 0, saved: 0, hasMore: false };
    return this.companyNews.scrapeHistorical(
      id,
      body.companyName ?? company.name,
      { stopDate: body.stopDate },
    );
  }

  /** 과거 뉴스 스크래핑 진행 상황 스트림 */
  @Sse(':id/news/scrape-historical/stream')
  streamHistoricalNews(
    @Param('id') id: string,
    @Query('companyName') companyName?: string,
    @Query('stopDate') stopDate?: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let finished = false;
      const controller = new AbortController();
      this.historicalScrapeControllers.get(id)?.abort();
      this.historicalScrapeControllers.set(id, controller);

      const emit = (data: string | object) => {
        if (!closed) subscriber.next({ data });
      };

      this.companyService
        .findCompany(id)
        .then((company) => {
          if (!company) {
            emit({
              type: 'error',
              message: '회사를 찾을 수 없습니다.',
            });
            return;
          }
          return this.companyNews.scrapeHistorical(
            id,
            companyName || company.name,
            { onProgress: emit, signal: controller.signal, stopDate },
          );
        })
        .catch((error) => {
          emit({
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : '이전 뉴스 수집에 실패했습니다.',
          });
        })
        .finally(() => {
          finished = true;
          if (this.historicalScrapeControllers.get(id) === controller) {
            this.historicalScrapeControllers.delete(id);
          }
          if (!closed) subscriber.complete();
        });

      return () => {
        closed = true;
        if (!finished) controller.abort();
      };
    });
  }

  /** 진행 중인 과거 뉴스 스크래핑 중지 — 현재까지 찾은 후보는 저장됨 */
  @Post(':id/news/scrape-historical/stop')
  stopHistoricalNews(@Param('id') id: string) {
    const controller = this.historicalScrapeControllers.get(id);
    if (!controller) return { stopped: false };
    controller.abort();
    return { stopped: true };
  }

  /** 저장된 뉴스 타임라인 조회 */
  @Get(':id/news/timeline')
  async getNewsTimeline(@Param('id') id: string) {
    const company = await this.companyService.findCompany(id);
    return this.companyNews.getSavedTimeline(company?.id ?? id, company?.name);
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
    return this.companyNews.getTimelineSources(company.id, company.name);
  }

  /** 뉴스 타임라인 AI 분석 (재)실행 */
  @Post(':id/news/timeline/analyze')
  async analyzeNewsTimeline(
    @Param('id') id: string,
    @Body() body: { model: string; companyName: string; incremental?: boolean },
  ) {
    const company = await this.companyService.findCompany(id);
    return this.companyNews.analyzeTimeline(
      company?.id ?? id,
      company?.name ?? body.companyName,
      body.model,
      body.incremental ?? false,
    );
  }

  @Sse(':id/refresh-missing/stream')
  streamRefreshMissing(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      const emit = (data: string | object) => {
        if (!closed) subscriber.next({ data });
      };

      this.companyEnrich
        .refreshMissing(id, { onProgress: emit })
        .catch((error) => {
          emit({
            type: 'error',
            completed: 0,
            total: 6,
            message:
              error instanceof Error
                ? error.message
                : '결측치 수집에 실패했습니다.',
          });
        })
        .finally(() => {
          if (!closed) subscriber.complete();
        });

      return () => {
        closed = true;
      };
    });
  }

  @Get(':id')
  getCompany(@Param('id') id: string) {
    return this.companyService.findCompany(id);
  }

  @Post(':id/refresh-missing')
  refreshMissing(@Param('id') id: string) {
    return this.companyEnrich.refreshMissing(id);
  }

  /** 중복 기업 후보 목록 조회 */
  @Get('duplicates/candidates')
  findDuplicateCandidates() {
    return this.companyMerge.findDuplicateCandidates();
  }

  /** 두 기업을 병합. keepId 기업이 살아남고 removeId 기업은 삭제됨 */
  @Post('merge')
  mergeCompanies(@Body() body: { keepId: string; removeId: string }) {
    return this.companyMerge.merge(body.keepId, body.removeId);
  }
}
