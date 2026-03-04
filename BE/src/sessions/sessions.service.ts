import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
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

@Injectable()
export class SessionsService implements OnModuleInit {
  private readonly dataDir = path.join(__dirname, '../../data/sessions');

  constructor(private readonly vectorService: VectorService) {}

  onModuleInit() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.migrateLegacy();
  }

  /** sessions.json → 폴더 구조로 1회 마이그레이션 */
  private migrateLegacy() {
    const legacyPath = path.join(this.dataDir, '../sessions.json');
    if (!fs.existsSync(legacyPath)) return;
    try {
      const { sessions } = JSON.parse(fs.readFileSync(legacyPath, 'utf-8')) as { sessions: Session[] };
      for (const s of sessions) {
        const dir = this.sessionDir(s.id);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(s, null, 2), 'utf-8');
        }
      }
      fs.renameSync(legacyPath, legacyPath + '.migrated');
    } catch {}
  }

  private sessionDir(id: string): string {
    return path.join(this.dataDir, id);
  }

  private readSession(id: string): Session {
    const filePath = path.join(this.sessionDir(id), 'session.json');
    if (!fs.existsSync(filePath)) throw new NotFoundException('Session not found');
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Session;
  }

  private writeSession(session: Session): void {
    const dir = this.sessionDir(session.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
  }

  findAll() {
    if (!fs.existsSync(this.dataDir)) return [];
    const ids = fs.readdirSync(this.dataDir).filter((name) => {
      return fs.statSync(path.join(this.dataDir, name)).isDirectory();
    });
    const sessions: ReturnType<typeof this.toListItem>[] = [];
    for (const id of ids) {
      try {
        const s = this.readSession(id);
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
    const session = this.readSession(id);
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
    this.writeSession(session);
    return session;
  }

  remove(id: string) {
    const dir = this.sessionDir(id);
    if (!fs.existsSync(dir)) throw new NotFoundException('Session not found');
    fs.rmSync(dir, { recursive: true, force: true });
    this.vectorService.deleteSession(id).catch(() => {});
    return { ok: true };
  }

  updateTaskSources(sessionId: string, taskId: number, additionalSources: Partial<SearchSources>) {
    try {
      const session = this.readSession(sessionId);
      if (!session.sources) session.sources = {};
      session.sources[String(taskId)] = {
        ...(session.sources[String(taskId)] ?? {}),
        ...additionalSources,
      };
      this.writeSession(session);
    } catch {}
  }

  updateTask(sessionId: string, taskId: number, result: string, status: string, sources?: SearchSources) {
    const session = this.readSession(sessionId);
    if (!session.results) session.results = {};
    if (!session.statuses) session.statuses = {};
    if (!session.sources) session.sources = {};
    session.results[taskId] = result;
    session.statuses[taskId] = status;
    if (sources) session.sources[taskId] = sources;
    this.writeSession(session);
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

  /** 채팅 히스토리 파일 경로 */
  chatPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'chat.json');
  }
}
