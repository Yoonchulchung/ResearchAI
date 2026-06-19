import { SearchModeInput } from 'src/research/application/search-planner.service';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { SearchPlan } from 'src/research/domain/model/search-planner.model';

export class TestStep0PlanDto {
  topic: string;
  localAIModel: string;
  searchMode?: SearchModeInput;
}

export class TestStep1aWebSearchDto {
  keyword: string;
  webModel?: SearchEngine;
}

export class TestStep1bRecruitSearchDto {
  keyword: string;
  companyTypes?: string[];
  jobTypes?: string[];
}

export class TestStep2GenerateTasksDto {
  topic: string;
  model: string;
  searchPlan: SearchPlan;
  webContext?: string;
  recruitCtx?: string;
}
