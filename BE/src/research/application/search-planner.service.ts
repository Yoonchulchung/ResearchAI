import { Injectable } from '@nestjs/common';
import {
  PlannerMode,
  SearchPlan,
} from 'src/research/domain/model/search-planner.model';
import { SearchPlannerImplService } from 'src/research/application/search-planner/search-planner-impl.service';

export type SearchModeInput =
  | import('src/research/domain/model/search-planner.model').SearchMode
  | PlannerMode;

@Injectable()
export class SearchPlannerService {
  constructor(private readonly impl: SearchPlannerImplService) {}

  plan(topic: string, localAIModel?: string): Promise<SearchPlan> {
    return this.impl.plan(topic, localAIModel);
  }
}
