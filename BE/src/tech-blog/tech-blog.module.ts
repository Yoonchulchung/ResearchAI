import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechBlogService } from './application/tech-blog.service';
import { TechBlogPostEntity } from './domain/entity/tech-blog-post.entity';
import { TechBlogCrawlerService } from './infrastructure/tech-blog-crawler.service';
import { TechBlogController } from './presentation/tech-blog.controller';
import { ContentRefreshStateEntity } from '../shared/entity/content-refresh-state.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TechBlogPostEntity, ContentRefreshStateEntity])],
  controllers: [TechBlogController],
  providers: [TechBlogService, TechBlogCrawlerService],
})
export class TechBlogModule {}
