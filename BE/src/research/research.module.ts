import { Module } from '@nestjs/common';
import { ResearchController } from './presentation/research.controller';
import { WebSearchService } from './application/web-search.service';
import { ResearchService } from './application/research.service';
import { SearchPlannerService } from './application/search-planner.service';
import { LightResearchPipelineService } from './application/pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService } from './application/pipeline/deep-research-pipeline.service';
import { RecruitModule } from '../recruit/recruit.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [RecruitModule, AiModule],
  controllers: [ResearchController],
  providers: [
    WebSearchService,
    SearchPlannerService,
    LightResearchPipelineService,
    DeepResearchPipelineService,
    ResearchService,
  ],
  exports: [WebSearchService, ResearchService],
})
export class ResearchModule {}
