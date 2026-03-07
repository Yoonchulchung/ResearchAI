import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchListEntity } from '../entity/searchlist.entity';

@Injectable()
export class SearchListRepository {
  constructor(
    @InjectRepository(SearchListEntity)
    private readonly repo: Repository<SearchListEntity>,
  ) {}

  async findByLightResearchId(lightResearchId: string): Promise<SearchListEntity[]> {
    return this.repo.find({ where: { lightResearchId }, order: { createdAt: 'ASC' } });
  }

  async save(entity: Partial<SearchListEntity>): Promise<SearchListEntity> {
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
