import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { QueueJob, QueueJobStatus, QueueJobPhase } from '../domain/queue-job.model';
import { DeepResearchPipelineService } from '../../research/application/pipeline/deep-research-pipeline.service';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SessionItemService } from '../../sessions/application/session-item.service';
import { ResearchState } from '../../sessions/domain/entity/session.entity';
import { QueueStatusDto } from '../presentation/dto/response/queue-status.dto';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private jobs: QueueJob[] = [];
  private abortControllers = new Map<string, AbortController>();
  private running = false;

  constructor(
    private readonly deepPipeline: DeepResearchPipelineService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionItemService: SessionItemService,
  ) {}

  onModuleDestroy() {
    for (const ctrl of this.abortControllers.values()) {
      ctrl.abort();
    }
  }

  // ******** //
  // 상태 조회 //
  // ******** //
  getStatus(): QueueStatusDto {
    return {
      running: this.running,
      total: this.jobs.length,
      pending: this.jobs.filter((j) => j.status === QueueJobStatus.PENDING).length,
      running_jobs: this.jobs.filter((j) => j.status === QueueJobStatus.RUNNING).length,
      done: this.jobs.filter((j) => j.status === QueueJobStatus.DONE).length,
      error: this.jobs.filter((j) => j.status === QueueJobStatus.ERROR).length,
      stopped: this.jobs.filter((j) => j.status === QueueJobStatus.STOPPED).length,
      jobs: this.jobs.map(({ jobId, sessionId, itemId, taskType, status, phase }) => ({
        jobId,
        sessionId,
        itemId,
        taskType,
        status,
        phase,
      })),
    };
  }

  // *********** //
  // 큐 대기열 삽입 //
  // *********** //
  enqueueDeepResearch(params: {
    sessionId: string;
    itemId: string;
    itemPrompt: string;
    localAIModel: string;
    cloudAIModel: string;
  }): void {
    const job: QueueJob = {
      jobId: `${params.sessionId}-${params.itemId}-${Date.now()}`,
      sessionId: params.sessionId,
      itemId: params.itemId,
      itemPrompt: params.itemPrompt,
      taskType: QueueJob.TaskType.DEEPRESEARCH,
      localAIModel: params.localAIModel,
      CloudAIModel: params.cloudAIModel,
      status: QueueJobStatus.PENDING,
    };
    this.jobs.push(job);
    this.runNext();
  }

  enqueueSummary(sessionId: string, localAIModel: string): void {
    const job: QueueJob = {
      jobId: `${sessionId}-summary-${Date.now()}`,
      sessionId,
      itemId: "",
      itemPrompt: "",
      taskType: QueueJob.TaskType.SUMMARY,
      localAIModel,
      CloudAIModel: "",
      status: QueueJobStatus.PENDING,
    };
    this.jobs.push(job);
    this.runNext();
  }

  // ********* //
  // 아이템 중단 //
  // ********* //
  async cancelByItem(sessionId: string, itemId: string): Promise<void> {
    const job = this.jobs.find((j) => j.sessionId === sessionId && j.itemId === itemId);
    if (!job) return;

    if (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }

    await this.sessionItemService.updateStatus(itemId, ResearchState.STOPPED);
  }

  // ******** //
  // 세션 중단  //
  // ******** //
  async cancelBySession(sessionId: string): Promise<void> {
    const sessionJobs = this.jobs.filter((j) => j.sessionId === sessionId);

    for (const job of sessionJobs) {
      if (job.status === QueueJobStatus.PENDING) {
        this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
        await this.sessionItemService.updateStatus(job.itemId, ResearchState.STOPPED);
      }
      if (job.status === QueueJobStatus.RUNNING) {
        this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
        await this.sessionItemService.updateStatus(job.itemId, ResearchState.STOPPED);
        this.abortControllers.get(job.jobId)?.abort();
      }
    }
  }

  // ***** //
  // 큐 처리 //
  // ***** //
  private runNext() {
    if (this.running) return;
    const next = this.jobs.find((j) => j.status === QueueJobStatus.PENDING);
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
    this.updateJob(job.jobId, { status: QueueJobStatus.RUNNING, phase: QueueJobPhase.SEARCHING });

    try {
      if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
        await this.sessionCommandService.updateSessionState(job.sessionId, ResearchState.RUNNING);
        await this.sessionItemService.updateStatus(job.itemId, ResearchState.RUNNING);
        const { result, sources } = await this.deepPipeline.run(job.itemPrompt, job.CloudAIModel);
        await this.sessionCommandService.updateSession(job.sessionId, job.itemId, result, ResearchState.DONE);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result, sources });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '오류';
      this.updateJob(job.jobId, { status: QueueJobStatus.ERROR, phase: undefined, result: msg });
      this.sessionCommandService.updateSession(job.sessionId, job.itemId, msg, ResearchState.ERROR).catch(() => {});
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
