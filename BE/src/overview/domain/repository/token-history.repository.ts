import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenHistoryEntity } from '../entity/token-history.entity';

@Injectable()
export class TokenHistoryRepository {
  constructor(
    @InjectRepository(TokenHistoryEntity)
    private readonly repo: Repository<TokenHistoryEntity>,
  ) {}

  async findAll(): Promise<TokenHistoryEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<TokenHistoryEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByModel(aiModel: string): Promise<TokenHistoryEntity[]> {
    return this.repo.find({ where: { aiModel }, order: { createdAt: 'DESC' } });
  }

  async save(entity: Partial<TokenHistoryEntity>): Promise<TokenHistoryEntity> {
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
