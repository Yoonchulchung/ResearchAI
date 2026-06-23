import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecruitController } from 'src/recruit/presentation/recruit.controller';
import { CollectService } from 'src/recruit/application/collect.service';
import { JobsService } from 'src/recruit/application/jobs.service';
import { RecruitContextService } from 'src/recruit/application/recruit-context.service';
import { RecruitDb } from 'src/recruit/infrastructure/database/recruit-db';
import { JobRepository } from 'src/recruit/infrastructure/repository/job-repository';
import { SourceRegistry } from 'src/recruit/infrastructure/sources/source-registry';
import { JobPostingScraperService } from 'src/recruit/application/job-posting-scraper.service';
import { JobPostingImageService } from 'src/recruit/application/job-posting/job-posting-image.service';
import { JobPostingDetailService } from 'src/recruit/application/job-posting/job-posting-detail.service';
import { JobPostingCompanyProfileService } from 'src/recruit/application/job-posting/job-posting-company-profile.service';
import { JobPostingQueryService } from 'src/recruit/application/job-posting/job-posting-query.service';
import { JobPostingScrapeEngineService } from 'src/recruit/application/job-posting/job-posting-scrape-engine.service';
import { JobPostingScraperController } from 'src/recruit/presentation/job-posting-scraper.controller';
import { RecruitJobPostingCollectService } from 'src/recruit/application/recruit-job-posting-collect.service';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';
import { RecruitJobRecommendEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-recommend.entity';
import { SharedModule } from 'src/shared/shared.module';
import { AiModule } from 'src/ai/ai.module';
import { CompanyModule } from 'src/company/company.module';
import { QueueModule } from 'src/queue/queue.module';
import { JobPostingCrawlerRegistry } from 'src/recruit/infrastructure/job-posting/job-posting-crawler.registry';
import { CatchJobCrawler } from 'src/recruit/infrastructure/job-posting/catch/catch-job.crawler';
import { JobdaJobCrawler } from 'src/recruit/infrastructure/job-posting/jobda/jobda-job.crawler';
import { JobkoreaJobCrawler } from 'src/recruit/infrastructure/job-posting/jobkorea/jobkorea-job.crawler';
import { JobplanetJobCrawler } from 'src/recruit/infrastructure/job-posting/jobplanet/jobplanet-job.crawler';
import { LinkareerJobCrawler } from 'src/recruit/infrastructure/job-posting/linkareer/linkareer-job.crawler';
import { JobPostingCrawlerRegistryPort } from 'src/recruit/application/job-posting/ports/job-posting-crawler.port';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AiModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => QueueModule),
    TypeOrmModule.forFeature([
      RecruitJobPostingEntity,
      RecruitJobRecommendEntity,
    ]),
  ],
  controllers: [RecruitController, JobPostingScraperController],
  providers: [
    CollectService,
    JobsService,
    RecruitContextService,
    RecruitDb,
    JobRepository,
    SourceRegistry,
    JobPostingImageService,
    JobPostingCompanyProfileService,
    JobPostingQueryService,
    JobPostingDetailService,
    JobPostingScrapeEngineService,
    JobPostingScraperService,
    RecruitJobPostingCollectService,
    JobPostingCrawlerRegistry,
    {
      provide: JobPostingCrawlerRegistryPort,
      useExisting: JobPostingCrawlerRegistry,
    },
    CatchJobCrawler,
    JobdaJobCrawler,
    JobkoreaJobCrawler,
    JobplanetJobCrawler,
    LinkareerJobCrawler,
  ],
  exports: [RecruitContextService, JobPostingScraperService],
})
export class RecruitModule {}
