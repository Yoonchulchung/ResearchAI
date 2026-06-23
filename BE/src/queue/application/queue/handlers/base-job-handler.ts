import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { QueueJob } from 'src/queue/domain/queue-job.model';
import { SearchSources } from 'src/research/domain/model/search-sources.model';

export interface JobResult {
  result?: string;
  webSources?: SearchSources;
}

/**
 * 잡 카테고리별 핸들러 추상 기반.
 * - SSE 채널 생명주기 (setup / get / cancel)
 * - 잡 실행 (execute)
 * - 오류 전파 (dispatchError)
 * - 모듈 파괴 시 정리 (cleanupAll)
 *
 * channelId: SUMMARY/LIGHTRESEARCH는 sessionId, 나머지는 jobId
 */
export abstract class BaseJobHandler {
  abstract readonly taskTypes: readonly QueueJob.TaskType[];

  abstract setupChannel(channelId: string, taskType: QueueJob.TaskType): void;
  abstract getStream(
    channelId: string,
    taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null;
  abstract cancelChannel(channelId: string, taskType: QueueJob.TaskType): void;

  abstract execute(job: QueueJob, signal: AbortSignal): Promise<JobResult>;
  abstract dispatchError(job: QueueJob, msg: string): void;
  abstract cleanupAll(): void;

  /** TTL 만료 후 누적 데이터 정리 — 필요한 핸들러만 오버라이드 */
  onExpiry(_jobId: string): void {}
}
