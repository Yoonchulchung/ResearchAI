import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SearchSources } from '../../research/domain/model/search-sources.model';
import { VectorService } from '../../vector/vector.service';
import { Task, Session } from '../domain/session.model';
import { SessionRepository } from '../infrastructure/session-repository';

@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly vectorService: VectorService,
  ) {}

  findAll() {
    const ids = this.repository.listIds();
    const sessions: ReturnType<typeof this.toListItem>[] = [];
    for (const id of ids) {
      try {
        const s = this.repository.read(id);
        sessions.push(this.toListItem(s));
      } catch {}
    }
    return sessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  private toListItem(s: Session) {
    const statuses = s.statuses ?? {};
    const { results, sources, ...rest } = s;
    return {
      ...rest,
      statuses,
      doneCount: Object.values(statuses).filter((v) => v === 'done').length,
    };
  }

  findOne(id: string) {
    const session = this.repository.read(id);
    return {
      ...session,
      results: session.results ?? {},
      statuses:
        session.statuses ??
        Object.fromEntries((session.tasks ?? []).map((t) => [t.id, 'idle'])),
    };
  }

  create(topic: string, model: string, tasks: Task[]) {
    const session: Session = {
      id: randomUUID(),
      topic,
      model,
      createdAt: new Date().toISOString(),
      tasks,
      results: {},
      statuses: Object.fromEntries(tasks.map((t) => [t.id, 'idle'])),
      sources: {},
    };
    this.repository.write(session);
    return session;
  }

  remove(id: string) {
    this.repository.deleteDir(id);
    this.vectorService.deleteSession(id).catch(() => {});
    return { ok: true };
  }

  updateTaskSources(sessionId: string, taskId: number, additionalSources: Partial<SearchSources>) {
    try {
      const session = this.repository.read(sessionId);
      if (!session.sources) session.sources = {};
      session.sources[String(taskId)] = {
        ...(session.sources[String(taskId)] ?? {}),
        ...additionalSources,
      };
      this.repository.write(session);
    } catch {}
  }

  updateTask(sessionId: string, taskId: number, result: string, status: string, sources?: SearchSources) {
    const session = this.repository.read(sessionId);
    if (!session.results) session.results = {};
    if (!session.statuses) session.statuses = {};
    if (!session.sources) session.sources = {};
    session.results[taskId] = result;
    session.statuses[taskId] = status;
    if (sources) session.sources[taskId] = sources;
    this.repository.write(session);
    if (status === 'done' && result) {
      const task = session.tasks?.find((t) => t.id === taskId);
      this.vectorService
        .indexTaskResult(
          sessionId,
          String(taskId),
          task?.title ?? String(taskId),
          task?.icon ?? '📄',
          result,
        )
        .catch(() => {});
    }
    return { ok: true };
  }

  chatPath(sessionId: string): string {
    return this.repository.chatPath(sessionId);
  }
}
