import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OverviewController } from './presentation/overview.controller';
import { OverviewService } from './application/overview.service';
import { TokenHistoryEntity } from './domain/entity/token-history.entity';
import { TokenHistoryRepository } from './domain/repository/token-history.repository';
import { ApiKeyEntity } from './domain/entity/api-key.entity';
import { ApiKeyRepository } from './domain/repository/api-key.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TokenHistoryEntity, ApiKeyEntity])],
  controllers: [OverviewController],
  providers: [OverviewService, TokenHistoryRepository, ApiKeyRepository],
  exports: [TokenHistoryRepository, ApiKeyRepository],
})
export class OverviewModule {}
