import { Module } from '@nestjs/common';
import { JobPostingScraperService } from './application/job-posting-scraper.service';
import { JobPostingScraperController } from './presentation/job-posting-scraper.controller';

@Module({
  controllers: [JobPostingScraperController],
  providers: [JobPostingScraperService],
})
export class JobPostingModule {}
