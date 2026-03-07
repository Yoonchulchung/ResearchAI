import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LightResearchEntity } from '../entity/lightsearch.entity';

@Injectable()
export class LightResearchRepository {
  constructor(
    @InjectRepository(LightResearchEntity)
    private readonly repo: Repository<LightResearchEntity>,
  ) {}

  async findAll(): Promise<LightResearchEntity[]> {
    return this.repo.find({
      relations: { searchList: true, recruits: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<LightResearchEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: { searchList: true, recruits: true },
    });
  }

  async save(entity: Partial<LightResearchEntity>): Promise<LightResearchEntity> {
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
