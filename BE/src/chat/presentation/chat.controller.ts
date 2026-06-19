import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatService } from 'src/chat/application/chat.service';
import { ChatMessageDto } from 'src/chat/presentation/dto/request/chat-message.dto';
import { ChatHistoryResponseDto } from 'src/chat/presentation/dto/response/chat-history.response.dto';
import { ClearHistoryResponseDto } from 'src/chat/presentation/dto/response/clear-history.response.dto';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { CompanyAnalysisService } from 'src/company/application/analysis/company-analysis.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiProvider: AiProviderService,
    private readonly companyAnalysisService: CompanyAnalysisService,
  ) {}

  /** 세션 없이 동작하는 직접 스트리밍 채팅 (기업 분석 등 컨텍스트 기반 채팅용) */
  @Post('direct')
  async directChat(
    @Body()
    body: {
      message: string;
      model: string;
      systemPrompt?: string;
      companyAnalysisKey?: string;
      history?: { role: string; content: string }[];
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.message?.trim())
      throw new BadRequestException('message 가 필요합니다');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const cleanup = () => res.end();
    req.on('close', cleanup);

    const system =
      body.systemPrompt?.trim() ||
      '당신은 기업 분석 AI 어시스턴트입니다. 제공된 기업 데이터를 바탕으로 명확하고 간결하게 한국어로 답변하세요. 이모지는 사용하지 마세요.';
    let finalSystem = system;

    try {
      const companyContext = body.companyAnalysisKey?.trim()
        ? await this.companyAnalysisService.buildChatContext(
            body.companyAnalysisKey.trim(),
          )
        : '';
      finalSystem = companyContext
        ? `${system}

---
[기업 분석 산출물 및 작성 근거]
${companyContext}

---
[근거 답변 규칙]
- 점수, 비율, HRD/HRM 분류, 보고서 문장에 대한 "왜/근거" 질문은 위 산출물과 원자료 묶음에서 확인되는 항목만 근거로 설명하세요.
- HRD/HRM 평균이나 비율은 HR Wheel의 개별 항목 점수와 분류별 평균을 기준으로 설명하세요.
- 저장된 원자료에 없는 내용은 추측하지 말고 "저장된 자료에서는 확인되지 않는다"고 말하세요.
- 출처를 말할 때는 위 출처 목록이나 원자료에 있는 제목·URL만 사용하세요.`
        : system;

      const messages = [
        ...(body.history ?? []).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: body.message },
      ];

      for await (const chunk of this.aiProvider.stream(
        body.model || '',
        finalSystem,
        messages,
      )) {
        if (res.writableEnded) break;
        res.write(
          `data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`,
        );
      }
      if (!res.writableEnded)
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) {
      if (!res.writableEnded) {
        const msg = e instanceof Error ? e.message : '오류 발생';
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`,
        );
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
      console.log(e);
      if (!res.writableEnded) {
        const msg = e instanceof Error ? e.message : '오류 발생';
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`,
        );
      }
    } finally {
      req.off('close', cleanup);
      res.end();
    }
  }

  @Get(':sessionId/history')
  async getHistory(
    @Param('sessionId') sessionId: string,
  ): Promise<ChatHistoryResponseDto[]> {
    const messages = await this.chatService.getHistory(sessionId);
    return messages.map(ChatHistoryResponseDto.from);
  }

  @Delete(':sessionId/history')
  async clearHistory(
    @Param('sessionId') sessionId: string,
  ): Promise<ClearHistoryResponseDto> {
    await this.chatService.clearHistory(sessionId);
    return ClearHistoryResponseDto.success();
  }
}
