import { Controller, Get, Query } from '@nestjs/common';
import { NewsService, NewsItem, CountryNewsItem, KeywordItem, ConflictZone } from './application/service/news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('google')
  async getGoogleNews(@Query('category') category = 'it'): Promise<NewsItem[]> {
    return this.newsService.getGoogleNews(category);
  }

  @Get('keywords')
  async getKeywords(@Query('limit') limitStr = '30'): Promise<KeywordItem[]> {
    const limit = Math.min(parseInt(limitStr, 10) || 30, 60);
    return this.newsService.getKeywords(limit);
  }

  @Get('summary')
  async getNewsSummary(): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    return this.newsService.getNewsSummary();
  }

  @Get('github-summary')
  async getGithubSummary(
    @Query('since') since = 'daily',
  ): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    return this.newsService.getGithubSummary(since);
  }

  @Get('hf-summary')
  async getHfSummary(
    @Query('category') category = 'models',
  ): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    return this.newsService.getHfSummary(category);
  }

  @Get('conflict-zones')
  async getConflictZones(): Promise<ConflictZone[]> {
    return this.newsService.getConflictZones();
  }

  @Get('country')
  async getCountryNews(
    @Query('name') name = '',
    @Query('limit') limitStr = '8',
  ): Promise<CountryNewsItem[]> {
    const limit = Math.min(parseInt(limitStr, 10) || 8, 20);
    return this.newsService.getCountryNews(name, limit);
  }

  @Get('article')
  async getArticleContent(
    @Query('url') url = '',
  ): Promise<{ title: string; content: string; image?: string; finalUrl?: string }> {
    return this.newsService.getArticleContent(url);
  }
}
