import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecruitController } from './presentation/recruit.controller';
import { CollectService } from './application/collect.service';
import { JobsService } from './application/jobs.service';
import { RecruitContextService } from './application/recruit-context.service';
import { RecruitDb } from './infrastructure/database/recruit-db';
import { JobRepository } from './infrastructure/repository/job-repository';
import { SourceRegistry } from './infrastructure/sources/source-registry';
import { JobPostingScraperService } from './application/job-posting-scraper.service';
import { JobPostingScraperController } from './presentation/job-posting-scraper.controller';
import { RecruitJobPostingCollectService } from './application/recruit-job-posting-collect.service';
import { RecruitJobPostingEntity } from './domain/job-posting/entity/recruit-job-posting.entity';
import { RecruitJobRecommendEntity } from './domain/job-posting/entity/recruit-job-recommend.entity';
import { SharedModule } from '../shared/shared.module';
import { AiModule } from '../ai/ai.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AiModule),
    forwardRef(() => CompanyModule),
    TypeOrmModule.forFeature([RecruitJobPostingEntity, RecruitJobRecommendEntity]),
  ],
  controllers: [RecruitController, JobPostingScraperController],
  providers: [
    CollectService,
    JobsService,
    RecruitContextService,
    RecruitDb,
    JobRepository,
    SourceRegistry,
    JobPostingScraperService,
    RecruitJobPostingCollectService,
  ],
  exports: [RecruitContextService],
})
export class RecruitModule {}
