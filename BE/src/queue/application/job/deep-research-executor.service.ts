import { Injectable } from '@nestjs/common';
import { DeepResearchPipelineService } from '../../../research/application/pipeline/deep-research-pipeline.service';
import { SessionCommandService } from '../../../sessions/application/command/session-command.service';
import { SessionItemCommandService } from '../../../sessions/application/command/session-item-command.service';
import { ResearchState } from '../../../sessions/domain/entity/session.entity';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { SearchSources } from '../../../research/domain/model/search-sources.model';

@Injectable()
export class DeepResearchExecutorService {
  constructor(
    private readonly deepPipeline: DeepResearchPipelineService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionItemCommandService: SessionItemCommandService,
  ) {}

  async execute(
    sessionId: string,
    itemId: string,
    itemPrompt: string,
    cloudAIModel: string,
    webModel: SearchEngine,
  ): Promise<{ aiResult: string; webSources: SearchSources }> {
    await this.sessionCommandService.updateSessionState(sessionId, ResearchState.RUNNING);
    await this.sessionItemCommandService.updateStatus(itemId, ResearchState.RUNNING);

    const { aiResult, webSources } = await this.deepPipeline.run(itemPrompt, cloudAIModel, webModel);

    const webResult = webSources.tavily ?? webSources.serper ?? webSources.naver ?? webSources.brave ?? '';
    await this.sessionCommandService.updateSessionItem(sessionId, itemId, aiResult, webResult, ResearchState.DONE);
    await this.sessionCommandService.updateSession(sessionId, ResearchState.DONE);

    return { aiResult, webSources };
  }
}
