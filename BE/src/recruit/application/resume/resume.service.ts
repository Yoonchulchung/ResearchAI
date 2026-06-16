import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer';
import { In, Like, Repository } from 'typeorm';
import { ResumeCoverLetterEntity } from '../../domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from '../../domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from '../../domain/resume/resume-prize.entity';
import { ResumeTrainingEntity } from '../../domain/resume/resume-training.entity';
import { ResumeVersionEntity } from '../../domain/resume/resume-version.entity';
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

interface ResumeTrainingDto {
  id: string;
  title: string;
  institution: string;
  startDate: string | null;
  endDate: string | null;
  hours: string | null;
  description: string | null;
}

interface ResumeTarget {
  id?: string;
  companyName?: string;
  jobTitle?: string;
  appliedAt?: string;
  applyDate?: string; // legacy alias accepted on write
  updatedAt?: string;
  isDeleted?: boolean;
  jd?: string;
  interviewScript?: string | null;
  selfIntroductions?: ResumeSelfIntro[];
  coverLetters?: ResumeSelfIntro[]; // legacy alias
  experiences?: ResumeExperienceDto[];
  prizes?: ResumePrizeDto[];
  trainings?: ResumeTrainingDto[];
}

// Accept any shape for saveResume (legacy compat)
type AnyProfile = {
  resume?: ResumeTarget[];
  resumeTargets?: ResumeTarget[];
  selfIntroductions?: ResumeSelfIntro[];
  replaceAll?: boolean;
  [key: string]: unknown;
};

export type ResumeResult = { resume: ResumeTarget[] };
export type ResumePdfResult = { buffer: Buffer; filename: string };

export interface ResumeVersionSummary {
  id: string;
  resumeId: string;
  title: string | null;
  companyName: string;
  jobTitle: string;
  appliedAt: string;
  createdAt: string;
}

export type ResumeVersionListResult = { items: ResumeVersionSummary[] };
export type ResumeVersionDetailResult = { version: ResumeVersionSummary; target: ResumeTarget };

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

interface ResumeSearchTrainingItem {
  type: 'training';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  title: string;
  institution: string;
  startDate: string | null;
  endDate: string | null;
  hours: string | null;
  description: string | null;
}

export type ResumeSearchItem = ResumeSearchCoverLetterItem | ResumeSearchExperienceItem | ResumeSearchPrizeItem | ResumeSearchTrainingItem;
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
    @InjectRepository(ResumeTrainingEntity)
    private readonly trainingRepo: Repository<ResumeTrainingEntity>,
    @InjectRepository(ResumeVersionEntity)
    private readonly versionRepo: Repository<ResumeVersionEntity>,
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

  async getResume(ids?: string, options: { deleted?: boolean } = {}): Promise<ResumeResult | null> {
    if (ids) {
      const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
      return this.getResumeDetail(idList, { includeDeleted: options.deleted === true });
    }

    const rows = await this.findAllResumes({ deleted: options.deleted === true });
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

  private async getResumeDetail(ids: string[], options: { includeDeleted?: boolean } = {}): Promise<ResumeResult | null> {
    const rows = await this.resumeRepo.find({
      where: options.includeDeleted ? { id: In(ids) } : { id: In(ids), isDeleted: false },
      relations: { coverLetters: true, experiences: true, prizes: true, trainings: true },
    });
    if (rows.length === 0) return null;
    return { resume: this.toDetailTargets(rows) };
  }

  async listVersions(resumeId: string): Promise<ResumeVersionListResult> {
    let rows = await this.versionRepo.find({
      where: { resumeId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    if (rows.length === 0) {
      const current = await this.getResumeDetail([resumeId]);
      const target = current?.resume[0];
      if (target) {
        await this.recordResumeVersion(target);
        rows = await this.versionRepo.find({
          where: { resumeId },
          order: { createdAt: 'DESC' },
          take: 50,
        });
      }
    }

    return { items: rows.map((row) => this.toVersionSummary(row)) };
  }

  async getVersion(resumeId: string, versionId: string): Promise<ResumeVersionDetailResult> {
    const version = await this.versionRepo.findOne({ where: { id: versionId, resumeId } });
    if (!version) throw new NotFoundException('버전 기록을 찾을 수 없습니다.');

    return {
      version: this.toVersionSummary(version),
      target: this.parseVersionSnapshot(version.snapshotJson),
    };
  }

  async generateResumePdf(resumeId: string): Promise<ResumePdfResult> {
    const detail = await this.getResumeDetail([resumeId]);
    const target = detail?.resume[0];
    if (!target) throw new NotFoundException('이력서를 찾을 수 없습니다.');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(this.renderResumePdfHtml(target), {
        waitUntil: ['load', 'networkidle0'],
      });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%; padding:0 14mm; text-align:right; font-size:8px; color:#94a3b8;"><span class="pageNumber"></span></div>',
        margin: { top: '14mm', right: '14mm', bottom: '16mm', left: '14mm' },
      });
      return {
        buffer: Buffer.from(pdf),
        filename: `${this.safeFilename(target.companyName || 'resume')}-${this.safeFilename(target.jobTitle || 'resume')}.pdf`,
      };
    } finally {
      await browser.close();
    }
  }

  async restoreVersion(resumeId: string, versionId: string): Promise<ResumeResult> {
    const version = await this.versionRepo.findOne({ where: { id: versionId, resumeId } });
    if (!version) throw new NotFoundException('버전 기록을 찾을 수 없습니다.');

    const snapshot = this.parseVersionSnapshot(version.snapshotJson);
    return this.saveResume({
      resume: [{ ...snapshot, id: resumeId }],
      replaceAll: false,
    });
  }

  async deleteVersion(resumeId: string, versionId: string): Promise<void> {
    await this.versionRepo.delete({ id: versionId, resumeId });
  }

  async updateInterviewScript(resumeId: string, interviewScript: string): Promise<{ interviewScript: string }> {
    const existing = await this.resumeRepo.findOne({ where: { id: resumeId, isDeleted: false } });
    if (!existing) throw new NotFoundException('이력서를 찾을 수 없습니다.');
    const nextScript = interviewScript ?? '';
    await this.resumeRepo.update({ id: resumeId }, { interviewScript: this.emptyToNull(nextScript) });
    return { interviewScript: nextScript };
  }

  async saveResume(body: AnyProfile): Promise<ResumeResult> {
    const targets = this.normalizeTargets(body);
    const targetIds = targets.map((target) => target.id?.trim()).filter((id): id is string => Boolean(id));
    const existingScriptRows = targetIds.length > 0
      ? await this.resumeRepo.find({ select: ['id', 'interviewScript'], where: { id: In(targetIds) } })
      : [];
    const existingScripts = new Map(existingScriptRows.map((row) => [row.id, row.interviewScript]));

    const entities = targets.map((target, targetIndex) => {
      const resumeId = this.safeId(target.id);
      const coverLetters = target.selfIntroductions ?? target.coverLetters ?? [];
      const experiences = target.experiences ?? [];
      const prizes = target.prizes ?? [];
      const trainings = target.trainings ?? [];

      return this.resumeRepo.create({
        id: resumeId,
        companyName: target.companyName?.trim() ?? '',
        jobTitle: target.jobTitle?.trim() ?? '',
        applyDate: this.normalizeDate(target.appliedAt ?? target.applyDate),
        jd: this.emptyToNull(target.jd),
        interviewScript: target.interviewScript === undefined
          ? existingScripts.get(resumeId) ?? null
          : this.emptyToNull(target.interviewScript),
        orderIndex: targetIndex,
        profileJson: null,
        isDeleted: false,
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
        trainings: trainings.map((item, index) =>
          this.trainingRepo.create({
            id: this.safeId(item.id),
            resumeId,
            title: item.title?.trim() ?? '',
            institution: item.institution?.trim() ?? '',
            startDate: this.normalizeDate(item.startDate),
            endDate: this.normalizeDate(item.endDate),
            hours: this.emptyToNull(item.hours),
            description: this.emptyToNull(item.description),
            orderIndex: index,
          }),
        ),
      });
    });

    for (const entity of entities) {
      await this.coverLetterRepo.delete({ resumeId: entity.id });
      await this.experienceRepo.delete({ resumeId: entity.id });
      await this.prizeRepo.delete({ resumeId: entity.id });
      await this.trainingRepo.delete({ resumeId: entity.id });
      await this.resumeRepo.save(entity);
    }

    if (body.replaceAll === true) {
      const keepIds = new Set(entities.map((entity) => entity.id));
      const existing = await this.resumeRepo.find({ select: ['id'], where: { isDeleted: false } });
      for (const row of existing) {
        if (!keepIds.has(row.id)) await this.deleteResume(row.id);
      }
    }

    const saved = await this.getResume();
    if (saved) {
      const savedEntityIds = new Set(entities.map((entity) => entity.id));
      for (const target of saved.resume) {
        if (target.id && savedEntityIds.has(target.id)) {
          await this.recordResumeVersion(target);
        }
      }
    }
    return saved ?? { resume: [] };
  }

  async deleteResume(resumeId: string): Promise<void> {
    await this.resumeRepo.update({ id: resumeId }, { isDeleted: true });
  }

  async restoreResume(resumeId: string): Promise<void> {
    await this.resumeRepo.update({ id: resumeId }, { isDeleted: false });
  }

  async permanentlyDeleteResume(resumeId: string): Promise<void> {
    await this.companyNewsRepo.delete({ resumeId });
    await this.companyJdRepo.delete({ resumeId });
    await this.aiEvalRepo.delete({ resumeId });
    await this.coverLetterRepo.delete({ resumeId });
    await this.experienceRepo.delete({ resumeId });
    await this.prizeRepo.delete({ resumeId });
    await this.trainingRepo.delete({ resumeId });
    await this.versionRepo.delete({ resumeId });
    await this.resumeRepo.delete(resumeId);
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
      (a, b) => this.compareResumeRows(a, b),
    );
    return orderedRows.map((row) => ({
      id: row.id,
      companyName: row.companyName ?? '',
      jobTitle: row.jobTitle ?? '',
      appliedAt: row.applyDate ?? '',
      updatedAt: row.updatedAt.toISOString(),
      isDeleted: row.isDeleted,
      jd: row.jd ?? '',
      interviewScript: row.interviewScript ?? '',
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
      trainings: this.sortByOrder(row.trainings ?? []).map((tr) => ({
        id: tr.id,
        title: tr.title ?? '',
        institution: tr.institution ?? '',
        startDate: tr.startDate ?? null,
        endDate: tr.endDate ?? null,
        hours: tr.hours ?? null,
        description: tr.description ?? null,
      })),
    }));
  }

  private toDetailTargets(rows: ResumeEntity[]): ResumeTarget[] {
    const orderedRows = [...rows].sort(
      (a, b) => this.compareResumeRows(a, b),
    );
    return orderedRows.map((row) => ({
      id: row.id,
      companyName: row.companyName ?? '',
      jobTitle: row.jobTitle ?? '',
      appliedAt: row.applyDate ?? '',
      updatedAt: row.updatedAt.toISOString(),
      isDeleted: row.isDeleted,
      jd: row.jd ?? '',
      interviewScript: row.interviewScript ?? '',
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
      trainings: this.sortByOrder(row.trainings ?? []).map((tr) => ({
        id: tr.id,
        title: tr.title ?? '',
        institution: tr.institution ?? '',
        startDate: tr.startDate ?? null,
        endDate: tr.endDate ?? null,
        hours: tr.hours ?? null,
        description: tr.description ?? null,
      })),
    }));
  }

  private async findAllResumes(options: { deleted?: boolean } = {}): Promise<ResumeEntity[]> {
    return this.resumeRepo.find({
      where: { isDeleted: options.deleted === true },
      relations: { coverLetters: true, experiences: true, prizes: true, trainings: true },
      order: { applyDate: 'DESC', updatedAt: 'DESC' },
    });
  }

  private hasNormalizedContent(row: ResumeEntity): boolean {
    return Boolean(
      row.companyName?.trim() ||
        row.jobTitle?.trim() ||
        row.applyDate ||
        row.jd ||
        row.interviewScript ||
        row.coverLetters?.length ||
        row.experiences?.length ||
        row.prizes?.length ||
        row.trainings?.length,
    );
  }

  private parseLegacyProfile(profileJson: string): AnyProfile | null {
    try {
      return JSON.parse(profileJson) as AnyProfile;
    } catch {
      return null;
    }
  }

  private compareResumeRows(a: ResumeEntity, b: ResumeEntity): number {
    const aDate = a.applyDate ?? '';
    const bDate = b.applyDate ?? '';
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return a.updatedAt.getTime() - b.updatedAt.getTime();
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

  private async recordResumeVersion(target: ResumeTarget): Promise<void> {
    if (!target.id) return;

    const snapshot = this.buildVersionSnapshot(target);
    const snapshotJson = JSON.stringify(snapshot);
    const latest = await this.versionRepo.findOne({
      where: { resumeId: target.id },
      order: { createdAt: 'DESC' },
    });
    if (latest?.snapshotJson === snapshotJson) return;

    await this.versionRepo.save(this.versionRepo.create({
      id: randomUUID(),
      resumeId: target.id,
      title: this.getVersionTitle(snapshot),
      snapshotJson,
    }));
    await this.trimResumeVersions(target.id);
  }

  private async trimResumeVersions(resumeId: string): Promise<void> {
    const keepLimit = 50;
    const rows = await this.versionRepo.find({
      where: { resumeId },
      select: ['id'],
      order: { createdAt: 'DESC' },
    });
    const removableIds = rows.slice(keepLimit).map((row) => row.id);
    if (removableIds.length > 0) {
      await this.versionRepo.delete({ id: In(removableIds) });
    }
  }

  private buildVersionSnapshot(target: ResumeTarget): ResumeTarget {
    const selfIntroductions = target.selfIntroductions ?? target.coverLetters ?? [];
    return {
      id: target.id,
      companyName: target.companyName ?? '',
      jobTitle: target.jobTitle ?? '',
      appliedAt: target.appliedAt ?? target.applyDate ?? '',
      jd: target.jd ?? '',
      selfIntroductions: selfIntroductions.map((item) => ({
        id: item.id,
        question: item.question ?? item.title ?? '',
        answer: item.answer ?? '',
        category: this.parseCategory(this.stringifyCategory(item.category)),
        refinedTitle: item.refinedTitle ?? null,
      })),
      experiences: (target.experiences ?? []).map((item) => ({
        id: item.id,
        activityType: item.activityType ?? '',
        organizationName: item.organizationName ?? '',
        startDate: item.startDate ?? null,
        endDate: item.endDate ?? null,
        role: item.role ?? null,
        description: item.description ?? null,
      })),
      prizes: (target.prizes ?? []).map((item) => ({
        id: item.id,
        title: item.title ?? '',
        organization: item.organization ?? '',
        issuedDate: item.issuedDate ?? null,
        description: item.description ?? null,
      })),
      trainings: (target.trainings ?? []).map((item) => ({
        id: item.id,
        title: item.title ?? '',
        institution: item.institution ?? '',
        startDate: item.startDate ?? null,
        endDate: item.endDate ?? null,
        hours: item.hours ?? null,
        description: item.description ?? null,
      })),
    };
  }

  private parseVersionSnapshot(snapshotJson: string): ResumeTarget {
    try {
      return this.buildVersionSnapshot(JSON.parse(snapshotJson) as ResumeTarget);
    } catch {
      throw new BadRequestException('버전 스냅샷을 읽을 수 없습니다.');
    }
  }

  private toVersionSummary(row: ResumeVersionEntity): ResumeVersionSummary {
    const snapshot = this.parseVersionSnapshot(row.snapshotJson);
    return {
      id: row.id,
      resumeId: row.resumeId,
      title: row.title,
      companyName: snapshot.companyName ?? '',
      jobTitle: snapshot.jobTitle ?? '',
      appliedAt: snapshot.appliedAt ?? '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  private getVersionTitle(target: ResumeTarget): string | null {
    const title = [target.companyName, target.jobTitle]
      .map((item) => item?.trim())
      .filter(Boolean)
      .join(' · ');
    return title || null;
  }

  private renderResumePdfHtml(target: ResumeTarget): string {
    const normalExperiences = (target.experiences ?? []).filter((item) => item.activityType !== '해외 경험');
    const overseasExperiences = (target.experiences ?? []).filter((item) => item.activityType === '해외 경험');

    const renderMeta = (label: string, value?: string | null) => value?.trim()
      ? `<div class="meta-row"><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(value)}</strong></div>`
      : '';

    const renderText = (value?: string | null) => `<div class="text">${this.escapeHtml(this.normalizeLineBreaks(value)) || '<span class="empty">내용 없음</span>'}</div>`;

    const renderSection = (title: string, body: string) => body.trim()
      ? `<section class="section"><h2>${this.escapeHtml(title)}</h2>${body}</section>`
      : '';

    const renderExperience = (item: ResumeExperienceDto) => `
      <article class="item">
        <div class="item-head">
          <h3>${this.escapeHtml(item.activityType || item.organizationName || '활동')}</h3>
          <span>${this.escapeHtml([item.startDate, item.endDate ? `~ ${item.endDate}` : ''].filter(Boolean).join(' '))}</span>
        </div>
        <p class="sub">${this.escapeHtml([item.organizationName, item.role].filter(Boolean).join(' · '))}</p>
        ${renderText(item.description)}
      </article>
    `;

    const renderPrize = (item: ResumePrizeDto) => `
      <article class="item">
        <div class="item-head">
          <h3>${this.escapeHtml(item.title || '수상')}</h3>
          <span>${this.escapeHtml(item.issuedDate ?? '')}</span>
        </div>
        <p class="sub">${this.escapeHtml(item.organization || '')}</p>
        ${renderText(item.description)}
      </article>
    `;

    const renderTraining = (item: ResumeTrainingDto) => `
      <article class="item">
        <div class="item-head">
          <h3>${this.escapeHtml(item.title || '교육이수사항')}</h3>
          <span>${this.escapeHtml([item.startDate, item.endDate ? `~ ${item.endDate}` : ''].filter(Boolean).join(' '))}</span>
        </div>
        <p class="sub">${this.escapeHtml([item.institution, item.hours ? `${item.hours}시간` : ''].filter(Boolean).join(' · '))}</p>
        ${renderText(item.description)}
      </article>
    `;

    const renderSelfIntro = (item: ResumeSelfIntro, index: number) => `
      <article class="item page-safe">
        <h3>문항 ${index + 1}</h3>
        <p class="question">${this.escapeHtml(item.question ?? item.title ?? '')}</p>
        ${renderText(item.answer)}
      </article>
    `;

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(target.companyName || '이력서')}</title>
  <style>
    @page { size: A4; margin: 14mm 14mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      background: #ffffff;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.72;
      word-break: keep-all;
    }
    .resume { width: 100%; }
    .cover {
      padding-bottom: 18px;
      border-bottom: 2px solid #111827;
      margin-bottom: 22px;
    }
    .eyebrow {
      margin: 0 0 6px;
      color: #64748b;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #0f172a;
      font-size: 28px;
      line-height: 1.25;
      font-weight: 900;
      letter-spacing: -0.01em;
    }
    .job {
      margin: 7px 0 0;
      color: #475569;
      font-size: 13px;
      font-weight: 700;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 16px;
    }
    .meta-row {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      padding: 8px 10px;
    }
    .meta-row span {
      display: block;
      color: #94a3b8;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .meta-row strong {
      display: block;
      margin-top: 3px;
      color: #1e293b;
      font-size: 11px;
      font-weight: 800;
    }
    .section {
      margin-top: 20px;
      break-inside: auto;
    }
    .section h2 {
      margin: 0 0 9px;
      padding-bottom: 5px;
      border-bottom: 1px solid #cbd5e1;
      color: #334155;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: -0.01em;
    }
    .item {
      margin-top: 10px;
      padding: 11px 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      break-inside: avoid;
    }
    .page-safe { break-inside: avoid; }
    .item-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .item h3 {
      margin: 0;
      color: #0f172a;
      font-size: 12px;
      font-weight: 900;
    }
    .item-head span {
      flex-shrink: 0;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 700;
    }
    .sub {
      margin: 2px 0 7px;
      color: #64748b;
      font-size: 10.5px;
      font-weight: 700;
    }
    .question {
      margin: 4px 0 9px;
      color: #334155;
      font-size: 11px;
      font-weight: 800;
      white-space: pre-wrap;
    }
    .text {
      color: #1f2937;
      font-size: 11.2px;
      white-space: pre-wrap;
    }
    .empty { color: #94a3b8; }
  </style>
</head>
<body>
  <main class="resume">
    <header class="cover">
      <p class="eyebrow">ResearchAI Resume</p>
      <h1>${this.escapeHtml(target.companyName || '기업명 미입력')}</h1>
      <p class="job">${this.escapeHtml(target.jobTitle || '직무 미입력')}</p>
      <div class="meta">
        ${renderMeta('지원일', target.appliedAt)}
        ${renderMeta('자기소개서', `${(target.selfIntroductions ?? []).length}문항`)}
        ${renderMeta('생성일', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}
      </div>
    </header>
    ${renderSection('채용공고 JD', target.jd ? renderText(target.jd) : '')}
    ${renderSection('교육 이수사항', (target.trainings ?? []).map(renderTraining).join(''))}
    ${renderSection('학내외 활동', normalExperiences.map(renderExperience).join(''))}
    ${renderSection('수상', (target.prizes ?? []).map(renderPrize).join(''))}
    ${renderSection('해외 활동', overseasExperiences.map(renderExperience).join(''))}
    ${renderSection('자기소개서', (target.selfIntroductions ?? []).map(renderSelfIntro).join(''))}
  </main>
</body>
</html>`;
  }

  private escapeHtml(value?: string | null): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private normalizeLineBreaks(value?: string | null): string {
    return (value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n');
  }

  private safeFilename(value: string): string {
    const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
    return normalized || 'resume';
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

    const resumes = await this.resumeRepo.find({ select: ['id', 'companyName', 'jobTitle'], where: { isDeleted: false } });
    const resumeMap = new Map(resumes.map((r) => [r.id, { companyName: r.companyName ?? '', jobTitle: r.jobTitle ?? '' }]));

    const [coverLetters, experiences, prizes, trainings] = await Promise.all([
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
      this.trainingRepo.find({
        where: [{ title: pattern }, { institution: pattern }, { description: pattern }],
        order: { orderIndex: 'ASC' },
        take: 15,
      }),
    ]);

    const items: ResumeSearchItem[] = [
      ...coverLetters.filter((cl) => resumeMap.has(cl.resumeId)).map((cl) => ({
        type: 'coverLetter' as const,
        id: cl.id,
        resumeId: cl.resumeId,
        companyName: resumeMap.get(cl.resumeId)?.companyName ?? '',
        jobTitle: resumeMap.get(cl.resumeId)?.jobTitle ?? '',
        question: cl.title ?? '',
        answer: cl.answer ?? '',
      })),
      ...experiences.filter((ex) => resumeMap.has(ex.resumeId)).map((ex) => ({
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
      ...prizes.filter((pr) => resumeMap.has(pr.resumeId)).map((pr) => ({
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
      ...trainings.filter((tr) => resumeMap.has(tr.resumeId)).map((tr) => ({
        type: 'training' as const,
        id: tr.id,
        resumeId: tr.resumeId,
        companyName: resumeMap.get(tr.resumeId)?.companyName ?? '',
        jobTitle: resumeMap.get(tr.resumeId)?.jobTitle ?? '',
        title: tr.title ?? '',
        institution: tr.institution ?? '',
        startDate: tr.startDate ?? null,
        endDate: tr.endDate ?? null,
        hours: tr.hours ?? null,
        description: tr.description ?? null,
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
