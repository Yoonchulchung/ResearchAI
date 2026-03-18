import { Injectable } from '@nestjs/common';
import { ResearchService } from '../../../research/application/research.service';
import { SessionCommandService } from '../../../sessions/application/command/session-command.service';
import { SessionItemCommandService } from '../../../sessions/application/command/session-item-command.service';
import { ResearchState } from '../../../sessions/domain/entity/session.entity';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { SearchSources } from '../../../research/domain/model/search-sources.model';

@Injectable()
export class DeepResearchExecutorService {
  constructor(
    private readonly researchService: ResearchService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionItemCommandService: SessionItemCommandService,
  ) {}

  async execute(
    sessionId: string,
    itemId: string,
    itemPrompt: string,
    cloudAIModel: string,
    webModel: SearchEngine,
    localAIModel?: string,
    signal?: AbortSignal,
    filterModel?: string,
  ): Promise<{ aiResult: string; webSources: SearchSources }> {
    await this.sessionCommandService.updateSessionState(sessionId, ResearchState.RUNNING);
    await this.sessionItemCommandService.updateStatus(itemId, ResearchState.RUNNING);

    // 로컬 모델이 명시적으로 지정된 경우 우선 사용
    const aiModel = localAIModel || cloudAIModel;

    const { aiResult, webSources, confidence, inputTokens, outputTokens, estimatedFees, searchLog, usedWebModel } =
      await this.researchService.research({ type: 'deep', itemPrompt, cloudAIModel: aiModel, webModel, signal, filterModel });

    const webResult = webSources.tavily ?? webSources.serper ?? webSources.naver ?? webSources.brave ?? webSources.duckduckgo ?? '';
    await this.sessionCommandService.updateSessionItem(
      sessionId, itemId, aiResult, webResult,
      ResearchState.DONE, confidence,
      { inputTokens, outputTokens, estimatedFees },
      { usedWebModel, searchLog },
    );
    await this.sessionCommandService.updateSession(sessionId, ResearchState.DONE);

    return { aiResult, webSources };
  }
}
