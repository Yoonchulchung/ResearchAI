import { Module } from '@nestjs/common';
import { ResearchController } from './presentation/research.controller';
import { ModelsService } from './application/models.service';
import { WebSearchService } from './application/web-search.service';
import { AiSearchService } from './application/ai-search.service';
import { LightResearchPipelineService } from './application/pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService } from './application/pipeline/deep-research-pipeline.service';

@Module({
  controllers: [ResearchController],
  providers: [ModelsService, WebSearchService, LightResearchPipelineService, DeepResearchPipelineService, AiSearchService],
})
export class ResearchModule {}
