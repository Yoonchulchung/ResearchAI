import { Module } from '@nestjs/common';
import { CoverLetterScraperService } from './application/cover-letter-scraper.service';
import { CoverLetterScraperController } from './presentation/cover-letter-scraper.controller';
import { SharedModule } from '../shared/shared.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [SharedModule, AiModule],
  controllers: [CoverLetterScraperController],
  providers: [CoverLetterScraperService],
})
export class CoverLetterModule {}
