import { Injectable } from '@nestjs/common';
import { WebSearchService } from '../../research/application/web-search.service';
import { ResearchService } from '../../research/application/research.service';
import { SessionsService } from '../../sessions/application/sessions.service';
import { ResearchState } from '../../sessions/domain/entity/session.entity';
import { QueueJob } from '../domain/queue-job.model';

export type OnJobUpdate = (updates: Partial<QueueJob>) => void;

@Injectable()
export class JobRunnerService {
  constructor(
    private readonly searchService: WebSearchService,
    private readonly aiService: ResearchService,
    private readonly sessionsService: SessionsService,
  ) {}

  async runJob(job: QueueJob, onUpdate: OnJobUpdate, signal: AbortSignal): Promise<void> {
    let context = '';
    let localSources: Record<string, unknown> = {};

    // 1. 웹 검색 스트리밍
    try {
      for await (const event of this.searchService.runSearchStream(job.taskPrompt)) {
        if (signal.aborted) return;
        if (event.type === 'source') {
          localSources = { ...localSources, [event.key]: event.result };
          onUpdate({ sources: { ...localSources } });
        } else if (event.type === 'done') {
          context = event.context;
        }
      }
    } catch (e) {
      if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
    }

    if (signal.aborted) return;

    // 2. AI 분석
    onUpdate({ phase: 'analyzing' });

    try {
      const { result } = await this.aiService.deepResearch(
        job.taskPrompt,
        job.model,
        context || undefined,
      );
      if (signal.aborted) return;
      await this.sessionsService.updateSession(job.sessionId, job.taskId, result, ResearchState.DONE);
      onUpdate({ status: 'done', phase: undefined, result });
    } catch (e) {
      if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      const msg = e instanceof Error ? e.message : '오류';
      try { this.sessionsService.updateSession(job.sessionId, job.taskId, msg, ResearchState.ERROR); } catch {}
      onUpdate({ status: 'error', phase: undefined, result: msg });
    }
  }
}
