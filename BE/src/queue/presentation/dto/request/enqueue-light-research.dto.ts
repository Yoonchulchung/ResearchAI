import { SearchModeInput, SearchEngine } from '../../../../research/application/search-planner.service';

export class EnqueueLightResearchDto {
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: SearchEngine;
  searchMode?: SearchModeInput;
}
