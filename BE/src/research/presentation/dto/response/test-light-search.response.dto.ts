import { SearchPlan } from '../../../application/search-planner.service';

export class TestLightSearchResponseDto {
  tasks: any[];
  searchContext: string | undefined;
  fullPrompt: string;
  searchPlan: SearchPlan;

  static from(data: { tasks: any[]; searchContext: string | undefined; fullPrompt: string; searchPlan: SearchPlan }): TestLightSearchResponseDto {
    const dto = new TestLightSearchResponseDto();
    dto.tasks = data.tasks;
    dto.searchContext = data.searchContext;
    dto.fullPrompt = data.fullPrompt;
    dto.searchPlan = data.searchPlan;
    return dto;
  }
}
