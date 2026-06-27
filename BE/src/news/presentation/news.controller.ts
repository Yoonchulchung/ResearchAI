import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  NewsService,
  NewsItem,
  CountryNewsItem,
  KeywordItem,
  ConflictZone,
  GithubNewsItem,
  HuggingFaceNewsItem,
  SearchRoadmapResult,
  QueryNewsResult,
  RoadmapExpandResult,
  SearchRoadmapMonth,
} from 'src/news/application/news.service';
import { YoutubeNewsItem } from 'src/news/infrastructure/provider/youtube.api';
import {
  MarketItem,
  ChartPoint,
  StockMarketService,
} from 'src/financial/application/stock/stock-market.service';
import { NewsSummaryService } from 'src/news/application/news-summary.service';
import { BrowserService } from 'src/browse/application/browser.service';
import type { BrowserSearchResult } from 'src/browse/application/browser.types';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly stockMarketService: StockMarketService,
    private readonly newsSummaryService: NewsSummaryService,
    private readonly browser: BrowserService,
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

  @Get('youtube')
  async getYoutubeNews(
    @Query('limit') limitStr = '30',
    @Query('type') type = '',
  ): Promise<YoutubeNewsItem[]> {
    if (type === 'live') {
      return this.newsService.getYoutubeLive();
    }
    const limit = Math.min(parseInt(limitStr, 10) || 30, 60);
    return this.newsService.getYoutubeNews(limit);
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
    return this.stockMarketService.getMarketData();
  }

  @Get('market-chart')
  async getMarketChart(
    @Query('symbol') symbol = '^KS11',
    @Query('range') range = '1mo',
  ): Promise<ChartPoint[]> {
    return this.stockMarketService.getMarketChart(symbol, range);
  }

  @Get('market-price')
  async getMarketPrice(
    @Query('symbol') symbol = '^KS11',
  ): Promise<MarketItem | null> {
    return this.stockMarketService.getMarketPrice(symbol);
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

  @Get('search-answer')
  async searchAnswer(
    @Req() req: Request,
    @Res() res: Response,
    @Query('q') q = '',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
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

    const send = (payload: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      // 1. 뉴스 + 일반 웹 검색 병렬 실행
      const [newsResult, webRaw] = await Promise.allSettled([
        this.newsService.getQueryNews(q, 1, dateFrom, dateTo),
        this.browser.searchWeb(q, 7),
      ]);

      const newsItems = (
        newsResult.status === 'fulfilled' ? newsResult.value.items : []
      )
        .slice(0, 5)
        .map((item) => ({ ...item, itemType: 'news' as const }));

      const webItems = (webRaw.status === 'fulfilled' ? webRaw.value : []).map(
        (item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          publishedAt: null,
          imageUrl: undefined,
          source: item.source,
          itemType: 'web' as const,
        }),
      );

      // 뉴스 URL을 기준으로 중복 제거 후 웹→뉴스 순 결합, 최대 10건
      const newsUrls = new Set(newsItems.map((n) => n.url));
      const dedupedWeb = webItems.filter((w) => !newsUrls.has(w.url));
      const top10 = [...dedupedWeb, ...newsItems].slice(0, 10);

      if (top10.length === 0) {
        send({ type: 'error', message: '관련 결과를 찾을 수 없습니다.' });
        return;
      }

      // 소스 목록 먼저 전송 (프론트가 즉시 표시)
      send({ type: 'sources', items: top10 });

      // 2. 상위 5건 본문 파싱 (경량 HTTP fetch, 병렬)
      const bodyResults = await Promise.allSettled(
        top10.slice(0, 5).map(async (item) => {
          const text = await this.browser.fetchArticleText(item.url, 1500);
          return { url: item.url, body: text };
        }),
      );

      // 3. AI 컨텍스트 조립
      const context = top10
        .map((item, i) => {
          const bodyRes = i < 5 ? bodyResults[i] : null;
          const body =
            bodyRes?.status === 'fulfilled' && bodyRes.value?.body
              ? bodyRes.value.body
              : item.snippet;
          const date = item.publishedAt ? ` (${item.publishedAt})` : '';
          const typeLabel = item.itemType === 'news' ? '[뉴스]' : '[웹]';
          return `[${i + 1}] ${typeLabel} ${item.title}${date}\n${body}\n출처: ${item.url}`;
        })
        .join('\n\n---\n\n');

      const dateRange =
        dateFrom && dateTo ? `\n날짜 범위: ${dateFrom} ~ ${dateTo}` : '';

      const system = `당신은 정확하고 유용한 AI 검색 어시스턴트입니다.
웹 검색 결과(블로그, 공식 사이트, 뉴스 기사 등)를 바탕으로 사용자의 질문에 한국어로 상세하고 명확하게 답변하세요.
규칙:
- 핵심 내용과 최신 동향을 먼저 요약하세요
- 출처 번호([1], [2] 등)는 표시하지 마세요
- 마크다운 형식 사용 (## 제목, **강조**, - 목록)
- 없는 정보는 만들어내지 마세요`;

      const prompt = `질문: ${q}${dateRange}\n\n관련 검색 결과 (웹 + 뉴스):\n${context}`;

      const freeModel = 'gemini-2.0-flash-lite';
      for await (const chunk of this.aiProvider.stream(freeModel, system, [
        { role: 'user', content: prompt },
      ])) {
        if (res.writableEnded) break;
        send({ type: 'chunk', text: chunk });
      }

      send({ type: 'done', model: freeModel });
    } catch (e) {
      send({ type: 'error', message: (e as Error).message });
    } finally {
      req.off('close', cleanup);
      res.end();
    }
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
      const webResults: BrowserSearchResult[] = await this.browser
        .search(q, 5)
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

  @Get('search-roadmap')
  async searchRoadmap(@Query('q') q = ''): Promise<SearchRoadmapResult> {
    if (!q.trim()) return { months: [], newsCount: 0, query: '', model: '' };
    return this.newsService.getSearchRoadmap(q.trim());
  }

  @Get('query-news')
  async queryNews(
    @Query('q') q = '',
    @Query('start') startStr = '1',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<QueryNewsResult> {
    if (!q.trim()) return { items: [], hasMore: false, nextStart: 1 };
    const start = Math.max(1, parseInt(startStr, 10) || 1);
    return this.newsService.getQueryNews(q.trim(), start, dateFrom, dateTo);
  }

  @Post('roadmap-expand')
  async roadmapExpand(
    @Body()
    body: {
      q: string;
      direction: 'newer' | 'older';
      refDate: string;
      existingMonths: SearchRoadmapMonth[];
    },
  ): Promise<RoadmapExpandResult> {
    const { q, direction, refDate, existingMonths } = body;
    if (!q?.trim() || !refDate) {
      return {
        months: existingMonths ?? [],
        newsCount: 0,
        query: q ?? '',
        model: '',
        addedCount: 0,
      };
    }
    return this.newsService.expandRoadmap(
      q.trim(),
      direction,
      refDate,
      existingMonths ?? [],
    );
  }

  @Get('search')
  async search(
    @Query('q') q = '',
    @Query('limit') limitStr = '10',
    @Query('images') imagesStr = 'true',
  ): Promise<
    { title: string; url: string; snippet: string; imageUrl?: string }[]
  > {
    if (!q.trim()) return [];
    const limit = Math.min(parseInt(limitStr, 10) || 10, 50);
    const includeImages = imagesStr !== 'false';
    return this.browser.search(q, limit, 0, { includeImages }).catch(() => []);
  }

  @Get('web-search')
  async webSearch(
    @Query('q') q = '',
    @Query('limit') limitStr = '10',
  ): Promise<
    { title: string; url: string; snippet: string; source: string }[]
  > {
    if (!q.trim()) return [];
    const limit = Math.min(parseInt(limitStr, 10) || 15, 20);
    return this.browser.searchWeb(q, limit).catch(() => []);
  }

  @Get('refresh')
  async refreshCache(): Promise<{ message: string }> {
    await this.newsService.refreshTodayCache();
    return {
      message: '오늘 캐시가 초기화되었습니다. 다음 요청 시 새로 조회합니다.',
    };
  }
}
