import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';
import { QueueJob } from '../domain/queue-job.model';
import { EnqueueTaskDto } from '../domain/enqueue-task.dto';
import { JobRunnerService } from './job-runner.service';
import { QueueRepository } from '../infrastructure/queue-repository';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private jobs: QueueJob[] = [];
  private abortControllers = new Map<string, AbortController>();
  private sseClients: Response[] = [];
  private running = false;

  constructor(
    private readonly jobRunner: JobRunnerService,
    private readonly repo: QueueRepository,
  ) {}

  onModuleInit() {
    // 서버 재시작 시 DB의 active 작업 복구 — running은 pending으로 되돌림
    const active = this.repo.findActive();
    for (const job of active) {
      if (job.status === 'running') {
        job.status = 'pending';
        this.repo.update(job.jobId, { status: 'pending' });
      }
      this.jobs.push(job);
    }
    if (this.jobs.length > 0) this.runNext();
  }

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

  getHistory(limit = 200): QueueJob[] {
    return this.repo.findRecent(limit);
  }

  enqueueSession(tasks: EnqueueTaskDto[], doneTaskIds: number[] = []) {
    let changed = false;
    for (const t of tasks) {
      if (doneTaskIds.includes(t.taskId)) continue;
      const alreadyQueued = this.jobs.some(
        (j) => j.sessionId === t.sessionId && j.taskId === t.taskId,
      );
      if (alreadyQueued) continue;
      const job = this.makeJob(t);
      this.jobs.push(job);
      this.repo.insert(job);
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
    const job = this.makeJob(t);
    this.jobs.push(job);
    this.repo.insert(job);
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
    const cancelled = this.jobs.filter(
      (j) => j.sessionId === sessionId && (j.status === 'pending' || j.status === 'running'),
    );
    for (const job of cancelled) {
      this.repo.update(job.jobId, { status: 'error' });
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

  // ── External tracking (FE가 직접 실행, 큐는 상태만 추적) ─────────────────────

  registerExternal(task: EnqueueTaskDto): QueueJob {
    this.jobs = this.jobs.filter(
      (j) => !(j.sessionId === task.sessionId && j.taskId === task.taskId),
    );
    const job = this.makeJob(task);
    job.status = 'running';
    this.jobs.push(job);
    this.repo.insert(job);
    this.broadcast();
    return job;
  }

  updateJobExternal(jobId: string, updates: Pick<Partial<QueueJob>, 'status' | 'phase'>): void {
    this.repo.update(jobId, updates);
    this.updateJob(jobId, updates);
  }

  removeJob(jobId: string): void {
    this.repo.delete(jobId);
    this.jobs = this.jobs.filter((j) => j.jobId !== jobId);
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
    this.repo.update(job.jobId, { status: 'running', phase: 'searching' });

    try {
      await this.jobRunner.runJob(
        job,
        (updates) => {
          this.updateJob(job.jobId, updates);
          this.repo.update(job.jobId, updates);
        },
        controller.signal,
      );
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
