import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { SearchSources } from '../research/domain/model/search-sources.model';
import { VectorService } from '../vector/vector.service';

export interface Task {
  id: number;
  title: string;
  icon: string;
  prompt: string;
}

export interface Session {
  id: string;
  topic: string;
  model: string;
  createdAt: string;
  tasks: Task[];
  results: Record<string, string>;
  statuses: Record<string, string>;
  sources: Record<string, SearchSources>;
}

interface DB {
  sessions: Session[];
}

@Injectable()
export class SessionsService {
  private readonly dbPath = path.join(__dirname, '../../data/sessions.json');

  constructor(private readonly vectorService: VectorService) {}

  private readDB(): DB {
    const raw = fs.readFileSync(this.dbPath, 'utf-8');
    return JSON.parse(raw);
  }

  private writeDB(db: DB): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(db, null, 2), 'utf-8');
  }

  findAll() {
    const { sessions } = this.readDB();
    return sessions.map((s) => {
      const statuses = s.statuses ?? {};
      const { results, sources, ...rest } = s;
      return {
        ...rest,
        statuses,
        doneCount: Object.values(statuses).filter((v) => v === 'done').length,
      };
    });
  }

  findOne(id: string) {
    const { sessions } = this.readDB();
    const session = sessions.find((s) => s.id === id);
    if (!session) throw new NotFoundException('Session not found');
    return {
      ...session,
      results: session.results ?? {},
      statuses:
        session.statuses ??
        Object.fromEntries((session.tasks ?? []).map((t) => [t.id, 'idle'])),
    };
  }

  create(topic: string, model: string, tasks: Task[]) {
    const db = this.readDB();
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
    db.sessions.unshift(session);
    this.writeDB(db);
    return session;
  }

  remove(id: string) {
    const db = this.readDB();
    const idx = db.sessions.findIndex((s) => s.id === id);
    if (idx === -1) throw new NotFoundException('Session not found');
    db.sessions.splice(idx, 1);
    this.writeDB(db);
    this.vectorService.deleteSession(id).catch(() => {});
    return { ok: true };
  }

  updateTaskSources(sessionId: string, taskId: number, additionalSources: Partial<SearchSources>) {
    try {
      const db = this.readDB();
      const session = db.sessions.find((s) => s.id === sessionId);
      if (!session) return;
      if (!session.sources) session.sources = {};
      session.sources[String(taskId)] = {
        ...(session.sources[String(taskId)] ?? {}),
        ...additionalSources,
      };
      this.writeDB(db);
    } catch {}
  }

  updateTask(sessionId: string, taskId: number, result: string, status: string, sources?: SearchSources) {
    const db = this.readDB();
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (!session.results) session.results = {};
    if (!session.statuses) session.statuses = {};
    if (!session.sources) session.sources = {};
    session.results[taskId] = result;
    session.statuses[taskId] = status;
    if (sources) session.sources[taskId] = sources;
    this.writeDB(db);
    // 완료된 task 결과를 백그라운드에서 벡터 인덱싱
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
}
