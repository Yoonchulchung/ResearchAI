import { Injectable, OnModuleDestroy, MessageEvent, NotFoundException } from '@nestjs/common';
import { Subject, Observable, of, concat, from } from 'rxjs';
import { QueueJob, QueueJobStatus, QueueJobPhase, SseEventType } from '../domain/queue-job.model';
import { DeepResearchPipelineService } from '../../research/application/pipeline/deep-research-pipeline.service';
import { SessionQueryService } from '../../sessions/application/query/session-query.service';
import { SessionCommandService } from '../../sessions/application/command/session-command.service';
import { SessionItemService } from '../../sessions/application/session-item.service';
import { SessionItemQueryService } from '../../sessions/application/query/session-item-query.service';
import { SessionItemCommandService } from '../../sessions/application/command/session-item-command.service';
import { ResearchState, SummaryState } from '../../sessions/domain/entity/session.entity';
import { QueueStatusDto } from '../presentation/dto/response/queue-status.dto';
import { streamOllama } from '../../ai/infrastructure/ollama.ai';
import { EnqueueDeepResearchDto, DeepResearchAction } from '../presentation/dto/request/enqueue-deep-research.dto';
import { EnqueueLightResearchDto } from '../presentation/dto/request/enqueue-light-research.dto';
import { LightResearchPipelineService, LightResearchEvent } from '../../research/application/pipeline/light-research-pipeline.service';
import { PlannerMode, SearchModeInput, SearchEngine } from '../../research/application/search-planner.service';
import { LightResearchRepository } from '../../research/domain/repository/light-research.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private jobs: QueueJob[] = [];
  private abortControllers = new Map<string, AbortController>();
  private summarySubjects = new Map<string, Subject<MessageEvent>>();
  private summaryAccumulated = new Map<string, string>();
  private lightResearchSubjects = new Map<string, Subject<MessageEvent>>();
  private lightResearchAccumulated = new Map<string, LightResearchEvent[]>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  private static readonly DONE_JOB_TTL_MS = 5 * 60 * 1000; // 5분

  constructor(
    private readonly deepPipeline: DeepResearchPipelineService,
    private readonly lightPipeline: LightResearchPipelineService,
    private readonly lightResearchRepository: LightResearchRepository,
    private readonly sessionQueryService: SessionQueryService,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionItemService: SessionItemService,
    private readonly sessionItemQueryService: SessionItemQueryService,
    private readonly sessionItemCommandService: SessionItemCommandService,
  ) {}

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
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
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
      jobs: this.jobs.map(({ jobId, sessionId, itemId, taskType, status, phase, result, webSources }) => ({
        jobId,
        sessionId,
        itemId,
        taskType,
        status,
        phase,
        result,
        webSources,
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

    const job: QueueJob = {
      jobId: `light-${searchId}`,
      sessionId: searchId,
      itemId: '',
      itemPrompt: requestBody.topic,
      taskType: QueueJob.TaskType.LIGHTRESEARCH,
      localAIModel: requestBody.localAIModel,
      CloudAIModel: requestBody.cloudAIModel,
      webModel: requestBody.webModel,
      searchMode: requestBody.searchMode ?? PlannerMode.AUTO,
      status: QueueJobStatus.PENDING,
    };
    this.jobs.push(job);
    this.runNext();
    return { searchId, status: 'pending' };
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
      const job: QueueJob = {
        jobId: `${sessionId}-${item.itemId}-${Date.now()}`,
        sessionId,
        itemId: item.itemId,
        itemPrompt: item.prompt,
        taskType: QueueJob.TaskType.DEEPRESEARCH,
        localAIModel: requestBody.localAIModel,
        CloudAIModel: requestBody.cloudAIModel,
        webModel: session.researchWebModel as SearchEngine,
        status: QueueJobStatus.PENDING,
      };
      this.jobs.push(job);
      this.runNext();
    }

    await this.sessionCommandService.updateSessionState(sessionId, ResearchState.PENDING);

    return { status: 'running', sessionId };
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
    const job: QueueJob = {
      jobId: `${sessionId}-summary-${Date.now()}`,
      sessionId,
      itemId: '',
      itemPrompt: '',
      taskType: QueueJob.TaskType.SUMMARY,
      localAIModel,
      CloudAIModel: '',
      status: QueueJobStatus.PENDING,
    };
    this.jobs.push(job);
    this.runNext();
  }

  // ********* //
  // 큐 작업 중단 //
  // ********* //
  async stopResearch(sessionId: string): Promise<{ status: string; sessionId: string }> {
    await this.cancelBySession(sessionId);
    return { status: 'stopped', sessionId };
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

        const { aiResult, webSources } = await this.deepPipeline.run(
          job.itemPrompt,
          job.CloudAIModel,
          job.webModel ?? SearchEngine.TAVILY,
        );

        const webResult = webSources.tavily ?? webSources.serper ?? webSources.naver ?? webSources.brave ?? '';
        await this.sessionCommandService.updateSessionItem(job.sessionId, job.itemId, aiResult, webResult, ResearchState.DONE);
        await this.sessionCommandService.updateSession(job.sessionId, ResearchState.DONE);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: aiResult, webSources });
      
      } else if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {

        const subject = this.lightResearchSubjects.get(job.sessionId);
        const { tasks } = await this.lightPipeline.run(
          job.itemPrompt,
          job.localAIModel,
          job.CloudAIModel,
          job.webModel ?? SearchEngine.TAVILY,
          (job.searchMode ?? PlannerMode.AUTO) as SearchModeInput,
          job.sessionId,
          (event) => {
            const accumulated = this.lightResearchAccumulated.get(job.sessionId) ?? [];
            accumulated.push(event);
            this.lightResearchAccumulated.set(job.sessionId, accumulated);
            subject?.next({ data: event });
          },
        );

        subject?.complete();
        this.lightResearchSubjects.delete(job.sessionId);
        this.lightResearchAccumulated.delete(job.sessionId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(tasks) });

      } else if (job.taskType === QueueJob.TaskType.SUMMARY) {

        await this.sessionCommandService.updateSummaryState(job.sessionId, SummaryState.RUNNING);
        const subject = this.summarySubjects.get(job.sessionId);
        const ctx = await this.sessionQueryService.buildSummaryContext(job.sessionId);
        if (!ctx) throw new Error('완료된 태스크가 없습니다.');
        const model = job.localAIModel || ctx.model;
        let fullText = '';

        for await (const chunk of streamOllama(model, ctx.system, ctx.prompt)) {
          fullText += chunk;
          this.summaryAccumulated.set(job.sessionId, (this.summaryAccumulated.get(job.sessionId) ?? '') + chunk);
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        }

        if (fullText) await this.sessionCommandService.saveSummary(job.sessionId, fullText);
        subject?.next({ data: { type: SseEventType.DONE } });
        subject?.complete();
        this.summarySubjects.delete(job.sessionId);
        this.summaryAccumulated.delete(job.sessionId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: fullText });
        await this.sessionCommandService.updateSummaryState(job.sessionId, SummaryState.DONE);

      }
    } catch (e) {
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

      } else {
        console.log("Unsupported taskType is called");
      }
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
