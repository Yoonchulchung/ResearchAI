import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, TaskWithResult } from '../session.model';
import { ResearchState, SessionEntity } from '../entity/session.entity';

@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly repo: Repository<SessionEntity>,
  ) {}

  async findById(id: string): Promise<Session> {
    const row = await this.repo.findOne({ where: { id }, relations: { items: true } });
    if (!row) throw new NotFoundException('Session not found');
    return this.toModel(row, true);
  }

  async findAll(): Promise<Session[]> {
    const rows = await this.repo.find({ order: { created_at: 'DESC' }, relations: { items: true } });
    return rows.map((r) => this.toModel(r, false));
  }

  async save(session: Session, state?: ResearchState): Promise<void> {
    await this.repo.save({
      id: session.id,
      topic: session.topic,
      researchAiModel: session.researchAiModel,
      researchWebModel: session.researchWebModel,
      researchState: state ?? ResearchState.IDLE,
    });
  }

  async updateState(id: string, state: ResearchState): Promise<void> {
    await this.repo.update(id, { researchState: state });
  }

  async updateSummary(id: string, summary: string): Promise<void> {
    await this.repo.update(id, { summary });
  }

  async delete(id: string): Promise<void> {
    const exists = await this.repo.findOne({ where: { id } });
    if (!exists) throw new NotFoundException('Session not found');
    await this.repo.delete(id);
  }

  private toModel(row: SessionEntity, withTasks: boolean): Session {
    const sortedItems = row.items
      ? [...row.items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      : [];

    const doneCount = sortedItems.filter((i) => i.aiResult).length;

    const tasks: TaskWithResult[] = sortedItems.map((item, idx) => ({
      id: idx + 1,
      title: item.topic,
      icon: item.taskIcon || '📄',
      prompt: item.webPrompt,
      result: item.aiResult || null,
    }));

    return {
      id: row.id,
      topic: row.topic,
      researchAiModel: row.researchAiModel,
      researchWebModel: row.researchWebModel,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      summary: row.summary,
      tasks: withTasks ? tasks : undefined,
      doneCount,
    };
  }
}
