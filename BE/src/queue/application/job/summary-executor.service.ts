import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../../../ai/application/ai-provider.service';
import { SessionQueryService } from '../../../sessions/application/query/session-query.service';
import { SessionCommandService } from '../../../sessions/application/command/session-command.service';
import { SummaryState } from '../../../sessions/domain/entity/session.entity';

@Injectable()
export class SummaryExecutorService {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly sessionQueryService: SessionQueryService,
    private readonly sessionCommandService: SessionCommandService,
  ) {}

  async execute(
    sessionId: string,
    model: string, 
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    await this.sessionCommandService.updateSummaryState(sessionId, SummaryState.RUNNING);

    const ctx = await this.sessionQueryService.buildSummaryContext(sessionId);
    if (!ctx) throw new Error('완료된 태스크가 없습니다.');

    const targetModel = model || ctx.model;
    let fullText = '';

    for await (const chunk of this.aiProvider.stream(targetModel, ctx.system, [{ role: 'user', content: ctx.prompt }])) {
      fullText += chunk;
      onChunk(chunk);
    }

    if (fullText) await this.sessionCommandService.saveSummary(sessionId, fullText);
    await this.sessionCommandService.updateSummaryState(sessionId, SummaryState.DONE);

    return fullText;
  }
}
