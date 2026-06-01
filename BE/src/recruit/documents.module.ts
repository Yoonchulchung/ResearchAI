import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentEntity } from './domain/documents/entity/document.entity';
import { ResumeCoverLetterEntity } from './domain/resume/resume-cover-letter.entity';
import { DocumentsService } from './application/documents/documents.service';
import { DocumentsController } from './presentation/documents/documents.controller';
import { JobplanetScraperService } from '../company/infrastructure/jobplanet-scraper.service';
import { AiModule } from '../ai/ai.module';
import { VectorModule } from '../vector/vector.module';
import { QueueModule } from '../queue/queue.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, ResumeCoverLetterEntity]),
    MulterModule.register(),
    forwardRef(() => AiModule),
    VectorModule,
    SharedModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    JobplanetScraperService,
  ],
})
export class DocumentsModule {}
