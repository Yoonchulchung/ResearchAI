import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OverviewController } from 'src/overview/presentation/overview.controller';
import { OverviewService } from 'src/overview/application/overview.service';
import { OverviewEnvImplService } from 'src/overview/application/env/overview-env-impl.service';
import { OverviewUsageImplService } from 'src/overview/application/usage/overview-usage-impl.service';
import { OverviewApiKeyImplService } from 'src/overview/application/api-key/overview-api-key-impl.service';
import { OverviewLogsImplService } from 'src/overview/application/logs/overview-logs-impl.service';
import { TokenHistoryEntity } from 'src/overview/domain/entity/token-history.entity';
import { TokenHistoryRepository } from 'src/overview/domain/repository/token-history.repository';
import { ApiKeyEntity } from 'src/overview/domain/entity/api-key.entity';
import { ApiKeyRepository } from 'src/overview/domain/repository/api-key.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TokenHistoryEntity, ApiKeyEntity])],
  controllers: [OverviewController],
  providers: [
    OverviewService,
    OverviewEnvImplService,
    OverviewUsageImplService,
    OverviewApiKeyImplService,
    OverviewLogsImplService,
    TokenHistoryRepository,
    ApiKeyRepository,
  ],
  exports: [TokenHistoryRepository, ApiKeyRepository],
})
export class OverviewModule {}
