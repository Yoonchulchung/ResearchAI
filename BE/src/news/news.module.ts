import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsController } from './presentation/news.controller';
import { NewsService } from './application/service/news.service';
import { MarketService } from './application/service/market.service';
import { NewsSummaryService } from './application/service/news-summary.service';
import { NewsProviderService } from './infrastructure/news-provider.service';
import { GithubApi } from './infrastructure/provider/github.api';
import { HuggingfaceApi } from './infrastructure/provider/huggingface.api';
import { GoogleNewsApi } from './infrastructure/provider/google-news.api';
import { NewsBriefingEntity } from './domain/entity/news-briefing.entity';
import { AiModule } from '../ai/ai.module';
import { AppConfigModule } from '../config/config.module';
import { SharedModule } from '../shared/shared.module';
import { TechBlogModule } from './tech-blog/tech-blog.module';
import { HotPapersModule } from './hot-papers/hot-papers.module';

@Module({
  imports: [TypeOrmModule.forFeature([NewsBriefingEntity]), AiModule, AppConfigModule, SharedModule, TechBlogModule, HotPapersModule],
  controllers: [NewsController],
  providers: [NewsService, MarketService, GithubApi, HuggingfaceApi, GoogleNewsApi, NewsProviderService, NewsSummaryService],
})
export class NewsModule {}
