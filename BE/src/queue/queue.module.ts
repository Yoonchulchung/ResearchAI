import { Module } from '@nestjs/common';
import { QueueController } from './presentation/queue.controller';
import { QueueService } from './application/queue.service';
import { JobRunnerService } from './application/job-runner.service';
import { ResearchModule } from '../research/research.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ResearchModule, SessionsModule],
  controllers: [QueueController],
  providers: [QueueService, JobRunnerService],
})
export class QueueModule {}
