import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, ReplaySubject, Observable, of, concat, from } from 'rxjs';
import { BaseJobHandler, JobResult } from './base-job-handler';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import { CompanyAnalysisProgress } from 'src/company/domain/company-analysis.types';
import { CompanyProfileExecutor } from 'src/queue/application/job/company-profile.executor';
import { CompanyAnalysisExecutor } from 'src/queue/application/job/company-analysis.executor';
import { CompanyNewsService } from 'src/company/application/company-news.service';

@Injectable()
export class CompanyHandler extends BaseJobHandler {
  readonly taskTypes = [
    QueueJob.TaskType.COMPANYPROFILE,
    QueueJob.TaskType.COMPANYANALYSIS,
    QueueJob.TaskType.ROADMAP_ANALYSIS,
    QueueJob.TaskType.BULK_FETCH_NEWS,
  ] as const;

  private profileSubjects = new Map<string, Subject<MessageEvent>>();
  private profileAccumulated = new Map<string, string>();

  private analysisSubjects = new Map<string, Subject<MessageEvent>>();
  private analysisAccumulated = new Map<string, CompanyAnalysisProgress[]>();

  // ReplaySubject — 잡 완료 후 늦게 구독해도 과거 이벤트 재생
  private roadmapSubjects = new Map<string, ReplaySubject<MessageEvent>>();
  private bulkFetchSubjects = new Map<string, ReplaySubject<MessageEvent>>();

  constructor(
    private readonly profileExecutor: CompanyProfileExecutor,
    private readonly analysisExecutor: CompanyAnalysisExecutor,
    private readonly companyNews: CompanyNewsService,
  ) {
    super();
  }

  setupChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.COMPANYPROFILE) {
      this.profileSubjects.set(channelId, new Subject<MessageEvent>());
      this.profileAccumulated.set(channelId, '');
    } else if (taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      this.analysisSubjects.set(channelId, new Subject<MessageEvent>());
      this.analysisAccumulated.set(channelId, []);
    } else if (taskType === QueueJob.TaskType.ROADMAP_ANALYSIS) {
      this.roadmapSubjects.set(channelId, new ReplaySubject<MessageEvent>(100));
    } else if (taskType === QueueJob.TaskType.BULK_FETCH_NEWS) {
      this.bulkFetchSubjects.set(
        channelId,
        new ReplaySubject<MessageEvent>(100),
      );
    }
  }

  getStream(
    channelId: string,
    taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    if (taskType === QueueJob.TaskType.COMPANYPROFILE) {
      const subject = this.profileSubjects.get(channelId);
      if (!subject) return null;
      const acc = this.profileAccumulated.get(channelId) ?? '';
      return acc
        ? concat(
            of({
              data: { type: SseEventType.CHUNK, text: acc },
            } as MessageEvent),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    if (taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      const subject = this.analysisSubjects.get(channelId);
      if (!subject) return null;
      const acc = this.analysisAccumulated.get(channelId) ?? [];
      return acc.length > 0
        ? concat(
            from(acc.map((e) => ({ data: e }) as MessageEvent)),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    if (taskType === QueueJob.TaskType.ROADMAP_ANALYSIS) {
      return this.roadmapSubjects.get(channelId) ?? null;
    }
    if (taskType === QueueJob.TaskType.BULK_FETCH_NEWS) {
      return this.bulkFetchSubjects.get(channelId) ?? null;
    }
    return null;
  }

  cancelChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.COMPANYPROFILE) {
      this.errorAndClose(
        this.profileSubjects,
        channelId,
        '작업이 중단되었습니다.',
      );
      this.profileAccumulated.delete(channelId);
    } else if (taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      const s = this.analysisSubjects.get(channelId);
      s?.next({
        data: { type: 'error', message: '기업 분석이 중단되었습니다.' },
      });
      s?.complete();
      this.analysisSubjects.delete(channelId);
      this.analysisAccumulated.delete(channelId);
    } else if (taskType === QueueJob.TaskType.ROADMAP_ANALYSIS) {
      const s = this.roadmapSubjects.get(channelId);
      s?.next({ data: { type: 'error', message: '취소되었습니다.' } });
      s?.complete();
      this.roadmapSubjects.delete(channelId);
    } else if (taskType === QueueJob.TaskType.BULK_FETCH_NEWS) {
      const s = this.bulkFetchSubjects.get(channelId);
      s?.next({ data: { type: 'error', message: '취소되었습니다.' } });
      s?.complete();
      this.bulkFetchSubjects.delete(channelId);
    }
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    if (job.taskType === QueueJob.TaskType.COMPANYPROFILE) {
      const subject = this.profileSubjects.get(job.jobId);
      const { companyName } = JSON.parse(job.itemContent) as {
        companyName: string;
      };
      const fullText = await this.profileExecutor.execute(
        companyName,
        job.CloudAIModel,
        (chunk) => {
          this.profileAccumulated.set(
            job.jobId,
            (this.profileAccumulated.get(job.jobId) ?? '') + chunk,
          );
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        },
        signal,
      );
      subject?.next({ data: { type: SseEventType.DONE } });
      subject?.complete();
      this.profileSubjects.delete(job.jobId);
      this.profileAccumulated.delete(job.jobId);
      return { result: fullText };
    }

    if (job.taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      const subject = this.analysisSubjects.get(job.jobId);
      const { companyName } = JSON.parse(job.itemContent) as {
        companyName: string;
      };
      const result = await this.analysisExecutor.execute(
        companyName,
        job.CloudAIModel,
        (event) => {
          const acc = this.analysisAccumulated.get(job.jobId) ?? [];
          acc.push(event);
          this.analysisAccumulated.set(job.jobId, acc);
          subject?.next({ data: event });
        },
        signal,
      );
      subject?.complete();
      this.analysisSubjects.delete(job.jobId);
      this.analysisAccumulated.delete(job.jobId);
      return { result: result ? JSON.stringify(result) : '' };
    }

    if (job.taskType === QueueJob.TaskType.ROADMAP_ANALYSIS) {
      const subject = this.roadmapSubjects.get(job.jobId);
      const { companyId, companyName, incremental } = JSON.parse(
        job.itemContent,
      ) as { companyId: string; companyName: string; incremental?: boolean };
      subject?.next({
        data: { type: 'log', message: '사업 로드맵 분석 중...' },
      });
      const result = await this.companyNews.analyzeTimeline(
        companyId,
        companyName,
        job.CloudAIModel,
        incremental ?? false,
      );
      if (!signal.aborted) {
        subject?.next({ data: { type: 'done', result } });
        subject?.complete();
        // ReplaySubject는 onExpiry()에서 TTL 만료 후 정리 — 늦은 SSE 구독에도 재생 가능
      }
      return { result: result ? JSON.stringify(result) : '' };
    }

    if (job.taskType === QueueJob.TaskType.BULK_FETCH_NEWS) {
      const subject = this.bulkFetchSubjects.get(job.jobId);
      const { companyId, companyName, round } = JSON.parse(job.itemContent) as {
        companyId: string;
        companyName: string;
        round: number;
      };
      subject?.next({ data: { type: 'log', message: '뉴스 수집 중...' } });
      const result = await this.companyNews.bulkFetchAndSaveNews(
        companyId,
        companyName,
        round ?? 0,
      );
      if (!signal.aborted) {
        subject?.next({ data: { type: 'done', result } });
        subject?.complete();
      }
      return { result: JSON.stringify(result) };
    }

    return {};
  }

  dispatchError(job: QueueJob, msg: string): void {
    if (job.taskType === QueueJob.TaskType.COMPANYPROFILE) {
      this.errorAndClose(this.profileSubjects, job.jobId, msg);
      this.profileAccumulated.delete(job.jobId);
    } else if (job.taskType === QueueJob.TaskType.COMPANYANALYSIS) {
      const s = this.analysisSubjects.get(job.jobId);
      s?.next({ data: { type: 'error', message: msg } });
      s?.complete();
      this.analysisSubjects.delete(job.jobId);
      this.analysisAccumulated.delete(job.jobId);
    } else if (job.taskType === QueueJob.TaskType.ROADMAP_ANALYSIS) {
      const s = this.roadmapSubjects.get(job.jobId);
      s?.next({ data: { type: 'error', message: msg } });
      s?.complete();
      this.roadmapSubjects.delete(job.jobId);
    } else if (job.taskType === QueueJob.TaskType.BULK_FETCH_NEWS) {
      const s = this.bulkFetchSubjects.get(job.jobId);
      s?.next({ data: { type: 'error', message: msg } });
      s?.complete();
      this.bulkFetchSubjects.delete(job.jobId);
    }
  }

  cleanupAll(): void {
    for (const s of this.profileSubjects.values()) s.complete();
    for (const s of this.analysisSubjects.values()) s.complete();
    for (const s of this.roadmapSubjects.values()) s.complete();
    for (const s of this.bulkFetchSubjects.values()) s.complete();
  }

  onExpiry(jobId: string): void {
    this.roadmapSubjects.delete(jobId);
    this.bulkFetchSubjects.delete(jobId);
  }

  private errorAndClose(
    map: Map<string, Subject<MessageEvent>>,
    key: string,
    msg: string,
  ): void {
    const subject = map.get(key);
    subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
    subject?.complete();
    map.delete(key);
  }
}
