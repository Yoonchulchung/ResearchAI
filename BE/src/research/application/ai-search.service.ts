import { Injectable } from '@nestjs/common';
import { LightResearchPipelineService, LightResearchEvent } from './pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService } from './pipeline/deep-research-pipeline.service';
import { SearchSource } from './search-planner.service';

@Injectable()
export class AiSearchService {
  constructor(
    private readonly lightPipeline: LightResearchPipelineService,
    private readonly deepPipeline: DeepResearchPipelineService,
  ) {}

  // Ollama 라우터 → 검색 소스 결정 → AI로 조사 항목(태스크) 목록 생성
  lightResearchStream(
    topic: string,
    model: string,
    searchMode: SearchSource | 'auto' = 'auto',
  ): AsyncGenerator<LightResearchEvent> {
    return this.lightPipeline.runStream(topic, model, searchMode);
  }
  
  // FE에서 첫 서치 이후 세부 서치 요청을 요청하면 이쪽으로 들어옴.
  // Tavily 등 외부 검색 → Claude 심층 분석
  async deepResearch(prompt: string, model: string, context = '') {
    const { result } = await this.deepPipeline.run(prompt, model, context || undefined);
    return { result };
  }

  async testGenerateTasks(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchSource | 'auto' },
  ) {
    return this.lightPipeline.testRun(topic, model, opts);
  }
}
