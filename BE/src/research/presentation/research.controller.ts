import { Controller, Get, Post, Param, Body, Res, Req, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ModelsService } from '../../ai/application/models.service';
import { WebSearchService } from '../application/web-search.service';
import { ResearchService } from '../application/research.service';
import { LightResearchStreamDto } from './dto/request/light-research-stream.dto';
import { DeepResearchStreamDto } from './dto/request/deep-research-stream.dto';
import { TestLightSearchDto } from './dto/request/test-light-search.dto';
import { TestSearchDto } from './dto/request/test-search.dto';
import { TestOllamaFilterDto } from './dto/request/test-ollama-filter.dto';
import { TestLightSearchResponseDto } from './dto/response/test-light-search.response.dto';

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

  // ******** //
  // 리서처 요청 //
  // ******** //
  @Post('light-search/stream')
  async lightResearchStream(
    @Body() body: LightResearchStreamDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 파이프라인을 백그라운드에서 실행 — 클라이언트 연결이 끊겨도 완료까지 실행됨
    this.aiService.startLightResearch(
      body.searchId, body.topic, body.localAIModel, body.cloudAIModel, body.webModel, body.searchMode ?? 'auto',
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
  deepResearch(@Body() body: DeepResearchStreamDto) {
    return this.aiService.deepResearch(body.sessionId, body.items, body.localAIModel, body.cloudAIModel, body.status);
  }

  @Post('sessions/:sessionId/stop')
  stopResearch(@Param('sessionId') sessionId: string) {
    return this.aiService.stopResearch(sessionId);
  }

  @Post('sessions/:sessionId/items/:itemId/stop')
  stopResearchItem(
    @Param('sessionId') sessionId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.aiService.stopResearchItem(sessionId, itemId);
  }

  // *************** //
  // 서칭 프롬프트 디버그 //
  // *************** //
  @Post('test/light-search')
  async testGenerateTasks(@Body() body: TestLightSearchDto): Promise<TestLightSearchResponseDto> {
    const result = await this.aiService.testGenerateTasks(body.topic, body.model, {
      customPrompt: body.customPrompt,
      customSystem: body.customSystem,
      searchMode: body.searchMode,
    });
    return TestLightSearchResponseDto.from(result);
  }

  @Post('test/search')
  testSearch(@Body() body: TestSearchDto) {
    return this.searchService.testSearchEngine(body.engine as any, body.query);
  }

  @Post('test/ollama-filter')
  testOllamaFilter(@Body() body: TestOllamaFilterDto) {
    return this.searchService.testOllamaFilter(body.query, body.context, body.customFilterPrompt);
  }
}
