import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HotPapersService } from './application/hot-papers.service';
import { HotPapersController } from './presentation/hot-papers.controller';
import { HotPaperEntity } from './domain/entity/hot-paper.entity';
import { ContentRefreshStateEntity } from '../../shared/entity/content-refresh-state.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HotPaperEntity, ContentRefreshStateEntity])],
  controllers: [HotPapersController],
  providers: [HotPapersService],
})
export class HotPapersModule {}
