import { SearchSource } from '../../../application/search-planner.service';

export class LightResearchStreamDto {
  searchId: string;
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: 'tavily' | 'serper' | 'naver' | 'brave';
  searchMode?: SearchSource | 'auto';
}
