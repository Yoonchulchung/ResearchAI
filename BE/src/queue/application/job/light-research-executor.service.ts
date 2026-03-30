import { Injectable } from '@nestjs/common';
import { ResearchService } from '../../../research/application/research.service';
import { LightResearchEvent } from '../../../research/application/pipeline/light-research-pipeline.service';
import { SearchModeInput } from '../../../research/application/search-planner.service';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { AttachedFilePayload } from '../../presentation/dto/request/enqueue-light-research.dto';

@Injectable()
export class LightResearchExecutorService {
  constructor(private readonly researchService: ResearchService) {}

  async execute(
    searchId: string,
    topic: string,
    localAIModel: string,
    cloudAIModel: string,
    webModel: SearchEngine,
    searchMode: SearchModeInput,
    onEvent: (event: LightResearchEvent) => void,
    attachedFiles?: AttachedFilePayload[],
  ): Promise<{ tasks: any[] }> {
    return this.researchService.research({
      type: 'light',
      topic,
      localAIModel,
      cloudAIModel,
      webModel,
      searchMode,
      searchId,
      onEvent,
      attachedFiles,
    });
  }
}
