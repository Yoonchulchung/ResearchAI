import { Injectable } from '@nestjs/common';
import { ResearchService } from 'src/research/application/research.service';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SessionItemCommandService } from 'src/sessions/application/command/session-item-command.service';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { ResearchState } from 'src/sessions/domain/entity/session.entity';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { SearchSources } from 'src/research/domain/model/search-sources.model';

@Injectable()
export class DeepResearchExecutorService {
  constructor(
    private readonly researchService: ResearchService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionItemCommandService: SessionItemCommandService,
    private readonly sessionGateway: SessionGateway,
  ) {}

  async execute(
    sessionId: string,
    itemId: string,
    itemContent: string,
    cloudAIModel: string,
    webModel: SearchEngine,
    localAIModel?: string,
    signal?: AbortSignal,
    filterModel?: string,
  ): Promise<{ aiResult: string; webSources: SearchSources }> {
    await this.sessionCommandService.updateSessionState(
      sessionId,
      ResearchState.RUNNING,
    );
    await this.sessionItemCommandService.updateStatus(
      itemId,
      ResearchState.RUNNING,
    );
    this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});

    // 로컬 모델이 명시적으로 지정된 경우 우선 사용
    const aiModel = localAIModel || cloudAIModel;

    const {
      aiResult,
      webSources,
      confidence,
      inputTokens,
      outputTokens,
      estimatedFees,
      searchLog,
      usedWebModel,
    } = await this.researchService.research({
      type: 'deep',
      itemContent,
      cloudAIModel: aiModel,
      webModel,
      signal,
      filterModel,
    });

    const webResult =
      webSources.tavily ??
      webSources.serper ??
      webSources.naver ??
      webSources.brave ??
      webSources.duckduckgo ??
      '';
    await this.sessionCommandService.updateSessionItem(
      sessionId,
      itemId,
      aiResult,
      webResult,
      ResearchState.DONE,
      confidence,
      { inputTokens, outputTokens, estimatedFees },
      { usedWebModel, searchLog },
    );
    await this.sessionCommandService.updateSession(
      sessionId,
      ResearchState.DONE,
    );
    this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});

    return { aiResult, webSources };
  }
}
