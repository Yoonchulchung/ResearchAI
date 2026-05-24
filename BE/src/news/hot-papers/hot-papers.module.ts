import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HotPapersService } from './application/hot-papers.service';
import { HotPapersController } from './presentation/hot-papers.controller';
import { HotPaperEntity } from './domain/entity/hot-paper.entity';
import { ContentRefreshStateEntity } from '../../shared/entity/content-refresh-state.entity';
import { AiModule } from '../../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([HotPaperEntity, ContentRefreshStateEntity]), forwardRef(() => AiModule)],
  controllers: [HotPapersController],
  providers: [HotPapersService],
  exports: [HotPapersService],
})
export class HotPapersModule {}
