import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CompanyMissingRefreshService } from '../../queue/application/company-missing-refresh.service';
import { CompanyEnrichQueueService } from '../application/company-enrich-queue.service';
import { CompanyService } from '../application/company.service';
import { CompanyInvestorTradingService } from '../infrastructure/company-investor-trading.service';
import { CompanyNewsService } from '../infrastructure/company-news.service';
import { SystemSettingsService } from '../../shared/application/system-settings.service';

@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly missingRefresh: CompanyMissingRefreshService,
    private readonly enrichQueue: CompanyEnrichQueueService,
    private readonly systemSettings: SystemSettingsService,
    private readonly companyNews: CompanyNewsService,
    private readonly investorTrading: CompanyInvestorTradingService,
  ) {}

  @Get()
  listCompanies(
    @Query('q') q?: string,
    @Query('hasAnalysis') hasAnalysis?: string,
    @Query('limit') limit?: string,
    @Query('slim') slim?: string,
  ) {
    const hasAnalysisBool = hasAnalysis == null ? undefined : hasAnalysis === 'true';
    const limitNum = limit ? Number(limit) : undefined;

    if (slim === 'true') {
      return this.companyService.listCompaniesSlim({ hasAnalysis: hasAnalysisBool, limit: limitNum });
    }
    return this.companyService.listCompanies({ q, hasAnalysis: hasAnalysisBool, limit: limitNum });
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

  @Get(':id/stock')
  getCompanyStock(@Param('id') id: string, @Query('interval') interval?: string) {
    return this.companyService.getStockQuote(id, interval ?? '1d');
  }

  @Get(':id/investor-trading')
  async getInvestorTrading(@Param('id') id: string, @Query('days') days?: string) {
    return this.investorTrading.getDailyInvestorTrading(id, days ? Number(days) : 30);
  }

  /** 실시간 수집 + DB 자동 저장 */
  @Get(':id/news')
  async getCompanyNews(@Param('id') id: string, @Query('limit') limit?: string) {
    const company = await this.companyService.findCompany(id);
    if (!company) return [];
    return this.companyNews.fetchAndSaveNews(id, company.name, limit ? Number(limit) : 12);
  }

  /** DB에 저장된 뉴스 목록 조회 */
  @Get(':id/news/saved')
  async getSavedNews(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.companyNews.getSavedNews(id, limit ? Number(limit) : 50);
  }

  @Get(':id')
  getCompany(@Param('id') id: string) {
    return this.companyService.findCompany(id);
  }

  @Post(':id/refresh-missing')
  refreshMissing(@Param('id') id: string) {
    return this.companyService.refreshMissing(id);
  }
}
