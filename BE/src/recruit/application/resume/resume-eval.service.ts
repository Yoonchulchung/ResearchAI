import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { ResumeAiEvalEntity } from 'src/recruit/domain/resume/resume-ai-eval.entity';
import { RecruitResumeCompanyJdEntity } from 'src/recruit/domain/resume/recruit-resume-company-jd.entity';

/** AI 평가 및 JD 평가 — 이력서에 대한 외부 기준 평가 저장/조회 */
@Injectable()
export class ResumeEvalService {
  constructor(
    @InjectRepository(ResumeAiEvalEntity)
    private readonly aiEvalRepo: Repository<ResumeAiEvalEntity>,
    @InjectRepository(RecruitResumeCompanyJdEntity)
    private readonly companyJdRepo: Repository<RecruitResumeCompanyJdEntity>,
  ) {}

  // ── AI 평가 ───────────────────────────────────────────────────────────────

  async getAiEvals(resumeId: string): Promise<ResumeAiEvalEntity[]> {
    return this.aiEvalRepo.find({
      where: { resumeId },
      order: { updatedAt: 'DESC' },
    });
  }

  async upsertAiEval(
    resumeId: string,
    subjectKey: string,
    type: string,
    result: string,
    model: string | null,
  ): Promise<ResumeAiEvalEntity> {
    const existing = await this.aiEvalRepo.findOne({
      where: { resumeId, subjectKey, type },
    });
    if (existing) {
      await this.aiEvalRepo.update(existing.id, { result, model });
      return { ...existing, result, model };
    }
    const entity = this.aiEvalRepo.create({
      id: randomUUID(),
      resumeId,
      subjectKey,
      type,
      result,
      model,
    });
    return this.aiEvalRepo.save(entity);
  }

  async deleteAiEval(id: string): Promise<void> {
    await this.aiEvalRepo.delete(id);
  }

  // ── JD 평가 ──────────────────────────────────────────────────────────────

  async getCompanyJdEval(
    resumeId: string,
  ): Promise<RecruitResumeCompanyJdEntity | null> {
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
    const entity = this.companyJdRepo.create({
      id: randomUUID(),
      resumeId,
      companyName,
      jdText,
      result,
      model,
    });
    return this.companyJdRepo.save(entity);
  }
}
