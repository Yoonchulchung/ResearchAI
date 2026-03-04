import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';
import { WebSearchService } from '../research/application/web-search.service';
import { AiSearchService } from '../research/application/ai-search.service';
import { SessionsService } from '../sessions/sessions.service';
import { SearchSources } from '../research/domain/model/search-sources.model';
import { filterWithOllama } from '../research/infrastructure/search/ollama-filter.search';

export type QueueJobStatus = 'pending' | 'running' | 'done' | 'error';
export type QueueJobPhase = 'searching' | 'analyzing';

export interface QueueJob {
  jobId: string;
  sessionId: string;
  sessionTopic: string;
  taskId: number;
  taskTitle: string;
  taskIcon: string;
  taskPrompt: string;
  model: string;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  sources?: SearchSources;
  result?: string;
}

export class EnqueueTaskDto {
  sessionId: string;
  sessionTopic: string;
  taskId: number;
  taskTitle: string;
  taskIcon: string;
  taskPrompt: string;
  model: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private jobs: QueueJob[] = [];
  private abortControllers = new Map<string, AbortController>();
  private sseClients: Response[] = [];
  private running = false;

  constructor(
    private readonly searchService: WebSearchService,
    private readonly aiService: AiSearchService,
    private readonly sessionsService: SessionsService,
  ) {}

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

  /** 세션 단위 인큐: 같은 (sessionId, taskId) 가 큐에 이미 있으면 상태 무관 스킵 (멱등) */
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

  /** 태스크 단위 인큐: pending이면 스킵, running이면 중단 후 교체, 그 외엔 새로 추가 (멱등) */
  enqueueTask(t: EnqueueTaskDto) {
    const existing = this.jobs.find(
      (j) => j.sessionId === t.sessionId && j.taskId === t.taskId,
    );

    if (existing?.status === 'pending') return; // 이미 대기 중 → 중복 무시

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
    this.runJob(next).finally(() => {
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

  private async runJob(job: QueueJob) {
    const controller = new AbortController();
    this.abortControllers.set(job.jobId, controller);
    const { signal } = controller;

    this.updateJob(job.jobId, { status: 'running', phase: 'searching' });

    let context = '';
    let localSources: SearchSources = {};

    // 1. 웹 검색 스트리밍
    try {
      for await (const event of this.searchService.runSearchStream(job.taskPrompt)) {
        if (signal.aborted) return;
        if (event.type === 'source') {
          localSources = { ...localSources, [event.key]: event.result };
          this.updateJob(job.jobId, { sources: { ...localSources } });
        } else if (event.type === 'done') {
          context = event.context;
        }
      }
    } catch (e) {
      if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
    }

    if (signal.aborted) return;

    // 1-1. 백그라운드 Ollama filter (소스 탭 표시용, 분석 차단 안 함)
    if (context) {
      filterWithOllama(job.taskPrompt, context)
        .then((filtered) => {
          if (!filtered || signal.aborted) return;
          localSources = { ...localSources, ollama: filtered };
          this.updateJob(job.jobId, { sources: { ...localSources } });
          this.sessionsService.updateTaskSources(job.sessionId, job.taskId, { ollama: filtered });
        })
        .catch(() => {});
    }

    // 2. AI 분석
    this.updateJob(job.jobId, { phase: 'analyzing' });

    try {
      const { result } = await this.aiService.deepResearch(
        job.taskPrompt,
        job.model,
        context || undefined,
      );
      if (signal.aborted) return;
      const sourcesToSave = Object.keys(localSources).length > 0 ? localSources : undefined;
      await this.sessionsService.updateTask(job.sessionId, job.taskId, result, 'done', sourcesToSave);
      this.updateJob(job.jobId, { status: 'done', phase: undefined, result });
    } catch (e) {
      if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      const msg = e instanceof Error ? e.message : '오류';
      try { this.sessionsService.updateTask(job.sessionId, job.taskId, msg, 'error'); } catch { }
      this.updateJob(job.jobId, { status: 'error', phase: undefined, result: msg });
    } finally {
      this.abortControllers.delete(job.jobId);
    }
  }
}
