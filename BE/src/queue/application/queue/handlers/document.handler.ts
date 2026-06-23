import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable, of, concat } from 'rxjs';
import { BaseJobHandler, JobResult } from './base-job-handler';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import { DocParseExecutor } from 'src/queue/application/job/doc-parse.executor';
import { SpecAnalysisExecutor } from 'src/queue/application/job/spec-analysis.executor';
import { CoverLetterJobAnalysisRequest } from 'src/recruit/domain/cover-letter/cover-letter.model';

@Injectable()
export class DocumentHandler extends BaseJobHandler {
  readonly taskTypes = [
    QueueJob.TaskType.DOCPARSE_ASK,
    QueueJob.TaskType.DOCPARSE_ACTION,
    QueueJob.TaskType.SPEC_ANALYSIS,
  ] as const;

  private docParseSubjects = new Map<string, Subject<MessageEvent>>();
  private docParseAccumulated = new Map<string, string>();
  private specAnalysisSubjects = new Map<string, Subject<MessageEvent>>();

  constructor(
    private readonly docParseExecutor: DocParseExecutor,
    private readonly specAnalysisExecutor: SpecAnalysisExecutor,
  ) {
    super();
  }

  setupChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (
      taskType === QueueJob.TaskType.DOCPARSE_ASK ||
      taskType === QueueJob.TaskType.DOCPARSE_ACTION
    ) {
      this.docParseSubjects.set(channelId, new Subject<MessageEvent>());
      this.docParseAccumulated.set(channelId, '');
    } else if (taskType === QueueJob.TaskType.SPEC_ANALYSIS) {
      this.specAnalysisSubjects.set(channelId, new Subject<MessageEvent>());
    }
  }

  getStream(
    channelId: string,
    taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    if (
      taskType === QueueJob.TaskType.DOCPARSE_ASK ||
      taskType === QueueJob.TaskType.DOCPARSE_ACTION
    ) {
      const subject = this.docParseSubjects.get(channelId);
      const accumulated = this.docParseAccumulated.get(channelId) ?? '';
      if (!subject) {
        // 잡 완료 후 늦게 연결한 클라이언트를 위해 accumulated TTL 만료까지 보존
        return accumulated
          ? of(
              {
                data: { type: SseEventType.CHUNK, text: accumulated },
              } as MessageEvent,
              { data: { type: SseEventType.DONE } } as MessageEvent,
            )
          : null;
      }
      return accumulated
        ? concat(
            of({
              data: { type: SseEventType.CHUNK, text: accumulated },
            } as MessageEvent),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    if (taskType === QueueJob.TaskType.SPEC_ANALYSIS) {
      return this.specAnalysisSubjects.get(channelId) ?? null;
    }
    return null;
  }

  cancelChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (
      taskType === QueueJob.TaskType.DOCPARSE_ASK ||
      taskType === QueueJob.TaskType.DOCPARSE_ACTION
    ) {
      this.errorAndClose(
        this.docParseSubjects,
        channelId,
        '작업이 중단되었습니다.',
      );
      this.docParseAccumulated.delete(channelId);
    } else if (taskType === QueueJob.TaskType.SPEC_ANALYSIS) {
      this.errorAndClose(
        this.specAnalysisSubjects,
        channelId,
        '작업이 중단되었습니다.',
      );
    }
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    if (
      job.taskType === QueueJob.TaskType.DOCPARSE_ASK ||
      job.taskType === QueueJob.TaskType.DOCPARSE_ACTION
    ) {
      const subject = this.docParseSubjects.get(job.jobId);
      const payload = JSON.parse(job.itemContent) as {
        docText?: string;
        question?: string;
        action?: string;
        pages?: string[];
      };
      const onChunk = (chunk: string) => {
        this.docParseAccumulated.set(
          job.jobId,
          (this.docParseAccumulated.get(job.jobId) ?? '') + chunk,
        );
        subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
      };
      const fullText =
        job.taskType === QueueJob.TaskType.DOCPARSE_ASK
          ? await this.docParseExecutor.executeAsk(
              payload.docText ?? '',
              payload.question ?? '',
              job.CloudAIModel,
              onChunk,
              signal,
            )
          : await this.docParseExecutor.executeAction(
              payload.action ?? '',
              payload.docText,
              payload.pages,
              job.CloudAIModel,
              onChunk,
              signal,
            );
      subject?.next({ data: { type: SseEventType.DONE } });
      subject?.complete();
      this.docParseSubjects.delete(job.jobId);
      // accumulated는 TTL 만료까지 보존 (늦게 연결한 SSE 클라이언트 대응)
      return { result: fullText };
    }

    if (job.taskType === QueueJob.TaskType.SPEC_ANALYSIS) {
      const subject = this.specAnalysisSubjects.get(job.jobId);
      const request = JSON.parse(
        job.itemContent,
      ) as CoverLetterJobAnalysisRequest;
      const result = await this.specAnalysisExecutor.execute(
        request,
        (message) => {
          subject?.next({ data: { type: SseEventType.LOG, message } });
        },
      );
      subject?.next({ data: { type: SseEventType.DONE, payload: result } });
      subject?.complete();
      this.specAnalysisSubjects.delete(job.jobId);
      return { result: JSON.stringify(result) };
    }

    return {};
  }

  dispatchError(job: QueueJob, msg: string): void {
    if (
      job.taskType === QueueJob.TaskType.DOCPARSE_ASK ||
      job.taskType === QueueJob.TaskType.DOCPARSE_ACTION
    ) {
      this.errorAndClose(this.docParseSubjects, job.jobId, msg);
      this.docParseAccumulated.delete(job.jobId);
    } else if (job.taskType === QueueJob.TaskType.SPEC_ANALYSIS) {
      this.errorAndClose(this.specAnalysisSubjects, job.jobId, msg);
    }
  }

  cleanupAll(): void {
    for (const s of this.docParseSubjects.values()) s.complete();
    for (const s of this.specAnalysisSubjects.values()) s.complete();
  }

  onExpiry(jobId: string): void {
    this.docParseAccumulated.delete(jobId);
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
