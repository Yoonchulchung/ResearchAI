import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable, of, concat, from } from 'rxjs';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import { SearchSources } from 'src/research/domain/model/search-sources.model';
import { ResearchState, SummaryState } from 'src/sessions/domain/entity/session.entity';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SearchEngine, PlannerMode } from 'src/research/domain/model/search-planner.model';
import { SearchModeInput } from 'src/research/application/search-planner.service';
import { AttachedFilePayload } from 'src/queue/presentation/dto/request/enqueue-light-research.dto';
import { LightResearchEvent } from 'src/research/application/pipeline/light-research-pipeline.service';
import { CompanyAnalysisProgress } from 'src/company/domain/company-analysis.types';
import {
  WriteAssistExtras,
  WriteAssistExecutorService,
} from 'src/queue/application/job/write-assist/write-assist-executor.service';
import { DeepResearchExecutorService } from 'src/queue/application/job/deep-research-executor.service';
import { LightResearchExecutorService } from 'src/queue/application/job/light-research-executor.service';
import { SummaryExecutorService } from 'src/queue/application/job/summary-executor.service';
import { CompanyProfileExecutorService } from 'src/queue/application/job/company-profile-executor.service';
import { CompanyAnalysisExecutorService } from 'src/queue/application/job/company-analysis-executor.service';
import { DocParseExecutorService } from 'src/queue/application/job/doc-parse-executor.service';
import { SpecAnalysisExecutorService } from 'src/queue/application/job/spec-analysis-executor.service';
import {
  TechBlogTrendExecutorService,
  TechBlogTrendRequest,
} from 'src/queue/application/job/tech-blog-trend-executor.service';
import {
  PaperSummaryExecutorService,
  PaperSummaryRequest,
} from 'src/queue/application/job/paper-summary-executor.service';
import {
  PaperTrendExecutorService,
  PaperTrendRequest,
} from 'src/queue/application/job/paper-trend-executor.service';
import {
  NewsArticleSummaryExecutorService,
  NewsArticleSummaryRequest,
} from 'src/queue/application/job/news-article-summary-executor.service';
import {
  ResumeCoverLetterCategoryExecutorService,
  ResumeCoverLetterCategoryRequest,
} from 'src/queue/application/job/resume-cover-letter-category-executor.service';
import {
  ResumeCoverLetterRefinedTitleExecutorService,
  ResumeCoverLetterRefinedTitleRequest,
} from 'src/queue/application/job/resume-cover-letter-refined-title-executor.service';

export interface JobResult {
  result?: string;
  webSources?: SearchSources;
}

/** 잡 타입별 SSE 채널 관리 + 실행 dispatch */
@Injectable()
export class AiJobDispatcher {
  // ── SSE 채널 맵 ─────────────────────────────────────────────────────
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

  constructor(
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
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionGateway: SessionGateway,
  ) {}

  // ── 채널 초기화 (enqueue 전 호출) ─────────────────────────────────────
  setupSummaryChannel(sessionId: string): void {
    this.summarySubjects.set(sessionId, new Subject<MessageEvent>());
    this.summaryAccumulated.set(sessionId, '');
  }

  setupLightResearchChannel(searchId: string): void {
    this.lightResearchSubjects.set(searchId, new Subject<MessageEvent>());
    this.lightResearchAccumulated.set(searchId, []);
  }

  setupWriteAssistChannel(jobId: string): void {
    this.writeAssistSubjects.set(jobId, new Subject<MessageEvent>());
    this.writeAssistAccumulated.set(jobId, '');
  }

  setupCompanyProfileChannel(jobId: string): void {
    this.companyProfileSubjects.set(jobId, new Subject<MessageEvent>());
    this.companyProfileAccumulated.set(jobId, '');
  }

  setupCompanyAnalysisChannel(jobId: string): void {
    this.companyAnalysisSubjects.set(jobId, new Subject<MessageEvent>());
    this.companyAnalysisAccumulated.set(jobId, []);
  }

  setupDocParseChannel(jobId: string): void {
    this.docParseSubjects.set(jobId, new Subject<MessageEvent>());
    this.docParseAccumulated.set(jobId, '');
  }

  setupSpecAnalysisChannel(jobId: string): void {
    this.specAnalysisSubjects.set(jobId, new Subject<MessageEvent>());
  }

  setupTechBlogTrendChannel(jobId: string): void {
    this.techBlogTrendSubjects.set(jobId, new Subject<MessageEvent>());
    this.techBlogTrendAccumulated.set(jobId, '');
  }

  setupPaperSummaryChannel(jobId: string): void {
    this.paperSummarySubjects.set(jobId, new Subject<MessageEvent>());
  }

  setupPaperTrendChannel(jobId: string): void {
    this.paperTrendSubjects.set(jobId, new Subject<MessageEvent>());
    this.paperTrendAccumulated.set(jobId, '');
  }

  setupNewsArticleSummaryChannel(jobId: string): void {
    this.newsArticleSummarySubjects.set(jobId, new Subject<MessageEvent>());
    this.newsArticleSummaryAccumulated.set(jobId, '');
  }

  setupResumeCoverLetterCategoryChannel(jobId: string): void {
    this.resumeCoverLetterCategorySubjects.set(jobId, new Subject<MessageEvent>());
    this.resumeCoverLetterCategoryAccumulated.set(jobId, []);
  }

  setupResumeCoverLetterRefinedTitleChannel(jobId: string): void {
    this.resumeCoverLetterRefinedTitleSubjects.set(jobId, new Subject<MessageEvent>());
    this.resumeCoverLetterRefinedTitleAccumulated.set(jobId, []);
  }

  // ── Stream 조회 ──────────────────────────────────────────────────────
  getSummaryObservable(sessionId: string): Observable<MessageEvent> | null {
    return this.summarySubjects.get(sessionId) ?? null;
  }

  getSummaryStream(
    sessionId: string,
    summaryStatus: string | null | undefined,
    summary: string | null | undefined,
  ): Observable<MessageEvent> | null {
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

  getLightResearchStream(searchId: string): Observable<MessageEvent> | null {
    const subject = this.lightResearchSubjects.get(searchId);
    if (!subject) return null;
    const accumulated = this.lightResearchAccumulated.get(searchId) ?? [];
    if (accumulated.length > 0) {
      return concat(
        from(accumulated.map((e) => ({ data: e }) as MessageEvent)),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
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

  getCompanyAnalysisStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.companyAnalysisSubjects.get(jobId);
    if (!subject) return null;
    const accumulated = this.companyAnalysisAccumulated.get(jobId) ?? [];
    if (accumulated.length > 0) {
      return concat(
        from(accumulated.map((e) => ({ data: e }) as MessageEvent)),
        subject.asObservable(),
      );
    }
    return subject.asObservable();
  }

  getDocParseStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.docParseSubjects.get(jobId);
    const accumulated = this.docParseAccumulated.get(jobId) ?? '';
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

  getSpecAnalysisStream(jobId: string): Observable<MessageEvent> | null {
    return this.specAnalysisSubjects.get(jobId) ?? null;
  }

  getTechBlogTrendStream(jobId: string): Observable<MessageEvent> | null {
    return this.techBlogTrendSubjects.get(jobId) ?? null;
  }

  getPaperSummaryStream(jobId: string): Observable<MessageEvent> | null {
    return this.paperSummarySubjects.get(jobId) ?? null;
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

  getResumeCoverLetterCategoryStream(jobId: string): Observable<MessageEvent> | null {
    const subject = this.resumeCoverLetterCategorySubjects.get(jobId);
    const accumulated = this.resumeCoverLetterCategoryAccumulated.get(jobId) ?? [];
    if (!subject) {
      if (accumulated.length > 0) {
        return concat(from(accumulated), of({ data: { type: SseEventType.DONE } } as MessageEvent));
      }
      return null;
    }
    if (accumulated.length > 0) return concat(from(accumulated), subject.asObservable());
    return subject.asObservable();
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
    if (accumulated.length > 0) return concat(from(accumulated), subject.asObservable());
    return subject.asObservable();
  }

  // ── 채널 취소 (SSE teardown only, 큐 mechanics는 AiQueueService) ─────
  cancelSummaryChannel(sessionId: string): void {
    this.errorAndClose(this.summarySubjects, sessionId, '서머리가 중단되었습니다.');
    this.summaryAccumulated.delete(sessionId);
  }

  cancelLightResearchChannel(searchId: string): void {
    this.errorAndClose(this.lightResearchSubjects, searchId, 'Light Research가 중단되었습니다.');
    this.lightResearchAccumulated.delete(searchId);
  }

  cancelWriteAssistChannel(jobId: string): void {
    this.errorAndClose(this.writeAssistSubjects, jobId, '작업이 중단되었습니다.');
    this.writeAssistAccumulated.delete(jobId);
  }

  cancelCompanyProfileChannel(jobId: string): void {
    this.errorAndClose(this.companyProfileSubjects, jobId, '작업이 중단되었습니다.');
    this.companyProfileAccumulated.delete(jobId);
  }

  cancelCompanyAnalysisChannel(jobId: string): void {
    const subject = this.companyAnalysisSubjects.get(jobId);
    subject?.next({ data: { type: 'error', message: '기업 분석이 중단되었습니다.' } });
    subject?.complete();
    this.companyAnalysisSubjects.delete(jobId);
    this.companyAnalysisAccumulated.delete(jobId);
  }

  cancelDocParseChannel(jobId: string): void {
    this.errorAndClose(this.docParseSubjects, jobId, '작업이 중단되었습니다.');
    this.docParseAccumulated.delete(jobId);
  }

  cancelSpecAnalysisChannel(jobId: string): void {
    this.errorAndClose(this.specAnalysisSubjects, jobId, '작업이 중단되었습니다.');
  }

  cancelTechBlogTrendChannel(jobId: string): void {
    this.errorAndClose(this.techBlogTrendSubjects, jobId, '작업이 중단되었습니다.');
    this.techBlogTrendAccumulated.delete(jobId);
  }

  cancelPaperSummaryChannel(jobId: string): void {
    this.errorAndClose(this.paperSummarySubjects, jobId, '작업이 중단되었습니다.');
  }

  cancelPaperTrendChannel(jobId: string): void {
    this.errorAndClose(this.paperTrendSubjects, jobId, '작업이 중단되었습니다.');
    this.paperTrendAccumulated.delete(jobId);
  }

  cancelNewsArticleSummaryChannel(jobId: string): void {
    this.errorAndClose(this.newsArticleSummarySubjects, jobId, '뉴스 요약이 중단되었습니다.');
    this.newsArticleSummaryAccumulated.delete(jobId);
  }

  cancelResumeCoverLetterCategoryChannel(jobId: string): void {
    this.errorAndClose(this.resumeCoverLetterCategorySubjects, jobId, '카테고리 분류가 중단되었습니다.');
    this.resumeCoverLetterCategoryAccumulated.delete(jobId);
  }

  cancelResumeCoverLetterRefinedTitleChannel(jobId: string): void {
    this.errorAndClose(this.resumeCoverLetterRefinedTitleSubjects, jobId, '제목 재작성이 중단되었습니다.');
    this.resumeCoverLetterRefinedTitleAccumulated.delete(jobId);
  }

  // ── 라이프사이클 ──────────────────────────────────────────────────────
  cleanupAll(): void {
    const allMaps: Map<string, Subject<MessageEvent>>[] = [
      this.summarySubjects, this.lightResearchSubjects, this.writeAssistSubjects,
      this.companyProfileSubjects, this.companyAnalysisSubjects, this.docParseSubjects,
      this.specAnalysisSubjects, this.techBlogTrendSubjects, this.paperSummarySubjects,
      this.paperTrendSubjects, this.newsArticleSummarySubjects,
      this.resumeCoverLetterCategorySubjects, this.resumeCoverLetterRefinedTitleSubjects,
    ];
    for (const map of allMaps) {
      for (const subject of map.values()) subject.complete();
    }
  }

  onExpiry(jobId: string): void {
    this.docParseAccumulated.delete(jobId);
    this.newsArticleSummaryAccumulated.delete(jobId);
    this.resumeCoverLetterCategoryAccumulated.delete(jobId);
    this.resumeCoverLetterRefinedTitleAccumulated.delete(jobId);
  }

  // ── 잡 실행 dispatch ─────────────────────────────────────────────────
  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
      const { aiResult, webSources } = await this.deepResearchExecutor.execute(
        job.sessionId, job.itemId, job.itemContent,
        job.CloudAIModel, job.webModel ?? SearchEngine.TAVILY,
        job.localAIModel || undefined, signal, job.filterModel,
      );
      return { result: aiResult, webSources };

    } else if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      const subject = this.lightResearchSubjects.get(job.sessionId);
      let lightTopic = job.itemContent;
      let lightAttachedFiles: AttachedFilePayload[] = [];
      try {
        const parsed = JSON.parse(job.itemContent) as { topic: string; attachedFiles?: AttachedFilePayload[] };
        lightTopic = parsed.topic;
        lightAttachedFiles = parsed.attachedFiles ?? [];
      } catch { /* 구형 포맷 */ }
      const { tasks } = await this.lightResearchExecutor.execute(
        job.sessionId, lightTopic, job.localAIModel, job.CloudAIModel,
        job.webModel ?? SearchEngine.TAVILY,
        (job.searchMode ?? PlannerMode.AUTO) as SearchModeInput,
        (event: LightResearchEvent) => {
          const acc = this.lightResearchAccumulated.get(job.sessionId) ?? [];
          acc.push(event);
          this.lightResearchAccumulated.set(job.sessionId, acc);
          subject?.next({ data: event });
        },
        lightAttachedFiles,
      );
      subject?.complete();
      this.lightResearchSubjects.delete(job.sessionId);
      this.lightResearchAccumulated.delete(job.sessionId);
      return { result: JSON.stringify(tasks) };

    } else if (job.taskType === QueueJob.TaskType.SUMMARY) {
      const subject = this.summarySubjects.get(job.sessionId);
      const fullText = await this.summaryExecutor.execute(job.sessionId, job.localAIModel, (chunk) => {
        this.summaryAccumulated.set(job.sessionId, (this.summaryAccumulated.get(job.sessionId) ?? '') + chunk);
        subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
      });
      subject?.next({ data: { type: SseEventType.DONE } });
      subject?.complete();
      this.summarySubjects.delete(job.sessionId);
      this.summaryAccumulated.delete(job.sessionId);
      return { result: fullText };

    } else if (QueueJob.isWriteAssist(job.taskType)) {
      const subject = this.writeAssistSubjects.get(job.jobId);
      const { content, ...extras } = JSON.parse(job.itemContent) as { content: string } & WriteAssistExtras;
      const fullText = await this.writeAssistExecutor.execute(
        job.taskType, content, job.CloudAIModel,
        (chunk) => {
          this.writeAssistAccumulated.set(job.jobId, (this.writeAssistAccumulated.get(job.jobId) ?? '') + chunk);
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        },
        signal, extras,
      );
      subject?.next({ data: { type: SseEventType.DONE } });
      subject?.complete();
      this.writeAssistSubjects.delete(job.jobId);
      this.writeAssistAccumulated.delete(job.jobId);
      return { result: fullText };

    } else if (job.taskType === QueueJob.TaskType.COMPANYPROFILE) {
      const subject = this.companyProfileSubjects.get(job.jobId);
      const { companyName } = JSON.parse(job.itemContent) as { companyName: string };
      const fullText = await this.companyProfileExecutor.execute(
        companyName, job.CloudAIModel,
        (chunk) => {
          this.companyProfileAccumulated.set(job.jobId, (this.companyProfileAccumulated.get(job.jobId) ?? '') + chunk);
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        },
        signal,
      );
      subject?.next({ data: { type: SseEventType.DONE } });
      subject?.complete();
      this.companyProfileSubjects.delete(job.jobId);
      this.companyProfileAccumulated.delete(job.jobId);
      return { result: fullText };

    } else if (job.taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      const subject = this.companyAnalysisSubjects.get(job.jobId);
      const { companyName } = JSON.parse(job.itemContent) as { companyName: string };
      const result = await this.companyAnalysisExecutor.execute(
        companyName, job.CloudAIModel,
        (event) => {
          const acc = this.companyAnalysisAccumulated.get(job.jobId) ?? [];
          acc.push(event);
          this.companyAnalysisAccumulated.set(job.jobId, acc);
          subject?.next({ data: event });
        },
        signal,
      );
      subject?.complete();
      this.companyAnalysisSubjects.delete(job.jobId);
      this.companyAnalysisAccumulated.delete(job.jobId);
      return { result: result ? JSON.stringify(result) : '' };

    } else if (job.taskType === QueueJob.TaskType.DOCPARSE_ASK || job.taskType === QueueJob.TaskType.DOCPARSE_ACTION) {
      const subject = this.docParseSubjects.get(job.jobId);
      const payload = JSON.parse(job.itemContent) as { docText?: string; question?: string; action?: string; pages?: string[] };
      const onChunk = (chunk: string) => {
        this.docParseAccumulated.set(job.jobId, (this.docParseAccumulated.get(job.jobId) ?? '') + chunk);
        subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
      };
      const fullText = job.taskType === QueueJob.TaskType.DOCPARSE_ASK
        ? await this.docParseExecutor.executeAsk(payload.docText ?? '', payload.question ?? '', job.CloudAIModel, onChunk, signal)
        : await this.docParseExecutor.executeAction(payload.action ?? '', payload.docText, payload.pages, job.CloudAIModel, onChunk, signal);
      subject?.next({ data: { type: SseEventType.DONE } });
      subject?.complete();
      this.docParseSubjects.delete(job.jobId);
      // accumulated 는 늦게 연결된 SSE 클라이언트를 위해 TTL 만료까지 보존
      return { result: fullText };

    } else if (job.taskType === QueueJob.TaskType.SPEC_ANALYSIS) {
      const subject = this.specAnalysisSubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as import('src/recruit/domain/cover-letter/cover-letter.model').CoverLetterJobAnalysisRequest;
      const result = await this.specAnalysisExecutor.execute(request, (message) => {
        subject?.next({ data: { type: SseEventType.LOG, message } });
      });
      subject?.next({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.specAnalysisSubjects.delete(job.jobId);
      return { result: JSON.stringify(result) };

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
      return { result: JSON.stringify(result) };

    } else if (job.taskType === QueueJob.TaskType.PAPER_SUMMARY) {
      const subject = this.paperSummarySubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as PaperSummaryRequest;
      subject?.next({ data: { type: SseEventType.LOG, message: '논문 AI 요약을 생성하는 중입니다.' } });
      const result = await this.paperSummaryExecutor.execute(request);
      subject?.next({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.paperSummarySubjects.delete(job.jobId);
      return { result: JSON.stringify(result) };

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
      return { result: JSON.stringify(trendResult) };

    } else if (job.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {
      const subject = this.newsArticleSummarySubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as NewsArticleSummaryRequest;
      subject?.next({ data: { type: SseEventType.LOG, message: '뉴스 본문을 확인하고 AI 요약을 생성하는 중입니다.' } });
      const fullText = await this.newsArticleSummaryExecutor.execute(request, (chunk) => {
        this.newsArticleSummaryAccumulated.set(job.jobId, (this.newsArticleSummaryAccumulated.get(job.jobId) ?? '') + chunk);
        subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
      }, signal);
      subject?.next({ data: { type: SseEventType.DONE, payload: { summary: fullText } } });
      subject?.complete();
      this.newsArticleSummarySubjects.delete(job.jobId);
      return { result: fullText };

    } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {
      const subject = this.resumeCoverLetterCategorySubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as ResumeCoverLetterCategoryRequest;
      const pushEvent = (event: MessageEvent) => {
        const acc = this.resumeCoverLetterCategoryAccumulated.get(job.jobId) ?? [];
        acc.push(event);
        this.resumeCoverLetterCategoryAccumulated.set(job.jobId, acc);
        subject?.next(event);
      };
      pushEvent({ data: { type: SseEventType.LOG, message: '자기소개서 카테고리 분류를 준비합니다.' } });
      const result = await this.resumeCoverLetterCategoryExecutor.execute(
        request,
        (message) => pushEvent({ data: { type: SseEventType.LOG, message } }),
        signal,
      );
      pushEvent({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.resumeCoverLetterCategorySubjects.delete(job.jobId);
      return { result: JSON.stringify(result) };

    } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE) {
      const subject = this.resumeCoverLetterRefinedTitleSubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as ResumeCoverLetterRefinedTitleRequest;
      const pushEvent = (event: MessageEvent) => {
        const acc = this.resumeCoverLetterRefinedTitleAccumulated.get(job.jobId) ?? [];
        acc.push(event);
        this.resumeCoverLetterRefinedTitleAccumulated.set(job.jobId, acc);
        subject?.next(event);
      };
      pushEvent({ data: { type: SseEventType.LOG, message: '자기소개서 제목 재작성을 준비합니다.' } });
      const refinedResult = await this.resumeCoverLetterRefinedTitleExecutor.execute(
        request,
        (message) => pushEvent({ data: { type: SseEventType.LOG, message } }),
        signal,
      );
      pushEvent({ data: { type: SseEventType.DONE, payload: refinedResult } });
      subject?.complete();
      this.resumeCoverLetterRefinedTitleSubjects.delete(job.jobId);
      return { result: JSON.stringify(refinedResult) };
    }

    return {};
  }

  // ── 에러 발생 시 해당 잡 타입 SSE 채널로 에러 전파 ───────────────────
  dispatchError(job: QueueJob, msg: string): void {
    if (job.taskType === QueueJob.TaskType.SUMMARY) {
      this.errorAndClose(this.summarySubjects, job.sessionId, msg);
      this.summaryAccumulated.delete(job.sessionId);
      this.sessionCommandService.updateSummaryState(job.sessionId, SummaryState.ERROR).catch(() => {});

    } else if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      this.errorAndClose(this.lightResearchSubjects, job.sessionId, msg);
      this.lightResearchAccumulated.delete(job.sessionId);

    } else if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
      this.sessionCommandService.updateSessionItem(job.sessionId, job.itemId, msg, '', ResearchState.ERROR).catch(() => {});
      this.sessionCommandService.updateSession(job.sessionId, ResearchState.ERROR).catch(() => {});
      this.sessionGateway.emitSessionUpdate(job.sessionId).catch(() => {});

    } else if (QueueJob.isWriteAssist(job.taskType)) {
      this.errorAndClose(this.writeAssistSubjects, job.jobId, msg);
      this.writeAssistAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.COMPANYPROFILE) {
      this.errorAndClose(this.companyProfileSubjects, job.jobId, msg);
      this.companyProfileAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      const s = this.companyAnalysisSubjects.get(job.jobId);
      s?.next({ data: { type: 'error', message: msg } }); s?.complete();
      this.companyAnalysisSubjects.delete(job.jobId);
      this.companyAnalysisAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.DOCPARSE_ASK || job.taskType === QueueJob.TaskType.DOCPARSE_ACTION) {
      this.errorAndClose(this.docParseSubjects, job.jobId, msg);
      this.docParseAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.SPEC_ANALYSIS) {
      this.errorAndClose(this.specAnalysisSubjects, job.jobId, msg);

    } else if (job.taskType === QueueJob.TaskType.TECH_BLOG_TREND) {
      this.errorAndClose(this.techBlogTrendSubjects, job.jobId, msg);
      this.techBlogTrendAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.PAPER_SUMMARY) {
      this.errorAndClose(this.paperSummarySubjects, job.jobId, msg);

    } else if (job.taskType === QueueJob.TaskType.PAPER_TREND) {
      this.errorAndClose(this.paperTrendSubjects, job.jobId, msg);
      this.paperTrendAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {
      this.errorAndClose(this.newsArticleSummarySubjects, job.jobId, msg);
      this.newsArticleSummaryAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {
      this.errorAndClose(this.resumeCoverLetterCategorySubjects, job.jobId, msg);
      this.resumeCoverLetterCategoryAccumulated.delete(job.jobId);

    } else if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE) {
      this.errorAndClose(this.resumeCoverLetterRefinedTitleSubjects, job.jobId, msg);
      this.resumeCoverLetterRefinedTitleAccumulated.delete(job.jobId);
    }
  }

  private errorAndClose(map: Map<string, Subject<MessageEvent>>, key: string, msg: string): void {
    const subject = map.get(key);
    subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
    subject?.complete();
    map.delete(key);
  }
}
