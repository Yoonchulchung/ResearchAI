import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { SourceRegistry } from 'src/recruit/infrastructure/sources/source-registry';
import { JobRepository } from 'src/recruit/infrastructure/repository/job-repository';
import { CollectQuery } from 'src/recruit/domain/job-source.interface';
import {
  CollectEvent,
  CollectJobStatus,
} from 'src/recruit/application/collect.service';

const JOB_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class CollectImplService {
  private sseClients: Response[] = [];
  private running = false;
  private currentJobId: string | null = null;
  private readonly jobs = new Map<string, CollectJobStatus>();

  constructor(
    private readonly registry: SourceRegistry,
    private readonly jobRepository: JobRepository,
  ) {}

  addClient(res: Response): void {
    this.sseClients.push(res);
    res.write(
      `data: ${JSON.stringify({ type: 'connected', running: this.running })}\n\n`,
    );
  }

  removeClient(res: Response): void {
    this.sseClients = this.sseClients.filter((c) => c !== res);
  }

  isRunning(): boolean {
    return this.running;
  }

  getJobStatus(jobId: string): CollectJobStatus | null {
    return this.jobs.get(jobId) ?? null;
  }

  startCollect(query: CollectQuery & { sources?: string[] }): {
    ok: boolean;
    jobId?: string;
    message?: string;
  } {
    if (this.running) {
      return {
        ok: false,
        jobId: this.currentJobId ?? undefined,
        message: '이미 수집 중입니다.',
      };
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

  private broadcast(event: CollectEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of [...this.sseClients]) {
      try {
        client.write(data);
      } catch {
        this.sseClients = this.sseClients.filter((c) => c !== client);
      }
    }
  }

  private cleanupJob(jobId: string): void {
    setTimeout(() => this.jobs.delete(jobId), JOB_TTL_MS);
  }

  private isKeywordRelevant(
    job: { title: string; company: string },
    keyword?: string,
  ): boolean {
    if (!keyword?.trim()) return true;
    const kw = keyword.trim().toLowerCase();
    const text = `${(job.title ?? '').toLowerCase()} ${(job.company ?? '').toLowerCase()}`;

    if (text.includes(kw)) return true;
    if (kw.length < 3) return false;

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

  private async collect(
    jobId: string,
    query: CollectQuery & { sources?: string[] },
    status: CollectJobStatus,
  ): Promise<void> {
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
            this.broadcast({
              type: 'job',
              id: job.id,
              title: job.title,
              company: job.company,
              source: job.source ?? source.name,
            });
            sourceCount++;
            status.collected++;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : '수집 실패';
          this.broadcast({ type: 'error', source: source.name, message });
        }

        this.broadcast({
          type: 'source_done',
          source: source.name,
          count: sourceCount,
        });
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
