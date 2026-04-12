import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCallLogEntity } from '../entity/ai-call-log.entity';

export interface AiCallLogPage {
  data: AiCallLogEntity[];
  total: number;
}

@Injectable()
export class AiCallLogRepository {
  constructor(
    @InjectRepository(AiCallLogEntity)
    private readonly repo: Repository<AiCallLogEntity>,
  ) {}

  async save(entity: Partial<AiCallLogEntity>): Promise<void> {
    await this.repo.save(entity);
  }

  async findPaginated(page: number, limit: number, model?: string): Promise<AiCallLogPage> {
    const qb = this.repo.createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (model) qb.where('log.aiModel = :model', { model });

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async deleteAll(): Promise<void> {
    await this.repo.clear();
  }
}
