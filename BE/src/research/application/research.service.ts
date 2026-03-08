import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { LightResearchPipelineService, LightResearchEvent } from './pipeline/light-research-pipeline.service';
import { SearchSource } from './search-planner.service';
import { SearchJobService } from './search-job.service';
import { LightResearchRepository } from '../domain/repository/light-research.repository';
import { SessionItemCommandService } from '../../sessions/application/command/session-item-command.service';
import { QueueService } from '../../queue/application/queue.service';

@Injectable()
export class ResearchService {
  constructor(
    private readonly lightPipeline: LightResearchPipelineService,
    private readonly searchJobService: SearchJobService,
    private readonly lightResearchRepository: LightResearchRepository,
    private readonly sessionItemCommandService: SessionItemCommandService,
    @Inject(forwardRef(() => QueueService))
    private readonly queueService: QueueService,
  ) {}

  /**
   * 파이프라인을 클라이언트 연결과 독립적으로 백그라운드에서 실행한다.
   * 이벤트는 SearchJobService에 버퍼링되므로 클라이언트가 재접속해도 재생 가능하다.
   */
  startLightResearch(
    searchId: string,
    topic: string,
    localAIModel: string,
    cloudAIModel: string,
    webModel: string,
    searchMode: SearchSource | 'auto' = 'auto',
  ): void {
    this.searchJobService.create(searchId);

    this.lightResearchRepository.save({
      id: searchId,
      requestQuestion: topic,
      researchCloudAiModel: cloudAIModel,
      researchLocalAIModel: localAIModel,
      researchWebModel: webModel,
    }).catch(() => {});

    // fire-and-forget: 클라이언트 연결 상태와 무관하게 끝까지 실행
    (async () => {
      try {
        for await (const event of this.lightPipeline.runStream(topic, localAIModel, cloudAIModel, webModel, searchMode, searchId)) {
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

  async stopResearch(sessionId: string): Promise<{ status: string; sessionId: string }> {
    await this.queueService.cancelBySession(sessionId);
    await this.sessionItemCommandService.stopActiveItemsBySession(sessionId);
    return { status: 'stopped', sessionId };
  }

  async stopResearchItem(sessionId: string, itemId: string): Promise<{ status: string; sessionId: string; itemId: string }> {
    await this.queueService.cancelByItem(sessionId, itemId);
    return { status: 'stopped', sessionId, itemId };
  }

  async testGenerateTasks(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchSource | 'auto' },
  ) {
    return this.lightPipeline.testRun(topic, model, opts);
  }
}
