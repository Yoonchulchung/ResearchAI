import { Injectable } from '@nestjs/common';

export type SummaryEvent =
  | { type: 'log'; message: string }
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

type EventCallback = (event: SummaryEvent) => void;
type DoneCallback = () => void;

export interface SummaryJob {
  events: SummaryEvent[];
  status: 'running' | 'done';
  eventSubs: Set<EventCallback>;
  doneSubs: Set<DoneCallback>;
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30분

@Injectable()
export class SummaryJobService {
  private readonly jobs = new Map<string, SummaryJob>();

  /** 이미 존재하는 jobId면 true 반환 (멱등성 체크용) */
  has(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  create(jobId: string): void {
    this.jobs.set(jobId, {
      events: [],
      status: 'running',
      eventSubs: new Set(),
      doneSubs: new Set(),
      createdAt: Date.now(),
    });
    setTimeout(() => this.jobs.delete(jobId), TTL_MS);
  }

  push(jobId: string, event: SummaryEvent): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.events.push(event);
    for (const sub of job.eventSubs) sub(event);
  }

  complete(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'done';
    for (const sub of job.doneSubs) sub();
    job.eventSubs.clear();
    job.doneSubs.clear();
  }

  get(jobId: string): SummaryJob | undefined {
    return this.jobs.get(jobId);
  }

  /** 버퍼된 이벤트를 재생하고, 아직 실행 중이면 새 이벤트도 구독한다. */
  replay(
    jobId: string,
    onEvent: EventCallback,
    onDone: DoneCallback,
  ): (() => void) | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    for (const event of job.events) onEvent(event);

    if (job.status === 'done') {
      onDone();
      return () => {};
    }

    job.eventSubs.add(onEvent);
    job.doneSubs.add(onDone);

    return () => {
      job.eventSubs.delete(onEvent);
      job.doneSubs.delete(onDone);
    };
  }
}
