import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable, of, concat, from } from 'rxjs';
import { BaseJobHandler, JobResult } from './base-job-handler';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import {
  SearchEngine,
  PlannerMode,
} from 'src/research/domain/model/search-planner.model';
import { SearchModeInput } from 'src/research/application/search-planner.service';
import { AttachedFilePayload } from 'src/queue/presentation/dto/request/enqueue-light-research.dto';
import { LightResearchEvent } from 'src/research/application/pipeline/light-research-pipeline.service';
import {
  ResearchState,
  SummaryState,
} from 'src/sessions/domain/entity/session.entity';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { SummaryExecutor } from 'src/queue/application/job/summary.executor';
import { LightResearchExecutor } from 'src/queue/application/job/light-research.executor';
import { DeepResearchExecutor } from 'src/queue/application/job/deep-research.executor';

@Injectable()
export class ResearchHandler extends BaseJobHandler {
  readonly taskTypes = [
    QueueJob.TaskType.SUMMARY,
    QueueJob.TaskType.LIGHTRESEARCH,
    QueueJob.TaskType.DEEPRESEARCH,
  ] as const;

  private summarySubjects = new Map<string, Subject<MessageEvent>>();
  private summaryAccumulated = new Map<string, string>();
  private lightResearchSubjects = new Map<string, Subject<MessageEvent>>();
  private lightResearchAccumulated = new Map<string, LightResearchEvent[]>();

  constructor(
    private readonly summaryExecutor: SummaryExecutor,
    private readonly lightResearchExecutor: LightResearchExecutor,
    private readonly deepResearchExecutor: DeepResearchExecutor,
    private readonly sessionCommandService: SessionCommandService,
    private readonly sessionGateway: SessionGateway,
  ) {
    super();
  }

  setupChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.SUMMARY) {
      this.summarySubjects.set(channelId, new Subject<MessageEvent>());
      this.summaryAccumulated.set(channelId, '');
    } else if (taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      this.lightResearchSubjects.set(channelId, new Subject<MessageEvent>());
      this.lightResearchAccumulated.set(channelId, []);
    }
    // DEEPRESEARCH: SessionGateway로 broadcast하므로 SSE 채널 불필요
  }

  getStream(
    channelId: string,
    taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    if (taskType === QueueJob.TaskType.SUMMARY) {
      const subject = this.summarySubjects.get(channelId);
      if (!subject) return null;
      const accumulated = this.summaryAccumulated.get(channelId) ?? '';
      return accumulated
        ? concat(
            of({
              data: { type: SseEventType.CHUNK, text: accumulated },
            } as MessageEvent),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    if (taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      const subject = this.lightResearchSubjects.get(channelId);
      if (!subject) return null;
      const accumulated = this.lightResearchAccumulated.get(channelId) ?? [];
      return accumulated.length > 0
        ? concat(
            from(accumulated.map((e) => ({ data: e }) as MessageEvent)),
            subject.asObservable(),
          )
        : subject.asObservable();
    }
    return null;
  }

  cancelChannel(channelId: string, taskType: QueueJob.TaskType): void {
    if (taskType === QueueJob.TaskType.SUMMARY) {
      this.errorAndClose(
        this.summarySubjects,
        channelId,
        '서머리가 중단되었습니다.',
      );
      this.summaryAccumulated.delete(channelId);
    } else if (taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      this.errorAndClose(
        this.lightResearchSubjects,
        channelId,
        'Light Research가 중단되었습니다.',
      );
      this.lightResearchAccumulated.delete(channelId);
    }
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
      const { aiResult, webSources } = await this.deepResearchExecutor.execute(
        job.sessionId,
        job.itemId,
        job.itemContent,
        job.CloudAIModel,
        job.webModel ?? SearchEngine.TAVILY,
        job.localAIModel || undefined,
        signal,
        job.filterModel,
      );
      return { result: aiResult, webSources };
    }

    if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      const subject = this.lightResearchSubjects.get(job.sessionId);
      let lightTopic = job.itemContent;
      let lightAttachedFiles: AttachedFilePayload[] = [];
      try {
        const parsed = JSON.parse(job.itemContent) as {
          topic: string;
          attachedFiles?: AttachedFilePayload[];
        };
        lightTopic = parsed.topic;
        lightAttachedFiles = parsed.attachedFiles ?? [];
      } catch {
        /* 구형 포맷 */
      }
      const { tasks } = await this.lightResearchExecutor.execute(
        job.sessionId,
        lightTopic,
        job.localAIModel,
        job.CloudAIModel,
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
    }

    if (job.taskType === QueueJob.TaskType.SUMMARY) {
      const subject = this.summarySubjects.get(job.sessionId);
      const fullText = await this.summaryExecutor.execute(
        job.sessionId,
        job.localAIModel,
        (chunk) => {
          this.summaryAccumulated.set(
            job.sessionId,
            (this.summaryAccumulated.get(job.sessionId) ?? '') + chunk,
          );
          subject?.next({ data: { type: SseEventType.CHUNK, text: chunk } });
        },
      );
      subject?.next({ data: { type: SseEventType.DONE } });
      subject?.complete();
      this.summarySubjects.delete(job.sessionId);
      this.summaryAccumulated.delete(job.sessionId);
      return { result: fullText };
    }

    return {};
  }

  dispatchError(job: QueueJob, msg: string): void {
    if (job.taskType === QueueJob.TaskType.SUMMARY) {
      this.errorAndClose(this.summarySubjects, job.sessionId, msg);
      this.summaryAccumulated.delete(job.sessionId);
      this.sessionCommandService
        .updateSummaryState(job.sessionId, SummaryState.ERROR)
        .catch(() => {});
    } else if (job.taskType === QueueJob.TaskType.LIGHTRESEARCH) {
      this.errorAndClose(this.lightResearchSubjects, job.sessionId, msg);
      this.lightResearchAccumulated.delete(job.sessionId);
    } else if (job.taskType === QueueJob.TaskType.DEEPRESEARCH) {
      this.sessionCommandService
        .updateSessionItem(
          job.sessionId,
          job.itemId,
          msg,
          '',
          ResearchState.ERROR,
        )
        .catch(() => {});
      this.sessionCommandService
        .updateSession(job.sessionId, ResearchState.ERROR)
        .catch(() => {});
      this.sessionGateway.emitSessionUpdate(job.sessionId).catch(() => {});
    }
  }

  cleanupAll(): void {
    for (const s of this.summarySubjects.values()) s.complete();
    for (const s of this.lightResearchSubjects.values()) s.complete();
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
