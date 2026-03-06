import { Injectable } from '@nestjs/common';
import { LightResearchEvent } from './pipeline/light-research-pipeline.service';

type EventCallback = (event: LightResearchEvent) => void;
type DoneCallback = () => void;

export interface SearchJob {
  events: LightResearchEvent[];
  status: 'running' | 'done';
  eventSubs: Set<EventCallback>;
  doneSubs: Set<DoneCallback>;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10분

@Injectable()
export class SearchJobService {
  private readonly jobs = new Map<string, SearchJob>();

  create(id: string): void {
    this.jobs.set(id, {
      events: [],
      status: 'running',
      eventSubs: new Set(),
      doneSubs: new Set(),
      createdAt: Date.now(),
    });
    setTimeout(() => this.jobs.delete(id), TTL_MS);
  }

  push(id: string, event: LightResearchEvent): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.events.push(event);
    for (const sub of job.eventSubs) sub(event);
  }

  complete(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'done';
    for (const sub of job.doneSubs) sub();
    job.eventSubs.clear();
    job.doneSubs.clear();
  }

  get(id: string): SearchJob | undefined {
    return this.jobs.get(id);
  }

  /** 버퍼된 이벤트를 재생하고, 아직 실행 중이면 새 이벤트도 구독한다. */
  replay(
    id: string,
    onEvent: EventCallback,
    onDone: DoneCallback,
  ): (() => void) | null {
    const job = this.jobs.get(id);
    if (!job) return null;

    // 버퍼된 이벤트 즉시 재생
    for (const event of job.events) onEvent(event);

    if (job.status === 'done') {
      onDone();
      return () => {};
    }

    // 아직 실행 중이면 구독 추가
    job.eventSubs.add(onEvent);
    job.doneSubs.add(onDone);

    return () => {
      job.eventSubs.delete(onEvent);
      job.doneSubs.delete(onDone);
    };
  }
}
