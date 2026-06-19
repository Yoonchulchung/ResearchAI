import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CoverLetter,
  CoverLetterListFilters,
  CoverLetterQuestionSearchItem,
} from 'src/recruit/domain/cover-letter/cover-letter.model';
import { CoverLetterEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterQuestionEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-question.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import {
  normalizeCompanyName,
  normalizeSearchText,
  parseJsonArray,
  toCoverLetter,
} from './cover-letter.utils';

@Injectable()
export class CoverLetterQueryService {
  constructor(
    @InjectRepository(CoverLetterEntity)
    private readonly coverLetterRepo: Repository<CoverLetterEntity>,
    @InjectRepository(CoverLetterQuestionEntity)
    private readonly questionRepo: Repository<CoverLetterQuestionEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
  ) {}

  async getData(
    page: number,
    limit: number,
    filters: CoverLetterListFilters = {},
    offset?: number,
  ): Promise<{
    items: CoverLetter[];
    total: number;
    page: number;
    limit: number;
    offset: number;
    hasNext: boolean;
  }> {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset =
      offset !== undefined && Number.isFinite(offset)
        ? Math.max(Number(offset), 0)
        : (safePage - 1) * safeLimit;
    const source = filters.source?.trim();
    const companyType = filters.companyType?.trim();
    const search = normalizeSearchText(filters.search);
    const jobCategory = filters.jobCategory?.trim();

    const qb = this.coverLetterRepo.createQueryBuilder('coverLetter');
    if (filters.hidden === true) {
      qb.andWhere('coverLetter.isHidden = :isHidden', { isHidden: true });
    } else {
      qb.andWhere(
        '(coverLetter.isHidden = :isHidden OR coverLetter.isHidden IS NULL)',
        { isHidden: false },
      );
    }
    if (source && source !== 'all' && source !== '전체') {
      qb.andWhere('coverLetter.source = :source', { source });
    }
    if (companyType && companyType !== '전체') {
      qb.andWhere('coverLetter.companyType = :companyType', { companyType });
    }
    if (jobCategory && jobCategory !== 'all' && jobCategory !== '전체') {
      if (jobCategory === 'IT+전자') {
        qb.andWhere('coverLetter.jobCategory IN (:...cats)', { cats: ['IT', '전자'] });
      } else {
        qb.andWhere('coverLetter.jobCategory = :jobCategory', { jobCategory });
      }
    }
    if (search) {
      qb.andWhere('coverLetter.searchText LIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('coverLetter.collectedAt', 'DESC')
      .addOrderBy('coverLetter.createdAt', 'DESC')
      .skip(safeOffset)
      .take(safeLimit);

    const [entities, total] = await qb.getManyAndCount();
    const industryMap = await this.lookupIndustries(entities.map((e) => e.company));
    const items = entities.map((entity) => toCoverLetter(entity, industryMap.get(entity.company)));
    return { items, total, page: safePage, limit: safeLimit, offset: safeOffset, hasNext: safeOffset + items.length < total };
  }

  async getById(id: string): Promise<CoverLetter | null> {
    const entity = await this.coverLetterRepo.findOne({
      where: { id },
      relations: { questionItems: true },
    });
    if (!entity) return null;
    const industryMap = await this.lookupIndustries([entity.company]);
    return toCoverLetter(entity, industryMap.get(entity.company));
  }

  async setHidden(id: string, isHidden: boolean): Promise<CoverLetter | null> {
    const entity = await this.coverLetterRepo.findOne({ where: { id } });
    if (!entity) return null;
    entity.isHidden = isHidden;
    await this.coverLetterRepo.save(entity);
    return this.getById(id);
  }

  async searchQuestions(
    query: string,
    limit = 20,
  ): Promise<{ items: CoverLetterQuestionSearchItem[]; total: number }> {
    const search = normalizeSearchText(query);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const qb = this.questionRepo
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.coverLetter', 'coverLetter')
      .orderBy('coverLetter.collectedAt', 'DESC')
      .addOrderBy('question.number', 'ASC')
      .take(safeLimit);
    qb.andWhere(
      '(coverLetter.isHidden = :isHidden OR coverLetter.isHidden IS NULL)',
      { isHidden: false },
    );
    if (search) {
      qb.andWhere('question.searchText LIKE :search', { search: `%${search}%` });
    }

    const [rows, total] = await qb.getManyAndCount();
    const companyNames = [
      ...new Set(rows.map((row) => row.coverLetter?.company).filter(Boolean)),
    ] as string[];
    const industryMap = await this.lookupIndustries(companyNames);
    return {
      items: rows
        .filter((row) => row.coverLetter)
        .map((row) => {
          const coverLetter = toCoverLetter(row.coverLetter, industryMap.get(row.coverLetter.company));
          return {
            id: row.id,
            coverLetterId: row.coverLetterId,
            number: row.number,
            question: row.question,
            answer: row.answer,
            keywords: parseJsonArray(row.keywords),
            tags: parseJsonArray(row.tags),
            coverLetter: {
              id: coverLetter.id,
              url: coverLetter.url,
              source: coverLetter.source,
              companyType: coverLetter.companyType,
              jobCategory: coverLetter.jobCategory,
              company: coverLetter.company,
              position: coverLetter.position,
              season: coverLetter.season,
              spec: coverLetter.spec,
              viewCount: coverLetter.viewCount,
              collectedAt: coverLetter.collectedAt,
              industry: coverLetter.industry,
            },
          };
        }),
      total,
    };
  }

  async lookupIndustries(companyNames: string[]): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    if (companyNames.length === 0) return map;
    const normalizedNames = companyNames.map((n) => normalizeCompanyName(n));
    const companies = await this.companyRepo.find({
      where: normalizedNames.map((n) => ({ normalizedName: n })),
    });
    const byNormalized = new Map(companies.map((c) => [c.normalizedName, c.industry ?? null]));
    for (const name of companyNames) {
      map.set(name, byNormalized.get(normalizeCompanyName(name)) ?? null);
    }
    return map;
  }
}
