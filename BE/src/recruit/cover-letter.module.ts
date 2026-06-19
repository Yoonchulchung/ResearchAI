import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoverLetterScraperService } from 'src/recruit/application/cover-letter/cover-letter-scraper.service';
import { CoverLetterQueryService } from 'src/recruit/application/cover-letter/cover-letter-query.service';
import { CoverLetterScrapeEngineService } from 'src/recruit/application/cover-letter/cover-letter-scrape-engine.service';
import { CoverLetterSpecAnalysisService } from 'src/recruit/application/cover-letter/cover-letter-spec-analysis.service';
import { CoverLetterScraperController } from 'src/recruit/presentation/cover-letter/cover-letter-scraper.controller';
import { SharedModule } from 'src/shared/shared.module';
import { AiModule } from 'src/ai/ai.module';
import { CompanyModule } from 'src/company/company.module';
import { QueueModule } from 'src/queue/queue.module';
import { BrowseModule } from 'src/browse/browse.module';
import { CoverLetterEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterQuestionEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-question.entity';
import { CoverLetterSpecAnalysisEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-spec-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';

@Module({
  imports: [
    SharedModule,
    BrowseModule,
    forwardRef(() => AiModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => QueueModule),
    TypeOrmModule.forFeature([
      CoverLetterEntity,
      CoverLetterQuestionEntity,
      CoverLetterSpecAnalysisEntity,
      CompanyEntity,
    ]),
  ],
  controllers: [CoverLetterScraperController],
  providers: [
    CoverLetterQueryService,
    CoverLetterScrapeEngineService,
    CoverLetterSpecAnalysisService,
    CoverLetterScraperService,
  ],
  exports: [CoverLetterScraperService],
})
export class CoverLetterModule {}
