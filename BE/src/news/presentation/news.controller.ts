import { Controller, Get, Query } from '@nestjs/common';
import { NewsService, NewsItem, CountryNewsItem, KeywordItem, ConflictZone } from '../application/service/news.service';
import { MarketService, MarketItem, ChartPoint } from '../application/service/market.service';
import { NewsSummaryService } from '../application/service/news-summary.service';
import { PuppeteerService } from '../puppeteer.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly marketService: MarketService,
    private readonly newsSummaryService: NewsSummaryService,
    private readonly puppeteerService: PuppeteerService,
  ) {}

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
    return this.newsSummaryService.getNewsSummary();
  }

  @Get('github-summary')
  async getGithubSummary(
    @Query('since') since = 'daily',
  ): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    return this.newsSummaryService.getGithubSummary(since);
  }

  @Get('hf-summary')
  async getHfSummary(
    @Query('category') category = 'models',
  ): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    return this.newsSummaryService.getHfSummary(category);
  }

  @Get('market')
  async getMarketData(): Promise<MarketItem[]> {
    return this.marketService.getMarketData();
  }

  @Get('market-chart')
  async getMarketChart(
    @Query('symbol') symbol = '^KS11',
    @Query('range') range = '1mo',
  ): Promise<ChartPoint[]> {
    return this.marketService.getMarketChart(symbol, range);
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

  @Get('search')
  async search(
    @Query('q') q = '',
    @Query('limit') limitStr = '8',
  ): Promise<{ title: string; url: string; snippet: string }[]> {
    if (!q.trim()) return [];
    const limit = Math.min(parseInt(limitStr, 10) || 8, 20);
    return this.puppeteerService.searchGoogle(q, limit);
  }

  @Get('refresh')
  async refreshCache(): Promise<{ message: string }> {
    await this.newsService.refreshTodayCache();
    return { message: '오늘 캐시가 초기화되었습니다. 다음 요청 시 새로 조회합니다.' };
  }
}
