import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ModelsService } from '../application/models.service';
import { SearchService } from '../application/search.service';
import { AiService } from '../application/ai.service';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly modelsService: ModelsService,
    private readonly searchService: SearchService,
    private readonly aiService: AiService,
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

  @Post()
  runResearch(@Body() body: { prompt: string; model: string; context?: string }) {
    return this.aiService.runResearch(body.prompt, body.model, body.context);
  }

  @Post('generate-tasks')
  generateTasks(@Body() body: { topic: string; model: string }) {
    return this.aiService.generateTasks(body.topic, body.model);
  }

  @Post('test/generate-tasks')
  testGenerateTasks(@Body() body: { topic: string; model: string; customPrompt?: string; customSystem?: string }) {
    return this.aiService.testGenerateTasks(body.topic, body.model, {
      customPrompt: body.customPrompt,
      customSystem: body.customSystem,
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
