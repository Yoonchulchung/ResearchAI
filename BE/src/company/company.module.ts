import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from 'src/ai/ai.module';
import { BrowseModule } from 'src/browse/browse.module';
import { ResearchModule } from 'src/research/research.module';
import { SharedModule } from 'src/shared/shared.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { QueueModule } from 'src/queue/queue.module';
import { FinancialDartModule } from 'src/financial/financial-dart.module';
import { FinancialStockModule } from 'src/financial/financial-stock.module';
import { FinancialRealEstateModule } from 'src/financial/financial-real-estate.module';
import { NewsModule } from 'src/news/news.module';
import { CompanyAnalysisService } from 'src/company/application/company-analysis.service';
import { CompanyAnalysisImplService } from 'src/company/application/analysis/company-analysis-impl.service';
import { CompanyAnalysisHrTechService } from 'src/company/application/analysis/company-analysis-hr-tech.service';
import { CompanyAnalysisChatService } from 'src/company/application/analysis/company-analysis-chat.service';
import { CompanyAnalysisPipelineService } from 'src/company/application/analysis/company-analysis-pipeline.service';
import { CompanyService } from 'src/company/application/company.service';
import { CompanyRegistryService } from 'src/company/application/internal/company-registry.service';
import { CompanyInfoService } from 'src/company/application/company-info.service';
import { CompanyInfoImplService } from 'src/company/application/info/company-info-impl.service';
import { CompanyMergeService } from 'src/company/application/company-merge.service';
import { CompanyMergeImplService } from 'src/company/application/info/company-merge-impl.service';
import { CompanyInfoFetchService } from 'src/company/application/info/company-info-fetch.service';
import { CompanyFinancialInsightsService } from 'src/company/application/company-financial-insights.service';
import { CompanyFinancialInsightsImplService } from 'src/company/application/financial/company-financial-insights-impl.service';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyEnrichQueueEntity } from 'src/company/domain/entity/company-enrich-queue.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { CompanyFinancialAiAnalysisEntity } from 'src/company/domain/entity/company-financial-ai-analysis.entity';
import { CompanyNewsKeywordEntity } from 'src/company/domain/entity/company-news-keyword.entity';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { CompanyRateEntity } from 'src/company/domain/entity/company-rate.entity';
import { CompanyMissingRefreshService } from 'src/queue/application/company-missing-refresh.service';
import { CompanyAnalysisController } from 'src/company/presentation/company-analysis.controller';
import { CompanyController } from 'src/company/presentation/company.controller';
import { CareerPageUrlService } from 'src/company/application/career-page-url.service';
import { CareerPageUrlImplService } from 'src/company/application/career/career-page-url-impl.service';
import { JobplanetScraperService } from 'src/company/infrastructure/jobplanet/jobplanet-scraper.service';
import { SaraminCompanyService } from 'src/company/infrastructure/jobportal/saramin-company.service';
import { JasoseolCompanyService } from 'src/company/infrastructure/jobportal/jasoseol-company.service';
import { JobkoreaCompanyService } from 'src/company/infrastructure/jobportal/jobkorea-company.service';
import { JobplanetInfoService } from 'src/company/infrastructure/jobportal/jobplanet-info.service';
import { NamuWikiService } from 'src/company/infrastructure/namu-wiki.service';
import { CompanyProfileUrlSearchAdapter } from 'src/company/infrastructure/company-profile-url-search.adapter';
import { CompanyProfileUrlResolverService } from 'src/company/application/info/company-profile-url-resolver.service';
import { COMPANY_PROFILE_URL_SEARCH_PORT } from 'src/company/application/info/company-profile-url-search.port';
import { CompanyNewsService } from 'src/company/application/company-news.service';
import { CompanyNewsImplService } from 'src/company/application/news/company-news-impl.service';
import { CompanyNewsScraperImplService } from 'src/company/application/news/company-news-scraper-impl.service';
import { CompanyNewsTimelineImplService } from 'src/company/application/news/company-news-timeline-impl.service';
import { CompanyNewsTimelineEntity } from 'src/company/domain/entity/company-news-timeline.entity';
import { CompanyEnglishNameService } from 'src/company/application/info/company-english-name.service';
import { CompanyHomepageService } from 'src/company/application/info/company-homepage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyAnalysisEntity,
      CompanyEntity,
      CompanyEnrichQueueEntity,
      CompanyFinancialEntity,
      CompanyFinancialAiAnalysisEntity,
      CompanyNewsKeywordEntity,
      CompanyNewsEntity,
      CompanyNewsTimelineEntity,
      CompanyRateEntity,
    ]),
    forwardRef(() => AiModule),
    forwardRef(() => ResearchModule),
    forwardRef(() => SessionsModule),
    forwardRef(() => QueueModule),
    BrowseModule,
    SharedModule,
    FinancialDartModule,
    FinancialStockModule,
    FinancialRealEstateModule,
    NewsModule,
  ],
  controllers: [CompanyAnalysisController, CompanyController],
  providers: [
    CompanyAnalysisService,
    CompanyAnalysisImplService,
    CompanyAnalysisHrTechService,
    CompanyAnalysisChatService,
    CompanyAnalysisPipelineService,
    CompanyService,
    CompanyRegistryService,
    CompanyInfoService,
    CompanyInfoImplService,
    CompanyInfoFetchService,
    CompanyMergeService,
    CompanyMergeImplService,
    CompanyFinancialInsightsService,
    CompanyFinancialInsightsImplService,
    CompanyMissingRefreshService,
    SaraminCompanyService,
    JasoseolCompanyService,
    JobkoreaCompanyService,
    JobplanetInfoService,
    NamuWikiService,
    CompanyProfileUrlResolverService,
    {
      provide: COMPANY_PROFILE_URL_SEARCH_PORT,
      useClass: CompanyProfileUrlSearchAdapter,
    },
    CareerPageUrlService,
    CareerPageUrlImplService,
    JobplanetScraperService,
    CompanyNewsService,
    CompanyNewsImplService,
    CompanyNewsScraperImplService,
    CompanyNewsTimelineImplService,
    CompanyHomepageService,
    CompanyEnglishNameService,
  ],
  exports: [
    CompanyAnalysisService,
    CompanyService,
    CompanyNewsService,
    CompanyInfoService,
    CompanyInfoFetchService,
    CompanyFinancialInsightsService,
    JobplanetScraperService,
    FinancialDartModule,
    SaraminCompanyService,
    JasoseolCompanyService,
    JobkoreaCompanyService,
    JobplanetInfoService,
    forwardRef(() => QueueModule),
  ],
})
export class CompanyModule {}
