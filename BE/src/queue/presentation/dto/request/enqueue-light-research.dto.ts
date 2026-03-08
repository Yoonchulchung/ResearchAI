import { SearchSource } from '../../../../research/application/search-planner.service';

export class EnqueueLightResearchDto {
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: 'tavily' | 'serper' | 'naver' | 'brave';
  searchMode?: SearchSource | 'auto';
}
