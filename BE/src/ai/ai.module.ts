import { Module } from '@nestjs/common';
import { AiClientService } from './application/ai-client.service';
import { ModelsService } from './application/models.service';
import { SummaryJobService } from './application/summary-job.service';
import { AiSummaryService } from './application/ai-summary.service';
import { AiChatService } from './application/ai-chat.service';
import { AiController } from './presentation/ai.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { VectorModule } from '../vector/vector.module';

@Module({
  imports: [SessionsModule, VectorModule],
  controllers: [AiController],
  providers: [AiClientService, ModelsService, SummaryJobService, AiSummaryService, AiChatService],
  exports: [AiClientService, ModelsService, AiChatService],
})
export class AiModule {}
