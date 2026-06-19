import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCallLogEntity } from 'src/ai/domain/entity/ai-call-log.entity';

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

  async findPaginated(
    page: number,
    limit: number,
    model?: string,
    userId?: string | null,
  ): Promise<AiCallLogPage> {
    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (model) {
      conditions.push('log.aiModel = :model');
      params.model = model;
    }
    if (userId !== undefined) {
      conditions.push('log.userId = :userId');
      params.userId = userId;
    }

    if (conditions.length > 0) qb.where(conditions.join(' AND '), params);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async deleteAll(userId?: string | null): Promise<void> {
    if (userId !== undefined) {
      await this.repo.delete({ userId: userId ?? undefined });
    } else {
      await this.repo.clear();
    }
  }
}
