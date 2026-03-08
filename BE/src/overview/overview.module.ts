import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OverviewController } from './presentation/overview.controller';
import { OverviewService } from './application/overview.service';
import { TokenHistoryEntity } from './domain/entity/token-history.entity';
import { TokenHistoryRepository } from './domain/repository/token-history.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TokenHistoryEntity])],
  controllers: [OverviewController],
  providers: [OverviewService, TokenHistoryRepository],
  exports: [TokenHistoryRepository],
})
export class OverviewModule {}
