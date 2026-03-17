import { Module } from '@nestjs/common';
import { AiProviderService } from './infrastructure/ai-provider.service';
import { AiService } from './application/ai.service';
import { AiController } from './presentation/ai.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { OverviewModule } from '../overview/overview.module';

@Module({
  imports: [SessionsModule, OverviewModule],
  controllers: [AiController],
  providers: [AiProviderService, AiService],
  exports: [AiProviderService, AiService],
})
export class AiModule {}
