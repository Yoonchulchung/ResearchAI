import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsController } from 'src/news/presentation/news.controller';
import { NewsService } from 'src/news/application/service/news.service';
import { MarketService } from 'src/news/application/service/market.service';
import { NewsSummaryService } from 'src/news/application/service/news-summary.service';
import { NewsProviderService } from 'src/news/infrastructure/news-provider.service';
import { GithubApi } from 'src/news/infrastructure/provider/github.api';
import { HuggingfaceApi } from 'src/news/infrastructure/provider/huggingface.api';
import { NaverNewsApi } from 'src/news/infrastructure/provider/naver-news.api';
import { StackOverflowApi } from 'src/news/infrastructure/provider/stackoverflow.api';
import { NewsBriefingEntity } from 'src/news/domain/entity/news-briefing.entity';
import { NewsArticleSummaryEntity } from 'src/news/domain/entity/news-article-summary.entity';
import { AiModule } from 'src/ai/ai.module';
import { AppConfigModule } from 'src/config/config.module';
import { SharedModule } from 'src/shared/shared.module';
import { TechBlogModule } from 'src/news/tech-blog/tech-blog.module';
import { PapersModule } from 'src/news/papers/papers.module';
import { AiLeaderboardModule } from 'src/news/ai-leaderboard/ai-leaderboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewsBriefingEntity, NewsArticleSummaryEntity]),
    forwardRef(() => AiModule),
    AppConfigModule,
    SharedModule,
    TechBlogModule,
    PapersModule,
    AiLeaderboardModule,
  ],
  controllers: [NewsController],
  providers: [
    NewsService,
    MarketService,
    GithubApi,
    HuggingfaceApi,
    NaverNewsApi,
    StackOverflowApi,
    NewsProviderService,
    NewsSummaryService,
  ],
  exports: [NewsService],
})
export class NewsModule {}
