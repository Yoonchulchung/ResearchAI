import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PapersService } from 'src/news/application/papers/papers.service';
import { PapersImplService } from 'src/news/application/papers/papers-impl.service';
import { PapersController } from 'src/news/presentation/papers/papers.controller';
import { PaperEntity } from 'src/news/domain/papers/entity/paper.entity';
import { PaperTrendSummaryEntity } from 'src/news/domain/papers/entity/paper-trend-summary.entity';
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
  providers: [PapersService, PapersImplService],
  exports: [PapersService],
})
export class PapersModule {}
