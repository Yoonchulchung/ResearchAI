import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionJobEntity } from 'src/sessions/domain/entity/session-job.entity';

@Injectable()
export class SessionJobRepository {
  constructor(
    @InjectRepository(SessionJobEntity)
    private readonly repo: Repository<SessionJobEntity>,
  ) {}

  async findBySessionId(sessionId: string): Promise<SessionJobEntity[]> {
    return this.repo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async save(entity: Partial<SessionJobEntity>): Promise<SessionJobEntity> {
    return this.repo.save(entity);
  }

  async saveMany(entities: Partial<SessionJobEntity>[]): Promise<void> {
    await this.repo.save(entities);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.repo.delete({ sessionId });
  }
}
