import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { AiService } from 'src/ai/application/ai.service';
import { AiController } from 'src/ai/presentation/ai.controller';
import { SessionsModule } from 'src/sessions/sessions.module';
import { OverviewModule } from 'src/overview/overview.module';
import { AiCallLogEntity } from 'src/ai/domain/entity/ai-call-log.entity';
import { AiCallLogRepository } from 'src/ai/domain/repository/ai-call-log.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiCallLogEntity]),
    forwardRef(() => SessionsModule),
    OverviewModule,
  ],
  controllers: [AiController],
  providers: [AiProviderService, AiService, AiCallLogRepository],
  exports: [AiProviderService, AiService],
})
export class AiModule {}
