import { Injectable, NotFoundException } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import {
  QueueJob,
  QueueJobStatus,
  QueueJobPhase,
  SseEventType,
} from 'src/queue/domain/queue-job.model';
import { QueueJobRepository } from 'src/queue/domain/repository/queue-job.repository';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { SessionQueryService } from 'src/sessions/application/query/session-query.service';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SessionItemService } from 'src/sessions/application/session-item.service';
import { SessionItemQueryService } from 'src/sessions/application/query/session-item-query.service';
import { SessionItemCommandService } from 'src/sessions/application/command/session-item-command.service';
import {
  ResearchState,
  SummaryState,
} from 'src/sessions/domain/entity/session.entity';
import { ResearchState as SessionItemResearchState } from 'src/sessions/domain/entity/session-item.entity';
import {
  EnqueueDeepResearchDto,
  DeepResearchAction,
} from 'src/queue/presentation/dto/request/enqueue-deep-research.dto';
import { EnqueueLightResearchDto } from 'src/queue/presentation/dto/request/enqueue-light-research.dto';
import {
  PlannerMode,
  SearchEngine,
} from 'src/research/domain/model/search-planner.model';
import { LightResearchRepository } from 'src/research/domain/repository/light-research.repository';
import { WriteAssistExtras } from 'src/queue/application/job/write-assist/write-assist.executor';
import { TechBlogTrendRequest } from 'src/queue/application/job/tech-blog-trend.executor';
import { PaperSummaryRequest } from 'src/queue/application/job/paper-summary.executor';
import { PaperTrendRequest } from 'src/queue/application/job/paper-trend.executor';
import { NewsArticleSummaryRequest } from 'src/queue/application/job/news-article-summary.executor';
import { ResumeCoverLetterCategoryRequest } from 'src/queue/application/job/resume-cover-letter-category.executor';
import { ResumeCoverLetterRefinedTitleRequest } from 'src/queue/application/job/resume-cover-letter-refined-title.executor';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { randomUUID } from 'crypto';
import { QueueEngineService } from './queue-engine.service';
import { QueueDispatcher } from './queue.dispatcher';
import { ImageHandler } from './handlers/image.handler';

@Injectable()
export class QueueWorkflowService extends QueueEngineService {
  constructor(
    // 엔진 의존성 (super 전달)
    queueJobRepository: QueueJobRepository,
    sessionGateway: SessionGateway,
    sessionQueryService: SessionQueryService,
    sessionCommandService: SessionCommandService,
    sessionItemService: SessionItemService,
    sessionItemQueryService: SessionItemQueryService,
    sessionItemCommandService: SessionItemCommandService,
    // QueueWorkflowService 전용
    private readonly dispatcher: QueueDispatcher,
    private readonly imageHandler: ImageHandler,
    private readonly lightResearchRepository: LightResearchRepository,
    private readonly aiProvider: AiProviderService,
  ) {
    super(
      queueJobRepository,
      sessionGateway,
      sessionQueryService,
      sessionCommandService,
      sessionItemService,
      sessionItemQueryService,
      sessionItemCommandService,
    );
  }

  // ── 엔진 추상 메서드 구현 ──────────────────────────────────────────────
  protected cleanupSubjects(): void {
    this.dispatcher.cleanupAll();
  }
  protected override onJobExpiry(jobId: string): void {
    this.dispatcher.onExpiry(jobId);
  }

  protected async executeJob(job: QueueJob): Promise<void> {
    const controller = new AbortController();
    this.abortControllers.set(job.jobId, controller);
    this.updateJob(job.jobId, {
      status: QueueJobStatus.RUNNING,
      phase: QueueJobPhase.SEARCHING,
    });
    try {
      const { result, webSources } = await this.dispatcher.execute(
        job,
        controller.signal,
      );
      this.updateJob(job.jobId, {
        status: QueueJobStatus.DONE,
        phase: undefined,
        result,
        webSources,
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      const msg = e instanceof Error ? e.message : '오류';
      this.updateJob(job.jobId, {
        status: QueueJobStatus.ERROR,
        phase: undefined,
        result: msg,
        errorMessage: msg,
      });
      this.dispatcher.dispatchError(job, msg);
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  getSummaryObservable(sessionId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(sessionId, QueueJob.TaskType.SUMMARY);
  }

  async getSummaryStream(
    sessionId: string,
  ): Promise<Observable<MessageEvent> | null> {
    const { summaryStatus, summary } =
      await this.sessionQueryService.getSummary(sessionId);
    if (summaryStatus === SummaryState.DONE && summary) {
      return of(
        { data: { type: SseEventType.CHUNK, text: summary } },
        { data: { type: SseEventType.DONE } },
      );
    }
    if (
      summaryStatus === SummaryState.PENDING ||
      summaryStatus === SummaryState.RUNNING
    ) {
      return this.dispatcher.getStream(sessionId, QueueJob.TaskType.SUMMARY);
    }
    return null;
  }

  async enqueueSummary(sessionId: string, localAIModel: string): Promise<void> {
    this.dispatcher.setupChannel(sessionId, QueueJob.TaskType.SUMMARY);
    const { summary } = await this.sessionQueryService.getSummary(sessionId);
    if (summary) await this.sessionCommandService.saveSummary(sessionId, '');
    await this.sessionCommandService.updateSummaryState(
      sessionId,
      SummaryState.PENDING,
    );
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

  async cancelSummary(sessionId: string): Promise<void> {
    const job = this.jobs.find(
      (j) =>
        j.sessionId === sessionId && j.taskType === QueueJob.TaskType.SUMMARY,
    );
    if (!job) return;
    if (
      job.status === QueueJobStatus.PENDING ||
      job.status === QueueJobStatus.RUNNING
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(sessionId, QueueJob.TaskType.SUMMARY);
    await this.sessionCommandService.updateSummaryState(
      sessionId,
      SummaryState.STOPPED,
    );
  }

  // ── Light Research ───────────────────────────────────────────────────
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
    this.dispatcher.setupChannel(searchId, QueueJob.TaskType.LIGHTRESEARCH);
    await this.pushJob({
      jobId: `light-${searchId}`,
      sessionId: searchId,
      itemId: '',
      itemContent: JSON.stringify({
        topic: requestBody.topic,
        attachedFiles: requestBody.attachedFiles ?? [],
      }),
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
    return this.dispatcher.getStream(searchId, QueueJob.TaskType.LIGHTRESEARCH);
  }

  cancelLightResearch(searchId: string): Promise<void> {
    const job = this.jobs.find(
      (j) =>
        j.sessionId === searchId &&
        j.taskType === QueueJob.TaskType.LIGHTRESEARCH,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(searchId, QueueJob.TaskType.LIGHTRESEARCH);
    return Promise.resolve();
  }

  // ── Deep Research ────────────────────────────────────────────────────
  async enqueueDeepResearch(
    sessionId: string,
    requestBody: EnqueueDeepResearchDto,
  ): Promise<{ status: string; sessionId: string }> {
    const session = await this.sessionQueryService
      .findOne(sessionId)
      .catch(() => null);
    if (!session)
      throw new NotFoundException(`세션을 찾을 수 없습니다: ${sessionId}`);

    if (requestBody.status === DeepResearchAction.STOP)
      return this.stopResearch(sessionId);

    if (session.summaryState === SummaryState.DONE) {
      await this.sessionCommandService.updateSummaryState(
        sessionId,
        SummaryState.CHANGED,
      );
    }

    for (const item of requestBody.items) {
      const sessionItem = await this.sessionItemQueryService.findById(
        item.itemId,
      );
      if (
        sessionItem.researchState === SessionItemResearchState.PENDING ||
        sessionItem.researchState === SessionItemResearchState.RUNNING
      )
        continue;

      await this.sessionItemCommandService.updateStatus(
        item.itemId,
        ResearchState.PENDING,
      );
      this.sessionGateway.emitSessionUpdate(sessionId).catch(() => {});

      const isLocal = requestBody.aiModel?.startsWith('ollama:');
      const localAIModel = isLocal ? requestBody.aiModel! : '';
      const cloudAIModel = isLocal
        ? (session.researchCloudAIModel ?? '')
        : (requestBody.aiModel ?? session.researchCloudAIModel ?? '');

      await this.pushJob({
        jobId: `${sessionId}-${item.itemId}-${Date.now()}`,
        sessionId,
        itemId: item.itemId,
        itemContent: item.content,
        taskType: QueueJob.TaskType.DEEPRESEARCH,
        localAIModel,
        CloudAIModel: cloudAIModel,
        webModel: (requestBody.webModel ??
          session.researchWebModel) as SearchEngine,
        filterModel: requestBody.filterModel,
        status: QueueJobStatus.PENDING,
      });
    }

    await this.sessionCommandService.updateSessionState(
      sessionId,
      ResearchState.PENDING,
    );
    return { status: QueueJobStatus.RUNNING, sessionId };
  }

  // ── Write Assist ─────────────────────────────────────────────────────
  async enqueueWriteAssist(
    content: string,
    instruction: string,
    model: string,
    history?: { role: 'user' | 'assistant'; content: string }[],
    imageFiles?: string[],
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.WRITEASSIST);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({
        content,
        instruction,
        history: history?.slice(-20),
        imageFiles,
      } satisfies WriteAssistExtras & { content: string }),
      taskType: QueueJob.TaskType.WRITEASSIST,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  async enqueueDocWriteAssist(
    action: string,
    content: string,
    model: string,
    experiences?: WriteAssistExtras['experiences'],
    companyCtx?: string,
  ): Promise<{ jobId: string }> {
    const ACTION_TO_TASK_TYPE: Record<string, QueueJob.TaskType> = {
      evaluate: QueueJob.TaskType.WRITEASSIST_EVALUATE,
      plagiarism: QueueJob.TaskType.WRITEASSIST_PLAGIARISM,
      continue: QueueJob.TaskType.WRITEASSIST_CONTINUE,
      section: QueueJob.TaskType.WRITEASSIST_SECTION,
      improve: QueueJob.TaskType.WRITEASSIST_IMPROVE,
      spellcheck: QueueJob.TaskType.WRITEASSIST_SPELLCHECK,
      summarize: QueueJob.TaskType.WRITEASSIST_SUMMARIZE,
      example: QueueJob.TaskType.WRITEASSIST_EXAMPLE,
      jd_evaluate: QueueJob.TaskType.WRITEASSIST_JD_EVALUATE,
    };
    const taskType = ACTION_TO_TASK_TYPE[action];
    if (!taskType) throw new Error(`알 수 없는 액션: ${action}`);

    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, taskType);
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
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.WRITEASSIST);
  }

  cancelWriteAssist(jobId: string): void {
    const job = this.jobs.find(
      (j) => j.jobId === jobId && QueueJob.isWriteAssist(j.taskType),
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    if (job) this.dispatcher.cancelChannel(jobId, job.taskType);
  }

  // ── Company Profile ──────────────────────────────────────────────────
  async enqueueCompanyProfile(
    companyName: string,
    model: string,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.COMPANYPROFILE);
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
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.COMPANYPROFILE);
  }

  cancelCompanyProfile(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId && j.taskType === QueueJob.TaskType.COMPANYPROFILE,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.COMPANYPROFILE);
  }

  // ── Company Analysis ─────────────────────────────────────────────────
  async enqueueCompanyAnalysis(
    companyName: string,
    model: string,
  ): Promise<{ jobId: string }> {
    const effectiveModel = this.aiProvider.resolveEffectiveModel(model);
    const key = this.normalizeCompanyName(companyName);
    const existing = this.jobs.find((job) => {
      if (job.taskType !== QueueJob.TaskType.COMPANYANALYSIS) return false;
      if (
        job.status !== QueueJobStatus.PENDING &&
        job.status !== QueueJobStatus.RUNNING
      )
        return false;
      try {
        const parsed = JSON.parse(job.itemContent) as { companyName?: string };
        return this.normalizeCompanyName(parsed.companyName ?? '') === key;
      } catch {
        return false;
      }
    });
    if (existing) return { jobId: existing.jobId };

    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.COMPANYANALYSIS);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ companyName }),
      taskType: QueueJob.TaskType.COMPANYANALYSIS,
      localAIModel: '',
      CloudAIModel: effectiveModel,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  private normalizeCompanyName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }

  getCompanyAnalysisStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.COMPANYANALYSIS);
  }

  cancelCompanyAnalysis(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId && j.taskType === QueueJob.TaskType.COMPANYANALYSIS,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.COMPANYANALYSIS);
  }

  // ── Roadmap Analysis ─────────────────────────────────────────────────
  async enqueueRoadmapAnalysis(
    companyId: string,
    companyName: string,
    model: string,
    incremental = false,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.ROADMAP_ANALYSIS);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ companyId, companyName, incremental }),
      taskType: QueueJob.TaskType.ROADMAP_ANALYSIS,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getRoadmapAnalysisStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.ROADMAP_ANALYSIS);
  }

  cancelRoadmapAnalysis(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId && j.taskType === QueueJob.TaskType.ROADMAP_ANALYSIS,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.ROADMAP_ANALYSIS);
  }

  // ── Doc Parse ────────────────────────────────────────────────────────
  async enqueueDocParseAsk(
    docText: string,
    question: string,
    model: string,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.DOCPARSE_ASK);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ docText, question }),
      taskType: QueueJob.TaskType.DOCPARSE_ASK,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  async enqueueDocParseAction(
    action: string,
    docText: string | undefined,
    pages: string[] | undefined,
    model: string,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.DOCPARSE_ACTION);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ action, docText, pages }),
      taskType: QueueJob.TaskType.DOCPARSE_ACTION,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getDocParseStream(jobId: string): Observable<MessageEvent> | null {
    // DOCPARSE_ASK/ACTION 모두 같은 스트림 맵을 사용하므로 DOCPARSE_ASK로 조회
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.DOCPARSE_ASK);
  }

  cancelDocParse(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId &&
        (j.taskType === QueueJob.TaskType.DOCPARSE_ASK ||
          j.taskType === QueueJob.TaskType.DOCPARSE_ACTION),
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    if (job) this.dispatcher.cancelChannel(jobId, job.taskType);
  }

  // ── Spec Analysis ────────────────────────────────────────────────────
  async enqueueSpecAnalysis(request: {
    ids?: string[];
    target?: string;
    model?: string;
    limit?: number;
  }): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.SPEC_ANALYSIS);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify(request),
      taskType: QueueJob.TaskType.SPEC_ANALYSIS,
      localAIModel: '',
      CloudAIModel: request.model ?? '',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getSpecAnalysisStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.SPEC_ANALYSIS);
  }

  cancelSpecAnalysis(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId && j.taskType === QueueJob.TaskType.SPEC_ANALYSIS,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.SPEC_ANALYSIS);
  }

  // ── Tech Blog Trend ──────────────────────────────────────────────────
  async enqueueTechBlogTrend(
    request: TechBlogTrendRequest,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.TECH_BLOG_TREND);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify(request),
      taskType: QueueJob.TaskType.TECH_BLOG_TREND,
      localAIModel: '',
      CloudAIModel: request.model ?? '',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getTechBlogTrendStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.TECH_BLOG_TREND);
  }

  cancelTechBlogTrend(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId && j.taskType === QueueJob.TaskType.TECH_BLOG_TREND,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.TECH_BLOG_TREND);
  }

  // ── Paper Summary ────────────────────────────────────────────────────
  async enqueuePaperSummary(
    request: PaperSummaryRequest,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.PAPER_SUMMARY);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: request.id,
      itemContent: JSON.stringify(request),
      taskType: QueueJob.TaskType.PAPER_SUMMARY,
      localAIModel: '',
      CloudAIModel: request.model ?? '',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getPaperSummaryStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.PAPER_SUMMARY);
  }

  cancelPaperSummary(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId && j.taskType === QueueJob.TaskType.PAPER_SUMMARY,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.PAPER_SUMMARY);
  }

  // ── Paper Trend ──────────────────────────────────────────────────────
  async enqueuePaperTrend(
    request: PaperTrendRequest,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.PAPER_TREND);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify(request),
      taskType: QueueJob.TaskType.PAPER_TREND,
      localAIModel: '',
      CloudAIModel: request.model ?? '',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getPaperTrendStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.PAPER_TREND);
  }

  cancelPaperTrend(jobId: string): void {
    const job = this.jobs.find(
      (j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.PAPER_TREND,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.PAPER_TREND);
  }

  // ── News Article Summary ─────────────────────────────────────────────
  async enqueueNewsArticleSummary(
    request: NewsArticleSummaryRequest,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.NEWS_ARTICLE_SUMMARY);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: request.url || request.title,
      itemContent: JSON.stringify(request),
      taskType: QueueJob.TaskType.NEWS_ARTICLE_SUMMARY,
      localAIModel: '',
      CloudAIModel: request.model ?? '',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getNewsArticleSummaryStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(
      jobId,
      QueueJob.TaskType.NEWS_ARTICLE_SUMMARY,
    );
  }

  cancelNewsArticleSummary(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId &&
        j.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(
      jobId,
      QueueJob.TaskType.NEWS_ARTICLE_SUMMARY,
    );
  }

  // ── Resume Cover Letter Category ─────────────────────────────────────
  async enqueueResumeCoverLetterCategories(
    request: ResumeCoverLetterCategoryRequest,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(
      jobId,
      QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY,
    );
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify(request),
      taskType: QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY,
      localAIModel: '',
      CloudAIModel: request.model ?? 'gemini-2.0-flash',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getResumeCoverLetterCategoryStream(
    jobId: string,
  ): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(
      jobId,
      QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY,
    );
  }

  cancelResumeCoverLetterCategories(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId &&
        j.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(
      jobId,
      QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY,
    );
  }

  // ── Resume Cover Letter Refined Title ────────────────────────────────
  async enqueueResumeCoverLetterRefinedTitle(
    request: ResumeCoverLetterRefinedTitleRequest,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(
      jobId,
      QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE,
    );
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify(request),
      taskType: QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE,
      localAIModel: '',
      CloudAIModel: request.model ?? 'gemini-2.0-flash',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getResumeCoverLetterRefinedTitleStream(
    jobId: string,
  ): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(
      jobId,
      QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE,
    );
  }

  cancelResumeCoverLetterRefinedTitle(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId &&
        j.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(
      jobId,
      QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE,
    );
  }

  // ── Bulk Fetch News ──────────────────────────────────────────────────
  async enqueueBulkFetchNews(
    companyId: string,
    companyName: string,
    round: number,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.BULK_FETCH_NEWS);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ companyId, companyName, round }),
      taskType: QueueJob.TaskType.BULK_FETCH_NEWS,
      localAIModel: '',
      CloudAIModel: '',
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getBulkFetchNewsStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.BULK_FETCH_NEWS);
  }

  cancelBulkFetchNews(jobId: string): void {
    const job = this.jobs.find(
      (j) =>
        j.jobId === jobId && j.taskType === QueueJob.TaskType.BULK_FETCH_NEWS,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.BULK_FETCH_NEWS);
  }

  // ── Image OCR ────────────────────────────────────────────────────────
  async enqueueImageOcr(
    buffer: Buffer,
    mimetype: string,
    model: string,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.imageHandler.storeImage(jobId, buffer, mimetype);
    this.dispatcher.setupChannel(jobId, QueueJob.TaskType.IMAGE_OCR);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ model }),
      taskType: QueueJob.TaskType.IMAGE_OCR,
      localAIModel: '',
      CloudAIModel: model,
      status: QueueJobStatus.PENDING,
    });
    return { jobId };
  }

  getImageOcrStream(jobId: string): Observable<MessageEvent> | null {
    return this.dispatcher.getStream(jobId, QueueJob.TaskType.IMAGE_OCR);
  }

  cancelImageOcr(jobId: string): void {
    const job = this.jobs.find(
      (j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.IMAGE_OCR,
    );
    if (
      job &&
      (job.status === QueueJobStatus.PENDING ||
        job.status === QueueJobStatus.RUNNING)
    ) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    this.dispatcher.cancelChannel(jobId, QueueJob.TaskType.IMAGE_OCR);
  }
}
