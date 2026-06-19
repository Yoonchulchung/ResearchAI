import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchController } from 'src/research/presentation/research.controller';
import { WebSearchService } from 'src/research/application/web-search.service';
import { ResearchService } from 'src/research/application/research.service';
import { SearchPlannerService } from 'src/research/application/search-planner.service';
import { LightResearchPipelineService } from 'src/research/application/pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService } from 'src/research/application/pipeline/deep-research-pipeline.service';
import { ResearchRecruitRepository } from 'src/research/domain/repository/research-recruit.repository';
import { LightResearchRepository } from 'src/research/domain/repository/light-research.repository';
import { SearchListRepository } from 'src/research/domain/repository/search-list.repository';
import { ResearchRecruitEntity } from 'src/research/domain/entity/researchrecruit.entity';
import { LightResearchEntity } from 'src/research/domain/entity/lightsearch.entity';
import { SearchListEntity } from 'src/research/domain/entity/searchlist.entity';
import { WebSearchProvider } from 'src/research/infrastructure/web-search.provider';
import { IntentClassifierService } from 'src/research/application/intent-classifier.service';
import { RecruitModule } from 'src/recruit/recruit.module';
import { AiModule } from 'src/ai/ai.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResearchRecruitEntity,
      LightResearchEntity,
      SearchListEntity,
    ]),
    forwardRef(() => RecruitModule),
    forwardRef(() => AiModule),
    forwardRef(() => SessionsModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [ResearchController],
  providers: [
    WebSearchProvider,
    WebSearchService,
    SearchPlannerService,
    LightResearchPipelineService,
    DeepResearchPipelineService,
    ResearchService,
    IntentClassifierService,
    ResearchRecruitRepository,
    LightResearchRepository,
    SearchListRepository,
  ],
  exports: [
    WebSearchService,
    ResearchService,
    LightResearchPipelineService,
    DeepResearchPipelineService,
    ResearchRecruitRepository,
    LightResearchRepository,
    SearchListRepository,
  ],
})
export class ResearchModule {}
