import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, ItemWithResult } from '../session.model';
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
    const rows = await this.repo.find({ order: { createdAt: 'DESC' }, relations: { items: true } });
    return rows.map((r) => this.toModel(r, false));
  }

  async save(session: Session, state?: ResearchState): Promise<void> {
    await this.repo.save({
      id: session.id,
      topic: session.topic,
      researchCloudAIModel: session.researchCloudAIModel,
      researchLocalAIModel: session.researchLocalAIModel,
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

    const items: ItemWithResult[] = sortedItems.map((item, idx) => ({
      id: idx + 1,
      itemId: item.id,
      title: item.topic,
      icon: item.taskIcon || '📄',
      prompt: item.webPrompt,
      status: item.researchState,
      researchState: item.researchState,
      result: item.aiResult || null,
    }));

    return {
      id: row.id,
      topic: row.topic,
      researchCloudAIModel: row.researchCloudAIModel,
      researchLocalAIModel: row.researchLocalAIModel,
      researchWebModel: row.researchWebModel,
      researchState: row.researchState,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      summary: row.summary,
      items: withTasks ? items : undefined,
      doneCount,
    };
  }
}
