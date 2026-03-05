import { Module } from '@nestjs/common';
import { ResearchController } from './presentation/research.controller';
import { ModelsService } from './application/models.service';
import { WebSearchService } from './application/web-search.service';
import { AiSearchService } from './application/ai-search.service';
import { SearchPlannerService } from './application/search-planner.service';
import { LightResearchPipelineService } from './application/pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService } from './application/pipeline/deep-research-pipeline.service';
import { RecruitModule } from '../recruit/recruit.module';

@Module({
  imports: [RecruitModule],
  controllers: [ResearchController],
  providers: [
    ModelsService,
    WebSearchService,
    SearchPlannerService,
    LightResearchPipelineService,
    DeepResearchPipelineService,
    AiSearchService,
  ],
  exports: [WebSearchService, AiSearchService],
})
export class ResearchModule {}
