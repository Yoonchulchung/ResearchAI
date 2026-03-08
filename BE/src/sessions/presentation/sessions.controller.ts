import { Controller, Get, Post, Delete, Put, Param, Body, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionsService } from '../application/sessions.service';
import { ResearchState } from '../domain/entity/session.entity';
import { streamOllama } from '../../ai/infrastructure/ollama.ai';
import { CreateSessionDto } from './dto/request/create-session.dto';
import { UpdateTaskDto } from './dto/request/update-task.dto';
import { StreamSummaryDto } from './dto/request/stream-summary.dto';
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // ******* //
  // 새션 조회 //
  // ******* //
  @Get()
  findAll() {
    return this.sessionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);

    // ToDo: 웹 검색 결과 반환이 안되는 문제가 있음.
    // ToDo: 큐 로직에 얼마나 들어가져 있는지 확인이 어려운 문제가 있음. len(queue) 같은 것으로 큐에 있는 것들의 개수를 알 수 있는 방법이 필요함.
  }

  // ******* //
  // 새션 생성 //
  // ******* //
  @Post()
  create(@Body() body: CreateSessionDto) {
    return this.sessionsService.createSession(body.topic, body.researchCloudAIModel, body.researchLocalAIModel, body.researchWebModel, body.tasks);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionsService.remove(id);
  }

  @Put(':id/items/:itemId')
  updateTask(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.sessionsService.updateSession(id, itemId, body.result, body.status as ResearchState);
  }
  
  // ************ //
  // 새션 서머리 요청 //
  // ************ //
  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.sessionsService.getSummary(id);
  }
  
  // ************** //
  // 세션의 요약본 생성 //
  // ************** //
  @Post(':id/summary/stream')
  async streamSummary(
    @Param('id') id: string,
    @Body() body: StreamSummaryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // 기존 서머리가 있으면 즉시 반환
    const existing = await this.sessionsService.getSummary(id);
    if (existing.summary) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: existing.summary })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    const ctx = await this.sessionsService.buildSummaryContext(id);
    if (!ctx) throw new BadRequestException('완료된 태스크가 없습니다.');

    const model = body?.model || ctx.model;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullText = '';
    try {
      for await (const chunk of streamOllama(model, ctx.system, ctx.prompt)) {
        if (req.destroyed) break;
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      }
      if (fullText) await this.sessionsService.saveSummary(id, fullText);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
