import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Like, Repository } from 'typeorm';
import { ResumeCoverLetterEntity } from '../../domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from '../../domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from '../../domain/resume/resume-prize.entity';
import { ResumeEntity } from '../../domain/resume/resume.entity';
import { ResumeAiEvalEntity } from '../../domain/resume/resume-ai-eval.entity';
import { RecruitResumeCompanyJdEntity } from '../../domain/resume/recruit-resume-company-jd.entity';
import { RecruitCompanyNewsEntity } from '../../domain/company-news/recruit-company-news.entity';

interface ResumeSelfIntro {
  id?: string;
  question?: string;
  title?: string; // legacy alias
  answer?: string;
  category?: string[] | string | null;
  refinedTitle?: string | null;
  companyName?: string; // legacy
  jobTitle?: string; // legacy
  jd?: string; // legacy
}

interface ResumeExperienceDto {
  id: string;
  activityType: string;
  organizationName: string;
  startDate: string | null;
  endDate: string | null;
  role: string | null;
  description: string | null;
}

interface ResumePrizeDto {
  id: string;
  title: string;
  organization: string;
  issuedDate: string | null;
  description: string | null;
}

interface ResumeTarget {
  id?: string;
  companyName?: string;
  jobTitle?: string;
  appliedAt?: string;
  applyDate?: string; // legacy alias accepted on write
  jd?: string;
  selfIntroductions?: ResumeSelfIntro[];
  coverLetters?: ResumeSelfIntro[]; // legacy alias
  experiences?: ResumeExperienceDto[];
  prizes?: ResumePrizeDto[];
}

// Accept any shape for saveResume (legacy compat)
type AnyProfile = {
  resume?: ResumeTarget[];
  resumeTargets?: ResumeTarget[];
  selfIntroductions?: ResumeSelfIntro[];
  [key: string]: unknown;
};

export type ResumeResult = { resume: ResumeTarget[] };

interface ResumeSearchCoverLetterItem {
  type: 'coverLetter';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  question: string;
  answer: string;
}

interface ResumeSearchExperienceItem {
  type: 'experience';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  activityType: string;
  organizationName: string;
  startDate: string | null;
  endDate: string | null;
  role: string | null;
  description: string | null;
}

interface ResumeSearchPrizeItem {
  type: 'prize';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  title: string;
  organization: string;
  issuedDate: string | null;
  description: string | null;
}

export type ResumeSearchItem = ResumeSearchCoverLetterItem | ResumeSearchExperienceItem | ResumeSearchPrizeItem;
export type ResumeSearchResult = { items: ResumeSearchItem[] };

export interface ResumeCoverLetterCategoryItem {
  id: string;
  resumeId: string;
  title: string;
  answer: string;
  category: string[];
}

@Injectable()
export class ResumeService {
  constructor(
    @InjectRepository(ResumeEntity)
    private readonly resumeRepo: Repository<ResumeEntity>,
    @InjectRepository(ResumeCoverLetterEntity)
    private readonly coverLetterRepo: Repository<ResumeCoverLetterEntity>,
    @InjectRepository(ResumeExperienceEntity)
    private readonly experienceRepo: Repository<ResumeExperienceEntity>,
    @InjectRepository(ResumePrizeEntity)
    private readonly prizeRepo: Repository<ResumePrizeEntity>,
    @InjectRepository(ResumeAiEvalEntity)
    private readonly aiEvalRepo: Repository<ResumeAiEvalEntity>,
    @InjectRepository(RecruitResumeCompanyJdEntity)
    private readonly companyJdRepo: Repository<RecruitResumeCompanyJdEntity>,
    @InjectRepository(RecruitCompanyNewsEntity)
    private readonly companyNewsRepo: Repository<RecruitCompanyNewsEntity>,
  ) {}

  // ── AI 평가 저장/조회 ───────────────────────────────────────────────────────

  async getAiEvals(resumeId: string): Promise<ResumeAiEvalEntity[]> {
    return this.aiEvalRepo.find({ where: { resumeId }, order: { updatedAt: 'DESC' } });
  }

  async upsertAiEval(
    resumeId: string,
    subjectKey: string,
    type: string,
    result: string,
    model: string | null,
  ): Promise<ResumeAiEvalEntity> {
    const existing = await this.aiEvalRepo.findOne({ where: { resumeId, subjectKey, type } });
    if (existing) {
      await this.aiEvalRepo.update(existing.id, { result, model });
      return { ...existing, result, model };
    }
    const entity = this.aiEvalRepo.create({ id: randomUUID(), resumeId, subjectKey, type, result, model });
    return this.aiEvalRepo.save(entity);
  }

  async deleteAiEval(id: string): Promise<void> {
    await this.aiEvalRepo.delete(id);
  }

  // ── JD 평가 저장/조회 ────────────────────────────────────────────────────────

  async getCompanyJdEval(resumeId: string): Promise<RecruitResumeCompanyJdEntity | null> {
    return this.companyJdRepo.findOne({ where: { resumeId } });
  }

  async upsertCompanyJdEval(
    resumeId: string,
    companyName: string,
    jdText: string,
    result: string,
    model: string | null,
  ): Promise<RecruitResumeCompanyJdEntity> {
    const existing = await this.companyJdRepo.findOne({ where: { resumeId } });
    if (existing) {
      await this.companyJdRepo.update(existing.id, { companyName, jdText, result, model });
      return { ...existing, companyName, jdText, result, model };
    }
    const entity = this.companyJdRepo.create({ id: randomUUID(), resumeId, companyName, jdText, result, model });
    return this.companyJdRepo.save(entity);
  }

  // ── 기업 뉴스 저장/조회 ──────────────────────────────────────────────────────

  async getCompanyNews(resumeId: string, companyName?: string): Promise<RecruitCompanyNewsEntity[]> {
    const where: Record<string, unknown> = { resumeId };
    if (companyName) where.companyName = companyName;
    return this.companyNewsRepo.find({ where: where as any, order: { createdAt: 'ASC' } });
  }

  async upsertCompanyNewsItem(
    resumeId: string,
    companyName: string,
    itemId: string,
    title: string,
    searchQuery: string,
    searchId: string | null,
  ): Promise<RecruitCompanyNewsEntity> {
    const existing = await this.companyNewsRepo.findOne({ where: { resumeId, companyName, itemId } });
    if (existing) {
      await this.companyNewsRepo.update(existing.id, { title, searchQuery, searchId });
      return { ...existing, title, searchQuery, searchId };
    }
    const entity = this.companyNewsRepo.create({ id: randomUUID(), resumeId, companyName, itemId, title, searchQuery, searchId, detailJson: null });
    return this.companyNewsRepo.save(entity);
  }

  async updateCompanyNewsDetail(id: string, detailJson: string): Promise<void> {
    await this.companyNewsRepo.update(id, { detailJson });
  }

  async deleteCompanyNews(id: string): Promise<void> {
    await this.companyNewsRepo.delete(id);
  }

  async deleteCompanyNewsByResume(resumeId: string, companyName?: string): Promise<void> {
    const where: Record<string, unknown> = { resumeId };
    if (companyName) where.companyName = companyName;
    await this.companyNewsRepo.delete(where as any);
  }

  async getResume(ids?: string): Promise<ResumeResult | null> {
    if (ids) {
      const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
      return this.getResumeDetail(idList);
    }

    const rows = await this.findAllResumes();
    if (rows.length === 0) return null;

    const hasNormalizedData = rows.some((row) => this.hasNormalizedContent(row));
    if (!hasNormalizedData) {
      const legacy = rows.find((row) => row.profileJson);
      if (legacy?.profileJson) {
        const migrated = this.parseLegacyProfile(legacy.profileJson);
        if (migrated) {
          await this.saveResume(migrated);
          return this.getResume();
        }
      }
      return null;
    }

    return { resume: this.toTargets(rows.filter((row) => this.hasNormalizedContent(row))) };
  }

  private async getResumeDetail(ids: string[]): Promise<ResumeResult | null> {
    const rows = await this.resumeRepo.find({
      where: { id: In(ids) },
      relations: { coverLetters: true, experiences: true, prizes: true },
    });
    if (rows.length === 0) return null;
    return { resume: this.toDetailTargets(rows) };
  }

  async saveResume(body: AnyProfile): Promise<ResumeResult> {
    const targets = this.normalizeTargets(body);

    await this.coverLetterRepo.createQueryBuilder().delete().execute();
    await this.experienceRepo.createQueryBuilder().delete().execute();
    await this.prizeRepo.createQueryBuilder().delete().execute();
    await this.resumeRepo.createQueryBuilder().delete().execute();

    const entities = targets.map((target, targetIndex) => {
      const resumeId = this.safeId(target.id);
      const coverLetters = target.selfIntroductions ?? target.coverLetters ?? [];
      const experiences = target.experiences ?? [];
      const prizes = target.prizes ?? [];

      return this.resumeRepo.create({
        id: resumeId,
        companyName: target.companyName?.trim() ?? '',
        jobTitle: target.jobTitle?.trim() ?? '',
        applyDate: this.normalizeDate(target.appliedAt ?? target.applyDate),
        jd: this.emptyToNull(target.jd),
        orderIndex: targetIndex,
        profileJson: null,
        coverLetters: coverLetters.map((item, index) =>
          this.coverLetterRepo.create({
            id: this.safeId(item.id),
            resumeId,
            title: (item.question ?? item.title ?? '').trim(),
            answer: item.answer ?? '',
            category: this.stringifyCategory(item.category),
            refinedTitle: item.refinedTitle ?? null,
            orderIndex: index,
          }),
        ),
        experiences: experiences.map((item, index) =>
          this.experienceRepo.create({
            id: this.safeId(item.id),
            resumeId,
            activityType: item.activityType?.trim() ?? '',
            organizationName: item.organizationName?.trim() ?? '',
            startDate: this.normalizeDate(item.startDate),
            endDate: this.normalizeDate(item.endDate),
            role: this.emptyToNull(item.role),
            description: this.emptyToNull(item.description),
            orderIndex: index,
          }),
        ),
        prizes: prizes.map((item, index) =>
          this.prizeRepo.create({
            id: this.safeId(item.id),
            resumeId,
            title: item.title?.trim() ?? '',
            organization: item.organization?.trim() ?? '',
            issuedDate: this.normalizeDate(item.issuedDate),
            description: this.emptyToNull(item.description),
            orderIndex: index,
          }),
        ),
      });
    });

    if (entities.length > 0) {
      await this.resumeRepo.save(entities);
    }

    const saved = await this.getResume();
    return saved ?? { resume: [] };
  }

  private normalizeTargets(body: AnyProfile): ResumeTarget[] {
    if (body.resume?.length) return body.resume;

    const existingTargets = body.resumeTargets?.length ? body.resumeTargets : [];
    if (existingTargets.length > 0) {
      return existingTargets.map((target) => ({
        ...target,
        selfIntroductions: target.selfIntroductions ?? target.coverLetters ?? [],
      }));
    }

    const intros = (body.selfIntroductions ?? []) as ResumeSelfIntro[];
    if (intros.length > 0) {
      const grouped = new Map<string, ResumeTarget>();
      for (const intro of intros) {
        const key = [intro.companyName ?? '', intro.jobTitle ?? '', intro.jd ?? ''].join('\n');
        const current = grouped.get(key) ?? {
          id: this.safeId(),
          companyName: intro.companyName ?? '',
          jobTitle: intro.jobTitle ?? '',
          jd: intro.jd ?? '',
          selfIntroductions: [],
        };
        current.selfIntroductions?.push(intro);
        grouped.set(key, current);
      }
      return [...grouped.values()];
    }

    return [{ id: this.safeId(), companyName: '', jobTitle: '', appliedAt: '', jd: '', selfIntroductions: [] }];
  }

  private toTargets(rows: ResumeEntity[]): ResumeTarget[] {
    const orderedRows = [...rows].sort(
      (a, b) => a.orderIndex - b.orderIndex || b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    return orderedRows.map((row) => ({
      id: row.id,
      companyName: row.companyName ?? '',
      jobTitle: row.jobTitle ?? '',
      appliedAt: row.applyDate ?? '',
      jd: row.jd ?? '',
      selfIntroductions: this.sortByOrder(row.coverLetters ?? []).map((cl) => ({
        id: cl.id,
        question: cl.title ?? '',
        answer: cl.answer ?? '',
        category: this.parseCategory(cl.category),
        refinedTitle: cl.refinedTitle ?? null,
      })),
      experiences: this.sortByOrder(row.experiences ?? []).map((ex) => ({
        id: ex.id,
        activityType: ex.activityType ?? '',
        organizationName: ex.organizationName ?? '',
        startDate: ex.startDate ?? null,
        endDate: ex.endDate ?? null,
        role: ex.role ?? null,
        description: ex.description ?? null,
      })),
      prizes: this.sortByOrder(row.prizes ?? []).map((pr) => ({
        id: pr.id,
        title: pr.title ?? '',
        organization: pr.organization ?? '',
        issuedDate: pr.issuedDate ?? null,
        description: pr.description ?? null,
      })),
    }));
  }

  private toDetailTargets(rows: ResumeEntity[]): ResumeTarget[] {
    const orderedRows = [...rows].sort(
      (a, b) => a.orderIndex - b.orderIndex || b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    return orderedRows.map((row) => ({
      id: row.id,
      companyName: row.companyName ?? '',
      jobTitle: row.jobTitle ?? '',
      appliedAt: row.applyDate ?? '',
      jd: row.jd ?? '',
      selfIntroductions: this.sortByOrder(row.coverLetters ?? []).map((cl) => ({
        id: cl.id,
        question: cl.title ?? '',
        answer: cl.answer ?? '',
        category: this.parseCategory(cl.category),
        refinedTitle: cl.refinedTitle ?? null,
      })),
      experiences: this.sortByOrder(row.experiences ?? []).map((ex) => ({
        id: ex.id,
        activityType: ex.activityType ?? '',
        organizationName: ex.organizationName ?? '',
        startDate: ex.startDate ?? null,
        endDate: ex.endDate ?? null,
        role: ex.role ?? null,
        description: ex.description ?? null,
      })),
      prizes: this.sortByOrder(row.prizes ?? []).map((pr) => ({
        id: pr.id,
        title: pr.title ?? '',
        organization: pr.organization ?? '',
        issuedDate: pr.issuedDate ?? null,
        description: pr.description ?? null,
      })),
    }));
  }

  private async findAllResumes(): Promise<ResumeEntity[]> {
    return this.resumeRepo.find({
      relations: { coverLetters: true, experiences: true, prizes: true },
      order: { orderIndex: 'ASC', updatedAt: 'DESC' },
    });
  }

  private hasNormalizedContent(row: ResumeEntity): boolean {
    return Boolean(
      row.companyName?.trim() ||
        row.jobTitle?.trim() ||
        row.applyDate ||
        row.jd ||
        row.coverLetters?.length,
    );
  }

  private parseLegacyProfile(profileJson: string): AnyProfile | null {
    try {
      return JSON.parse(profileJson) as AnyProfile;
    } catch {
      return null;
    }
  }

  private sortByOrder<T extends { orderIndex: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async findCoverLettersForCategoryClassification(request: {
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
      qb.andWhere('coverLetter.resumeId IN (:...resumeIds)', { resumeIds: request.resumeIds });
    }
    if (request.coverLetterIds?.length) {
      qb.andWhere('coverLetter.id IN (:...coverLetterIds)', { coverLetterIds: request.coverLetterIds });
    }
    if (request.onlyEmpty !== false) {
      qb.andWhere("(coverLetter.category IS NULL OR coverLetter.category = '' OR coverLetter.category = '[]')");
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
      category: this.parseCategory(row.category),
    }));
  }

  async updateCoverLetterCategory(id: string, category: string[]): Promise<void> {
    await this.coverLetterRepo.update(id, { category: this.stringifyCategory(category) });
  }

  async findCoverLettersForRefinedTitle(request: {
    resumeIds?: string[];
    coverLetterIds?: string[];
    onlyEmpty?: boolean;
    limit?: number;
  }): Promise<Array<{ id: string; resumeId: string; title: string; answer: string; companyName: string; jobTitle: string; jd: string | null }>> {
    const qb = this.coverLetterRepo
      .createQueryBuilder('cl')
      .innerJoin('cl.resume', 'r')
      .addSelect(['r.companyName', 'r.jobTitle', 'r.jd'])
      .orderBy('cl.resumeId', 'ASC')
      .addOrderBy('cl.orderIndex', 'ASC');

    if (request.resumeIds?.length) {
      qb.andWhere('cl.resumeId IN (:...resumeIds)', { resumeIds: request.resumeIds });
    }
    if (request.coverLetterIds?.length) {
      qb.andWhere('cl.id IN (:...coverLetterIds)', { coverLetterIds: request.coverLetterIds });
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
      ? await this.resumeRepo.find({ where: { id: In(resumeIds) }, select: ['id', 'companyName', 'jobTitle', 'jd'] })
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

  async updateCoverLetterRefinedTitle(id: string, refinedTitle: string): Promise<void> {
    await this.coverLetterRepo.update(id, { refinedTitle });
  }

  private safeId(id?: string): string {
    const value = id?.trim();
    return value || randomUUID();
  }

  private emptyToNull(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeDate(value?: string | null): string | null {
    const v = value?.trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const dotSlash = v.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
    if (dotSlash) return `${dotSlash[1]}-${dotSlash[2].padStart(2, '0')}-${dotSlash[3].padStart(2, '0')}`;
    const compact = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const partial = v.match(/^(\d{4})[.\-/](\d{1,2})$/);
    if (partial) return `${partial[1]}-${partial[2].padStart(2, '0')}-01`;
    if (/^\d{4}$/.test(v)) return `${v}-01-01`;
    return v;
  }

  private parseCategory(value?: string | null): string[] {
    if (!value?.trim()) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Legacy comma-separated values.
    }
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  async searchResume(q: string): Promise<ResumeSearchResult> {
    const pattern = Like(`%${q}%`);

    const resumes = await this.resumeRepo.find({ select: ['id', 'companyName', 'jobTitle'] });
    const resumeMap = new Map(resumes.map((r) => [r.id, { companyName: r.companyName ?? '', jobTitle: r.jobTitle ?? '' }]));

    const [coverLetters, experiences, prizes] = await Promise.all([
      this.coverLetterRepo.find({
        where: [{ title: pattern }, { answer: pattern }],
        order: { orderIndex: 'ASC' },
        take: 15,
      }),
      this.experienceRepo.find({
        where: [{ activityType: pattern }, { organizationName: pattern }, { description: pattern }],
        order: { orderIndex: 'ASC' },
        take: 15,
      }),
      this.prizeRepo.find({
        where: [{ title: pattern }, { organization: pattern }, { description: pattern }],
        order: { orderIndex: 'ASC' },
        take: 15,
      }),
    ]);

    const items: ResumeSearchItem[] = [
      ...coverLetters.map((cl) => ({
        type: 'coverLetter' as const,
        id: cl.id,
        resumeId: cl.resumeId,
        companyName: resumeMap.get(cl.resumeId)?.companyName ?? '',
        jobTitle: resumeMap.get(cl.resumeId)?.jobTitle ?? '',
        question: cl.title ?? '',
        answer: cl.answer ?? '',
      })),
      ...experiences.map((ex) => ({
        type: 'experience' as const,
        id: ex.id,
        resumeId: ex.resumeId,
        companyName: resumeMap.get(ex.resumeId)?.companyName ?? '',
        jobTitle: resumeMap.get(ex.resumeId)?.jobTitle ?? '',
        activityType: ex.activityType ?? '',
        organizationName: ex.organizationName ?? '',
        startDate: ex.startDate ?? null,
        endDate: ex.endDate ?? null,
        role: ex.role ?? null,
        description: ex.description ?? null,
      })),
      ...prizes.map((pr) => ({
        type: 'prize' as const,
        id: pr.id,
        resumeId: pr.resumeId,
        companyName: resumeMap.get(pr.resumeId)?.companyName ?? '',
        jobTitle: resumeMap.get(pr.resumeId)?.jobTitle ?? '',
        title: pr.title ?? '',
        organization: pr.organization ?? '',
        issuedDate: pr.issuedDate ?? null,
        description: pr.description ?? null,
      })),
    ];

    return { items };
  }

  private stringifyCategory(value?: string[] | string | null): string | null {
    if (!value) return null;
    const categories = Array.isArray(value)
      ? value
      : value.split(',').map((item) => item.trim());
    const normalized = [...new Set(categories.map((item) => item.trim()).filter(Boolean))];
    return normalized.length > 0 ? JSON.stringify(normalized) : null;
  }
}
