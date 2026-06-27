import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechBlogService } from 'src/news/application/tech-blog/tech-blog.service';
import { TechBlogImplService } from 'src/news/application/tech-blog/tech-blog-impl.service';
import { TechBlogPostEntity } from 'src/news/domain/tech-blog/entity/tech-blog-post.entity';
import { TechBlogTrendSummaryEntity } from 'src/news/domain/tech-blog/entity/tech-blog-trend-summary.entity';
import { TechBlogCrawlerService } from 'src/news/infrastructure/tech-blog/tech-blog-crawler.service';
import { TechBlogController } from 'src/news/presentation/tech-blog/tech-blog.controller';
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
  providers: [TechBlogService, TechBlogImplService, TechBlogCrawlerService],
  exports: [TechBlogService],
})
export class TechBlogModule {}
