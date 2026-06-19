import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ResumeCoverLetterEntity } from 'src/recruit/domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from 'src/recruit/domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from 'src/recruit/domain/resume/resume-prize.entity';
import { ResumeTrainingEntity } from 'src/recruit/domain/resume/resume-training.entity';
import { ResumeVersionEntity } from 'src/recruit/domain/resume/resume-version.entity';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';
import { RecruitCompanyNewsEntity } from 'src/recruit/domain/company-news/recruit-company-news.entity';
import { RecruitResumeCompanyJdEntity } from 'src/recruit/domain/resume/recruit-resume-company-jd.entity';
import { ResumeAiEvalEntity } from 'src/recruit/domain/resume/resume-ai-eval.entity';
import { ResumeAttachmentEntity } from 'src/recruit/domain/resume/resume-attachment.entity';
import {
  AnyProfile,
  ResumeResult,
  ResumeTarget,
} from './resume.types';
import {
  safeId,
  emptyToNull,
  normalizeDate,
  parseCategory,
  stringifyCategory,
  sortByOrder,
  normalizeTargets,
  buildVersionSnapshot,
} from './resume.utils';
import { randomUUID } from 'crypto';

@Injectable()
export class ResumeCrudService {
  constructor(
    @InjectRepository(ResumeEntity)
    readonly resumeRepo: Repository<ResumeEntity>,
    @InjectRepository(ResumeCoverLetterEntity)
    readonly coverLetterRepo: Repository<ResumeCoverLetterEntity>,
    @InjectRepository(ResumeExperienceEntity)
    readonly experienceRepo: Repository<ResumeExperienceEntity>,
    @InjectRepository(ResumePrizeEntity)
    readonly prizeRepo: Repository<ResumePrizeEntity>,
    @InjectRepository(ResumeTrainingEntity)
    readonly trainingRepo: Repository<ResumeTrainingEntity>,
    @InjectRepository(ResumeVersionEntity)
    private readonly versionRepo: Repository<ResumeVersionEntity>,
    @InjectRepository(ResumeAiEvalEntity)
    private readonly aiEvalRepo: Repository<ResumeAiEvalEntity>,
    @InjectRepository(RecruitResumeCompanyJdEntity)
    private readonly companyJdRepo: Repository<RecruitResumeCompanyJdEntity>,
    @InjectRepository(RecruitCompanyNewsEntity)
    private readonly companyNewsRepo: Repository<RecruitCompanyNewsEntity>,
    @InjectRepository(ResumeAttachmentEntity)
    private readonly attachmentRepo: Repository<ResumeAttachmentEntity>,
  ) {}

  async getResume(
    ids?: string,
    options: { deleted?: boolean } = {},
  ): Promise<ResumeResult | null> {
    if (ids) {
      const idList = ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return this.getResumeDetail(idList, {
        includeDeleted: options.deleted === true,
      });
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

    return {
      resume: this.toTargets(rows.filter((row) => this.hasNormalizedContent(row))),
    };
  }

  async getResumeDetail(
    ids: string[],
    options: { includeDeleted?: boolean } = {},
  ): Promise<ResumeResult | null> {
    const rows = await this.resumeRepo.find({
      where: options.includeDeleted
        ? { id: In(ids) }
        : { id: In(ids), isDeleted: false },
      relations: {
        coverLetters: true,
        experiences: true,
        prizes: true,
        trainings: true,
      },
    });
    if (rows.length === 0) return null;
    return { resume: this.toDetailTargets(rows) };
  }

  async saveResume(body: AnyProfile): Promise<ResumeResult> {
    const targets = normalizeTargets(body);
    const targetIds = targets
      .map((target) => target.id?.trim())
      .filter((id): id is string => Boolean(id));
    const existingScriptRows =
      targetIds.length > 0
        ? await this.resumeRepo.find({
            select: ['id', 'interviewScript'],
            where: { id: In(targetIds) },
          })
        : [];
    const existingScripts = new Map(
      existingScriptRows.map((row) => [row.id, row.interviewScript]),
    );

    const entities = targets.map((target, targetIndex) => {
      const resumeId = safeId(target.id);
      const coverLetters = target.selfIntroductions ?? target.coverLetters ?? [];
      const experiences = target.experiences ?? [];
      const prizes = target.prizes ?? [];
      const trainings = target.trainings ?? [];

      return this.resumeRepo.create({
        id: resumeId,
        companyName: target.companyName?.trim() ?? '',
        companyId: target.companyId ?? null,
        jobTitle: target.jobTitle?.trim() ?? '',
        applyDate: normalizeDate(target.appliedAt ?? target.applyDate),
        jd: emptyToNull(target.jd),
        interviewScript:
          target.interviewScript === undefined
            ? (existingScripts.get(resumeId) ?? null)
            : emptyToNull(target.interviewScript),
        orderIndex: targetIndex,
        profileJson: null,
        isDeleted: false,
        coverLetters: coverLetters.map((item, index) =>
          this.coverLetterRepo.create({
            id: safeId(item.id),
            resumeId,
            title: (item.question ?? item.title ?? '').trim(),
            answer: item.answer ?? '',
            category: stringifyCategory(item.category),
            refinedTitle: item.refinedTitle ?? null,
            orderIndex: index,
          }),
        ),
        experiences: experiences.map((item, index) =>
          this.experienceRepo.create({
            id: safeId(item.id),
            resumeId,
            activityType: item.activityType?.trim() ?? '',
            organizationName: item.organizationName?.trim() ?? '',
            startDate: normalizeDate(item.startDate),
            endDate: normalizeDate(item.endDate),
            role: emptyToNull(item.role),
            description: emptyToNull(item.description),
            orderIndex: index,
          }),
        ),
        prizes: prizes.map((item, index) =>
          this.prizeRepo.create({
            id: safeId(item.id),
            resumeId,
            title: item.title?.trim() ?? '',
            organization: item.organization?.trim() ?? '',
            issuedDate: normalizeDate(item.issuedDate),
            description: emptyToNull(item.description),
            orderIndex: index,
          }),
        ),
        trainings: trainings.map((item, index) =>
          this.trainingRepo.create({
            id: safeId(item.id),
            resumeId,
            title: item.title?.trim() ?? '',
            institution: item.institution?.trim() ?? '',
            startDate: normalizeDate(item.startDate),
            endDate: normalizeDate(item.endDate),
            hours: emptyToNull(item.hours),
            description: emptyToNull(item.description),
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
      const existing = await this.resumeRepo.find({
        select: ['id'],
        where: { isDeleted: false },
      });
      for (const row of existing) {
        if (!keepIds.has(row.id)) await this.deleteResume(row.id);
      }
    }

    const saved = await this.getResume();
    if (saved) {
      const savedEntityIds = new Set(entities.map((entity) => entity.id));
      for (const target of saved.resume) {
        if (target.id && savedEntityIds.has(target.id)) {
          await this.recordVersion(target);
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

  async updateInterviewScript(
    resumeId: string,
    interviewScript: string,
  ): Promise<{ interviewScript: string }> {
    const existing = await this.resumeRepo.findOne({
      where: { id: resumeId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('이력서를 찾을 수 없습니다.');
    const nextScript = interviewScript ?? '';
    await this.resumeRepo.update({ id: resumeId }, { interviewScript: emptyToNull(nextScript) });
    return { interviewScript: nextScript };
  }

  async updateCompanyLink(
    resumeId: string,
    companyId: string | null,
  ): Promise<{ companyId: string | null }> {
    const existing = await this.resumeRepo.findOne({
      where: { id: resumeId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('이력서를 찾을 수 없습니다.');
    await this.resumeRepo.update({ id: resumeId }, { companyId: companyId ?? null });
    return { companyId: companyId ?? null };
  }

  // ── version recording (triggered by saveResume) ──────────────────────────

  async recordVersion(target: ResumeTarget): Promise<void> {
    if (!target.id) return;
    const snapshot = buildVersionSnapshot(target);
    const snapshotJson = JSON.stringify(snapshot);
    const latest = await this.versionRepo.findOne({
      where: { resumeId: target.id },
      order: { createdAt: 'DESC' },
    });
    if (latest?.snapshotJson === snapshotJson) return;
    await this.versionRepo.save(
      this.versionRepo.create({
        id: randomUUID(),
        resumeId: target.id,
        title: this.getVersionTitle(snapshot),
        snapshotJson,
      }),
    );
    await this.trimVersions(target.id);
  }

  private async trimVersions(resumeId: string): Promise<void> {
    const rows = await this.versionRepo.find({
      where: { resumeId },
      select: ['id'],
      order: { createdAt: 'DESC' },
    });
    const removableIds = rows.slice(50).map((row) => row.id);
    if (removableIds.length > 0) {
      await this.versionRepo.delete({ id: In(removableIds) });
    }
  }

  private getVersionTitle(target: ResumeTarget): string | null {
    const title = [target.companyName, target.jobTitle]
      .map((item) => item?.trim())
      .filter(Boolean)
      .join(' · ');
    return title || null;
  }

  // ── private mapping helpers ───────────────────────────────────────────────

  private toTargets(rows: ResumeEntity[]): ResumeTarget[] {
    return [...rows]
      .sort((a, b) => this.compareRows(a, b))
      .map((row) => this.mapRowToTarget(row));
  }

  private toDetailTargets(rows: ResumeEntity[]): ResumeTarget[] {
    return [...rows]
      .sort((a, b) => this.compareRows(a, b))
      .map((row) => this.mapRowToTarget(row));
  }

  private mapRowToTarget(row: ResumeEntity): ResumeTarget {
    return {
      id: row.id,
      companyName: row.companyName ?? '',
      companyId: row.companyId ?? null,
      jobTitle: row.jobTitle ?? '',
      appliedAt: row.applyDate ?? '',
      updatedAt: row.updatedAt.toISOString(),
      isDeleted: row.isDeleted,
      jd: row.jd ?? '',
      interviewScript: row.interviewScript ?? '',
      selfIntroductions: sortByOrder(row.coverLetters ?? []).map((cl) => ({
        id: cl.id,
        question: cl.title ?? '',
        answer: cl.answer ?? '',
        category: parseCategory(cl.category),
        refinedTitle: cl.refinedTitle ?? null,
      })),
      experiences: sortByOrder(row.experiences ?? []).map((ex) => ({
        id: ex.id,
        activityType: ex.activityType ?? '',
        organizationName: ex.organizationName ?? '',
        startDate: ex.startDate ?? null,
        endDate: ex.endDate ?? null,
        role: ex.role ?? null,
        description: ex.description ?? null,
      })),
      prizes: sortByOrder(row.prizes ?? []).map((pr) => ({
        id: pr.id,
        title: pr.title ?? '',
        organization: pr.organization ?? '',
        issuedDate: pr.issuedDate ?? null,
        description: pr.description ?? null,
      })),
      trainings: sortByOrder(row.trainings ?? []).map((tr) => ({
        id: tr.id,
        title: tr.title ?? '',
        institution: tr.institution ?? '',
        startDate: tr.startDate ?? null,
        endDate: tr.endDate ?? null,
        hours: tr.hours ?? null,
        description: tr.description ?? null,
      })),
    };
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

  private compareRows(a: ResumeEntity, b: ResumeEntity): number {
    const aDate = a.applyDate ?? '';
    const bDate = b.applyDate ?? '';
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return a.updatedAt.getTime() - b.updatedAt.getTime();
  }
}
