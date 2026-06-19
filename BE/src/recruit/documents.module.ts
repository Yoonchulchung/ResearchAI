import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentEntity } from 'src/recruit/domain/documents/entity/document.entity';
import { ResumeCoverLetterEntity } from 'src/recruit/domain/resume/resume-cover-letter.entity';
import { DocumentsService } from 'src/recruit/application/documents/documents.service';
import { DocumentsController } from 'src/recruit/presentation/documents/documents.controller';
import { JobplanetScraperService } from 'src/company/infrastructure/jobplanet/jobplanet-scraper.service';
import { AiModule } from 'src/ai/ai.module';
import { VectorModule } from 'src/vector/vector.module';
import { QueueModule } from 'src/queue/queue.module';
import { SharedModule } from 'src/shared/shared.module';

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
  providers: [DocumentsService, JobplanetScraperService],
})
export class DocumentsModule {}
