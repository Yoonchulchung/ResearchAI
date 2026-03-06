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

  getSummary(id: string): { summary: string | null } {
    const session = this.repository.read(id);
    return { summary: session.summary ?? null };
  }

  saveSummary(id: string, summary: string): void {
    const session = this.repository.read(id);
    session.summary = summary;
    this.repository.write(session);
  }

  buildSummaryContext(id: string): { model: string; system: string; prompt: string } | null {
    const session = this.repository.read(id);
    const doneResults = Object.entries(session.results ?? {})
      .filter(([taskId]) => session.statuses?.[taskId] === 'done')
      .map(([taskId, result]) => {
        const task = session.tasks?.find((t) => String(t.id) === taskId);
        return task ? `## ${task.icon} ${task.title}\n${result}` : result;
      });

    if (doneResults.length === 0) return null;

    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    const system = '당신은 리서치 결과를 간결하고 명확하게 요약하는 전문가입니다. 핵심 인사이트를 추출하여 체계적으로 정리해주세요.';
    const prompt = `다음은 "${session.topic}" 주제로 수행된 리서치 결과입니다:\n\n${doneResults.join('\n\n---\n\n')}\n\n위 내용을 바탕으로 핵심 인사이트와 주요 포인트를 한국어로 요약해주세요. 마크다운 형식으로 작성해주세요.`;

    return { model, system, prompt };
  }
}
