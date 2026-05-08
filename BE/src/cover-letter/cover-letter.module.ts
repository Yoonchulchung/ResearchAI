import { Module } from '@nestjs/common';
import { CoverLetterScraperService } from './application/cover-letter-scraper.service';
import { CoverLetterScraperController } from './presentation/cover-letter-scraper.controller';

@Module({
  controllers: [CoverLetterScraperController],
  providers: [CoverLetterScraperService],
})
export class CoverLetterModule {}
