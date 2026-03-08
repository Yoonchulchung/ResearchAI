import { Controller, Get, Post, Sse, Param, Body, BadRequestException, MessageEvent } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { QueueService } from '../application/queue.service';
import { QueueStatusDto } from './dto/response/queue-status.dto';
import { SessionQueryService } from '../../sessions/application/query/session-query.service';

class EnqueueSummaryDto {
  localAIModel: string;
}

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly sessionQueryService: SessionQueryService,
  ) {}

  @Get('status')
  getQueueStatus(): QueueStatusDto {
    return this.queueService.getStatus();
  }

  // ************* //
  // 세션의 서머리 생성 //
  // ************* //
  @Post('sessions/:id/summary')
  async enqueueSummary(
    @Param('id') id: string,
    @Body() body: EnqueueSummaryDto,
  ) {
    const ctx = await this.sessionQueryService.buildSummaryContext(id);
    if (!ctx) throw new BadRequestException('완료된 태스크가 없습니다.');

    await this.queueService.enqueueSummary(id, body.localAIModel || ctx.model);
    return { ok: true };
  }

  // ***************** //
  // 서머리 SSE 스트리밍   //
  // ***************** //
  @Sse('sessions/:id/summary/stream')
  async streamSummary(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    const existing = await this.sessionQueryService.getSummary(id);
    if (existing.summary) {
      return of(
        { data: { type: 'chunk', text: existing.summary } },
        { data: { type: 'done' } },
      );
    }

    const obs = this.queueService.getSummaryObservable(id);
    if (!obs) throw new BadRequestException('진행 중인 서머리 작업이 없습니다.');
    return obs;
  }

  // ToDo: DeepResarch 로직도 Queue Module에서 관리하도록 변경.
}
