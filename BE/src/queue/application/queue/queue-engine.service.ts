import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { QueueJob, QueueJobStatus } from 'src/queue/domain/queue-job.model';
import { getQueueJobLabel } from 'src/queue/domain/queue-job-labels';
import { QueueStatusDto } from 'src/queue/presentation/dto/response/queue-status.dto';
import { QueueJobRepository } from 'src/queue/domain/repository/queue-job.repository';
import { QueueJobDbStatus } from 'src/queue/domain/entity/queue-job.entity';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { SessionItemCommandService } from 'src/sessions/application/command/session-item-command.service';
import { SessionItemService } from 'src/sessions/application/session-item.service';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SessionItemQueryService } from 'src/sessions/application/query/session-item-query.service';
import { SessionQueryService } from 'src/sessions/application/query/session-query.service';
import {
  ResearchState,
  SummaryState,
} from 'src/sessions/domain/entity/session.entity';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { AttachedFilePayload } from 'src/queue/presentation/dto/request/enqueue-light-research.dto';

/** 큐 엔진 추상 기반 클래스 — 잡 리스트·동시성·취소 관리
 *  구체 서브클래스는 executeJob + cleanupSubjects + handleJobError 를 구현한다.
 */
@Injectable()
export abstract class QueueEngineService
  implements OnModuleInit, OnModuleDestroy
{
  protected jobs: QueueJob[] = [];
  protected abortControllers = new Map<string, AbortController>();
  protected cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  protected runningCount = 0;

  protected static readonly DONE_JOB_TTL_MS = 5 * 60 * 1000;
  protected static readonly MAX_CONCURRENCY = 3;
  private static readonly STALE_JOB_THRESHOLD_MS = 60 * 60 * 1000;

  constructor(
    protected readonly queueJobRepository: QueueJobRepository,
    protected readonly sessionGateway: SessionGateway,
    protected readonly sessionQueryService: SessionQueryService,
    protected readonly sessionCommandService: SessionCommandService,
    protected readonly sessionItemService: SessionItemService,
    protected readonly sessionItemQueryService: SessionItemQueryService,
    protected readonly sessionItemCommandService: SessionItemCommandService,
  ) {}

  // ── 서브클래스가 반드시 구현 ──────────────────────────────────────────
  protected abstract executeJob(job: QueueJob): Promise<void>;
  protected abstract cleanupSubjects(): void;
  /** TTL 만료 시 잡별 누적 데이터 정리 — 서브클래스에서 선택적 오버라이드 */
  protected onJobExpiry(_jobId: string): void {}

  // ── 라이프사이클 ──────────────────────────────────────────────────────
  async onModuleInit() {
    const activeJobs = await this.queueJobRepository.findByStatuses([
      QueueJobDbStatus.INIT,
      QueueJobDbStatus.RUNNING,
    ]);
    const now = Date.now();

    for (const entity of activeJobs) {
      const isStale =
        now - new Date(entity.createdAt).getTime() >
        QueueEngineService.STALE_JOB_THRESHOLD_MS;

      if (isStale) {
        await this.queueJobRepository.updateStatus(
          entity.jobId,
          QueueJobDbStatus.STOPPED,
        );
        if (entity.itemId) {
          await this.sessionItemCommandService
            .updateStatus(entity.itemId, ResearchState.STOPPED)
            .catch(() => {});
        }
        continue;
      }

      if (entity.taskType === QueueJob.TaskType.DEEPRESEARCH) {
        await this.queueJobRepository.updateStatus(
          entity.jobId,
          QueueJobDbStatus.INIT,
        );
        if (entity.itemId) {
          await this.sessionItemCommandService.updateStatus(
            entity.itemId,
            ResearchState.PENDING,
          );
        }
        this.jobs.push({
          jobId: entity.jobId,
          sessionId: entity.sessionId,
          itemId: entity.itemId ?? '',
          itemContent: entity.itemContent ?? '',
          taskType: QueueJob.TaskType.DEEPRESEARCH,
          localAIModel: entity.localAIModel ?? '',
          CloudAIModel: entity.cloudAIModel ?? '',
          webModel: (entity.webModel ?? SearchEngine.TAVILY) as SearchEngine,
          status: QueueJobStatus.PENDING,
        });
      } else if (entity.taskType === QueueJob.TaskType.SUMMARY) {
        await this.queueJobRepository.updateStatus(
          entity.jobId,
          QueueJobDbStatus.ERROR,
        );
        await this.sessionCommandService
          .updateSummaryState(entity.sessionId, SummaryState.ERROR)
          .catch(() => {});
      } else if (entity.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
        await this.queueJobRepository.updateStatus(
          entity.jobId,
          QueueJobDbStatus.STOPPED,
        );
      } else if (QueueJob.isWriteAssist(entity.taskType as QueueJob.TaskType)) {
        await this.queueJobRepository.updateStatus(
          entity.jobId,
          QueueJobDbStatus.STOPPED,
        );
      } else if (
        entity.taskType === QueueJob.TaskType.COMPANYPROFILE ||
        entity.taskType === QueueJob.TaskType.COMPANYANALYSIS ||
        entity.taskType === QueueJob.TaskType.ROADMAP_ANALYSIS ||
        entity.taskType === QueueJob.TaskType.IMAGE_OCR
      ) {
        await this.queueJobRepository.updateStatus(
          entity.jobId,
          QueueJobDbStatus.STOPPED,
        );
      }
    }

    if (this.jobs.length > 0) this.runNext();
  }

  onModuleDestroy() {
    for (const ctrl of this.abortControllers.values()) ctrl.abort();
    this.cleanupSubjects();
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
  }

  // ── 상태 조회 ────────────────────────────────────────────────────────
  getStatus(): QueueStatusDto {
    return {
      running: this.runningCount > 0,
      total: this.jobs.length,
      pending: this.jobs.filter((j) => j.status === QueueJobStatus.PENDING)
        .length,
      running_jobs: this.jobs.filter((j) => j.status === QueueJobStatus.RUNNING)
        .length,
      done: this.jobs.filter((j) => j.status === QueueJobStatus.DONE).length,
      error: this.jobs.filter((j) => j.status === QueueJobStatus.ERROR).length,
      stopped: this.jobs.filter((j) => j.status === QueueJobStatus.STOPPED)
        .length,
      jobs: this.jobs.map(
        ({
          jobId,
          sessionId,
          itemId,
          itemContent,
          taskType,
          status,
          phase,
          result,
          errorMessage,
          webSources,
        }) => ({
          jobId,
          sessionId,
          itemId,
          taskType,
          status,
          phase,
          displayTitle: this.getJobDisplayTitle({
            jobId,
            sessionId,
            itemId,
            itemContent,
            taskType,
          }),
          displaySubtitle: this.getJobDisplaySubtitle({
            taskType,
            itemContent,
          }),
          companyName: this.getJobCompanyName({ taskType, itemContent }),
          result,
          errorMessage:
            errorMessage ??
            (status === QueueJobStatus.ERROR ? result : undefined),
          webSources,
          referenceCount: result
            ? (result.match(/\[.+?\]\(https?:\/\/[^)]+\)/g) ?? []).length
            : undefined,
        }),
      ),
    };
  }

  private getJobDisplayTitle(
    job: Pick<
      QueueJob,
      'jobId' | 'sessionId' | 'itemId' | 'itemContent' | 'taskType'
    >,
  ): string {
    if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      const parsed = this.parseJobContent<{
        topic?: string;
        attachedFiles?: AttachedFilePayload[];
      }>(job.itemContent);
      return this.truncateDisplayText(parsed?.topic) || '라이트 리서치';
    }
    if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
      return this.truncateDisplayText(job.itemContent) || '딥 리서치';
    }
    if (job.taskType === QueueJob.TaskType.SUMMARY) return '세션 요약 생성';
    if (
      job.taskType === QueueJob.TaskType.COMPANYPROFILE ||
      job.taskType === QueueJob.TaskType.COMPANYANALYSIS
    ) {
      const parsed = this.parseJobContent<{ companyName?: string }>(
        job.itemContent,
      );
      return parsed?.companyName
        ? `${parsed.companyName} ${job.taskType === QueueJob.TaskType.COMPANYPROFILE ? '기업 프로필' : '기업 분석'}`
        : this.getTaskTypeLabel(job.taskType);
    }
    if (QueueJob.isWriteAssist(job.taskType)) {
      const parsed = this.parseJobContent<{
        content?: string;
        instruction?: string;
      }>(job.itemContent);
      return (
        this.truncateDisplayText(parsed?.instruction || parsed?.content) ||
        this.getTaskTypeLabel(job.taskType)
      );
    }
    return job.itemId || job.sessionId || job.jobId;
  }

  private getJobCompanyName(
    job: Pick<QueueJob, 'taskType' | 'itemContent'>,
  ): string | undefined {
    if (
      job.taskType !== QueueJob.TaskType.COMPANYPROFILE &&
      job.taskType !== QueueJob.TaskType.COMPANYANALYSIS
    )
      return undefined;
    return this.parseJobContent<{ companyName?: string }>(job.itemContent)
      ?.companyName;
  }

  private getJobDisplaySubtitle(
    job: Pick<QueueJob, 'taskType' | 'itemContent'>,
  ): string {
    if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      const parsed = this.parseJobContent<{
        attachedFiles?: AttachedFilePayload[];
      }>(job.itemContent);
      const fileCount = parsed?.attachedFiles?.length ?? 0;
      return fileCount > 0
        ? `${this.getTaskTypeLabel(job.taskType)} · 첨부 ${fileCount}개`
        : this.getTaskTypeLabel(job.taskType);
    }
    return this.getTaskTypeLabel(job.taskType);
  }

  private getTaskTypeLabel(taskType: QueueJob.TaskType): string {
    return getQueueJobLabel(taskType);
  }

  protected parseJobContent<T>(content: string): T | null {
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  protected truncateDisplayText(value?: string | null): string {
    const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
    if (!normalized) return '';
    return normalized.length > 80
      ? `${normalized.slice(0, 80)}...`
      : normalized;
  }

  // ── 큐 처리 ──────────────────────────────────────────────────────────
  protected async pushJob(job: QueueJob) {
    await this.queueJobRepository.save({
      jobId: job.jobId,
      sessionId: job.sessionId,
      itemId: job.itemId,
      itemContent: job.itemContent,
      taskType: job.taskType,
      localAIModel: job.localAIModel,
      cloudAIModel: job.CloudAIModel,
      webModel: job.webModel,
      searchMode: job.searchMode,
      jobStatus: QueueJobDbStatus.INIT,
    });
    this.jobs.push(job);
    this.sessionGateway.emitQueueUpdate(this.getStatus());
    this.runNext();
  }

  private runNext() {
    while (this.runningCount < QueueEngineService.MAX_CONCURRENCY) {
      const next = this.jobs.find((j) => j.status === QueueJobStatus.PENDING);
      if (!next) break;
      this.runningCount++;
      this.executeJob(next).finally(() => {
        this.runningCount--;
        this.runNext();
      });
    }
  }

  protected updateJob(jobId: string, updates: Partial<QueueJob>) {
    const idx = this.jobs.findIndex((j) => j.jobId === jobId);
    if (idx === -1) return;
    this.jobs[idx] = { ...this.jobs[idx], ...updates };

    if (updates.status) {
      this.queueJobRepository
        .updateStatus(jobId, this.toDbStatus(updates.status))
        .catch(() => {});
    }

    const terminalStatuses = [
      QueueJobStatus.DONE,
      QueueJobStatus.ERROR,
      QueueJobStatus.STOPPED,
    ];
    if (updates.status && terminalStatuses.includes(updates.status)) {
      const existing = this.cleanupTimers.get(jobId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        this.jobs = this.jobs.filter((j) => j.jobId !== jobId);
        this.cleanupTimers.delete(jobId);
        this.onJobExpiry(jobId);
      }, QueueEngineService.DONE_JOB_TTL_MS);
      this.cleanupTimers.set(jobId, timer);
    }

    this.sessionGateway.emitQueueUpdate(this.getStatus());
  }

  protected toDbStatus(status: QueueJobStatus): QueueJobDbStatus {
    switch (status) {
      case QueueJobStatus.RUNNING:
        return QueueJobDbStatus.RUNNING;
      case QueueJobStatus.DONE:
        return QueueJobDbStatus.DONE;
      case QueueJobStatus.ERROR:
        return QueueJobDbStatus.ERROR;
      case QueueJobStatus.STOPPED:
        return QueueJobDbStatus.STOPPED;
      default:
        return QueueJobDbStatus.INIT;
    }
  }

  // ── 취소 연산 ────────────────────────────────────────────────────────
  async stopResearch(
    sessionId: string,
  ): Promise<{ status: string; sessionId: string }> {
    await this.cancelBySession(sessionId);
    await this.sessionItemCommandService.stopActiveItemsBySession(sessionId);
    return { status: QueueJobStatus.STOPPED, sessionId };
  }

  async cancelByItem(sessionId: string, itemId: string): Promise<void> {
    const job = this.jobs.find(
      (j) => j.sessionId === sessionId && j.itemId === itemId,
    );
    if (!job) return;
    if (
      job.status === QueueJobStatus.PENDING ||
      job.status === QueueJobStatus.RUNNING
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    await this.sessionItemService.updateStatus(itemId, ResearchState.STOPPED);
    this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});
  }

  async cancelBySession(sessionId: string): Promise<void> {
    const sessionJobs = this.jobs.filter((j) => j.sessionId === sessionId);
    for (const job of sessionJobs) {
      if (
        job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING
      ) {
        this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
        await this.sessionItemService.updateStatus(
          job.itemId,
          ResearchState.STOPPED,
        );
        if (job.status === QueueJobStatus.RUNNING) {
          this.abortControllers.get(job.jobId)?.abort();
        }
      }
    }
    this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});
  }
}
