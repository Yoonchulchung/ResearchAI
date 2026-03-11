import { SearchModeInput } from '../../../../research/application/search-planner.service';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';

export class EnqueueLightResearchDto {
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: SearchEngine;
  searchMode?: SearchModeInput;
}
