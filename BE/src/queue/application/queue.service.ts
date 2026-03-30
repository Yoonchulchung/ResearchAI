import { Injectable, OnModuleDestroy, OnModuleInit, MessageEvent, NotFoundException } from '@nestjs/common';
import { Subject, Observable, of, concat, from } from 'rxjs';
import { QueueJob, QueueJobStatus, QueueJobPhase, SseEventType } from '../domain/queue-job.model';
import { SessionQueryService } from '../../sessions/application/query/session-query.service';
import { SessionCommandService } from '../../sessions/application/command/session-command.service';
import { SessionItemService } from '../../sessions/application/session-item.service';
import { SessionItemQueryService } from '../../sessions/application/query/session-item-query.service';
import { SessionItemCommandService } from '../../sessions/application/command/session-item-command.service';
import { SessionGateway } from '../../sessions/presentation/session.gateway';
import { ResearchState, SummaryState } from '../../sessions/domain/entity/session.entity';
import { QueueStatusDto } from '../presentation/dto/response/queue-status.dto';
import { EnqueueDeepResearchDto, DeepResearchAction } from '../presentation/dto/request/enqueue-deep-research.dto';
import { EnqueueLightResearchDto, AttachedFilePayload } from '../presentation/dto/request/enqueue-light-research.dto';
import { LightResearchEvent } from '../../research/application/pipeline/light-research-pipeline.service';
import { SearchModeInput } from '../../research/application/search-planner.service';
import { PlannerMode, SearchEngine } from 'src/research/domain/model/search-planner.model';
import { LightResearchRepository } from '../../research/domain/repository/light-research.repository';
import { DeepResearchExecutorService } from './job/deep-research-executor.service';
import { LightResearchExecutorService } from './job/light-research-executor.service';
import { SummaryExecutorService } from './job/summary-executor.service';
import { WriteAssistExecutorService, WriteAssistExtras } from './job/write-assist-executor.service';
import { CompanyProfileExecutorService } from './job/company-profile-executor.service';
import { QueueJobRepository } from '../domain/repository/queue-job.repository';
import { QueueJobDbStatus } from '../domain/entity/queue-job.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private jobs: QueueJob[] = [];
  private abortControllers = new Map<string, AbortController>();
  private summarySubjects = new Map<string, Subject<MessageEvent>>();
  private summaryAccumulated = new Map<string, string>();
  private lightResearchSubjects = new Map<string, Subject<MessageEvent>>();
  private lightResearchAccumulated = new Map<string, LightResearchEvent[]>();
  private writeAssistSubjects = new Map<string, Subject<MessageEvent>>();
  private writeAssistAccumulated = new Map<string, string>();
  private companyProfileSubjects = new Map<string, Subject<MessageEvent>>();
  private companyProfileAccumulated = new Map<string, string>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private runningCount = 0;

  private static readonly DONE_JOB_TTL_MS = 5 * 60 * 1000; // 5분
  private static readonly MAX_CONCURRENCY = 3;

  constructor(
    private readonly lightResearchRepository: LightResearchRepository,
    private readonly sessionQueryService: SessionQueryService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionItemService: SessionItemService,
    private readonly sessionItemQueryService: SessionItemQueryService,
    private readonly sessionItemCommandService: SessionItemCommandService,
    private readonly deepResearchExecutor: DeepResearchExecutorService,
    private readonly lightResearchExecutor: LightResearchExecutorService,
    private readonly summaryExecutor: SummaryExecutorService,
    private readonly writeAssistExecutor: WriteAssistExecutorService,
    private readonly companyProfileExecutor: CompanyProfileExecutorService,
    private readonly queueJobRepository: QueueJobRepository,
    private readonly sessionGateway: SessionGateway,
  ) {}

  // ************* //
  // 서버 재시작 복구 //
  // ************* //
  private static readonly STALE_JOB_THRESHOLD_MS = 60 * 60 * 1000; // 1시간

  async onModuleInit() {
    const activeJobs = await this.queueJobRepository.findByStatuses([
      QueueJobDbStatus.INIT,
      QueueJobDbStatus.RUNNING,
    ]);

    const now = Date.now();

    for (const entity of activeJobs) {
      const isStale = now - new Date(entity.createdAt).getTime() > QueueService.STALE_JOB_THRESHOLD_MS;

      if (isStale) {
        await this.queueJobRepository.updateStatus(entity.jobId, QueueJobDbStatus.STOPPED);
        if (entity.itemId) {
          await this.sessionItemCommandService.updateStatus(entity.itemId, ResearchState.STOPPED).catch(() => {});
        }
        continue;
      }

      if (entity.taskType === QueueJob.TaskType.DEEPRESEARCH) {
        // DB 상태를 INIT으로 되돌리고 메모리 큐에 재등록
        await this.queueJobRepository.updateStatus(entity.jobId, QueueJobDbStatus.INIT);
        if (entity.itemId) {
          await this.sessionItemCommandService.updateStatus(entity.itemId, ResearchState.PENDING);
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
        // Summary는 SSE가 끊겼으므로 Error 처리
        await this.queueJobRepository.updateStatus(entity.jobId, QueueJobDbStatus.ERROR);
        await this.sessionCommandService.updateSummaryState(entity.sessionId, SummaryState.ERROR).catch(() => {});
      } else if (entity.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
        // LightResearch는 SSE가 끊겼으므로 Stopped 처리
        await this.queueJobRepository.updateStatus(entity.jobId, QueueJobDbStatus.STOPPED);
      } else if (entity.taskType === QueueJob.TaskType.WRITEASSIST) {
        // WriteAssist는 SSE가 끊겼으므로 Stopped 처리
        await this.queueJobRepository.updateStatus(entity.jobId, QueueJobDbStatus.STOPPED);
      }
    }

    if (this.jobs.length > 0) {
      this.runNext();
    }
  }

  onModuleDestroy() {
    for (const ctrl of this.abortControllers.values()) {
      ctrl.abort();
    }
    for (const subject of this.summarySubjects.values()) {
      subject.complete();
    }
    for (const subject of this.lightResearchSubjects.values()) {
      subject.complete();
    }
    for (const subject of this.writeAssistSubjects.values()) {
      subject.complete();
    }
    for (const subject of this.companyProfileSubjects.values()) {
      subject.complete();
    }
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
  }

  // ******** //
  // 상태 조회 //
  // ******** //
  getStatus(): QueueStatusDto {
    return {
      running: this.runningCount > 0,
      total: this.jobs.length,
      pending: this.jobs.filter((j) => j.status === QueueJobStatus.PENDING).length,
      running_jobs: this.jobs.filter((j) => j.status === QueueJobStatus.RUNNING).length,
      done: this.jobs.filter((j) => j.status === QueueJobStatus.DONE).length,
      error: this.jobs.filter((j) => j.status === QueueJobStatus.ERROR).length,
      stopped: this.jobs.filter((j) => j.status === QueueJobStatus.STOPPED).length,
      jobs: this.jobs.map(({ jobId, sessionId, itemId, taskType, status, phase, result, webSources }) => ({
        jobId,
        sessionId,
        itemId,
        taskType,
        status,
        phase,
        result,
        webSources,
        referenceCount: result ? (result.match(/\[.+?\]\(https?:\/\/[^)]+\)/g) ?? []).length : undefined,
      })),
    };
  }

  // ************* //
  // SSE Observable //
  // ************* //
  getSummaryObservable(sessionId: string): Observable<MessageEvent> | null {
    return this.summarySubjects.get(sessionId) ?? null;
  }

  async getSummaryStream(sessionId: string): Promise<Observable<MessageEvent> | null> {
    const { summaryStatus, summary } = await this.sessionQueryService.getSummary(sessionId);

    if (summaryStatus === SummaryState.DONE && summary) {
      return of(
        { data: { type: SseEventType.CHUNK, text: summary } },
        { data: { type: SseEventType.DONE } },
      );
    }

    if (summaryStatus === SummaryState.PENDING || summaryStatus === SummaryState.RUNNING) {
      const subject = this.summarySubjects.get(sessionId);
      if (!subject) return null;

      const accumulated = this.summaryAccumulated.get(sessionId) ?? '';
      if (accumulated) {
        return concat(
          of({ data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent),
          subject.asObservable(),
        );
      }
      return subject.asObservable();
    }

    return null;
  }

  // *********** //
  // 큐 대기열 삽입 //
  // *********** //
  async enqueueLightResearch(
    requestBody: EnqueueLightResearchDto,
  ): Promise<{ searchId: string; status: string }> {
    const searchId = randomUUID();

    await this.lightResearchRepository.save({
      id: searchId,
      requestQuestion: requestBody.topic,
      researchCloudAiModel: requestBody.cloudAIModel,
      researchLocalAIModel: requestBody.localAIModel,
      researchWebModel: requestBody.webModel ?? '',
    });

    this.lightResearchSubjects.set(searchId, new Subject<MessageEvent>());
    this.lightResearchAccumulated.set(searchId, []);

    await this.pushJob({
      jobId: `light-${searchId}`,
      sessionId: searchId,
      itemId: '',
      itemContent: JSON.stringify({ topic: requestBody.topic, attachedFiles: requestBody.attachedFiles ?? [] }),
      taskType: QueueJob.TaskType.LIGHTRESEARCH,
      localAIModel: requestBody.localAIModel,
      CloudAIModel: requestBody.cloudAIModel,
      webModel: requestBody.webModel,
      searchMode: requestBody.searchMode ?? PlannerMode.AUTO,
      status: QueueJobStatus.PENDING,
    });
    return { searchId, status: QueueJobStatus.PENDING };
  }

  getLightResearchStream(searchId: string): Observable<MessageEvent> | null {
    const subject = this.lightResearchSubjects.get(searchId);
    if (!subject) return null;

    const accumulated = this.lightResearchAccumulated.get(searchId) ?? [];
    if (accumulated.length > 0) {
      return concat(
        from(accumulated.map((event) => ({ data: event } as MessageEvent))),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  async enqueueDeepResearch(
    sessionId: string,
    requestBody: EnqueueDeepResearchDto,
  ): Promise<{ status: string; sessionId: string }> {
    const session = await this.sessionQueryService.findOne(sessionId).catch(() => null);
    if (!session) throw new NotFoundException(`세션을 찾을 수 없습니다: ${sessionId}`);

    if (requestBody.status === DeepResearchAction.STOP) {
      return this.stopResearch(sessionId);
    }

    if (session.summaryState === SummaryState.DONE) {
      await this.sessionCommandService.updateSummaryState(sessionId, SummaryState.CHANGED);
    }

    for (const item of requestBody.items) {
      const sessionItem = await this.sessionItemQueryService.findById(item.itemId);
      if (
        sessionItem.researchState === ResearchState.PENDING ||
        sessionItem.researchState === ResearchState.RUNNING
      ) {
        continue;
      }
      await this.sessionItemCommandService.updateStatus(item.itemId, ResearchState.PENDING);
      this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});
      const isLocal = requestBody.aiModel?.startsWith('ollama:');
      const localAIModel = isLocal ? requestBody.aiModel! : '';
      const cloudAIModel = isLocal ? (session.researchCloudAIModel ?? '') : (requestBody.aiModel ?? session.researchCloudAIModel ?? '');

      await this.pushJob({
        jobId: `${sessionId}-${item.itemId}-${Date.now()}`,
        sessionId,
        itemId: item.itemId,
        itemContent: item.content,
        taskType: QueueJob.TaskType.DEEPRESEARCH,
        localAIModel,
        CloudAIModel: cloudAIModel,
        webModel: (requestBody.webModel ?? session.researchWebModel) as SearchEngine,
        filterModel: requestBody.filterModel,
        status: QueueJobStatus.PENDING,
      });
    }

    await this.sessionCommandService.updateSessionState(sessionId, ResearchState.PENDING);

    return { status: QueueJobStatus.RUNNING, sessionId };
  }

  async enqueueSummary(sessionId: string, localAIModel: string): Promise<void> {
    this.summarySubjects.set(sessionId, new Subject<MessageEvent>());
    this.summaryAccumulated.set(sessionId, '');

    // 서머리 초기화.
    const { summary } = await this.sessionQueryService.getSummary(sessionId);

    if (summary) {
      await this.sessionCommandService.saveSummary(sessionId, '');
    }

    await this.sessionCommandService.updateSummaryState(sessionId, SummaryState.PENDING);
    await this.pushJob({
      jobId: `${sessionId}-summary-${Date.now()}`,
      sessionId,
      itemId: '',
      itemContent: '',
      taskType: QueueJob.TaskType.SUMMARY,
      localAIModel,
      CloudAIModel: '',
      status: QueueJobStatus.PENDING,
    });
  }

  // 커스텀 자유 입력 (FE에서 instruction 직접 전달)
  async enqueueWriteAssist(
    content: string,
    instruction: string,
    model: string,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.writeAssistSubjects.set(jobId, new Subject<MessageEvent>());
    this.writeAssistAccumulated.set(jobId, '');
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ content, instruction } satisfies WriteAssistExtras & { content: string }),
      taskType: QueueJob.TaskType.WRITEASSIST,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  // 액션 기반 (evaluate, plagiarism 등) — instruction은 BE에서 관리
  async enqueueDocWriteAssist(
    action: string,
    content: string,
    model: string,
    experiences?: WriteAssistExtras['experiences'],
    companyCtx?: string,
  ): Promise<{ jobId: string }> {
    const ACTION_TO_TASK_TYPE: Record<string, QueueJob.TaskType> = {
      evaluate:  QueueJob.TaskType.WRITEASSIST_EVALUATE,
      plagiarism: QueueJob.TaskType.WRITEASSIST_PLAGIARISM,
      continue:  QueueJob.TaskType.WRITEASSIST_CONTINUE,
      section:   QueueJob.TaskType.WRITEASSIST_SECTION,
      improve:   QueueJob.TaskType.WRITEASSIST_IMPROVE,
      summarize: QueueJob.TaskType.WRITEASSIST_SUMMARIZE,
    };
    const taskType = ACTION_TO_TASK_TYPE[action];
    if (!taskType) throw new Error(`알 수 없는 액션: ${action}`);

    const jobId = randomUUID();
    this.writeAssistSubjects.set(jobId, new Subject<MessageEvent>());
    this.writeAssistAccumulated.set(jobId, '');
    const extras: WriteAssistExtras = { experiences, companyCtx };
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ content, ...extras }),
      taskType,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getWriteAssistStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.writeAssistSubjects.get(jobId);
    if (!subject) return null;
    const accumulated = this.writeAssistAccumulated.get(jobId) ?? '';
    if (accumulated) {
      return concat(
        of({ data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  cancelWriteAssist(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && QueueJob.isWriteAssist(j.taskType));
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.writeAssistSubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '작업이 중단되었습니다.' } });
    subject?.complete();
    this.writeAssistSubjects.delete(jobId);
    this.writeAssistAccumulated.delete(jobId);
  }

  // *************** //
  // Company Profile //
  // *************** //
  async enqueueCompanyProfile(companyName: string, model: string): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.companyProfileSubjects.set(jobId, new Subject<MessageEvent>());
    this.companyProfileAccumulated.set(jobId, '');
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ companyName }),
      taskType: QueueJob.TaskType.COMPANYPROFILE,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getCompanyProfileStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.companyProfileSubjects.get(jobId);
    if (!subject) return null;
    const accumulated = this.companyProfileAccumulated.get(jobId) ?? '';
    if (accumulated) {
      return concat(
        of({ data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  cancelCompanyProfile(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.COMPANYPROFILE);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.companyProfileSubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '작업이 중단되었습니다.' } });
    subject?.complete();
    this.companyProfileSubjects.delete(jobId);
    this.companyProfileAccumulated.delete(jobId);
  }

  // ********* //
  // 큐 작업 중단 //
  // ********* //
  async stopResearch(sessionId: string): Promise<{ status: string; sessionId: string }> {
    await this.cancelBySession(sessionId);
    await this.sessionItemCommandService.stopActiveItemsBySession(sessionId);
    return { status: QueueJobStatus.STOPPED, sessionId };
  }

  async cancelLightResearch(searchId: string): Promise<void> {
    const job = this.jobs.find(
      (j) => j.sessionId === searchId && j.taskType === QueueJob.TaskType.LIGHTRESEARCH,
    );
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }

    const subject = this.lightResearchSubjects.get(searchId);
    subject?.next({ data: { type: SseEventType.ERROR, message: 'Light Research가 중단되었습니다.' } });
    subject?.complete();
    this.lightResearchSubjects.delete(searchId);
    this.lightResearchAccumulated.delete(searchId);
  }

  async cancelSummary(sessionId: string): Promise<void> {
    const job = this.jobs.find(
      (j) => j.sessionId === sessionId && j.taskType === QueueJob.TaskType.SUMMARY,
    );
    if (!job) return;

    if (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }

    const subject = this.summarySubjects.get(sessionId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '서머리가 중단되었습니다.' } });
    subject?.complete();
    this.summarySubjects.delete(sessionId);
    this.summaryAccumulated.delete(sessionId);
    await this.sessionCommandService.updateSummaryState(sessionId, SummaryState.STOPPED);
  }

  async cancelByItem(sessionId: string, itemId: string): Promise<void> {
    const job = this.jobs.find((j) => j.sessionId === sessionId && j.itemId === itemId);
    if (!job) return;

    if (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }

    await this.sessionItemService.updateStatus(itemId, ResearchState.STOPPED);
    this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});
  }

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
    this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});
  }

  // ***** //
  // 큐 처리 //
  // ***** //
  private async pushJob(job: QueueJob) {
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
    while (this.runningCount < QueueService.MAX_CONCURRENCY) {
      const next = this.jobs.find((j) => j.status === QueueJobStatus.PENDING);
      if (!next) break;
      this.runningCount++;
      this.executeJob(next).finally(() => {
        this.runningCount--;
        this.runNext();
      });
    }
  }

  private updateJob(jobId: string, updates: Partial<QueueJob>) {
    const idx = this.jobs.findIndex((j) => j.jobId === jobId);
    if (idx !== -1) {
      this.jobs[idx] = { ...this.jobs[idx], ...updates };

      if (updates.status) {
        const dbStatus = this.toDbStatus(updates.status);
        this.queueJobRepository.updateStatus(jobId, dbStatus).catch(() => {});
      }

      const terminalStatuses = [QueueJobStatus.DONE, QueueJobStatus.ERROR, QueueJobStatus.STOPPED];
      if (updates.status && terminalStatuses.includes(updates.status)) {
        const existing = this.cleanupTimers.get(jobId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          this.jobs = this.jobs.filter((j) => j.jobId !== jobId);
          this.cleanupTimers.delete(jobId);
        }, QueueService.DONE_JOB_TTL_MS);
        this.cleanupTimers.set(jobId, timer);
      }

      this.sessionGateway.emitQueueUpdate(this.getStatus());
    }
  }

  private toDbStatus(status: QueueJobStatus): QueueJobDbStatus {
    switch (status) {
      case QueueJobStatus.RUNNING: return QueueJobDbStatus.RUNNING;
      case QueueJobStatus.DONE:    return QueueJobDbStatus.DONE;
      case QueueJobStatus.ERROR:   return QueueJobDbStatus.ERROR;
      case QueueJobStatus.STOPPED: return QueueJobDbStatus.STOPPED;
      default:                     return QueueJobDbStatus.INIT;
    }
  }

  private async executeJob(job: QueueJob) {
    const controller = new AbortController();
    this.abortControllers.set(job.jobId, controller);
    this.updateJob(job.jobId, { status: QueueJobStatus.RUNNING, phase: QueueJobPhase.SEARCHING });

    try {
      if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {

        const { aiResult, webSources } = await this.deepResearchExecutor.execute(
          job.sessionId,
          job.itemId,
          job.itemContent,
          job.CloudAIModel,
          job.webModel ?? SearchEngine.TAVILY,
          job.localAIModel || undefined,
          controller.signal,
          job.filterModel,
        );
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: aiResult, webSources });

      } else if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {

        const subject = this.lightResearchSubjects.get(job.sessionId);
        let lightTopic = job.itemContent;
        let lightAttachedFiles: AttachedFilePayload[] = [];
        try {
          const parsed = JSON.parse(job.itemContent) as { topic: string; attachedFiles?: AttachedFilePayload[] };
          lightTopic = parsed.topic;
          lightAttachedFiles = parsed.attachedFiles ?? [];
        } catch { /* 구형 포맷: itemContent가 plain 문자열 */ }
        const { tasks } = await this.lightResearchExecutor.execute(
          job.sessionId,
          lightTopic,
          job.localAIModel,
          job.CloudAIModel,
          job.webModel ?? SearchEngine.TAVILY,
          (job.searchMode ?? PlannerMode.AUTO) as SearchModeInput,
          (event: LightResearchEvent) => {
            const accumulated = this.lightResearchAccumulated.get(job.sessionId) ?? [];
            accumulated.push(event);
            this.lightResearchAccumulated.set(job.sessionId, accumulated);
            subject?.next({ data: event });
          },
          lightAttachedFiles,
        );

        subject?.complete();
        this.lightResearchSubjects.delete(job.sessionId);
        this.lightResearchAccumulated.delete(job.sessionId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(tasks) });

      } else if (job.taskType === QueueJob.TaskType.COMPANYPROFILE) {

        const subject = this.companyProfileSubjects.get(job.jobId);
        const { companyName } = JSON.parse(job.itemContent) as { companyName: string };
        const fullText = await this.companyProfileExecutor.execute(
          companyName,
          job.CloudAIModel,
          (chunk) => {
            this.companyProfileAccumulated.set(job.jobId, (this.companyProfileAccumulated.get(job.jobId) ?? '') + chunk);
            subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
          },
          controller.signal,
        );

        subject?.next({ data: { type: SseEventType.DONE } });
        subject?.complete();
        this.companyProfileSubjects.delete(job.jobId);
        this.companyProfileAccumulated.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: fullText });

      } else if (QueueJob.isWriteAssist(job.taskType)) {

        const subject = this.writeAssistSubjects.get(job.jobId);
        const { content, ...extras } = JSON.parse(job.itemContent) as { content: string } & WriteAssistExtras;
        const fullText = await this.writeAssistExecutor.execute(
          job.taskType,
          content,
          job.CloudAIModel,
          (chunk) => {
            this.writeAssistAccumulated.set(job.jobId, (this.writeAssistAccumulated.get(job.jobId) ?? '') + chunk);
            subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
          },
          controller.signal,
          extras,
        );

        subject?.next({ data: { type: SseEventType.DONE } });
        subject?.complete();
        this.writeAssistSubjects.delete(job.jobId);
        this.writeAssistAccumulated.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: fullText });

      } else if (job.taskType === QueueJob.TaskType.SUMMARY) {

        const subject = this.summarySubjects.get(job.sessionId);
        const fullText = await this.summaryExecutor.execute(
          job.sessionId,
          job.localAIModel,
          (chunk) => {
            this.summaryAccumulated.set(job.sessionId, (this.summaryAccumulated.get(job.sessionId) ?? '') + chunk);
            subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
          },
        );

        subject?.next({ data: { type: SseEventType.DONE } });
        subject?.complete();
        this.summarySubjects.delete(job.sessionId);
        this.summaryAccumulated.delete(job.sessionId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: fullText });

      }
    } catch (e) {
      // AbortError: cancelByItem/cancelBySession에서 이미 STOPPED 처리됨
      if (controller.signal.aborted) return;
      console.log(e);
      const msg = e instanceof Error ? e.message : '오류';
      this.updateJob(job.jobId, { status: QueueJobStatus.ERROR, phase: undefined, result: msg });
      if (job.taskType === QueueJob.TaskType.SUMMARY) {

        const subject = this.summarySubjects.get(job.sessionId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.summarySubjects.delete(job.sessionId);
        this.summaryAccumulated.delete(job.sessionId);
        this.sessionCommandService.updateSummaryState(job.sessionId, SummaryState.ERROR).catch(() => {});

      } else if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {

        const subject = this.lightResearchSubjects.get(job.sessionId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.lightResearchSubjects.delete(job.sessionId);
        this.lightResearchAccumulated.delete(job.sessionId);

      } else if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {

        this.sessionCommandService.updateSessionItem(job.sessionId, job.itemId, msg, '', ResearchState.ERROR).catch(() => {});
        this.sessionCommandService.updateSession(job.sessionId, ResearchState.ERROR).catch(() => {});
        this.sessionGateway.emitSessionUpdate(job.sessionId).catch(() => {});

      } else if (job.taskType === QueueJob.TaskType.WRITEASSIST) {

        const subject = this.writeAssistSubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.writeAssistSubjects.delete(job.jobId);
        this.writeAssistAccumulated.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.COMPANYPROFILE) {

        const subject = this.companyProfileSubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.companyProfileSubjects.delete(job.jobId);
        this.companyProfileAccumulated.delete(job.jobId);

      } else {
        console.log("Unsupported taskType is called");
      }
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
