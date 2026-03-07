import { Injectable } from '@nestjs/common';
import { LightResearchPipelineService, LightResearchEvent } from './pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService, DeepResearchEvent } from './pipeline/deep-research-pipeline.service';
import { SearchSource } from './search-planner.service';
import { SearchJobService } from './search-job.service';

@Injectable()
export class ResearchService {
  constructor(
    private readonly lightPipeline: LightResearchPipelineService,
    private readonly deepPipeline: DeepResearchPipelineService,
    private readonly searchJobService: SearchJobService,
  ) {}

  /**
   * 파이프라인을 클라이언트 연결과 독립적으로 백그라운드에서 실행한다.
   * 이벤트는 SearchJobService에 버퍼링되므로 클라이언트가 재접속해도 재생 가능하다.
   */
  startLightResearch(
    searchId: string,
    topic: string,
    model: string,
    searchMode: SearchSource | 'auto' = 'auto',
  ): void {
    this.searchJobService.create(searchId);
    // fire-and-forget: 클라이언트 연결 상태와 무관하게 끝까지 실행
    (async () => {
      try {
        for await (const event of this.lightPipeline.runStream(topic, model, searchMode)) {
          this.searchJobService.push(searchId, event);
        }
      } finally {
        this.searchJobService.complete(searchId);
      }
    })();
  }

  getSearchJob(searchId: string) {
    return this.searchJobService.get(searchId);
  }

  replaySearchJob(
    searchId: string,
    onEvent: (event: LightResearchEvent) => void,
    onDone: () => void,
  ): (() => void) | null {
    return this.searchJobService.replay(searchId, onEvent, onDone);
  }

  // FE에서 첫 서치 이후 세부 서치 요청을 요청하면 이쪽으로 들어옴.
  // Tavily 등 외부 검색 → Claude 심층 분석
  async deepResearch(prompt: string, model: string, context = '') {
    const { result } = await this.deepPipeline.run(prompt, model, context || undefined);
    return { result };
  }

  deepResearchStream(
    prompt: string,
    model: string,
    context?: string,
  ): AsyncGenerator<DeepResearchEvent> {
    return this.deepPipeline.runStream(prompt, model, context || undefined);
  }

  async testGenerateTasks(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchSource | 'auto' },
  ) {
    return this.lightPipeline.testRun(topic, model, opts);
  }
}
