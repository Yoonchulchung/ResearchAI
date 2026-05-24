import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResumeEntity } from '../../domain/resume/resume.entity';

const RESUME_ID = 'default';

@Injectable()
export class ResumeService {
  constructor(
    @InjectRepository(ResumeEntity)
    private readonly repo: Repository<ResumeEntity>,
  ) {}

  async getResume(): Promise<object | null> {
    const record = await this.repo.findOne({ where: { id: RESUME_ID } });
    if (!record?.profileJson) return null;
    try {
      return JSON.parse(record.profileJson);
    } catch {
      return null;
    }
  }

  async saveResume(profile: object): Promise<object> {
    let record = await this.repo.findOne({ where: { id: RESUME_ID } });
    if (!record) {
      record = this.repo.create({ id: RESUME_ID });
    }
    record.profileJson = JSON.stringify(profile);
    await this.repo.save(record);
    return profile;
  }
}
