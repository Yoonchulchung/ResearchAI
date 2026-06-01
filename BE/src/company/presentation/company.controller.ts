import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CompanyMissingRefreshService } from '../../queue/application/company-missing-refresh.service';
import { CompanyEnrichQueueService } from '../application/company-enrich-queue.service';
import { CompanyService } from '../application/company.service';
import { SystemSettingsService } from '../../shared/application/system-settings.service';

@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly missingRefresh: CompanyMissingRefreshService,
    private readonly enrichQueue: CompanyEnrichQueueService,
    private readonly systemSettings: SystemSettingsService,
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

  @Get(':id')
  getCompany(@Param('id') id: string) {
    return this.companyService.findCompany(id);
  }

  @Post(':id/refresh-missing')
  refreshMissing(@Param('id') id: string) {
    return this.companyService.refreshMissing(id);
  }
}
