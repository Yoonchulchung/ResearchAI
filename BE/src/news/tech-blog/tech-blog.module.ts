import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechBlogService } from './application/tech-blog.service';
import { TechBlogPostEntity } from './domain/entity/tech-blog-post.entity';
import { TechBlogTrendSummaryEntity } from './domain/entity/tech-blog-trend-summary.entity';
import { TechBlogCrawlerService } from './infrastructure/tech-blog-crawler.service';
import { TechBlogController } from './presentation/tech-blog.controller';
import { ContentRefreshStateEntity } from '../../shared/entity/content-refresh-state.entity';
import { AiModule } from '../../ai/ai.module';
import { AppConfigModule } from '../../config/config.module';

@Module({
  imports: [TypeOrmModule.forFeature([TechBlogPostEntity, TechBlogTrendSummaryEntity, ContentRefreshStateEntity]), forwardRef(() => AiModule), AppConfigModule],
  controllers: [TechBlogController],
  providers: [TechBlogService, TechBlogCrawlerService],
  exports: [TechBlogService],
})
export class TechBlogModule {}
