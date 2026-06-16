import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { BrowseModule } from '../browse/browse.module';
import { ResearchModule } from '../research/research.module';
import { SharedModule } from '../shared/shared.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CompanyAnalysisService } from './application/company-analysis.service';
import { CompanyEnrichQueueService } from './application/company-enrich-queue.service';
import { CompanyService } from './application/company.service';
import { CompanyAnalysisEntity } from './domain/entity/company-analysis.entity';
import { CompanyEntity } from './domain/entity/company.entity';
import { CompanyEnrichQueueEntity } from './domain/entity/company-enrich-queue.entity';
import { CompanyFinancialEntity } from './domain/entity/company-financial.entity';
import { CompanyInvestorTradingEntity } from './domain/entity/company-investor-trading.entity';
import { CompanyNewsEntity } from './domain/entity/company-news.entity';
import { CompanyRateEntity } from './domain/entity/company-rate.entity';
import { CompanyMissingRefreshService } from '../queue/application/company-missing-refresh.service';
import { CompanyAnalysisController } from './presentation/company-analysis.controller';
import { CompanyController } from './presentation/company.controller';
import { CareerPageUrlService } from './infrastructure/career-page-url.service';
import { DartApiQueueService } from './infrastructure/dart-api-queue.service';
import { DartFinancialService } from './infrastructure/dart-financial.service';
import { JobplanetScraperService } from './infrastructure/jobplanet-scraper.service';
import { NamuWikiService } from './infrastructure/namu-wiki.service';
import { SaraminCompanyService } from './infrastructure/saramin-company.service';
import { JasoseolCompanyService } from './infrastructure/jasoseol-company.service';
import { JobkoreaCompanyService } from './infrastructure/jobkorea-company.service';
import { JobplanetInfoService } from './infrastructure/jobplanet-info.service';
import { CompanyNewsService } from './infrastructure/company-news.service';
import { CompanyInvestorTradingService } from './infrastructure/company-investor-trading.service';
import { KrxInvestorService } from './infrastructure/krx-investor.service';
import { NeonetRealEstatePriceService } from './infrastructure/neonet-real-estate-price.service';
import { ZippoomRealEstateUrlService } from './infrastructure/zippoom-real-estate-url.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyAnalysisEntity, CompanyEntity, CompanyEnrichQueueEntity, CompanyFinancialEntity, CompanyInvestorTradingEntity, CompanyNewsEntity, CompanyRateEntity]),
    forwardRef(() => AiModule),
    forwardRef(() => ResearchModule),
    forwardRef(() => SessionsModule),
    BrowseModule,
    SharedModule,
  ],
  controllers: [CompanyAnalysisController, CompanyController],
  providers: [
    CompanyAnalysisService,
    CompanyEnrichQueueService,
    CompanyService,
    CompanyMissingRefreshService,
    NamuWikiService,
    SaraminCompanyService,
    JasoseolCompanyService,
    JobkoreaCompanyService,
    JobplanetInfoService,
    CareerPageUrlService,
    DartApiQueueService,
    DartFinancialService,
    JobplanetScraperService,
    CompanyNewsService,
    CompanyInvestorTradingService,
    KrxInvestorService,
    NeonetRealEstatePriceService,
    ZippoomRealEstateUrlService,
  ],
  exports: [CompanyAnalysisService, CompanyEnrichQueueService, CompanyService, JobplanetScraperService, DartApiQueueService, NamuWikiService, SaraminCompanyService, JasoseolCompanyService, JobkoreaCompanyService, JobplanetInfoService],
})
export class CompanyModule {}
