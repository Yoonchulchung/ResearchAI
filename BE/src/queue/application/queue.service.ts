import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { QueueJob } from '../domain/queue-job.model';
import { DeepResearchPipelineService } from '../../research/application/pipeline/deep-research-pipeline.service';
import { SessionsService } from '../../sessions/application/sessions.service';
import { ResearchState } from '../../sessions/domain/entity/session.entity';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private jobs: QueueJob[] = [];
  private abortControllers = new Map<string, AbortController>();
  private running = false;

  constructor(
    private readonly deepPipeline: DeepResearchPipelineService,
    private readonly sessionsService: SessionsService,
  ) {}

  onModuleDestroy() {
    for (const ctrl of this.abortControllers.values()) {
      ctrl.abort();
    }
  }

  // *********** //
  // 큐 대기열 삽입 //
  // *********** //
  enqueueDeepResearch(params: {
    sessionId: string;
    itemId: string;
    taskPrompt: string;
    model: string;
  }): void {
    const job: QueueJob = {
      jobId: `${params.sessionId}-${params.itemId}-${Date.now()}`,
      sessionId: params.sessionId,
      itemId: params.itemId,
      taskPrompt: params.taskPrompt,
      taskType: QueueJob.TaskType.DEEPRESEARCH,
      model: params.model,
      status: 'pending',
    };
    this.jobs.push(job);
    this.runNext();
  }

  // ***** //
  // 큐 처리 //
  // ***** //
  private runNext() {
    if (this.running) return;
    const next = this.jobs.find((j) => j.status === 'pending');
    if (!next) return;
    this.running = true;
    this.executeJob(next).finally(() => {
      this.running = false;
      this.runNext();
    });
  }

  private updateJob(jobId: string, updates: Partial<QueueJob>) {
    const idx = this.jobs.findIndex((j) => j.jobId === jobId);
    if (idx !== -1) {
      this.jobs[idx] = { ...this.jobs[idx], ...updates };
    }
  }

  private async executeJob(job: QueueJob) {
    const controller = new AbortController();
    this.abortControllers.set(job.jobId, controller);
    this.updateJob(job.jobId, { status: 'running', phase: 'searching' });

    try {
      if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
        await this.sessionsService.updateSessionState(job.sessionId, ResearchState.RUNNING);
        const { result, sources } = await this.deepPipeline.run(job.taskPrompt, job.model);
        await this.sessionsService.updateSession(job.sessionId, job.itemId, result, ResearchState.DONE);
        this.updateJob(job.jobId, { status: 'done', phase: undefined, result, sources });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '오류';
      this.updateJob(job.jobId, { status: 'error', phase: undefined, result: msg });
      this.sessionsService.updateSession(job.sessionId, job.itemId, msg, ResearchState.ERROR).catch(() => {});
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
