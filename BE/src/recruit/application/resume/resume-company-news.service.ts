import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { RecruitCompanyNewsEntity } from 'src/recruit/domain/company-news/recruit-company-news.entity';

@Injectable()
export class ResumeCompanyNewsService {
  constructor(
    @InjectRepository(RecruitCompanyNewsEntity)
    private readonly companyNewsRepo: Repository<RecruitCompanyNewsEntity>,
  ) {}

  async getCompanyNews(
    resumeId: string,
    companyName?: string,
  ): Promise<RecruitCompanyNewsEntity[]> {
    const where: Record<string, unknown> = { resumeId };
    if (companyName) where.companyName = companyName;
    return this.companyNewsRepo.find({
      where: where as any,
      order: { createdAt: 'ASC' },
    });
  }

  async upsertCompanyNewsItem(
    resumeId: string,
    companyName: string,
    itemId: string,
    title: string,
    searchQuery: string,
    searchId: string | null,
  ): Promise<RecruitCompanyNewsEntity> {
    const existing = await this.companyNewsRepo.findOne({
      where: { resumeId, companyName, itemId },
    });
    if (existing) {
      await this.companyNewsRepo.update(existing.id, {
        title,
        searchQuery,
        searchId,
      });
      return { ...existing, title, searchQuery, searchId };
    }
    const entity = this.companyNewsRepo.create({
      id: randomUUID(),
      resumeId,
      companyName,
      itemId,
      title,
      searchQuery,
      searchId,
      detailJson: null,
    });
    return this.companyNewsRepo.save(entity);
  }

  async updateCompanyNewsDetail(id: string, detailJson: string): Promise<void> {
    await this.companyNewsRepo.update(id, { detailJson });
  }

  async deleteCompanyNews(id: string): Promise<void> {
    await this.companyNewsRepo.delete(id);
  }

  async deleteCompanyNewsByResume(
    resumeId: string,
    companyName?: string,
  ): Promise<void> {
    const where: Record<string, unknown> = { resumeId };
    if (companyName) where.companyName = companyName;
    await this.companyNewsRepo.delete(where as any);
  }
}
