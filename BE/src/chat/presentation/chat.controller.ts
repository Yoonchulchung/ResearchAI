import { Controller, Post, Get, Delete, Param, Body, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatService } from '../application/chat.service';
import { ChatMessageDto } from './dto/request/chat-message.dto';
import { ChatHistoryResponseDto } from './dto/response/chat-history.response.dto';
import { ClearHistoryResponseDto } from './dto/response/clear-history.response.dto';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiProvider: AiProviderService,
  ) {}

  /** 세션 없이 동작하는 직접 스트리밍 채팅 (기업 분석 등 컨텍스트 기반 채팅용) */
  @Post('direct')
  async directChat(
    @Body() body: {
      message: string;
      model: string;
      systemPrompt?: string;
      history?: { role: string; content: string }[];
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.message?.trim()) throw new BadRequestException('message 가 필요합니다');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const cleanup = () => res.end();
    req.on('close', cleanup);

    const system = body.systemPrompt?.trim() ||
      '당신은 기업 분석 AI 어시스턴트입니다. 제공된 기업 데이터를 바탕으로 명확하고 간결하게 한국어로 답변하세요. 이모지는 사용하지 마세요.';

    const messages = [
      ...(body.history ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: body.message },
    ];

    try {
      for await (const chunk of this.aiProvider.stream(body.model || '', system, messages)) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      }
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
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
      for await (const event of this.chatService.chatStream(
        sessionId,
        body.message,
        body.model,
        body.attachedTexts,
      )) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
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
