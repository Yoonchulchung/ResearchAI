import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { CompanyNewsTimelineService } from 'src/company/infrastructure/company-news-timeline.service';

export type RoadmapJobStatus = 'pending' | 'running' | 'done' | 'error';

interface RoadmapJob {
  status: RoadmapJobStatus;
  message?: string;
  subject: Subject<MessageEvent>;
  abortController: AbortController;
}

/** 사업 로드맵 분석 전용 인메모리 큐 */
@Injectable()
export class NewsQueueService implements OnModuleDestroy {
  private readonly DONE_TTL_MS = 5 * 60 * 1000;
  private jobs = new Map<string, RoadmapJob>();

  constructor(private readonly newsTimeline: CompanyNewsTimelineService) {}

  onModuleDestroy() {
    for (const { subject, abortController } of this.jobs.values()) {
      abortController.abort();
      subject.complete();
    }
    this.jobs.clear();
  }

  enqueue(companyId: string, companyName: string, model: string): string {
    const jobId = randomUUID();
    const subject = new Subject<MessageEvent>();
    const abortController = new AbortController();
    const job: RoadmapJob = { status: 'pending', subject, abortController };

    this.jobs.set(jobId, job);

    this.run(jobId, companyId, companyName, model, subject, abortController.signal).catch(
      (e) => {
        if (!abortController.signal.aborted) {
          const msg = e instanceof Error ? e.message : '오류가 발생했습니다.';
          this.patch(jobId, { status: 'error', message: msg });
          subject.next({ data: { type: 'error', message: msg } });
          subject.complete();
        }
      },
    );

    return jobId;
  }

  getStream(jobId: string): Observable<MessageEvent> | null {
    return this.jobs.get(jobId)?.subject ?? null;
  }

  getStatus(jobId: string): { status: RoadmapJobStatus; message?: string } | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return { status: job.status, message: job.message };
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.abortController.abort();
    job.subject.next({ data: { type: 'error', message: '취소되었습니다.' } });
    job.subject.complete();
    this.jobs.delete(jobId);
  }

  private patch(jobId: string, patch: Partial<Pick<RoadmapJob, 'status' | 'message'>>) {
    const job = this.jobs.get(jobId);
    if (job) Object.assign(job, patch);
  }

  private async run(
    jobId: string,
    companyId: string,
    companyName: string,
    model: string,
    subject: Subject<MessageEvent>,
    signal: AbortSignal,
  ) {
    this.patch(jobId, { status: 'running' });
    subject.next({ data: { type: 'log', message: '사업 로드맵 분석 중...' } });

    const result = await this.newsTimeline.analyze(companyId, companyName, model, false);

    if (signal.aborted) return;

    this.patch(jobId, { status: 'done' });
    subject.next({ data: { type: 'done', result } });
    subject.complete();

    setTimeout(() => this.jobs.delete(jobId), this.DONE_TTL_MS);
  }
}
