import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearchRecruitEntity } from '../entity/researchrecruit.entity';

@Injectable()
export class ResearchRecruitRepository {
  constructor(
    @InjectRepository(ResearchRecruitEntity)
    private readonly repo: Repository<ResearchRecruitEntity>,
  ) {}

  async findAll(): Promise<ResearchRecruitEntity[]> {
    return this.repo.find({ relations: { lightResearch: true }, order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<ResearchRecruitEntity | null> {
    return this.repo.findOne({ where: { id }, relations: { lightResearch: true } });
  }

  async save(entity: Partial<ResearchRecruitEntity>): Promise<ResearchRecruitEntity> {
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
