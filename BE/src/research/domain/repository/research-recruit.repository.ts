import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearchRecruitEntity } from 'src/research/domain/entity/researchrecruit.entity';

@Injectable()
export class ResearchRecruitRepository {
  constructor(
    @InjectRepository(ResearchRecruitEntity)
    private readonly repo: Repository<ResearchRecruitEntity>,
  ) {}

  async findAll(): Promise<ResearchRecruitEntity[]> {
    return this.repo.find({
      relations: { lightResearch: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<ResearchRecruitEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: { lightResearch: true },
    });
  }

  async save(
    entity: Partial<ResearchRecruitEntity>,
  ): Promise<ResearchRecruitEntity> {
    return this.repo.save(entity);
  }

  async findByLightResearchId(
    lightResearchId: string,
  ): Promise<ResearchRecruitEntity[]> {
    return this.repo.find({
      where: { lightResearchId },
      order: { createdAt: 'ASC' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
