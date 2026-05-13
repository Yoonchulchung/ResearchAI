import { Module } from '@nestjs/common';
import { RecruitController } from './presentation/recruit.controller';
import { CollectService } from './application/collect.service';
import { JobsService } from './application/jobs.service';
import { RecruitContextService } from './application/recruit-context.service';
import { RecruitDb } from './infrastructure/database/recruit-db';
import { JobRepository } from './infrastructure/repository/job-repository';
import { SourceRegistry } from './infrastructure/sources/source-registry';
import { JobPostingScraperService } from './application/job-posting-scraper.service';
import { JobPostingScraperController } from './presentation/job-posting-scraper.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [RecruitController, JobPostingScraperController],
  providers: [
    CollectService,
    JobsService,
    RecruitContextService,
    RecruitDb,
    JobRepository,
    SourceRegistry,
    JobPostingScraperService,
  ],
  exports: [RecruitContextService],
})
export class RecruitModule {}
