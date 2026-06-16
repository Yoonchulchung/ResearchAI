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
import { WriteAssistExecutorService, WriteAssistExtras } from './job/write-assist/write-assist-executor.service';
import { CompanyProfileExecutorService } from './job/company-profile-executor.service';
import { CompanyAnalysisExecutorService } from './job/company-analysis-executor.service';
import { DocParseExecutorService } from './job/doc-parse-executor.service';
import { SpecAnalysisExecutorService } from './job/spec-analysis-executor.service';
import { TechBlogTrendExecutorService, TechBlogTrendRequest } from './job/tech-blog-trend-executor.service';
import { PaperSummaryExecutorService, PaperSummaryRequest } from './job/paper-summary-executor.service';
import { PaperTrendExecutorService, PaperTrendRequest } from './job/paper-trend-executor.service';
import { NewsArticleSummaryExecutorService, NewsArticleSummaryRequest } from './job/news-article-summary-executor.service';
import {
  ResumeCoverLetterCategoryExecutorService,
  ResumeCoverLetterCategoryRequest,
} from './job/resume-cover-letter-category-executor.service';
import {
  ResumeCoverLetterRefinedTitleExecutorService,
  ResumeCoverLetterRefinedTitleRequest,
} from './job/resume-cover-letter-refined-title-executor.service';
import { QueueJobRepository } from '../domain/repository/queue-job.repository';
import { QueueJobDbStatus } from '../domain/entity/queue-job.entity';
import { randomUUID } from 'crypto';
import { CompanyAnalysisProgress } from '../../company/domain/company-analysis.types';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';

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
  private companyAnalysisSubjects = new Map<string, Subject<MessageEvent>>();
  private companyAnalysisAccumulated = new Map<string, CompanyAnalysisProgress[]>();
  private docParseSubjects = new Map<string, Subject<MessageEvent>>();
  private docParseAccumulated = new Map<string, string>();
  private specAnalysisSubjects = new Map<string, Subject<MessageEvent>>();
  private techBlogTrendSubjects = new Map<string, Subject<MessageEvent>>();
  private techBlogTrendAccumulated = new Map<string, string>();
  private paperSummarySubjects = new Map<string, Subject<MessageEvent>>();
  private paperTrendSubjects = new Map<string, Subject<MessageEvent>>();
  private paperTrendAccumulated = new Map<string, string>();
  private newsArticleSummarySubjects = new Map<string, Subject<MessageEvent>>();
  private newsArticleSummaryAccumulated = new Map<string, string>();
  private resumeCoverLetterCategorySubjects = new Map<string, Subject<MessageEvent>>();
  private resumeCoverLetterCategoryAccumulated = new Map<string, MessageEvent[]>();
  private resumeCoverLetterRefinedTitleSubjects = new Map<string, Subject<MessageEvent>>();
  private resumeCoverLetterRefinedTitleAccumulated = new Map<string, MessageEvent[]>();
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
    private readonly companyAnalysisExecutor: CompanyAnalysisExecutorService,
    private readonly docParseExecutor: DocParseExecutorService,
    private readonly specAnalysisExecutor: SpecAnalysisExecutorService,
    private readonly techBlogTrendExecutor: TechBlogTrendExecutorService,
    private readonly paperSummaryExecutor: PaperSummaryExecutorService,
    private readonly paperTrendExecutor: PaperTrendExecutorService,
    private readonly newsArticleSummaryExecutor: NewsArticleSummaryExecutorService,
    private readonly resumeCoverLetterCategoryExecutor: ResumeCoverLetterCategoryExecutorService,
    private readonly resumeCoverLetterRefinedTitleExecutor: ResumeCoverLetterRefinedTitleExecutorService,
    private readonly queueJobRepository: QueueJobRepository,
    private readonly sessionGateway: SessionGateway,
    private readonly aiProvider: AiProviderService,
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
      } else if (QueueJob.isWriteAssist(entity.taskType as QueueJob.TaskType)) {
        // WriteAssist는 SSE가 끊겼으므로 Stopped 처리
        await this.queueJobRepository.updateStatus(entity.jobId, QueueJobDbStatus.STOPPED);
      } else if (entity.taskType === QueueJob.TaskType.COMPANYPROFILE || entity.taskType === QueueJob.TaskType.COMPANYANALYSIS) {
        // 단발 SSE 작업은 서버 재시작 후 이어붙일 수 없으므로 중단 처리
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
    for (const subject of this.companyAnalysisSubjects.values()) {
      subject.complete();
    }
    for (const subject of this.docParseSubjects.values()) {
      subject.complete();
    }
    for (const subject of this.specAnalysisSubjects.values()) {
      subject.complete();
    }
    for (const subject of this.techBlogTrendSubjects.values()) {
      subject.complete();
    }
    for (const subject of this.paperSummarySubjects.values()) {
      subject.complete();
    }
    for (const subject of this.paperTrendSubjects.values()) {
      subject.complete();
    }
    for (const subject of this.newsArticleSummarySubjects.values()) {
      subject.complete();
    }
    for (const subject of this.resumeCoverLetterCategorySubjects.values()) {
      subject.complete();
    }
    for (const subject of this.resumeCoverLetterRefinedTitleSubjects.values()) {
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
      jobs: this.jobs.map(({ jobId, sessionId, itemId, itemContent, taskType, status, phase, result, errorMessage, webSources }) => ({
        jobId,
        sessionId,
        itemId,
        taskType,
        status,
        phase,
        displayTitle: this.getJobDisplayTitle({ jobId, sessionId, itemId, itemContent, taskType }),
        displaySubtitle: this.getJobDisplaySubtitle({ taskType, itemContent }),
        companyName: this.getJobCompanyName({ taskType, itemContent }),
        result,
        errorMessage: errorMessage ?? (status === QueueJobStatus.ERROR ? result : undefined),
        webSources,
        referenceCount: result ? (result.match(/\[.+?\]\(https?:\/\/[^)]+\)/g) ?? []).length : undefined,
      })),
    };
  }

  private getJobDisplayTitle(job: Pick<QueueJob, 'jobId' | 'sessionId' | 'itemId' | 'itemContent' | 'taskType'>): string {
    if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      const parsed = this.parseJobContent<{ topic?: string; attachedFiles?: AttachedFilePayload[] }>(job.itemContent);
      return this.truncateDisplayText(parsed?.topic) || '라이트 리서치';
    }

    if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
      return this.truncateDisplayText(job.itemContent) || '딥 리서치';
    }

    if (job.taskType === QueueJob.TaskType.SUMMARY) {
      return '세션 요약 생성';
    }

    if (job.taskType === QueueJob.TaskType.COMPANYPROFILE || job.taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      const parsed = this.parseJobContent<{ companyName?: string }>(job.itemContent);
      return parsed?.companyName ? `${parsed.companyName} ${job.taskType === QueueJob.TaskType.COMPANYPROFILE ? '기업 프로필' : '기업 분석'}` : this.getTaskTypeLabel(job.taskType);
    }

    if (QueueJob.isWriteAssist(job.taskType)) {
      const parsed = this.parseJobContent<{ content?: string; instruction?: string }>(job.itemContent);
      return this.truncateDisplayText(parsed?.instruction || parsed?.content) || this.getTaskTypeLabel(job.taskType);
    }

    return job.itemId || job.sessionId || job.jobId;
  }

  private getJobCompanyName(job: Pick<QueueJob, 'taskType' | 'itemContent'>): string | undefined {
    if (job.taskType !== QueueJob.TaskType.COMPANYPROFILE && job.taskType !== QueueJob.TaskType.COMPANYANALYSIS) {
      return undefined;
    }
    const parsed = this.parseJobContent<{ companyName?: string }>(job.itemContent);
    return parsed?.companyName;
  }

  private getJobDisplaySubtitle(job: Pick<QueueJob, 'taskType' | 'itemContent'>): string {
    if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      const parsed = this.parseJobContent<{ attachedFiles?: AttachedFilePayload[] }>(job.itemContent);
      const fileCount = parsed?.attachedFiles?.length ?? 0;
      return fileCount > 0 ? `${this.getTaskTypeLabel(job.taskType)} · 첨부 ${fileCount}개` : this.getTaskTypeLabel(job.taskType);
    }
    return this.getTaskTypeLabel(job.taskType);
  }

  private getTaskTypeLabel(taskType: QueueJob.TaskType): string {
    const labels: Partial<Record<QueueJob.TaskType, string>> = {
      [QueueJob.TaskType.LIGHTRESEARCH]: 'Light Research',
      [QueueJob.TaskType.DEEPRESEARCH]: 'Deep Research',
      [QueueJob.TaskType.SUMMARY]: '요약',
      [QueueJob.TaskType.WRITEASSIST]: '작성 보조',
      [QueueJob.TaskType.WRITEASSIST_EVALUATE]: '평가',
      [QueueJob.TaskType.WRITEASSIST_PLAGIARISM]: '표절 검사',
      [QueueJob.TaskType.WRITEASSIST_CONTINUE]: '이어쓰기',
      [QueueJob.TaskType.WRITEASSIST_SECTION]: '문단 작성',
      [QueueJob.TaskType.WRITEASSIST_IMPROVE]: '개선',
      [QueueJob.TaskType.WRITEASSIST_SPELLCHECK]: '맞춤법',
      [QueueJob.TaskType.WRITEASSIST_SUMMARIZE]: '요약',
      [QueueJob.TaskType.WRITEASSIST_EXAMPLE]: '예시 생성',
      [QueueJob.TaskType.WRITEASSIST_JD_EVALUATE]: 'JD 분석',
      [QueueJob.TaskType.COMPANYPROFILE]: '기업 프로필',
      [QueueJob.TaskType.COMPANYANALYSIS]: '기업 분석',
      [QueueJob.TaskType.DOCPARSE_ASK]: '문서 질문',
      [QueueJob.TaskType.DOCPARSE_ACTION]: '문서 분석',
      [QueueJob.TaskType.SPEC_ANALYSIS]: '스펙 분석',
      [QueueJob.TaskType.TECH_BLOG_TREND]: 'AI 트렌드 분석',
      [QueueJob.TaskType.PAPER_SUMMARY]: '논문 AI 요약',
      [QueueJob.TaskType.PAPER_TREND]: '논문 트렌드 분석',
      [QueueJob.TaskType.NEWS_ARTICLE_SUMMARY]: '뉴스 AI 요약',
      [QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY]: '자기소개서 카테고리 분류',
      [QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE]: '자기소개서 제목 재작성',
    };
    return labels[taskType] ?? taskType;
  }

  private parseJobContent<T>(content: string): T | null {
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private truncateDisplayText(value?: string | null): string {
    const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
    if (!normalized) return '';
    return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
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
    history?: { role: 'user' | 'assistant'; content: string }[],
    imageFiles?: string[],
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.writeAssistSubjects.set(jobId, new Subject<MessageEvent>());
    this.writeAssistAccumulated.set(jobId, '');
    // 히스토리는 최근 10턴(20개 메시지)으로 제한해 토큰 과부하 방지
    const trimmedHistory = history?.slice(-20);
    await this.pushJob({
      jobId,
      sessionId: jobId,
      itemId: '',
      itemContent: JSON.stringify({ content, instruction, history: trimmedHistory, imageFiles } satisfies WriteAssistExtras & { content: string }),
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
      spellcheck: QueueJob.TaskType.WRITEASSIST_SPELLCHECK,
      summarize: QueueJob.TaskType.WRITEASSIST_SUMMARIZE,
      example:   QueueJob.TaskType.WRITEASSIST_EXAMPLE,
      jd_evaluate: QueueJob.TaskType.WRITEASSIST_JD_EVALUATE,
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

  // **************** //
  // Company Analysis //
  // **************** //
  async enqueueCompanyAnalysis(companyName: string, model: string): Promise<{ jobId: string }> {
    const effectiveModel = this.aiProvider.resolveEffectiveModel(this.aiProvider.resolveEffectiveModel(model));
    const key = this.normalizeCompanyName(companyName);
    const existing = this.jobs.find((job) => {
      if (job.taskType !== QueueJob.TaskType.COMPANYANALYSIS) return false;
      if (job.status !== QueueJobStatus.PENDING && job.status !== QueueJobStatus.RUNNING) return false;
      try {
        const parsed = JSON.parse(job.itemContent) as { companyName?: string };
        return this.normalizeCompanyName(parsed.companyName ?? '') === key;
      } catch {
        return false;
      }
    });
    if (existing) return { jobId: existing.jobId };

    const jobId = randomUUID();
    this.companyAnalysisSubjects.set(jobId, new Subject<MessageEvent>());
    this.companyAnalysisAccumulated.set(jobId, []);
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
    return name.trim().toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  }

  getCompanyAnalysisStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.companyAnalysisSubjects.get(jobId);
    if (!subject) return null;
    const accumulated = this.companyAnalysisAccumulated.get(jobId) ?? [];
    if (accumulated.length > 0) {
      return concat(
        from(accumulated.map((event) => ({ data: event } as MessageEvent))),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  cancelCompanyAnalysis(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.COMPANYANALYSIS);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.companyAnalysisSubjects.get(jobId);
    subject?.next({ data: { type: 'error', message: '기업 분석이 중단되었습니다.' } });
    subject?.complete();
    this.companyAnalysisSubjects.delete(jobId);
    this.companyAnalysisAccumulated.delete(jobId);
  }

  // *********** //
  // Doc Parse   //
  // *********** //
  async enqueueDocParseAsk(docText: string, question: string, model: string): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.docParseSubjects.set(jobId, new Subject<MessageEvent>());
    this.docParseAccumulated.set(jobId, '');
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
    this.docParseSubjects.set(jobId, new Subject<MessageEvent>());
    this.docParseAccumulated.set(jobId, '');
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
    const subject = this.docParseSubjects.get(jobId);
    const accumulated = this.docParseAccumulated.get(jobId) ?? '';

    if (!subject) {
      // Job already completed before the client connected — replay accumulated text
      if (accumulated) {
        return of(
          { data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent,
          { data: { type: SseEventType.DONE } } as MessageEvent,
        );
      }
      return null;
    }

    if (accumulated) {
      return concat(
        of({ data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  cancelDocParse(jobId: string): void {
    const job = this.jobs.find(
      (j) => j.jobId === jobId &&
        (j.taskType === QueueJob.TaskType.DOCPARSE_ASK || j.taskType === QueueJob.TaskType.DOCPARSE_ACTION),
    );
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.docParseSubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '작업이 중단되었습니다.' } });
    subject?.complete();
    this.docParseSubjects.delete(jobId);
    this.docParseAccumulated.delete(jobId);
  }

  // ************* //
  // Spec Analysis //
  // ************* //
  async enqueueSpecAnalysis(request: {
    ids?: string[];
    target?: string;
    model?: string;
    limit?: number;
  }): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.specAnalysisSubjects.set(jobId, new Subject<MessageEvent>());
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
    return this.specAnalysisSubjects.get(jobId) ?? null;
  }

  cancelSpecAnalysis(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.SPEC_ANALYSIS);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.specAnalysisSubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '작업이 중단되었습니다.' } });
    subject?.complete();
    this.specAnalysisSubjects.delete(jobId);
  }

  // **************** //
  // Tech Blog Trend  //
  // **************** //
  async enqueueTechBlogTrend(request: TechBlogTrendRequest): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.techBlogTrendSubjects.set(jobId, new Subject<MessageEvent>());
    this.techBlogTrendAccumulated.set(jobId, '');
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
    return this.techBlogTrendSubjects.get(jobId) ?? null;
  }

  cancelTechBlogTrend(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.TECH_BLOG_TREND);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.techBlogTrendSubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '작업이 중단되었습니다.' } });
    subject?.complete();
    this.techBlogTrendSubjects.delete(jobId);
    this.techBlogTrendAccumulated.delete(jobId);
  }

  // ************* //
  // Paper Summary //
  // ************* //
  async enqueuePaperSummary(request: PaperSummaryRequest): Promise<{ jobId: string }> {

    const jobId = randomUUID();
    this.paperSummarySubjects.set(jobId, new Subject<MessageEvent>());
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
    return this.paperSummarySubjects.get(jobId) ?? null;
  }

  cancelPaperSummary(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.PAPER_SUMMARY);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.paperSummarySubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '작업이 중단되었습니다.' } });
    subject?.complete();
    this.paperSummarySubjects.delete(jobId);
  }

  // ************ //
  // Paper Trend  //
  // ************ //
  async enqueuePaperTrend(request: PaperTrendRequest): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.paperTrendSubjects.set(jobId, new Subject<MessageEvent>());
    this.paperTrendAccumulated.set(jobId, '');
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
    const subject = this.paperTrendSubjects.get(jobId);
    if (!subject) return null;
    const accumulated = this.paperTrendAccumulated.get(jobId) ?? '';
    if (accumulated) {
      return concat(
        of({ data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  cancelPaperTrend(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.PAPER_TREND);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.paperTrendSubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '작업이 중단되었습니다.' } });
    subject?.complete();
    this.paperTrendSubjects.delete(jobId);
    this.paperTrendAccumulated.delete(jobId);
  }

  // **************** //
  // News AI Summary  //
  // **************** //
  async enqueueNewsArticleSummary(request: NewsArticleSummaryRequest): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.newsArticleSummarySubjects.set(jobId, new Subject<MessageEvent>());
    this.newsArticleSummaryAccumulated.set(jobId, '');
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
    const subject = this.newsArticleSummarySubjects.get(jobId);
    const accumulated = this.newsArticleSummaryAccumulated.get(jobId) ?? '';
    if (!subject) {
      if (accumulated) {
        return of(
          { data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent,
          { data: { type: SseEventType.DONE } } as MessageEvent,
        );
      }
      return null;
    }
    if (accumulated) {
      return concat(
        of({ data: { type: SseEventType.CHUNK, text: accumulated } } as MessageEvent),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  cancelNewsArticleSummary(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.newsArticleSummarySubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '뉴스 요약이 중단되었습니다.' } });
    subject?.complete();
    this.newsArticleSummarySubjects.delete(jobId);
    this.newsArticleSummaryAccumulated.delete(jobId);
  }

  // ******************************* //
  // Resume Cover Letter Categories  //
  // ******************************* //
  async enqueueResumeCoverLetterCategories(request: ResumeCoverLetterCategoryRequest): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.resumeCoverLetterCategorySubjects.set(jobId, new Subject<MessageEvent>());
    this.resumeCoverLetterCategoryAccumulated.set(jobId, []);
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

  getResumeCoverLetterCategoryStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.resumeCoverLetterCategorySubjects.get(jobId);
    const accumulated = this.resumeCoverLetterCategoryAccumulated.get(jobId) ?? [];
    if (!subject) {
      if (accumulated.length > 0) {
        return concat(from(accumulated), of({ data: { type: SseEventType.DONE } } as MessageEvent));
      }
      return null;
    }
    if (accumulated.length > 0) {
      return concat(from(accumulated), subject.asObservable());
    }
    return subject.asObservable();
  }

  cancelResumeCoverLetterCategories(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.resumeCoverLetterCategorySubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '카테고리 분류가 중단되었습니다.' } });
    subject?.complete();
    this.resumeCoverLetterCategorySubjects.delete(jobId);
    this.resumeCoverLetterCategoryAccumulated.delete(jobId);
  }

  // *************************************** //
  // Resume Cover Letter Refined Title       //
  // *************************************** //
  async enqueueResumeCoverLetterRefinedTitle(request: ResumeCoverLetterRefinedTitleRequest): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    this.resumeCoverLetterRefinedTitleSubjects.set(jobId, new Subject<MessageEvent>());
    this.resumeCoverLetterRefinedTitleAccumulated.set(jobId, []);
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

  getResumeCoverLetterRefinedTitleStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.resumeCoverLetterRefinedTitleSubjects.get(jobId);
    const accumulated = this.resumeCoverLetterRefinedTitleAccumulated.get(jobId) ?? [];
    if (!subject) {
      if (accumulated.length > 0) {
        return concat(from(accumulated), of({ data: { type: SseEventType.DONE } } as MessageEvent));
      }
      return null;
    }
    if (accumulated.length > 0) {
      return concat(from(accumulated), subject.asObservable());
    }
    return subject.asObservable();
  }

  cancelResumeCoverLetterRefinedTitle(jobId: string): void {
    const job = this.jobs.find((j) => j.jobId === jobId && j.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE);
    if (job && (job.status === QueueJobStatus.PENDING || job.status === QueueJobStatus.RUNNING)) {
      this.updateJob(job.jobId, { status: QueueJobStatus.STOPPED });
      this.abortControllers.get(job.jobId)?.abort();
    }
    const subject = this.resumeCoverLetterRefinedTitleSubjects.get(jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: '제목 재작성이 중단되었습니다.' } });
    subject?.complete();
    this.resumeCoverLetterRefinedTitleSubjects.delete(jobId);
    this.resumeCoverLetterRefinedTitleAccumulated.delete(jobId);
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
          this.docParseAccumulated.delete(jobId);
          this.newsArticleSummaryAccumulated.delete(jobId);
          this.resumeCoverLetterCategoryAccumulated.delete(jobId);
          this.resumeCoverLetterRefinedTitleAccumulated.delete(jobId);
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

      } else if (job.taskType === QueueJob.TaskType.COMPANYANALYSIS) {

        const subject = this.companyAnalysisSubjects.get(job.jobId);
        const { companyName } = JSON.parse(job.itemContent) as { companyName: string };
        const result = await this.companyAnalysisExecutor.execute(
          companyName,
          job.CloudAIModel,
          (event) => {
            const accumulated = this.companyAnalysisAccumulated.get(job.jobId) ?? [];
            accumulated.push(event);
            this.companyAnalysisAccumulated.set(job.jobId, accumulated);
            subject?.next({ data: event });
          },
          controller.signal,
        );

        subject?.complete();
        this.companyAnalysisSubjects.delete(job.jobId);
        this.companyAnalysisAccumulated.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: result ? JSON.stringify(result) : '' });

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

      } else if (
        job.taskType === QueueJob.TaskType.DOCPARSE_ASK ||
        job.taskType === QueueJob.TaskType.DOCPARSE_ACTION
      ) {

        const subject = this.docParseSubjects.get(job.jobId);
        const payload = JSON.parse(job.itemContent) as {
          docText?: string; question?: string; action?: string; pages?: string[];
        };
        const onChunk = (chunk: string) => {
          this.docParseAccumulated.set(job.jobId, (this.docParseAccumulated.get(job.jobId) ?? '') + chunk);
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        };

        let fullText: string;
        if (job.taskType === QueueJob.TaskType.DOCPARSE_ASK) {
          fullText = await this.docParseExecutor.executeAsk(
            payload.docText ?? '', payload.question ?? '', job.CloudAIModel, onChunk, controller.signal,
          );
        } else {
          fullText = await this.docParseExecutor.executeAction(
            payload.action ?? '', payload.docText, payload.pages, job.CloudAIModel, onChunk, controller.signal,
          );
        }

        subject?.next({ data: { type: SseEventType.DONE } });
        subject?.complete();
        this.docParseSubjects.delete(job.jobId);
        // Keep accumulated for late-connecting SSE clients; TTL cleanup handles deletion
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: fullText });

      } else if (job.taskType === QueueJob.TaskType.SPEC_ANALYSIS) {

        const subject = this.specAnalysisSubjects.get(job.jobId);
        const request = JSON.parse(job.itemContent) as import('../../recruit/domain/cover-letter/cover-letter.model').CoverLetterJobAnalysisRequest;
        const result = await this.specAnalysisExecutor.execute(request, (message) => {
          subject?.next({ data: { type: SseEventType.LOG, message } });
        });

        subject?.next({ data: { type: SseEventType.DONE, payload: result } });
        subject?.complete();
        this.specAnalysisSubjects.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(result) });

      } else if (job.taskType === QueueJob.TaskType.TECH_BLOG_TREND) {

        const subject = this.techBlogTrendSubjects.get(job.jobId);
        const request = JSON.parse(job.itemContent) as TechBlogTrendRequest;
        const result = await this.techBlogTrendExecutor.execute(request, (chunk) => {
          this.techBlogTrendAccumulated.set(job.jobId, (this.techBlogTrendAccumulated.get(job.jobId) ?? '') + chunk);
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        });
        subject?.next({ data: { type: SseEventType.DONE, payload: result } });
        subject?.complete();
        this.techBlogTrendSubjects.delete(job.jobId);
        this.techBlogTrendAccumulated.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(result) });

      } else if (job.taskType === QueueJob.TaskType.PAPER_SUMMARY) {

        const subject = this.paperSummarySubjects.get(job.jobId);
        const request = JSON.parse(job.itemContent) as PaperSummaryRequest;
        subject?.next({ data: { type: SseEventType.LOG, message: '논문 AI 요약을 생성하는 중입니다.' } });
        const result = await this.paperSummaryExecutor.execute(request);
        subject?.next({ data: { type: SseEventType.DONE, payload: result } });
        subject?.complete();
        this.paperSummarySubjects.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(result) });

      } else if (job.taskType === QueueJob.TaskType.PAPER_TREND) {

        const subject = this.paperTrendSubjects.get(job.jobId);
        const request = JSON.parse(job.itemContent) as PaperTrendRequest;
        const trendResult = await this.paperTrendExecutor.execute(request, (chunk) => {
          this.paperTrendAccumulated.set(job.jobId, (this.paperTrendAccumulated.get(job.jobId) ?? '') + chunk);
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        });
        subject?.next({ data: { type: SseEventType.DONE, payload: trendResult } });
        subject?.complete();
        this.paperTrendSubjects.delete(job.jobId);
        this.paperTrendAccumulated.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(trendResult) });

      } else if (job.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {

        const subject = this.newsArticleSummarySubjects.get(job.jobId);
        const request = JSON.parse(job.itemContent) as NewsArticleSummaryRequest;
        subject?.next({ data: { type: SseEventType.LOG, message: '뉴스 본문을 확인하고 AI 요약을 생성하는 중입니다.' } });
        const fullText = await this.newsArticleSummaryExecutor.execute(
          request,
          (chunk) => {
            this.newsArticleSummaryAccumulated.set(job.jobId, (this.newsArticleSummaryAccumulated.get(job.jobId) ?? '') + chunk);
            subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
          },
          controller.signal,
        );
        subject?.next({ data: { type: SseEventType.DONE, payload: { summary: fullText } } });
        subject?.complete();
        this.newsArticleSummarySubjects.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: fullText });

      } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {

        const subject = this.resumeCoverLetterCategorySubjects.get(job.jobId);
        const request = JSON.parse(job.itemContent) as ResumeCoverLetterCategoryRequest;
        const pushEvent = (event: MessageEvent) => {
          const accumulated = this.resumeCoverLetterCategoryAccumulated.get(job.jobId) ?? [];
          accumulated.push(event);
          this.resumeCoverLetterCategoryAccumulated.set(job.jobId, accumulated);
          subject?.next(event);
        };
        pushEvent({ data: { type: SseEventType.LOG, message: '자기소개서 카테고리 분류를 준비합니다.' } });
        const result = await this.resumeCoverLetterCategoryExecutor.execute(
          request,
          (message) => pushEvent({ data: { type: SseEventType.LOG, message } }),
          controller.signal,
        );
        pushEvent({ data: { type: SseEventType.DONE, payload: result } });
        subject?.complete();
        this.resumeCoverLetterCategorySubjects.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(result) });

      } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE) {

        const subject = this.resumeCoverLetterRefinedTitleSubjects.get(job.jobId);
        const request = JSON.parse(job.itemContent) as ResumeCoverLetterRefinedTitleRequest;
        const pushEvent = (event: MessageEvent) => {
          const accumulated = this.resumeCoverLetterRefinedTitleAccumulated.get(job.jobId) ?? [];
          accumulated.push(event);
          this.resumeCoverLetterRefinedTitleAccumulated.set(job.jobId, accumulated);
          subject?.next(event);
        };
        pushEvent({ data: { type: SseEventType.LOG, message: '자기소개서 제목 재작성을 준비합니다.' } });
        const refinedResult = await this.resumeCoverLetterRefinedTitleExecutor.execute(
          request,
          (message) => pushEvent({ data: { type: SseEventType.LOG, message } }),
          controller.signal,
        );
        pushEvent({ data: { type: SseEventType.DONE, payload: refinedResult } });
        subject?.complete();
        this.resumeCoverLetterRefinedTitleSubjects.delete(job.jobId);
        this.updateJob(job.jobId, { status: QueueJobStatus.DONE, phase: undefined, result: JSON.stringify(refinedResult) });

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
      const msg = e instanceof Error ? e.message : '오류';
      this.updateJob(job.jobId, { status: QueueJobStatus.ERROR, phase: undefined, result: msg, errorMessage: msg });
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

      } else if (QueueJob.isWriteAssist(job.taskType)) {

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

      } else if (job.taskType === QueueJob.TaskType.COMPANYANALYSIS) {

        const subject = this.companyAnalysisSubjects.get(job.jobId);
        subject?.next({ data: { type: 'error', message: msg } });
        subject?.complete();
        this.companyAnalysisSubjects.delete(job.jobId);
        this.companyAnalysisAccumulated.delete(job.jobId);

      } else if (
        job.taskType === QueueJob.TaskType.DOCPARSE_ASK ||
        job.taskType === QueueJob.TaskType.DOCPARSE_ACTION
      ) {

        const subject = this.docParseSubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.docParseSubjects.delete(job.jobId);
        this.docParseAccumulated.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.SPEC_ANALYSIS) {

        const subject = this.specAnalysisSubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.specAnalysisSubjects.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.TECH_BLOG_TREND) {

        const subject = this.techBlogTrendSubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.techBlogTrendSubjects.delete(job.jobId);
        this.techBlogTrendAccumulated.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.PAPER_SUMMARY) {

        const subject = this.paperSummarySubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.paperSummarySubjects.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.PAPER_TREND) {

        const subject = this.paperTrendSubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.paperTrendSubjects.delete(job.jobId);
        this.paperTrendAccumulated.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {

        const subject = this.newsArticleSummarySubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.newsArticleSummarySubjects.delete(job.jobId);
        this.newsArticleSummaryAccumulated.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {

        const subject = this.resumeCoverLetterCategorySubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.resumeCoverLetterCategorySubjects.delete(job.jobId);
        this.resumeCoverLetterCategoryAccumulated.delete(job.jobId);

      } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE) {

        const subject = this.resumeCoverLetterRefinedTitleSubjects.get(job.jobId);
        subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
        subject?.complete();
        this.resumeCoverLetterRefinedTitleSubjects.delete(job.jobId);
        this.resumeCoverLetterRefinedTitleAccumulated.delete(job.jobId);

      }
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
