import { Injectable } from '@nestjs/common';
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

@Injectable()
export class CollectService {
  private sseClients: Response[] = [];
  private running = false;

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

  // ── 수집 ───────────────────────────────────────────────────────────────────

  isRunning(): boolean {
    return this.running;
  }

  async collect(query: CollectQuery & { sources?: string[] }): Promise<void> {
    if (this.running) return;
    this.running = true;

    const sources = this.registry.getAvailable(query.sources);
    let totalCollected = 0;

    try {
      for (const source of sources) {
        this.broadcast({ type: 'start', source: source.name });
        let sourceCount = 0;

        try {
          for await (const job of source.collect(query)) {
            this.jobRepository.upsert(job);
            this.broadcast({ type: 'job', id: job.id, title: job.title, company: job.company, source: job.source });
            sourceCount++;
            totalCollected++;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : '수집 실패';
          this.broadcast({ type: 'error', source: source.name, message });
        }

        this.broadcast({ type: 'source_done', source: source.name, count: sourceCount });
      }
    } finally {
      this.running = false;
      this.broadcast({ type: 'done', total: totalCollected });
    }
  }
}
