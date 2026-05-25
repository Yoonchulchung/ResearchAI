import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PapersService } from './application/papers.service';
import { PapersController } from './presentation/papers.controller';
import { PaperEntity } from './domain/entity/paper.entity';
import { PaperTrendSummaryEntity } from './domain/entity/paper-trend-summary.entity';
import { ContentRefreshStateEntity } from '../../shared/entity/content-refresh-state.entity';
import { AiModule } from '../../ai/ai.module';
import { AppConfigModule } from '../../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaperEntity, PaperTrendSummaryEntity, ContentRefreshStateEntity]),
    forwardRef(() => AiModule),
    AppConfigModule,
  ],
  controllers: [PapersController],
  providers: [PapersService],
  exports: [PapersService],
})
export class PapersModule {}
