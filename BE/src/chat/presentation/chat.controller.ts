import { Controller, Post, Get, Delete, Param, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatService } from '../application/chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':sessionId')
  async chat(
    @Param('sessionId') sessionId: string,
    @Body() body: { message: string; model: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const cleanup = () => res.end();
    req.on('close', cleanup);

    try {
      for await (const chunk of this.chatService.chatStream(
        sessionId,
        body.message,
        body.model,
      )) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    } catch (e) {
      if (!res.writableEnded) {
        const msg = e instanceof Error ? e.message : '오류 발생';
        res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      }
    } finally {
      req.off('close', cleanup);
      res.end();
    }
  }

  @Get(':sessionId/history')
  getHistory(@Param('sessionId') sessionId: string) {
    return this.chatService.getHistory(sessionId);
  }

  @Delete(':sessionId/history')
  clearHistory(@Param('sessionId') sessionId: string) {
    this.chatService.clearHistory(sessionId);
    return { ok: true };
  }

  @Post(':sessionId/compact')
  triggerCompaction(@Param('sessionId') sessionId: string) {
    this.chatService.scheduleCompaction(sessionId);
    return { ok: true };
  }

  @Get(':sessionId/compaction')
  getCompactionStatus(@Param('sessionId') sessionId: string) {
    return this.chatService.getCompactionStatus(sessionId);
  }
}
