import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionItemEntity } from '../entity/session-item.entity';
import { ResearchState } from '../entity/session.entity';

@Injectable()
export class SessionItemRepository {
  constructor(
    @InjectRepository(SessionItemEntity)
    private readonly repo: Repository<SessionItemEntity>,
  ) {}

  async findById(id: string): Promise<SessionItemEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('SessionItem not found');
    return row;
  }

  async findBySessionId(sessionId: string): Promise<SessionItemEntity[]> {
    return this.repo.find({
      where: { sessionId },
      order: { created_at: 'ASC' },
    });
  }

  async findByTopic(topic: string): Promise<SessionItemEntity[]> {
    return this.repo.find({
      where: { topic },
      order: { created_at: 'DESC' },
    });
  }

  async save(item: Partial<SessionItemEntity>): Promise<SessionItemEntity> {
    return this.repo.save(item);
  }

  async updateResult(
    id: string,
    aiResult: string,
    webResult: string,
    state?: ResearchState,
    confidence?: { score: number; reason: string },
  ): Promise<void> {
    await this.repo.update(id, {
      aiResult,
      webResult,
      ...(state && { researchState: state as any }),
      ...(confidence && { confidenceScore: confidence.score, confidenceReason: confidence.reason }),
    });
  }

  async updateStatus(id: string, state: ResearchState): Promise<void> {
    await this.repo.update(id, { researchState: state as any });
  }

  async delete(id: string): Promise<void> {
    const exists = await this.repo.findOne({ where: { id } });
    if (!exists) throw new NotFoundException('SessionItem not found');
    await this.repo.delete(id);
  }
}
