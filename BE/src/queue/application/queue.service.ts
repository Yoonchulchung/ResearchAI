import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';
import { QueueJob } from '../domain/queue-job.model';
import { EnqueueTaskDto } from '../domain/enqueue-task.dto';
import { JobRunnerService } from './job-runner.service';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private jobs: QueueJob[] = [];
  private abortControllers = new Map<string, AbortController>();
  private sseClients: Response[] = [];
  private running = false;

  constructor(private readonly jobRunner: JobRunnerService) {}

  onModuleDestroy() {
    for (const ctrl of this.abortControllers.values()) {
      ctrl.abort();
    }
  }

  // ── SSE ────────────────────────────────────────────────────────────────────

  addClient(res: Response) {
    this.sseClients.push(res);
    res.write(`data: ${JSON.stringify({ type: 'sync', jobs: this.jobs })}\n\n`);
  }

  removeClient(res: Response) {
    this.sseClients = this.sseClients.filter((c) => c !== res);
  }

  private broadcast() {
    const data = `data: ${JSON.stringify({ type: 'sync', jobs: this.jobs })}\n\n`;
    for (const client of [...this.sseClients]) {
      try {
        client.write(data);
      } catch {
        this.sseClients = this.sseClients.filter((c) => c !== client);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getJobs(): QueueJob[] {
    return this.jobs;
  }

  enqueueSession(tasks: EnqueueTaskDto[], doneTaskIds: number[] = []) {
    let changed = false;
    for (const t of tasks) {
      if (doneTaskIds.includes(t.taskId)) continue;
      const alreadyQueued = this.jobs.some(
        (j) => j.sessionId === t.sessionId && j.taskId === t.taskId,
      );
      if (alreadyQueued) continue;
      this.jobs.push(this.makeJob(t));
      changed = true;
    }
    if (changed) {
      this.broadcast();
      this.runNext();
    }
  }

  enqueueTask(t: EnqueueTaskDto) {
    const existing = this.jobs.find(
      (j) => j.sessionId === t.sessionId && j.taskId === t.taskId,
    );

    if (existing?.status === 'pending') return;

    if (existing?.status === 'running') {
      this.abortControllers.get(existing.jobId)?.abort();
      this.abortControllers.delete(existing.jobId);
    }

    this.jobs = this.jobs.filter(
      (j) => !(j.sessionId === t.sessionId && j.taskId === t.taskId),
    );
    this.jobs.push(this.makeJob(t));
    this.broadcast();
    this.runNext();
  }

  cancelSession(sessionId: string) {
    const running = this.jobs.find(
      (j) => j.sessionId === sessionId && j.status === 'running',
    );
    if (running) {
      this.abortControllers.get(running.jobId)?.abort();
      this.abortControllers.delete(running.jobId);
    }
    this.jobs = this.jobs.filter(
      (j) => !(j.sessionId === sessionId && (j.status === 'pending' || j.status === 'running')),
    );
    this.broadcast();
  }

  dismissCompleted() {
    this.jobs = this.jobs.filter((j) => j.status === 'pending' || j.status === 'running');
    this.broadcast();
  }

  // ── Runner ─────────────────────────────────────────────────────────────────

  private makeJob(t: EnqueueTaskDto): QueueJob {
    return {
      jobId: `${t.sessionId}-${t.taskId}-${Date.now()}`,
      sessionId: t.sessionId,
      sessionTopic: t.sessionTopic,
      taskId: t.taskId,
      taskTitle: t.taskTitle,
      taskIcon: t.taskIcon,
      taskPrompt: t.taskPrompt,
      model: t.model,
      status: 'pending',
    };
  }

  private runNext() {
    if (this.running) return;
    const next = this.jobs.find((j) => j.status === 'pending');
    if (!next) return;
    this.running = true;
    this.executeJob(next).finally(() => {
      this.running = false;
      this.runNext();
    });
  }

  private updateJob(jobId: string, updates: Partial<QueueJob>) {
    const idx = this.jobs.findIndex((j) => j.jobId === jobId);
    if (idx !== -1) {
      this.jobs[idx] = { ...this.jobs[idx], ...updates };
      this.broadcast();
    }
  }

  private async executeJob(job: QueueJob) {
    const controller = new AbortController();
    this.abortControllers.set(job.jobId, controller);
    this.updateJob(job.jobId, { status: 'running', phase: 'searching' });

    try {
      await this.jobRunner.runJob(job, (updates) => this.updateJob(job.jobId, updates), controller.signal);
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
