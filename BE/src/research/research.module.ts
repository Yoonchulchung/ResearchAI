import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchController } from 'src/research/presentation/research.controller';
import { WebSearchService } from 'src/research/application/web-search.service';
import { WebSearchImplService } from 'src/research/application/web-search/web-search-impl.service';
import { ResearchService } from 'src/research/application/research.service';
import { SearchPlannerService } from 'src/research/application/search-planner.service';
import { SearchPlannerImplService } from 'src/research/application/search-planner/search-planner-impl.service';
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
import { IntentClassifierImplService } from 'src/research/application/intent-classifier/intent-classifier-impl.service';
import { RecruitModule } from 'src/recruit/recruit.module';
import { AiModule } from 'src/ai/ai.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { QueueModule } from 'src/queue/queue.module';
import { BrowseModule } from 'src/browse/browse.module';
import { NewsModule } from 'src/news/news.module';

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
    BrowseModule,
    forwardRef(() => NewsModule),
  ],
  controllers: [ResearchController],
  providers: [
    WebSearchProvider,
    WebSearchService,
    WebSearchImplService,
    SearchPlannerService,
    SearchPlannerImplService,
    LightResearchPipelineService,
    DeepResearchPipelineService,
    ResearchService,
    IntentClassifierService,
    IntentClassifierImplService,
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
