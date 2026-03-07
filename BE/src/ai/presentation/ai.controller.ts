import { Controller, Get, Post, Param, Body, Req, Res, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AiSummaryService } from '../application/ai-summary.service';

@Controller('ai')
export class AiController {
  constructor(private readonly summaryService: AiSummaryService) {}

  /**
   * POST /ai/summary/stream
   * body: { jobId: string; sessionId: string; model?: string }
   *
   * - jobId가 같으면 기존 작업을 재생 (멱등성)
   * - 처음 요청이면 백그라운드에서 서머리 생성 시작
   */
  @Post('summary/stream')
  async streamSummary(
    @Body() body: { jobId: string; sessionId: string; model?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    this.summaryService.startSummaryJob(body.jobId, body.sessionId, body.model);

    await new Promise<void>((resolve) => {
      const unsub = this.summaryService.replaySummaryJob(
        body.jobId,
        (event) => res.write(`data: ${JSON.stringify(event)}\n\n`),
        resolve,
      );
      req.on('close', () => { unsub?.(); resolve(); });
    });

    res.end();
  }

  /**
   * GET /ai/summary/reconnect/:jobId
   * 연결이 끊긴 후 재접속 — 버퍼된 이벤트 재생 + 이후 이벤트 구독
   */
  @Get('summary/reconnect/:jobId')
  async reconnectSummary(
    @Param('jobId') jobId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const job = this.summaryService.getSummaryJob(jobId);
    if (!job) throw new NotFoundException('서머리 작업을 찾을 수 없습니다.');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await new Promise<void>((resolve) => {
      const unsub = this.summaryService.replaySummaryJob(
        jobId,
        (event) => res.write(`data: ${JSON.stringify(event)}\n\n`),
        resolve,
      );
      req.on('close', () => { unsub?.(); resolve(); });
    });

    res.end();
  }
}
