import { Controller, Post, Get, Delete, Param, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatService } from '../application/chat.service';
import { ChatMessageDto } from './dto/request/chat-message.dto';
import { ChatHistoryResponseDto } from './dto/response/chat-history.response.dto';
import { ClearHistoryResponseDto } from './dto/response/clear-history.response.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ******* //
  // 채팅 생성 //
  // ******* //
  @Post(':sessionId')
  async chat(
    @Param('sessionId') sessionId: string,
    @Body() body: ChatMessageDto,
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
  async getHistory(@Param('sessionId') sessionId: string): Promise<ChatHistoryResponseDto[]> {
    const messages = await this.chatService.getHistory(sessionId);
    return messages.map(ChatHistoryResponseDto.from);
  }

  @Delete(':sessionId/history')
  async clearHistory(@Param('sessionId') sessionId: string): Promise<ClearHistoryResponseDto> {
    await this.chatService.clearHistory(sessionId);
    return ClearHistoryResponseDto.success();
  }
}
