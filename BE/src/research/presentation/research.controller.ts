import { Controller, Get, Post, Param, Body, Res, Req, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ModelsService } from '../../ai/application/models.service';
import { WebSearchService } from '../application/web-search.service';
import { ResearchService } from '../application/research.service';
import { SearchSource } from '../application/search-planner.service';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly modelsService: ModelsService,
    private readonly searchService: WebSearchService,
    private readonly aiService: ResearchService,
  ) {}

  @Get('models')
  getModels() {
    return this.modelsService.getModels();
  }

  @Post('search')
  runSearch(@Body() body: { prompt: string }) {
    return this.searchService.runSearch(body.prompt);
  }

  @Post('search/stream')
  async searchStream(@Body() body: { prompt: string }, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.searchService.runSearchStream(body.prompt)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  // *** //
  // 서칭 //
  // *** //
  @Post('light-search/stream')
  async lightResearchStream(
    @Body() body: { topic: string; model: string; searchMode?: SearchSource | 'auto'; searchId: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 파이프라인을 백그라운드에서 실행 — 클라이언트 연결이 끊겨도 완료까지 실행됨
    this.aiService.startLightResearchJob(
      body.searchId, body.topic, body.model, body.searchMode ?? 'auto',
    );

    await new Promise<void>((resolve) => {
      const unsub = this.aiService.replaySearchJob(
        body.searchId,
        (event) => res.write(`data: ${JSON.stringify(event)}\n\n`),
        resolve,
      );
      req.on('close', () => { unsub?.(); resolve(); });
    });

    res.end();
  }

  @Get('light-search/reconnect/:searchId')
  async reconnectLightResearch(
    @Param('searchId') searchId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const job = this.aiService.getSearchJob(searchId);
    if (!job) throw new NotFoundException('검색 작업을 찾을 수 없습니다.');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await new Promise<void>((resolve) => {
      const unsub = this.aiService.replaySearchJob(
        searchId,
        (event) => res.write(`data: ${JSON.stringify(event)}\n\n`),
        resolve,
      );
      req.on('close', () => { unsub?.(); resolve(); });
    });

    res.end();
  }

  @Post('deep-search')
  deepResearch(@Body() body: { prompt: string; model: string; context?: string }) {
    return this.aiService.deepResearch(body.prompt, body.model, body.context);
  }

  // *************** //
  // 서칭 프롬프트 디버그 //
  // *************** //
  @Post('test/light-search')
  testGenerateTasks(@Body() body: {
    topic: string;
    model: string;
    customPrompt?: string;
    customSystem?: string;
    searchMode?: SearchSource | 'auto';
  }) {
    return this.aiService.testGenerateTasks(body.topic, body.model, {
      customPrompt: body.customPrompt,
      customSystem: body.customSystem,
      searchMode: body.searchMode,
    });
  }

  @Post('test/search')
  testSearch(@Body() body: { engine: string; query: string }) {
    return this.searchService.testSearchEngine(body.engine as any, body.query);
  }

  @Post('test/ollama-filter')
  testOllamaFilter(@Body() body: { query: string; context: string; customFilterPrompt?: string }) {
    return this.searchService.testOllamaFilter(body.query, body.context, body.customFilterPrompt);
  }
}
