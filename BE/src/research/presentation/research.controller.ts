import { Controller, Get, Post, Body, Res, Req } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ModelsService } from '../application/models.service';
import { WebSearchService } from '../application/web-search.service';
import { AiSearchService } from '../application/ai-search.service';
import { SearchSource } from '../application/search-planner.service';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly modelsService: ModelsService,
    private readonly searchService: WebSearchService,
    private readonly aiService: AiSearchService,
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
    @Body() body: { topic: string; model: string; searchMode?: SearchSource | 'auto' },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => { aborted = true; });

    try {
      for await (const event of this.aiService.lightResearchStream(
        body.topic, body.model, body.searchMode ?? 'auto',
      )) {
        if (aborted) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      res.end();
    }
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
