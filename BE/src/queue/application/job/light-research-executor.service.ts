import { Injectable } from '@nestjs/common';
import { LightResearchPipelineService, LightResearchEvent } from '../../../research/application/pipeline/light-research-pipeline.service';
import { SearchModeInput } from '../../../research/application/search-planner.service';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';

@Injectable()
export class LightResearchExecutorService {
  constructor(
    private readonly lightPipeline: LightResearchPipelineService,
  ) {}

  async execute(
    sessionId: string,
    itemPrompt: string,
    localAIModel: string,
    cloudAIModel: string,
    webModel: SearchEngine,
    searchMode: SearchModeInput,
    onEvent: (event: LightResearchEvent) => void,
  ): Promise<{ tasks: Awaited<ReturnType<LightResearchPipelineService['run']>>['tasks'] }> {
    const { tasks } = await this.lightPipeline.run(
      itemPrompt,
      localAIModel,
      cloudAIModel,
      webModel,
      searchMode,
      sessionId,
      onEvent,
    );
    return { tasks };
  }
}
