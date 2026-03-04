import { Controller, Get, Post, Delete, Param, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueueService, EnqueueTaskDto } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get('jobs')
  getJobs() {
    return this.queueService.getJobs();
  }

  @Get('events')
  events(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    this.queueService.addClient(res);
    req.on('close', () => this.queueService.removeClient(res));
  }

  @Post('session')
  enqueueSession(
    @Body() body: { tasks: EnqueueTaskDto[]; doneTaskIds?: number[] },
  ) {
    this.queueService.enqueueSession(body.tasks, body.doneTaskIds ?? []);
    return { ok: true };
  }

  @Post('task')
  enqueueTask(@Body() body: EnqueueTaskDto) {
    this.queueService.enqueueTask(body);
    return { ok: true };
  }

  @Delete('sessions/:sessionId')
  cancelSession(@Param('sessionId') sessionId: string) {
    this.queueService.cancelSession(sessionId);
    return { ok: true };
  }

  @Delete('completed')
  dismissCompleted() {
    this.queueService.dismissCompleted();
    return { ok: true };
  }
}
