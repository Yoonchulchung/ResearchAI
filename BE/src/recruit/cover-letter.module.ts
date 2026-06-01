import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoverLetterScraperService } from './application/cover-letter/cover-letter-scraper.service';
import { CoverLetterScraperController } from './presentation/cover-letter/cover-letter-scraper.controller';
import { SharedModule } from '../shared/shared.module';
import { AiModule } from '../ai/ai.module';
import { CompanyModule } from '../company/company.module';
import { CoverLetterEntity } from './domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterSpecAnalysisEntity } from './domain/cover-letter/entity/cover-letter-spec-analysis.entity';
import { CompanyEntity } from '../company/domain/entity/company.entity';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AiModule),
    forwardRef(() => CompanyModule),
    TypeOrmModule.forFeature([CoverLetterEntity, CoverLetterSpecAnalysisEntity, CompanyEntity]),
  ],
  controllers: [CoverLetterScraperController],
  providers: [CoverLetterScraperService],
  exports: [CoverLetterScraperService],
})
export class CoverLetterModule {}
