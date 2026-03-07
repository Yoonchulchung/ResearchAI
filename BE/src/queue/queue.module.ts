import { Module } from '@nestjs/common';
import { QueueController } from './presentation/queue.controller';
import { QueueService } from './application/queue.service';
import { JobRunnerService } from './application/job-runner.service';
import { QueueDb } from './infrastructure/queue-db';
import { QueueRepository } from './infrastructure/queue-repository';
import { ResearchModule } from '../research/research.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ResearchModule, SessionsModule],
  controllers: [QueueController],
  providers: [QueueDb, QueueRepository, QueueService, JobRunnerService],
})
export class QueueModule {}
