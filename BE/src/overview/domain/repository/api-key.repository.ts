import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from '../entity/api-key.entity';

@Injectable()
export class ApiKeyRepository {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly repo: Repository<ApiKeyEntity>,
  ) {}

  async findAll(): Promise<ApiKeyEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<ApiKeyEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async save(entity: Partial<ApiKeyEntity>): Promise<ApiKeyEntity> {
    return this.repo.save(entity);
  }

  async update(id: string, partial: Partial<Pick<ApiKeyEntity, 'apiName' | 'key'>>): Promise<ApiKeyEntity> {
    await this.repo.update(id, partial);
    return this.repo.findOne({ where: { id } }) as Promise<ApiKeyEntity>;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
