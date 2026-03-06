import { Controller, Get, Post, Delete, Put, Param, Body, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionsService } from '../application/sessions.service';
import { SearchSources } from '../../research/domain/model/search-sources.model';
import { streamOllama } from '../../ai/infrastructure/ollama.ai';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  findAll() {
    return this.sessionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Post()
  create(@Body() body: { topic: string; model: string; tasks: any[] }) {
    return this.sessionsService.create(body.topic, body.model, body.tasks);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionsService.remove(id);
  }

  @Put(':id/tasks/:taskId')
  updateTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() body: { result: string; status: string; sources?: SearchSources },
  ) {
    return this.sessionsService.updateTask(id, parseInt(taskId), body.result, body.status, body.sources);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.sessionsService.getSummary(id);
  }

  @Post(':id/summary/stream')
  async streamSummary(
    @Param('id') id: string,
    @Body() body: { model?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // 기존 서머리가 있으면 즉시 반환
    const existing = this.sessionsService.getSummary(id);
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

    const ctx = this.sessionsService.buildSummaryContext(id);
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
      if (fullText) this.sessionsService.saveSummary(id, fullText);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
