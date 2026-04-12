import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProviderService } from './infrastructure/ai-provider.service';
import { AiService } from './application/ai.service';
import { AiController } from './presentation/ai.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { OverviewModule } from '../overview/overview.module';
import { AiCallLogEntity } from './domain/entity/ai-call-log.entity';
import { AiCallLogRepository } from './domain/repository/ai-call-log.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AiCallLogEntity]), SessionsModule, OverviewModule],
  controllers: [AiController],
  providers: [AiProviderService, AiService, AiCallLogRepository],
  exports: [AiProviderService, AiService],
})
export class AiModule {}
