import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ResumeCoverLetterEntity } from 'src/recruit/domain/resume/resume-cover-letter.entity';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';
import { ResumeCoverLetterCategoryItem } from './resume.types';
import { parseCategory, stringifyCategory } from './resume.utils';

@Injectable()
export class ResumeCoverLetterService {
  constructor(
    @InjectRepository(ResumeCoverLetterEntity)
    private readonly coverLetterRepo: Repository<ResumeCoverLetterEntity>,
    @InjectRepository(ResumeEntity)
    private readonly resumeRepo: Repository<ResumeEntity>,
  ) {}

  async findForCategoryClassification(request: {
    resumeIds?: string[];
    coverLetterIds?: string[];
    onlyEmpty?: boolean;
    limit?: number;
  }): Promise<ResumeCoverLetterCategoryItem[]> {
    const qb = this.coverLetterRepo
      .createQueryBuilder('coverLetter')
      .orderBy('coverLetter.resumeId', 'ASC')
      .addOrderBy('coverLetter.orderIndex', 'ASC');

    if (request.resumeIds?.length) {
      qb.andWhere('coverLetter.resumeId IN (:...resumeIds)', {
        resumeIds: request.resumeIds,
      });
    }
    if (request.coverLetterIds?.length) {
      qb.andWhere('coverLetter.id IN (:...coverLetterIds)', {
        coverLetterIds: request.coverLetterIds,
      });
    }
    if (request.onlyEmpty !== false) {
      qb.andWhere(
        "(coverLetter.category IS NULL OR coverLetter.category = '' OR coverLetter.category = '[]')",
      );
    }
    if (request.limit && request.limit > 0) {
      qb.take(Math.min(request.limit, 100));
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      id: row.id,
      resumeId: row.resumeId,
      title: row.title ?? '',
      answer: row.answer ?? '',
      category: parseCategory(row.category),
    }));
  }

  async updateCategory(id: string, category: string[]): Promise<void> {
    await this.coverLetterRepo.update(id, {
      category: stringifyCategory(category),
    });
  }

  async findForRefinedTitle(request: {
    resumeIds?: string[];
    coverLetterIds?: string[];
    onlyEmpty?: boolean;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      resumeId: string;
      title: string;
      answer: string;
      companyName: string;
      jobTitle: string;
      jd: string | null;
    }>
  > {
    const qb = this.coverLetterRepo
      .createQueryBuilder('cl')
      .innerJoin('cl.resume', 'r')
      .addSelect(['r.companyName', 'r.jobTitle', 'r.jd'])
      .orderBy('cl.resumeId', 'ASC')
      .addOrderBy('cl.orderIndex', 'ASC');

    if (request.resumeIds?.length) {
      qb.andWhere('cl.resumeId IN (:...resumeIds)', {
        resumeIds: request.resumeIds,
      });
    }
    if (request.coverLetterIds?.length) {
      qb.andWhere('cl.id IN (:...coverLetterIds)', {
        coverLetterIds: request.coverLetterIds,
      });
    }
    if (request.onlyEmpty !== false) {
      qb.andWhere("(cl.refinedTitle IS NULL OR cl.refinedTitle = '')");
    }
    if (request.limit && request.limit > 0) {
      qb.take(Math.min(request.limit, 100));
    }

    const rows = await qb.getMany();
    const resumeIds = [...new Set(rows.map((r) => r.resumeId))];
    const resumes = resumeIds.length
      ? await this.resumeRepo.find({
          where: { id: In(resumeIds) },
          select: ['id', 'companyName', 'jobTitle', 'jd'],
        })
      : [];
    const resumeMap = new Map(resumes.map((r) => [r.id, r]));

    return rows.map((row) => {
      const resume = resumeMap.get(row.resumeId);
      return {
        id: row.id,
        resumeId: row.resumeId,
        title: row.title ?? '',
        answer: row.answer ?? '',
        companyName: resume?.companyName ?? '',
        jobTitle: resume?.jobTitle ?? '',
        jd: resume?.jd ?? null,
      };
    });
  }

  async updateRefinedTitle(id: string, refinedTitle: string): Promise<void> {
    await this.coverLetterRepo.update(id, { refinedTitle });
  }
}
