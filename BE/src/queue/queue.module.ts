import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './application/queue.service';
import { DeepResearchExecutorService } from './application/job/deep-research-executor.service';
import { LightResearchExecutorService } from './application/job/light-research-executor.service';
import { SummaryExecutorService } from './application/job/summary-executor.service';
import { QueueController } from './presentation/queue.controller';
import { ResearchModule } from '../research/research.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AiModule } from '../ai/ai.module';
import { QueueJobEntity } from './domain/entity/queue-job.entity';
import { QueueJobRepository } from './domain/repository/queue-job.repository';

@Module({
  imports: [forwardRef(() => ResearchModule), SessionsModule, AiModule, TypeOrmModule.forFeature([QueueJobEntity])],
  controllers: [QueueController],
  providers: [QueueService, DeepResearchExecutorService, LightResearchExecutorService, SummaryExecutorService, QueueJobRepository],
  exports: [QueueService],
})
export class QueueModule {}
