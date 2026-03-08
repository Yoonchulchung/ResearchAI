import { Injectable, Inject, NotFoundException, forwardRef } from '@nestjs/common';
import { LightResearchPipelineService, LightResearchEvent } from './pipeline/light-research-pipeline.service';
import { SearchSource } from './search-planner.service';
import { SearchJobService } from './search-job.service';
import { LightResearchRepository } from '../domain/repository/light-research.repository';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SessionQueryService } from 'src/sessions/application/query/session-query.service';
import { SessionItemQueryService } from '../../sessions/application/query/session-item-query.service';
import { SessionItemCommandService } from '../../sessions/application/command/session-item-command.service';
import { ResearchState } from '../../sessions/domain/entity/session.entity';
import { QueueService } from '../../queue/application/queue.service';
import { DeepResearchAction } from '../presentation/dto/request/deep-research-stream.dto';

@Injectable()
export class ResearchService {
  constructor(
    private readonly lightPipeline: LightResearchPipelineService,
    private readonly searchJobService: SearchJobService,
    private readonly lightResearchRepository: LightResearchRepository,
    private readonly sessionQueryService: SessionQueryService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionItemQueryService: SessionItemQueryService,
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

  async deepResearch(
    sessionId: string,
    items: { itemId: string; prompt: string }[],
    localAIModel: string,
    cloudAIModel: string,
    status?: string,
  ): Promise<{ status: string; sessionId: string }> {
    const session = await this.sessionQueryService.findOne(sessionId).catch(() => null);
    if (!session) throw new NotFoundException(`세션을 찾을 수 없습니다: ${sessionId}`);

    if (status === DeepResearchAction.STOP) {
      return this.stopResearch(sessionId);
    }
    for (const item of items) {
      const sessionItem = await this.sessionItemQueryService.findById(item.itemId);
      if (sessionItem.researchState === ResearchState.PENDING || sessionItem.researchState === ResearchState.RUNNING) {
        continue;
      }
      await this.sessionItemCommandService.updateStatus(item.itemId, ResearchState.PENDING);
      this.queueService.enqueueDeepResearch({
        sessionId,
        itemId: item.itemId,
        itemPrompt: item.prompt,
        localAIModel,
        cloudAIModel,
      });
    }

    await this.sessionCommandService.updateSessionState(sessionId, ResearchState.PENDING);

    return { status: 'running', sessionId };
  }

  async testGenerateTasks(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchSource | 'auto' },
  ) {
    return this.lightPipeline.testRun(topic, model, opts);
  }
}
