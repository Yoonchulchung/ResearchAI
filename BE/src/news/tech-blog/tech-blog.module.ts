import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechBlogService } from 'src/news/tech-blog/application/tech-blog.service';
import { TechBlogPostEntity } from 'src/news/tech-blog/domain/entity/tech-blog-post.entity';
import { TechBlogTrendSummaryEntity } from 'src/news/tech-blog/domain/entity/tech-blog-trend-summary.entity';
import { TechBlogCrawlerService } from 'src/news/tech-blog/infrastructure/tech-blog-crawler.service';
import { TechBlogController } from 'src/news/tech-blog/presentation/tech-blog.controller';
import { ContentRefreshStateEntity } from 'src/shared/entity/content-refresh-state.entity';
import { AiModule } from 'src/ai/ai.module';
import { AppConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TechBlogPostEntity,
      TechBlogTrendSummaryEntity,
      ContentRefreshStateEntity,
    ]),
    forwardRef(() => AiModule),
    AppConfigModule,
  ],
  controllers: [TechBlogController],
  providers: [TechBlogService, TechBlogCrawlerService],
  exports: [TechBlogService],
})
export class TechBlogModule {}
