import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsController } from 'src/news/presentation/news.controller';
import { NewsService } from 'src/news/application/service/news.service';
import { NewsCacheService } from 'src/news/application/service/news-cache.service';
import { NewsFeedService } from 'src/news/application/service/news-feed.service';
import { NewsArticleService } from 'src/news/application/service/news-article.service';
import { NewsYoutubeService } from 'src/news/application/service/news-youtube.service';
import { NewsSearchService } from 'src/news/application/service/news-search.service';
import { NewsSummaryService } from 'src/news/application/service/news-summary.service';
import { NewsProviderService } from 'src/news/infrastructure/news-provider.service';
import { GithubApi } from 'src/news/infrastructure/provider/github.api';
import { HuggingfaceApi } from 'src/news/infrastructure/provider/huggingface.api';
import { NaverNewsApi } from 'src/news/infrastructure/provider/naver-news.api';
import { StackOverflowApi } from 'src/news/infrastructure/provider/stackoverflow.api';
import { YoutubeApi } from 'src/news/infrastructure/provider/youtube.api';
import { NaverRssApi } from 'src/news/infrastructure/provider/naver-rss.api';
import { NewsBriefingEntity } from 'src/news/domain/entity/news-briefing.entity';
import { NewsArticleSummaryEntity } from 'src/news/domain/entity/news-article-summary.entity';
import { AiModule } from 'src/ai/ai.module';
import { AppConfigModule } from 'src/config/config.module';
import { SharedModule } from 'src/shared/shared.module';
import { TechBlogModule } from 'src/news/tech-blog/tech-blog.module';
import { PapersModule } from 'src/news/papers/papers.module';
import { AiLeaderboardModule } from 'src/news/ai-leaderboard/ai-leaderboard.module';
import { StockModule } from 'src/stock/stock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewsBriefingEntity, NewsArticleSummaryEntity]),
    forwardRef(() => AiModule),
    AppConfigModule,
    SharedModule,
    TechBlogModule,
    PapersModule,
    AiLeaderboardModule,
    StockModule,
  ],
  controllers: [NewsController],
  providers: [
    NewsService,
    NewsCacheService,
    NewsFeedService,
    NewsArticleService,
    NewsYoutubeService,
    NewsSearchService,
    GithubApi,
    HuggingfaceApi,
    NaverNewsApi,
    NaverRssApi,
    StackOverflowApi,
    YoutubeApi,
    NewsProviderService,
    NewsSummaryService,
  ],
  exports: [NewsService],
})
export class NewsModule {}
