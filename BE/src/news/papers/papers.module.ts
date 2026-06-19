import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PapersService } from 'src/news/papers/application/papers.service';
import { PapersController } from 'src/news/papers/presentation/papers.controller';
import { PaperEntity } from 'src/news/papers/domain/entity/paper.entity';
import { PaperTrendSummaryEntity } from 'src/news/papers/domain/entity/paper-trend-summary.entity';
import { ContentRefreshStateEntity } from 'src/shared/entity/content-refresh-state.entity';
import { AiModule } from 'src/ai/ai.module';
import { AppConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaperEntity,
      PaperTrendSummaryEntity,
      ContentRefreshStateEntity,
    ]),
    forwardRef(() => AiModule),
    AppConfigModule,
  ],
  controllers: [PapersController],
  providers: [PapersService],
  exports: [PapersService],
})
export class PapersModule {}
