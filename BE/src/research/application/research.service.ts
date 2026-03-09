import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { LightResearchPipelineService, LightResearchEvent } from './pipeline/light-research-pipeline.service';
import { SearchModeInput } from './search-planner.service';
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
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchModeInput },
  ) {
    return this.lightPipeline.testRun(topic, model, opts);
  }
}
