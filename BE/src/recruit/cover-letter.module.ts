import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoverLetterScraperService } from './application/cover-letter/cover-letter-scraper.service';
import { CoverLetterScraperController } from './presentation/cover-letter/cover-letter-scraper.controller';
import { SharedModule } from '../shared/shared.module';
import { AiModule } from '../ai/ai.module';
import { CoverLetterEntity } from './domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterSpecAnalysisEntity } from './domain/cover-letter/entity/cover-letter-spec-analysis.entity';

@Module({
  imports: [SharedModule, AiModule, TypeOrmModule.forFeature([CoverLetterEntity, CoverLetterSpecAnalysisEntity])],
  controllers: [CoverLetterScraperController],
  providers: [CoverLetterScraperService],
})
export class CoverLetterModule {}
