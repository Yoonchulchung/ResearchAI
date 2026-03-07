import { Module } from '@nestjs/common';
import { AiClientService } from './application/ai-client.service';
import { ModelsService } from './application/models.service';
import { SummaryJobService } from './application/summary-job.service';
import { AiSummaryService } from './application/ai-summary.service';
import { AiController } from './presentation/ai.controller';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  controllers: [AiController],
  providers: [AiClientService, ModelsService, SummaryJobService, AiSummaryService],
  exports: [AiClientService, ModelsService],
})
export class AiModule {}
