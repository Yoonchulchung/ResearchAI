import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsController } from './news.controller';
import { NewsService } from './application/service/news.service';
import { MarketService } from './application/service/market.service';
import { NewsSummaryService } from './application/service/news-summary.service';
import { NewsProviderService } from './application/service/news-provider.service';
import { GithubApi } from './infrastructure/provider/github.api';
import { HuggingfaceApi } from './infrastructure/provider/huggingface.api';
import { GoogleNewsApi } from './infrastructure/provider/google-news.api';
import { PuppeteerService } from './puppeteer.service';
import { NewsBriefingEntity } from './domain/entity/news-briefing.entity';
import { AiModule } from '../ai/ai.module';
import { AppConfigModule } from '../config/config.module';

@Module({
  imports: [TypeOrmModule.forFeature([NewsBriefingEntity]), AiModule, AppConfigModule],
  controllers: [NewsController],
  providers: [PuppeteerService, NewsService, MarketService, GithubApi, HuggingfaceApi, GoogleNewsApi, NewsProviderService, NewsSummaryService],
  exports: [PuppeteerService],
})
export class NewsModule {}
