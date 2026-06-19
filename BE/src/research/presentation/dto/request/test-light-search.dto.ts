import { SearchModeInput } from 'src/research/application/search-planner.service';

export class TestLightSearchDto {
  topic: string;
  model: string;
  customPrompt?: string;
  customSystem?: string;
  searchMode?: SearchModeInput;
}
