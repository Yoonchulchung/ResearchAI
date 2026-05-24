import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { ResearchModule } from '../research/research.module';
import { SharedModule } from '../shared/shared.module';
import { CompanyAnalysisService } from './application/company-analysis.service';
import { CompanyAnalysisEntity } from './domain/entity/company-analysis.entity';
import { CompanyAnalysisController } from './presentation/company-analysis.controller';
import { CareerPageUrlService } from './infrastructure/career-page-url.service';
import { DartFinancialService } from './infrastructure/dart-financial.service';
import { JobplanetScraperService } from './infrastructure/jobplanet-scraper.service';
import { NeonetRealEstatePriceService } from './infrastructure/neonet-real-estate-price.service';
import { ZippoomRealEstateUrlService } from './infrastructure/zippoom-real-estate-url.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyAnalysisEntity]),
    forwardRef(() => AiModule),
    forwardRef(() => ResearchModule),
    SharedModule,
  ],
  controllers: [CompanyAnalysisController],
  providers: [
    CompanyAnalysisService,
    CareerPageUrlService,
    DartFinancialService,
    JobplanetScraperService,
    NeonetRealEstatePriceService,
    ZippoomRealEstateUrlService,
  ],
  exports: [CompanyAnalysisService, JobplanetScraperService],
})
export class CompanyAnalysisModule {}
