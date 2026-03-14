import { Module } from '@nestjs/common';
import { AiProviderService } from './application/ai-provider.service';
import { AiChatService } from './application/ai-chat.service';
import { AiController } from './presentation/ai.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { VectorModule } from '../vector/vector.module';
import { OverviewModule } from '../overview/overview.module';

@Module({
  imports: [SessionsModule, VectorModule, OverviewModule],
  controllers: [AiController],
  providers: [AiProviderService, AiChatService],
  exports: [AiProviderService, AiChatService],
})
export class AiModule {}
