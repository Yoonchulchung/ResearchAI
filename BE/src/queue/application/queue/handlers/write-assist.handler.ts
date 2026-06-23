import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable, of, concat } from 'rxjs';
import { BaseJobHandler, JobResult } from './base-job-handler';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import {
  WriteAssistExecutor,
  WriteAssistExtras,
} from 'src/queue/application/job/write-assist/write-assist.executor';

@Injectable()
export class WriteAssistHandler extends BaseJobHandler {
  readonly taskTypes = [
    QueueJob.TaskType.WRITEASSIST,
    QueueJob.TaskType.WRITEASSIST_EVALUATE,
    QueueJob.TaskType.WRITEASSIST_PLAGIARISM,
    QueueJob.TaskType.WRITEASSIST_CONTINUE,
    QueueJob.TaskType.WRITEASSIST_SECTION,
    QueueJob.TaskType.WRITEASSIST_IMPROVE,
    QueueJob.TaskType.WRITEASSIST_SPELLCHECK,
    QueueJob.TaskType.WRITEASSIST_SUMMARIZE,
    QueueJob.TaskType.WRITEASSIST_EXAMPLE,
    QueueJob.TaskType.WRITEASSIST_JD_EVALUATE,
  ] as const;

  private subjects = new Map<string, Subject<MessageEvent>>();
  private accumulated = new Map<string, string>();

  constructor(private readonly executor: WriteAssistExecutor) {
    super();
  }

  setupChannel(channelId: string, _taskType: QueueJob.TaskType): void {
    this.subjects.set(channelId, new Subject<MessageEvent>());
    this.accumulated.set(channelId, '');
  }

  getStream(
    channelId: string,
    _taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    const subject = this.subjects.get(channelId);
    if (!subject) return null;
    const acc = this.accumulated.get(channelId) ?? '';
    return acc
      ? concat(
          of({ data: { type: SseEventType.CHUNK, text: acc } } as MessageEvent),
          subject.asObservable(),
        )
      : subject.asObservable();
  }

  cancelChannel(channelId: string, _taskType: QueueJob.TaskType): void {
    this.errorAndClose(channelId, '작업이 중단되었습니다.');
    this.accumulated.delete(channelId);
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    const subject = this.subjects.get(job.jobId);
    const { content, ...extras } = JSON.parse(job.itemContent) as {
      content: string;
    } & WriteAssistExtras;
    const fullText = await this.executor.execute(
      job.taskType,
      content,
      job.CloudAIModel,
      (chunk) => {
        this.accumulated.set(
          job.jobId,
          (this.accumulated.get(job.jobId) ?? '') + chunk,
        );
        subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
      },
      signal,
      extras,
    );
    subject?.next({ data: { type: SseEventType.DONE } });
    subject?.complete();
    this.subjects.delete(job.jobId);
    this.accumulated.delete(job.jobId);
    return { result: fullText };
  }

  dispatchError(job: QueueJob, msg: string): void {
    this.errorAndClose(job.jobId, msg);
    this.accumulated.delete(job.jobId);
  }

  cleanupAll(): void {
    for (const s of this.subjects.values()) s.complete();
  }

  private errorAndClose(key: string, msg: string): void {
    const subject = this.subjects.get(key);
    subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
    subject?.complete();
    this.subjects.delete(key);
  }
}
