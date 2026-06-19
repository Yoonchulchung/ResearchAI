import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  NewsService,
  NewsItem,
  CountryNewsItem,
  KeywordItem,
  ConflictZone,
  GithubNewsItem,
  HuggingFaceNewsItem,
} from 'src/news/application/service/news.service';
import {
  MarketService,
  MarketItem,
  ChartPoint,
} from 'src/news/application/service/market.service';
import { NewsSummaryService } from 'src/news/application/service/news-summary.service';
import { PuppeteerService } from 'src/browse/infrastructure/puppeteer.service';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly marketService: MarketService,
    private readonly newsSummaryService: NewsSummaryService,
    private readonly puppeteerService: PuppeteerService,
    private readonly aiProvider: AiProviderService,
  ) {}

  @Get('naver')
  async getNaverNews(
    @Query('category') category = 'it',
    @Query('limit') limitStr = '20',
    @Query('offset') offsetStr = '0',
  ): Promise<NewsItem[]> {
    return this.newsService.getNaverNews(
      category,
      Number(limitStr) || 20,
      Number(offsetStr) || 0,
    );
  }

  @Get('google')
  async getGoogleNews(
    @Query('category') category = 'it',
    @Query('limit') limitStr = '20',
    @Query('offset') offsetStr = '0',
  ): Promise<NewsItem[]> {
    return this.newsService.getNaverNews(
      category,
      Number(limitStr) || 20,
      Number(offsetStr) || 0,
    );
  }

  @Get('github')
  async getGithubTrending(
    @Query('since') since = 'daily',
  ): Promise<GithubNewsItem[]> {
    return this.newsService.getGithubTrending(since);
  }

  @Get('huggingface')
  async getHuggingFaceTrending(
    @Query('category') category = 'models',
  ): Promise<HuggingFaceNewsItem[]> {
    return this.newsService.getHuggingFaceTrending(category);
  }

  @Get('stackoverflow')
  async getStackOverflow(
    @Query('site') site = 'stackoverflow',
    @Query('limit') limitStr = '20',
  ) {
    const limit = Math.min(parseInt(limitStr, 10) || 20, 50);
    return this.newsService.getStackOverflowHot(site, limit);
  }

  @Get('keywords')
  async getKeywords(@Query('limit') limitStr = '30'): Promise<KeywordItem[]> {
    const limit = Math.min(parseInt(limitStr, 10) || 30, 60);
    return this.newsService.getKeywords(limit);
  }

  @Get('summary')
  async getNewsSummary(): Promise<{
    summary: string;
    generatedAt: string;
    cached: boolean;
  }> {
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
  async getArticleContent(@Query('url') url = ''): Promise<{
    title: string;
    content: string;
    image?: string;
    finalUrl?: string;
  }> {
    return this.newsService.getArticleContent(url);
  }

  @Get('article-summary')
  async getArticleSummary(@Query('url') url = '') {
    return this.newsService.getArticleSummary(url);
  }

  @Get('ai-answer')
  async aiAnswer(
    @Query('q') q = '',
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!q.trim()) {
      res.status(400).json({ error: '검색어를 입력하세요' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const cleanup = () => res.end();
    req.on('close', cleanup);

    try {
      // 웹 검색 결과를 컨텍스트로 사용
      const webResults = await this.puppeteerService
        .searchGoogle(q, 5)
        .catch(() => []);
      const context = webResults.length
        ? webResults
            .map(
              (r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n출처: ${r.url}`,
            )
            .join('\n\n')
        : '(웹 검색 결과 없음)';

      const system = `당신은 정확하고 유용한 AI 검색 어시스턴트입니다.
웹 검색 결과를 바탕으로 질문에 간결하고 명확하게 한국어로 답변하세요.
- 핵심 정보를 먼저 제시하고, 필요시 근거를 덧붙이세요
- 출처 번호([1], [2] 등)를 인용해 신뢰도를 높이세요
- 모르는 것은 솔직하게 밝히세요`;

      const prompt = `질문: ${q}\n\n웹 검색 결과:\n${context}`;

      const aiModel = this.aiProvider.resolveEffectiveModel('');
      for await (const chunk of this.aiProvider.stream('', system, [
        { role: 'user', content: prompt },
      ])) {
        if (res.writableEnded) break;
        res.write(
          `data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`,
        );
      }
      if (!res.writableEnded)
        res.write(
          `data: ${JSON.stringify({ type: 'done', model: aiModel })}\n\n`,
        );
    } catch (e) {
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`,
        );
      }
    } finally {
      req.off('close', cleanup);
      res.end();
    }
  }

  @Get('search')
  async search(
    @Query('q') q = '',
    @Query('limit') limitStr = '8',
  ): Promise<{ title: string; url: string; snippet: string }[]> {
    if (!q.trim()) return [];
    const limit = Math.min(parseInt(limitStr, 10) || 8, 20);
    return this.puppeteerService.searchGoogle(q, limit).catch(() => []);
  }

  @Get('refresh')
  async refreshCache(): Promise<{ message: string }> {
    await this.newsService.refreshTodayCache();
    return {
      message: '오늘 캐시가 초기화되었습니다. 다음 요청 시 새로 조회합니다.',
    };
  }
}
