import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { CollectQuery } from 'src/recruit/domain/job-source.interface';
import { CollectImplService } from 'src/recruit/application/collect/collect-impl.service';

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

@Injectable()
export class CollectService {
  constructor(private readonly impl: CollectImplService) {}

  addClient(res: Response): void {
    return this.impl.addClient(res);
  }

  removeClient(res: Response): void {
    return this.impl.removeClient(res);
  }

  isRunning(): boolean {
    return this.impl.isRunning();
  }

  getJobStatus(jobId: string): CollectJobStatus | null {
    return this.impl.getJobStatus(jobId);
  }

  startCollect(query: CollectQuery & { sources?: string[] }): {
    ok: boolean;
    jobId?: string;
    message?: string;
  } {
    return this.impl.startCollect(query);
  }
}
