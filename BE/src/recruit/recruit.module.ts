import { Module } from '@nestjs/common';
import { RecruitController } from './presentation/recruit.controller';
import { CollectService } from './application/collect.service';
import { JobsService } from './application/jobs.service';
import { RecruitContextService } from './application/recruit-context.service';
import { RecruitDb } from './infrastructure/database/recruit-db';
import { JobRepository } from './infrastructure/repository/job-repository';
import { SourceRegistry } from './infrastructure/sources/source-registry';

@Module({
  controllers: [RecruitController],
  providers: [CollectService, JobsService, RecruitContextService, RecruitDb, JobRepository, SourceRegistry],
  exports: [RecruitContextService],
})
export class RecruitModule {}
