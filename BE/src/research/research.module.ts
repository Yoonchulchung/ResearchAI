import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchController } from './presentation/research.controller';
import { WebSearchService } from './application/web-search.service';
import { ResearchService } from './application/research.service';
import { SearchPlannerService } from './application/search-planner.service';
import { LightResearchPipelineService } from './application/pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService } from './application/pipeline/deep-research-pipeline.service';
import { SearchJobService } from './application/search-job.service';
import { ResearchRecruitRepository } from './domain/repository/research-recruit.repository';
import { LightResearchRepository } from './domain/repository/light-research.repository';
import { SearchListRepository } from './domain/repository/search-list.repository';
import { ResearchRecruitEntity } from './domain/entity/researchrecruit.entity';
import { LightResearchEntity } from './domain/entity/lightsearch.entity';
import { SearchListEntity } from './domain/entity/searchlist.entity';
import { RecruitModule } from '../recruit/recruit.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResearchRecruitEntity, LightResearchEntity, SearchListEntity]), RecruitModule, AiModule],
  controllers: [ResearchController],
  providers: [
    WebSearchService,
    SearchPlannerService,
    LightResearchPipelineService,
    DeepResearchPipelineService,
    SearchJobService,
    ResearchService,
    ResearchRecruitRepository,
    LightResearchRepository,
    SearchListRepository,
  ],
  exports: [WebSearchService, ResearchService, ResearchRecruitRepository, LightResearchRepository, SearchListRepository],
})
export class ResearchModule {}
