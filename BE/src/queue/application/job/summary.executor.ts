import { Injectable } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { SessionQueryService } from 'src/sessions/application/query/session-query.service';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SummaryState } from 'src/sessions/domain/entity/session.entity';
import {
  AppConfigService,
  CONFIG_KEYS,
} from 'src/config/application/app-config.service';

@Injectable()
export class SummaryExecutor {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly sessionQueryService: SessionQueryService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async execute(
    sessionId: string,
    model: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    await this.sessionCommandService.updateSummaryState(
      sessionId,
      SummaryState.RUNNING,
    );

    const ctx = await this.sessionQueryService.buildSummaryContext(sessionId);
    if (!ctx) throw new Error('완료된 태스크가 없습니다.');

    const defaultLocalModel = await this.appConfigService.get(
      CONFIG_KEYS.DEFAULT_LOCAL_MODEL,
    );
    const targetModel = model || defaultLocalModel || ctx.model;
    let fullText = '';

    for await (const chunk of this.aiProvider.stream(targetModel, ctx.system, [
      { role: 'user', content: ctx.prompt },
    ])) {
      fullText += chunk;
      onChunk(chunk);
    }

    if (fullText)
      await this.sessionCommandService.saveSummary(sessionId, fullText);
    await this.sessionCommandService.updateSummaryState(
      sessionId,
      SummaryState.DONE,
    );

    return fullText;
  }
}
