import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentEntity } from './domain/documents/entity/document.entity';
import { ExperienceEntity } from './domain/documents/entity/experience.entity';
import { CompanyAnalysisEntity } from './domain/documents/entity/company-analysis.entity';
import { DocumentsService } from './application/documents/documents.service';
import { CompanyAnalysisService } from './application/documents/company-analysis.service';
import { DocumentsController } from './presentation/documents/documents.controller';
import { JobplanetScraperService } from './infrastructure/documents/jobplanet-scraper.service';
import { CareerPageUrlService } from './infrastructure/documents/career-page-url.service';
import { DartFinancialService } from './infrastructure/documents/dart-financial.service';
import { NaverLandService } from './infrastructure/documents/naver-land.service';
import { NeonetRealEstatePriceService } from './infrastructure/documents/neonet-real-estate-price.service';
import { ZippoomRealEstateUrlService } from './infrastructure/documents/zippoom-real-estate-url.service';
import { AiModule } from '../ai/ai.module';
import { VectorModule } from '../vector/vector.module';
import { QueueModule } from '../queue/queue.module';
import { ResearchModule } from '../research/research.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, ExperienceEntity, CompanyAnalysisEntity]),
    MulterModule.register(),
    forwardRef(() => AiModule),
    VectorModule,
    SharedModule,
    forwardRef(() => QueueModule),
    forwardRef(() => ResearchModule),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    CompanyAnalysisService,
    JobplanetScraperService,
    CareerPageUrlService,
    DartFinancialService,
    NaverLandService,
    NeonetRealEstatePriceService,
    ZippoomRealEstateUrlService,
  ],
  exports: [CompanyAnalysisService],
})
export class DocumentsModule {}
