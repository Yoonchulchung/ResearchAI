import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable, of, concat, from } from 'rxjs';
import { BaseJobHandler, JobResult } from './base-job-handler';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import {
  ResumeCoverLetterCategoryExecutor,
  ResumeCoverLetterCategoryRequest,
} from 'src/queue/application/job/resume-cover-letter-category.executor';
import {
  ResumeCoverLetterRefinedTitleExecutor,
  ResumeCoverLetterRefinedTitleRequest,
} from 'src/queue/application/job/resume-cover-letter-refined-title.executor';

@Injectable()
export class ResumeHandler extends BaseJobHandler {
  readonly taskTypes = [
    QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY,
    QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE,
  ] as const;

  private categorySubjects = new Map<string, Subject<MessageEvent>>();
  private categoryAccumulated = new Map<string, MessageEvent[]>();

  private refinedTitleSubjects = new Map<string, Subject<MessageEvent>>();
  private refinedTitleAccumulated = new Map<string, MessageEvent[]>();

  constructor(
    private readonly categoryExecutor: ResumeCoverLetterCategoryExecutor,
    private readonly refinedTitleExecutor: ResumeCoverLetterRefinedTitleExecutor,
  ) {
    super();
  }

  setupChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {
      this.categorySubjects.set(channelId, new Subject<MessageEvent>());
      this.categoryAccumulated.set(channelId, []);
    } else if (
      taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE
    ) {
      this.refinedTitleSubjects.set(channelId, new Subject<MessageEvent>());
      this.refinedTitleAccumulated.set(channelId, []);
    }
  }

  getStream(
    channelId: string,
    taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    if (taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {
      const subject = this.categorySubjects.get(channelId);
      const acc = this.categoryAccumulated.get(channelId) ?? [];
      if (!subject) {
        return acc.length > 0
          ? concat(
              from(acc),
              of({ data: { type: SseEventType.DONE } } as MessageEvent),
            )
          : null;
      }
      return acc.length > 0
        ? concat(from(acc), subject.asObservable())
        : subject.asObservable();
    }
    if (taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE) {
      const subject = this.refinedTitleSubjects.get(channelId);
      const acc = this.refinedTitleAccumulated.get(channelId) ?? [];
      if (!subject) {
        return acc.length > 0
          ? concat(
              from(acc),
              of({ data: { type: SseEventType.DONE } } as MessageEvent),
            )
          : null;
      }
      return acc.length > 0
        ? concat(from(acc), subject.asObservable())
        : subject.asObservable();
    }
    return null;
  }

  cancelChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {
      this.errorAndClose(
        this.categorySubjects,
        channelId,
        '카테고리 분류가 중단되었습니다.',
      );
      this.categoryAccumulated.delete(channelId);
    } else if (
      taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE
    ) {
      this.errorAndClose(
        this.refinedTitleSubjects,
        channelId,
        '제목 재작성이 중단되었습니다.',
      );
      this.refinedTitleAccumulated.delete(channelId);
    }
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {
      const subject = this.categorySubjects.get(job.jobId);
      const request = JSON.parse(
        job.itemContent,
      ) as ResumeCoverLetterCategoryRequest;
      const pushEvent = (event: MessageEvent) => {
        const acc = this.categoryAccumulated.get(job.jobId) ?? [];
        acc.push(event);
        this.categoryAccumulated.set(job.jobId, acc);
        subject?.next(event);
      };
      pushEvent({
        data: {
          type: SseEventType.LOG,
          message: '자기소개서 카테고리 분류를 준비합니다.',
        },
      });
      const result = await this.categoryExecutor.execute(
        request,
        (message) => pushEvent({ data: { type: SseEventType.LOG, message } }),
        signal,
      );
      pushEvent({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.categorySubjects.delete(job.jobId);
      return { result: JSON.stringify(result) };
    }

    if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE) {
      const subject = this.refinedTitleSubjects.get(job.jobId);
      const request = JSON.parse(
        job.itemContent,
      ) as ResumeCoverLetterRefinedTitleRequest;
      const pushEvent = (event: MessageEvent) => {
        const acc = this.refinedTitleAccumulated.get(job.jobId) ?? [];
        acc.push(event);
        this.refinedTitleAccumulated.set(job.jobId, acc);
        subject?.next(event);
      };
      pushEvent({
        data: {
          type: SseEventType.LOG,
          message: '자기소개서 제목 재작성을 준비합니다.',
        },
      });
      const result = await this.refinedTitleExecutor.execute(
        request,
        (message) => pushEvent({ data: { type: SseEventType.LOG, message } }),
        signal,
      );
      pushEvent({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.refinedTitleSubjects.delete(job.jobId);
      return { result: JSON.stringify(result) };
    }

    return {};
  }

  dispatchError(job: QueueJob, msg: string): void {
    if (job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY) {
      this.errorAndClose(this.categorySubjects, job.jobId, msg);
      this.categoryAccumulated.delete(job.jobId);
    } else if (
      job.taskType === QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE
    ) {
      this.errorAndClose(this.refinedTitleSubjects, job.jobId, msg);
      this.refinedTitleAccumulated.delete(job.jobId);
    }
  }

  cleanupAll(): void {
    for (const s of this.categorySubjects.values()) s.complete();
    for (const s of this.refinedTitleSubjects.values()) s.complete();
  }

  onExpiry(jobId: string): void {
    this.categoryAccumulated.delete(jobId);
    this.refinedTitleAccumulated.delete(jobId);
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
