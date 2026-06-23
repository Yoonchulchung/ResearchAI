import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from 'src/ai/ai.module';
import { BrowseModule } from 'src/browse/browse.module';
import { ResearchModule } from 'src/research/research.module';
import { SharedModule } from 'src/shared/shared.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { QueueModule } from 'src/queue/queue.module';
import { CompanyAnalysisService } from 'src/company/application/analysis/company-analysis.service';
import { CompanyAnalysisHrTechService } from 'src/company/application/analysis/company-analysis-hr-tech.service';
import { CompanyAnalysisChatService } from 'src/company/application/analysis/company-analysis-chat.service';
import { CompanyAnalysisPipelineService } from 'src/company/application/analysis/company-analysis-pipeline.service';
import { CompanyService } from 'src/company/application/company.service';
import { CompanyEnrichService } from 'src/company/application/company-enrich.service';
import { CompanyStockService } from 'src/company/application/company-stock.service';
import { CompanyFinancialInsightsService } from 'src/company/application/company-financial-insights.service';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyEnrichQueueEntity } from 'src/company/domain/entity/company-enrich-queue.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { CompanyFinancialAiAnalysisEntity } from 'src/company/domain/entity/company-financial-ai-analysis.entity';
import { CompanyInvestorTradingEntity } from 'src/company/domain/entity/company-investor-trading.entity';
import { CompanyNewsKeywordEntity } from 'src/company/domain/entity/company-news-keyword.entity';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { CompanyRateEntity } from 'src/company/domain/entity/company-rate.entity';
import { CompanyShortSellingEntity } from 'src/company/domain/entity/company-short-selling.entity';
import { CompanyMissingRefreshService } from 'src/queue/application/company-missing-refresh.service';
import { CompanyAnalysisController } from 'src/company/presentation/company-analysis.controller';
import { CompanyController } from 'src/company/presentation/company.controller';
import { CareerPageUrlService } from 'src/company/infrastructure/career-page-url.service';
import { DartApiQueueService } from 'src/company/infrastructure/dart-api-queue.service';
import { DartFinancialService } from 'src/company/infrastructure/dart/dart-financial.service';
import { DartCorpCodeService } from 'src/company/infrastructure/dart/dart-corp-code.service';
import { DartReportService } from 'src/company/infrastructure/dart/dart-report.service';
import { JobplanetScraperService } from 'src/company/infrastructure/jobplanet/jobplanet-scraper.service';
import { NamuWikiService } from 'src/company/infrastructure/namu-wiki.service';
import { SaraminCompanyService } from 'src/company/infrastructure/saramin-company.service';
import { JasoseolCompanyService } from 'src/company/infrastructure/jasoseol-company.service';
import { JobkoreaCompanyService } from 'src/company/infrastructure/jobkorea-company.service';
import { JobplanetInfoService } from 'src/company/infrastructure/jobplanet/jobplanet-info.service';
import { CompanyNewsService } from 'src/company/infrastructure/company-news.service';
import { CompanyNewsScraperService } from 'src/company/infrastructure/company-news-scraper.service';
import { CompanyNewsTimelineService } from 'src/company/infrastructure/company-news-timeline.service';
import { CompanyNewsTimelineEntity } from 'src/company/domain/entity/company-news-timeline.entity';
import { CompanyInvestorTradingService } from 'src/company/infrastructure/company-investor-trading.service';
import { CompanyShortSellingService } from 'src/company/infrastructure/company-short-selling.service';
import { KrxInvestorService } from 'src/company/infrastructure/krx-investor.service';
import { KrxShortSellingService } from 'src/company/infrastructure/krx-short-selling.service';
import { NeonetRealEstatePriceService } from 'src/company/infrastructure/neonet-real-estate-price.service';
import { ZippoomRealEstateUrlService } from 'src/company/infrastructure/zippoom-real-estate-url.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyAnalysisEntity,
      CompanyEntity,
      CompanyEnrichQueueEntity,
      CompanyFinancialEntity,
      CompanyFinancialAiAnalysisEntity,
      CompanyInvestorTradingEntity,
      CompanyNewsKeywordEntity,
      CompanyNewsEntity,
      CompanyNewsTimelineEntity,
      CompanyRateEntity,
      CompanyShortSellingEntity,
    ]),
    forwardRef(() => AiModule),
    forwardRef(() => ResearchModule),
    forwardRef(() => SessionsModule),
    forwardRef(() => QueueModule),
    BrowseModule,
    SharedModule,
  ],
  controllers: [CompanyAnalysisController, CompanyController],
  providers: [
    CompanyAnalysisService,
    CompanyAnalysisHrTechService,
    CompanyAnalysisChatService,
    CompanyAnalysisPipelineService,
    CompanyService,
    CompanyEnrichService,
    CompanyStockService,
    CompanyFinancialInsightsService,
    CompanyMissingRefreshService,
    NamuWikiService,
    SaraminCompanyService,
    JasoseolCompanyService,
    JobkoreaCompanyService,
    JobplanetInfoService,
    CareerPageUrlService,
    DartApiQueueService,
    DartFinancialService,
    DartCorpCodeService,
    DartReportService,
    JobplanetScraperService,
    CompanyNewsService,
    CompanyNewsScraperService,
    CompanyNewsTimelineService,
    CompanyInvestorTradingService,
    CompanyShortSellingService,
    KrxInvestorService,
    KrxShortSellingService,
    NeonetRealEstatePriceService,
    ZippoomRealEstateUrlService,
  ],
  exports: [
    CompanyAnalysisService,
    CompanyService,
    CompanyNewsService,
    CompanyEnrichService,
    CompanyStockService,
    CompanyFinancialInsightsService,
    CompanyNewsTimelineService,
    JobplanetScraperService,
    DartApiQueueService,
    NamuWikiService,
    SaraminCompanyService,
    JasoseolCompanyService,
    JobkoreaCompanyService,
    JobplanetInfoService,
    forwardRef(() => QueueModule),
  ],
})
export class CompanyModule {}
