import { Module } from '@nestjs/common';
import { OverviewController } from './presentation/overview.controller';
import { OverviewService } from './application/overview.service';

@Module({
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
