import { Injectable } from '@nestjs/common';
import { ResumeAttachmentEntity } from 'src/recruit/domain/resume/resume-attachment.entity';
import { ResumeAiEvalEntity } from 'src/recruit/domain/resume/resume-ai-eval.entity';
import { RecruitResumeCompanyJdEntity } from 'src/recruit/domain/resume/recruit-resume-company-jd.entity';
import { RecruitCompanyNewsEntity } from 'src/recruit/domain/company-news/recruit-company-news.entity';
import { ResumeCrudService } from './resume-crud.service';
import { ResumeVersionService } from './resume-version.service';
import { ResumePdfService } from './resume-pdf.service';
import { ResumeSearchService } from './resume-search.service';
import { ResumeCoverLetterService } from './resume-cover-letter.service';
import { ResumeEvalService } from './resume-eval.service';
import { ResumeCompanyNewsService } from './resume-company-news.service';
import { ResumeAttachmentService } from './resume-attachment.service';
import {
  AnyProfile,
  ResumeCoverLetterCategoryItem,
  ResumePdfResult,
  ResumeResult,
  ResumeSearchResult,
  ResumeVersionDetailResult,
  ResumeVersionListResult,
} from './resume.types';

export type {
  ResumeResult,
  ResumePdfResult,
  ResumeVersionSummary,
  ResumeVersionListResult,
  ResumeVersionDetailResult,
  ResumeSearchItem,
  ResumeSearchResult,
  ResumeCoverLetterCategoryItem,
} from './resume.types';

/**
 * 얇은 파사드 — 외부 모듈·컨트롤러가 단일 진입점으로 사용할 수 있도록 각 전문 서비스로 위임한다.
 * 비즈니스 로직은 각 서비스에 있으며 여기에는 없다.
 */
@Injectable()
export class ResumeService {
  constructor(
    private readonly crud: ResumeCrudService,
    private readonly version: ResumeVersionService,
    private readonly pdf: ResumePdfService,
    private readonly search: ResumeSearchService,
    private readonly coverLetter: ResumeCoverLetterService,
    private readonly eval_: ResumeEvalService,
    private readonly companyNews: ResumeCompanyNewsService,
    private readonly attachment: ResumeAttachmentService,
  ) {}

  // ── Core CRUD ──────────────────────────────────────────────────────────────
  getResume(
    ids?: string,
    options: { deleted?: boolean } = {},
  ): Promise<ResumeResult | null> {
    return this.crud.getResume(ids, options);
  }
  saveResume(body: AnyProfile): Promise<ResumeResult> {
    return this.crud.saveResume(body);
  }
  deleteResume(resumeId: string): Promise<void> {
    return this.crud.deleteResume(resumeId);
  }
  restoreResume(resumeId: string): Promise<void> {
    return this.crud.restoreResume(resumeId);
  }
  permanentlyDeleteResume(resumeId: string): Promise<void> {
    return this.crud.permanentlyDeleteResume(resumeId);
  }
  updateInterviewScript(resumeId: string, interviewScript: string) {
    return this.crud.updateInterviewScript(resumeId, interviewScript);
  }
  updateCompanyLink(resumeId: string, companyId: string | null) {
    return this.crud.updateCompanyLink(resumeId, companyId);
  }

  // ── Version ────────────────────────────────────────────────────────────────
  listVersions(resumeId: string): Promise<ResumeVersionListResult> {
    return this.version.listVersions(resumeId);
  }
  getVersion(
    resumeId: string,
    versionId: string,
  ): Promise<ResumeVersionDetailResult> {
    return this.version.getVersion(resumeId, versionId);
  }
  async restoreVersion(
    resumeId: string,
    versionId: string,
  ): Promise<ResumeResult> {
    const target = await this.version.getSnapshotAsTarget(resumeId, versionId);
    return this.crud.saveResume({ resume: [target], replaceAll: false });
  }
  deleteVersion(resumeId: string, versionId: string): Promise<void> {
    return this.version.deleteVersion(resumeId, versionId);
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  generateResumePdf(resumeId: string): Promise<ResumePdfResult> {
    return this.pdf.generateResumePdf(resumeId);
  }

  // ── Search ────────────────────────────────────────────────────────────────
  searchResume(
    q: string,
    excludeResumeId?: string,
  ): Promise<ResumeSearchResult> {
    return this.search.searchResume(q, excludeResumeId);
  }
  getAllActivities(excludeResumeId?: string) {
    return this.search.getAllActivities(excludeResumeId);
  }

  // ── Cover Letter ──────────────────────────────────────────────────────────
  findCoverLettersForCategoryClassification(
    request: Parameters<
      ResumeCoverLetterService['findForCategoryClassification']
    >[0],
  ): Promise<ResumeCoverLetterCategoryItem[]> {
    return this.coverLetter.findForCategoryClassification(request);
  }
  updateCoverLetterCategory(id: string, category: string[]): Promise<void> {
    return this.coverLetter.updateCategory(id, category);
  }
  findCoverLettersForRefinedTitle(
    request: Parameters<ResumeCoverLetterService['findForRefinedTitle']>[0],
  ) {
    return this.coverLetter.findForRefinedTitle(request);
  }
  updateCoverLetterRefinedTitle(
    id: string,
    refinedTitle: string,
  ): Promise<void> {
    return this.coverLetter.updateRefinedTitle(id, refinedTitle);
  }

  // ── Eval (AI + JD) ────────────────────────────────────────────────────────
  getAiEvals(resumeId: string): Promise<ResumeAiEvalEntity[]> {
    return this.eval_.getAiEvals(resumeId);
  }
  upsertAiEval(
    resumeId: string,
    subjectKey: string,
    type: string,
    result: string,
    model: string | null,
  ): Promise<ResumeAiEvalEntity> {
    return this.eval_.upsertAiEval(resumeId, subjectKey, type, result, model);
  }
  deleteAiEval(id: string): Promise<void> {
    return this.eval_.deleteAiEval(id);
  }
  getCompanyJdEval(
    resumeId: string,
  ): Promise<RecruitResumeCompanyJdEntity | null> {
    return this.eval_.getCompanyJdEval(resumeId);
  }
  upsertCompanyJdEval(
    resumeId: string,
    companyName: string,
    jdText: string,
    result: string,
    model: string | null,
  ): Promise<RecruitResumeCompanyJdEntity> {
    return this.eval_.upsertCompanyJdEval(
      resumeId,
      companyName,
      jdText,
      result,
      model,
    );
  }

  // ── Company News ─────────────────────────────────────────────────────────
  getCompanyNews(
    resumeId: string,
    companyName?: string,
  ): Promise<RecruitCompanyNewsEntity[]> {
    return this.companyNews.getCompanyNews(resumeId, companyName);
  }
  upsertCompanyNewsItem(
    resumeId: string,
    companyName: string,
    itemId: string,
    title: string,
    searchQuery: string,
    searchId: string | null,
  ): Promise<RecruitCompanyNewsEntity> {
    return this.companyNews.upsertCompanyNewsItem(
      resumeId,
      companyName,
      itemId,
      title,
      searchQuery,
      searchId,
    );
  }
  updateCompanyNewsDetail(id: string, detailJson: string): Promise<void> {
    return this.companyNews.updateCompanyNewsDetail(id, detailJson);
  }
  deleteCompanyNews(id: string): Promise<void> {
    return this.companyNews.deleteCompanyNews(id);
  }
  deleteCompanyNewsByResume(
    resumeId: string,
    companyName?: string,
  ): Promise<void> {
    return this.companyNews.deleteCompanyNewsByResume(resumeId, companyName);
  }

  // ── Attachment ────────────────────────────────────────────────────────────
  listAttachments(resumeId: string) {
    return this.attachment.listAttachments(resumeId);
  }
  addAttachment(
    resumeId: string,
    file: Express.Multer.File,
    parsedText: string | null,
    pageCount: number | null,
  ) {
    return this.attachment.addAttachment(resumeId, file, parsedText, pageCount);
  }
  getAttachmentFile(
    resumeId: string,
    id: string,
  ): Promise<ResumeAttachmentEntity | null> {
    return this.attachment.getAttachmentFile(resumeId, id);
  }
  deleteAttachment(resumeId: string, id: string): Promise<void> {
    return this.attachment.deleteAttachment(resumeId, id);
  }
}
