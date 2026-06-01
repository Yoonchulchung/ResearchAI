import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { SourceRegistry } from '../infrastructure/sources/source-registry';
import { JobRepository } from '../infrastructure/repository/job-repository';
import { CollectQuery } from '../domain/job-source.interface';

export type CollectEvent =
  | { type: 'start'; source: string }
  | { type: 'job'; id: string; title: string; company: string; source: string }
  | { type: 'source_done'; source: string; count: number }
  | { type: 'done'; total: number }
  | { type: 'error'; source: string; message: string };

export interface CollectJobStatus {
  jobId: string;
  keyword: string;
  running: boolean;
  collected: number;
  startedAt: string;
  doneAt?: string;
}

// 완료된 job은 5분 후 자동 정리
const JOB_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class CollectService {
  private sseClients: Response[] = [];
  private running = false;
  private currentJobId: string | null = null;
  private readonly jobs = new Map<string, CollectJobStatus>();

  constructor(
    private readonly registry: SourceRegistry,
    private readonly jobRepository: JobRepository,
  ) {}

  // ── SSE ────────────────────────────────────────────────────────────────────

  addClient(res: Response) {
    this.sseClients.push(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', running: this.running })}\n\n`);
  }

  removeClient(res: Response) {
    this.sseClients = this.sseClients.filter((c) => c !== res);
  }

  private broadcast(event: CollectEvent) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of [...this.sseClients]) {
      try {
        client.write(data);
      } catch {
        this.sseClients = this.sseClients.filter((c) => c !== client);
      }
    }
  }

  // ── Job 상태 조회 ──────────────────────────────────────────────────────────

  getJobStatus(jobId: string): CollectJobStatus | null {
    return this.jobs.get(jobId) ?? null;
  }

  private cleanupJob(jobId: string) {
    setTimeout(() => this.jobs.delete(jobId), JOB_TTL_MS);
  }

  // ── 수집 ───────────────────────────────────────────────────────────────────

  isRunning(): boolean {
    return this.running;
  }

  startCollect(query: CollectQuery & { sources?: string[] }): { ok: boolean; jobId?: string; message?: string } {
    if (this.running) {
      return { ok: false, jobId: this.currentJobId ?? undefined, message: '이미 수집 중입니다.' };
    }
    const jobId = randomUUID();
    this.currentJobId = jobId;
    const status: CollectJobStatus = {
      jobId,
      keyword: query.keyword ?? '',
      running: true,
      collected: 0,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, status);
    this.collect(jobId, query, status).catch(() => {});
    return { ok: true, jobId };
  }

  /**
   * 2-gram(bi-gram) 겹침 비율로 관련성 판단.
   * keyword bi-gram 중 50% 이상이 title 또는 company에 존재하면 통과.
   *
   * 예) "아우모비스타" vs "아우모비오스타" → 겹침 4/5 = 80% → 통과
   *     "아우모비스타" vs "바리스타"      → 겹침 1/5 = 20% → 제거
   *     "아우모비스타" vs "우리은행"      → 겹침 0/5 = 0%  → 제거
   */
  private isKeywordRelevant(job: { title: string; company: string }, keyword?: string): boolean {
    if (!keyword?.trim()) return true;
    const kw = keyword.trim().toLowerCase();
    const title = (job.title ?? '').toLowerCase();
    const company = (job.company ?? '').toLowerCase();
    const text = `${title} ${company}`;

    // 완전 일치 fast path
    if (text.includes(kw)) return true;

    // 3자 미만이면 완전 일치만 허용
    if (kw.length < 3) return false;

    // bi-gram 생성
    const bigrams = (str: string): Set<string> => {
      const set = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
      return set;
    };

    const kwBigrams = bigrams(kw);
    if (kwBigrams.size === 0) return false;

    let matched = 0;
    for (const bg of kwBigrams) {
      if (text.includes(bg)) matched++;
    }

    return matched / kwBigrams.size >= 0.5;
  }

  private async collect(jobId: string, query: CollectQuery & { sources?: string[] }, status: CollectJobStatus): Promise<void> {
    this.running = true;
    const sources = this.registry.getAvailable(query.sources);

    try {
      for (const source of sources) {
        this.broadcast({ type: 'start', source: source.name });
        let sourceCount = 0;

        try {
          for await (const job of source.collect(query)) {
            if (!this.isKeywordRelevant(job, query.keyword)) continue;
            this.jobRepository.upsert(job);
            this.broadcast({ type: 'job', id: job.id, title: job.title, company: job.company, source: job.source ?? source.name });
            sourceCount++;
            status.collected++;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : '수집 실패';
          this.broadcast({ type: 'error', source: source.name, message });
        }

        this.broadcast({ type: 'source_done', source: source.name, count: sourceCount });
      }
    } finally {
      this.running = false;
      this.currentJobId = null;
      status.running = false;
      status.doneAt = new Date().toISOString();
      this.broadcast({ type: 'done', total: status.collected });
      this.cleanupJob(jobId);
    }
  }
}
