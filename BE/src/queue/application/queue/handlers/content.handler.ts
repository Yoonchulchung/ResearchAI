import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable, of, concat } from 'rxjs';
import { BaseJobHandler, JobResult } from './base-job-handler';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import {
  TechBlogTrendExecutor,
  TechBlogTrendRequest,
} from 'src/queue/application/job/tech-blog-trend.executor';
import {
  PaperSummaryExecutor,
  PaperSummaryRequest,
} from 'src/queue/application/job/paper-summary.executor';
import {
  PaperTrendExecutor,
  PaperTrendRequest,
} from 'src/queue/application/job/paper-trend.executor';
import {
  NewsArticleSummaryExecutor,
  NewsArticleSummaryRequest,
} from 'src/queue/application/job/news-article-summary.executor';

@Injectable()
export class ContentHandler extends BaseJobHandler {
  readonly taskTypes = [
    QueueJob.TaskType.TECH_BLOG_TREND,
    QueueJob.TaskType.PAPER_SUMMARY,
    QueueJob.TaskType.PAPER_TREND,
    QueueJob.TaskType.NEWS_ARTICLE_SUMMARY,
  ] as const;

  private techBlogSubjects = new Map<string, Subject<MessageEvent>>();
  private techBlogAccumulated = new Map<string, string>();

  private paperSummarySubjects = new Map<string, Subject<MessageEvent>>();

  private paperTrendSubjects = new Map<string, Subject<MessageEvent>>();
  private paperTrendAccumulated = new Map<string, string>();

  private newsArticleSubjects = new Map<string, Subject<MessageEvent>>();
  private newsArticleAccumulated = new Map<string, string>();

  constructor(
    private readonly techBlogExecutor: TechBlogTrendExecutor,
    private readonly paperSummaryExecutor: PaperSummaryExecutor,
    private readonly paperTrendExecutor: PaperTrendExecutor,
    private readonly newsArticleExecutor: NewsArticleSummaryExecutor,
  ) {
    super();
  }

  setupChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.TECH_BLOG_TREND) {
      this.techBlogSubjects.set(channelId, new Subject<MessageEvent>());
      this.techBlogAccumulated.set(channelId, '');
    } else if (taskType === QueueJob.TaskType.PAPER_SUMMARY) {
      this.paperSummarySubjects.set(channelId, new Subject<MessageEvent>());
    } else if (taskType === QueueJob.TaskType.PAPER_TREND) {
      this.paperTrendSubjects.set(channelId, new Subject<MessageEvent>());
      this.paperTrendAccumulated.set(channelId, '');
    } else if (taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {
      this.newsArticleSubjects.set(channelId, new Subject<MessageEvent>());
      this.newsArticleAccumulated.set(channelId, '');
    }
  }

  getStream(
    channelId: string,
    taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    if (taskType === QueueJob.TaskType.TECH_BLOG_TREND) {
      const subject = this.techBlogSubjects.get(channelId);
      if (!subject) return null;
      const acc = this.techBlogAccumulated.get(channelId) ?? '';
      return acc
        ? concat(
            of({
              data: { type: SseEventType.CHUNK, text: acc },
            } as MessageEvent),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    if (taskType === QueueJob.TaskType.PAPER_SUMMARY) {
      return this.paperSummarySubjects.get(channelId) ?? null;
    }
    if (taskType === QueueJob.TaskType.PAPER_TREND) {
      const subject = this.paperTrendSubjects.get(channelId);
      if (!subject) return null;
      const acc = this.paperTrendAccumulated.get(channelId) ?? '';
      return acc
        ? concat(
            of({
              data: { type: SseEventType.CHUNK, text: acc },
            } as MessageEvent),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    if (taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {
      const subject = this.newsArticleSubjects.get(channelId);
      const acc = this.newsArticleAccumulated.get(channelId) ?? '';
      if (!subject) {
        return acc
          ? of(
              { data: { type: SseEventType.CHUNK, text: acc } } as MessageEvent,
              { data: { type: SseEventType.DONE } } as MessageEvent,
            )
          : null;
      }
      return acc
        ? concat(
            of({
              data: { type: SseEventType.CHUNK, text: acc },
            } as MessageEvent),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    return null;
  }

  cancelChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.TECH_BLOG_TREND) {
      this.errorAndClose(
        this.techBlogSubjects,
        channelId,
        '작업이 중단되었습니다.',
      );
      this.techBlogAccumulated.delete(channelId);
    } else if (taskType === QueueJob.TaskType.PAPER_SUMMARY) {
      this.errorAndClose(
        this.paperSummarySubjects,
        channelId,
        '작업이 중단되었습니다.',
      );
    } else if (taskType === QueueJob.TaskType.PAPER_TREND) {
      this.errorAndClose(
        this.paperTrendSubjects,
        channelId,
        '작업이 중단되었습니다.',
      );
      this.paperTrendAccumulated.delete(channelId);
    } else if (taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {
      this.errorAndClose(
        this.newsArticleSubjects,
        channelId,
        '뉴스 요약이 중단되었습니다.',
      );
      this.newsArticleAccumulated.delete(channelId);
    }
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    if (job.taskType === QueueJob.TaskType.TECH_BLOG_TREND) {
      const subject = this.techBlogSubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as TechBlogTrendRequest;
      const result = await this.techBlogExecutor.execute(request, (chunk) => {
        this.techBlogAccumulated.set(
          job.jobId,
          (this.techBlogAccumulated.get(job.jobId) ?? '') + chunk,
        );
        subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
      });
      subject?.next({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.techBlogSubjects.delete(job.jobId);
      this.techBlogAccumulated.delete(job.jobId);
      return { result: JSON.stringify(result) };
    }

    if (job.taskType === QueueJob.TaskType.PAPER_SUMMARY) {
      const subject = this.paperSummarySubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as PaperSummaryRequest;
      subject?.next({
        data: {
          type: SseEventType.LOG,
          message: '논문 AI 요약을 생성하는 중입니다.',
        },
      });
      const result = await this.paperSummaryExecutor.execute(request);
      subject?.next({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.paperSummarySubjects.delete(job.jobId);
      return { result: JSON.stringify(result) };
    }

    if (job.taskType === QueueJob.TaskType.PAPER_TREND) {
      const subject = this.paperTrendSubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as PaperTrendRequest;
      const result = await this.paperTrendExecutor.execute(request, (chunk) => {
        this.paperTrendAccumulated.set(
          job.jobId,
          (this.paperTrendAccumulated.get(job.jobId) ?? '') + chunk,
        );
        subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
      });
      subject?.next({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.paperTrendSubjects.delete(job.jobId);
      this.paperTrendAccumulated.delete(job.jobId);
      return { result: JSON.stringify(result) };
    }

    if (job.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {
      const subject = this.newsArticleSubjects.get(job.jobId);
      const request = JSON.parse(job.itemContent) as NewsArticleSummaryRequest;
      subject?.next({
        data: {
          type: SseEventType.LOG,
          message: '뉴스 본문을 확인하고 AI 요약을 생성하는 중입니다.',
        },
      });
      const fullText = await this.newsArticleExecutor.execute(
        request,
        (chunk) => {
          this.newsArticleAccumulated.set(
            job.jobId,
            (this.newsArticleAccumulated.get(job.jobId) ?? '') + chunk,
          );
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        },
        signal,
      );
      subject?.next({
        data: { type: SseEventType.DONE, payload: { summary: fullText } },
      });
      subject?.complete();
      this.newsArticleSubjects.delete(job.jobId);
      // accumulated는 TTL 만료까지 보존
      return { result: fullText };
    }

    return {};
  }

  dispatchError(job: QueueJob, msg: string): void {
    if (job.taskType === QueueJob.TaskType.TECH_BLOG_TREND) {
      this.errorAndClose(this.techBlogSubjects, job.jobId, msg);
      this.techBlogAccumulated.delete(job.jobId);
    } else if (job.taskType === QueueJob.TaskType.PAPER_SUMMARY) {
      this.errorAndClose(this.paperSummarySubjects, job.jobId, msg);
    } else if (job.taskType === QueueJob.TaskType.PAPER_TREND) {
      this.errorAndClose(this.paperTrendSubjects, job.jobId, msg);
      this.paperTrendAccumulated.delete(job.jobId);
    } else if (job.taskType === QueueJob.TaskType.NEWS_ARTICLE_SUMMARY) {
      this.errorAndClose(this.newsArticleSubjects, job.jobId, msg);
      this.newsArticleAccumulated.delete(job.jobId);
    }
  }

  cleanupAll(): void {
    for (const s of this.techBlogSubjects.values()) s.complete();
    for (const s of this.paperSummarySubjects.values()) s.complete();
    for (const s of this.paperTrendSubjects.values()) s.complete();
    for (const s of this.newsArticleSubjects.values()) s.complete();
  }

  onExpiry(jobId: string): void {
    this.newsArticleAccumulated.delete(jobId);
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
