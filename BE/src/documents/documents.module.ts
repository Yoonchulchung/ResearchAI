import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentEntity } from './domain/entity/document.entity';
import { ExperienceEntity } from './domain/entity/experience.entity';
import { CompanyAnalysisEntity } from './domain/entity/company-analysis.entity';
import { DocumentsService } from './application/documents.service';
import { CompanyAnalysisService } from './application/company-analysis.service';
import { DocumentsController } from './presentation/documents.controller';
import { JobplanetScraperService } from './infrastructure/jobplanet-scraper.service';
import { DartFinancialService } from './infrastructure/dart-financial.service';
import { AiModule } from '../ai/ai.module';
import { VectorModule } from '../vector/vector.module';
import { QueueModule } from '../queue/queue.module';
import { ResearchModule } from '../research/research.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, ExperienceEntity, CompanyAnalysisEntity]),
    MulterModule.register(),
    AiModule,
    VectorModule,
    QueueModule,
    ResearchModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, CompanyAnalysisService, JobplanetScraperService, DartFinancialService],
})
export class DocumentsModule {}
