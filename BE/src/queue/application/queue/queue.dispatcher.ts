import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { QueueJob } from 'src/queue/domain/queue-job.model';
import { BaseJobHandler, JobResult } from './handlers/base-job-handler';
import { ResearchHandler } from './handlers/research.handler';
import { WriteAssistHandler } from './handlers/write-assist.handler';
import { CompanyHandler } from './handlers/company.handler';
import { DocumentHandler } from './handlers/document.handler';
import { ContentHandler } from './handlers/content.handler';
import { ResumeHandler } from './handlers/resume.handler';
import { ImageHandler } from './handlers/image.handler';

/**
 * 잡 타입 → 핸들러 라우팅.
 * 새 잡 카테고리 추가 시 핸들러 파일을 만들고 이곳 registry에 등록하면 된다.
 */
@Injectable()
export class QueueDispatcher {
  private readonly registry = new Map<QueueJob.TaskType, BaseJobHandler>();

  constructor(
    readonly research: ResearchHandler,
    readonly writeAssist: WriteAssistHandler,
    readonly company: CompanyHandler,
    readonly document: DocumentHandler,
    readonly content: ContentHandler,
    readonly resume: ResumeHandler,
    readonly image: ImageHandler,
  ) {
    for (const handler of [
      research,
      writeAssist,
      company,
      document,
      content,
      resume,
      image,
    ]) {
      for (const type of handler.taskTypes) {
        this.registry.set(type, handler);
      }
    }
  }

  setupChannel(channelId: string, taskType: QueueJob.TaskType): void {
    this.registry.get(taskType)?.setupChannel(channelId, taskType);
  }

  getStream(
    channelId: string,
    taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    return this.registry.get(taskType)?.getStream(channelId, taskType) ?? null;
  }

  cancelChannel(channelId: string, taskType: QueueJob.TaskType): void {
    this.registry.get(taskType)?.cancelChannel(channelId, taskType);
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    return this.registry.get(job.taskType)?.execute(job, signal) ?? {};
  }

  dispatchError(job: QueueJob, msg: string): void {
    this.registry.get(job.taskType)?.dispatchError(job, msg);
  }

  cleanupAll(): void {
    const seen = new Set<BaseJobHandler>();
    for (const handler of this.registry.values()) {
      if (!seen.has(handler)) {
        handler.cleanupAll();
        seen.add(handler);
      }
    }
  }

  onExpiry(jobId: string): void {
    const seen = new Set<BaseJobHandler>();
    for (const handler of this.registry.values()) {
      if (!seen.has(handler)) {
        handler.onExpiry(jobId);
        seen.add(handler);
      }
    }
  }
}
