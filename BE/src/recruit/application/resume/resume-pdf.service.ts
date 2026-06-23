import { Injectable, NotFoundException } from '@nestjs/common';
import { BrowserService } from 'src/browse/application/browser.service';
import {
  ResumePdfResult,
  ResumeTarget,
  ResumeExperienceDto,
  ResumePrizeDto,
  ResumeTrainingDto,
  ResumeSelfIntro,
} from './resume.types';
import { escapeHtml, normalizeLineBreaks, safeFilename } from './resume.utils';
import { ResumeCrudService } from './resume-crud.service';

@Injectable()
export class ResumePdfService {
  constructor(
    private readonly crud: ResumeCrudService,
    private readonly browser: BrowserService,
  ) {}

  async generateResumePdf(resumeId: string): Promise<ResumePdfResult> {
    const detail = await this.crud.getResumeDetail([resumeId]);
    const target = detail?.resume[0];
    if (!target) throw new NotFoundException('이력서를 찾을 수 없습니다.');

    const buffer = await this.browser.renderPdf(this.renderHtml(target), {
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%; padding:0 14mm; text-align:right; font-size:8px; color:#94a3b8;"><span class="pageNumber"></span></div>',
      margin: {
        top: '14mm',
        right: '14mm',
        bottom: '16mm',
        left: '14mm',
      },
    });
    return {
      buffer,
      filename: `${safeFilename(target.companyName || 'resume')}-${safeFilename(target.jobTitle || 'resume')}.pdf`,
    };
  }

  private renderHtml(target: ResumeTarget): string {
    const normalExperiences = (target.experiences ?? []).filter(
      (item) => item.activityType !== '해외 경험',
    );
    const overseasExperiences = (target.experiences ?? []).filter(
      (item) => item.activityType === '해외 경험',
    );

    const renderMeta = (label: string, value?: string | null) =>
      value?.trim()
        ? `<div class="meta-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
        : '';

    const renderText = (value?: string | null) =>
      `<div class="text">${escapeHtml(normalizeLineBreaks(value)) || '<span class="empty">내용 없음</span>'}</div>`;

    const renderSection = (title: string, body: string) =>
      body.trim()
        ? `<section class="section"><h2>${escapeHtml(title)}</h2>${body}</section>`
        : '';

    const renderExperience = (item: ResumeExperienceDto) => `
      <article class="item">
        <div class="item-head">
          <h3>${escapeHtml(item.activityType || item.organizationName || '활동')}</h3>
          <span>${escapeHtml([item.startDate, item.endDate ? `~ ${item.endDate}` : ''].filter(Boolean).join(' '))}</span>
        </div>
        <p class="sub">${escapeHtml([item.organizationName, item.role].filter(Boolean).join(' · '))}</p>
        ${renderText(item.description)}
      </article>
    `;

    const renderPrize = (item: ResumePrizeDto) => `
      <article class="item">
        <div class="item-head">
          <h3>${escapeHtml(item.title || '수상')}</h3>
          <span>${escapeHtml(item.issuedDate ?? '')}</span>
        </div>
        <p class="sub">${escapeHtml(item.organization || '')}</p>
        ${renderText(item.description)}
      </article>
    `;

    const renderTraining = (item: ResumeTrainingDto) => `
      <article class="item">
        <div class="item-head">
          <h3>${escapeHtml(item.title || '교육이수사항')}</h3>
          <span>${escapeHtml([item.startDate, item.endDate ? `~ ${item.endDate}` : ''].filter(Boolean).join(' '))}</span>
        </div>
        <p class="sub">${escapeHtml([item.institution, item.hours ? `${item.hours}시간` : ''].filter(Boolean).join(' · '))}</p>
        ${renderText(item.description)}
      </article>
    `;

    const renderSelfIntro = (item: ResumeSelfIntro, index: number) => `
      <article class="item page-safe">
        <h3>문항 ${index + 1}</h3>
        <p class="question">${escapeHtml(item.question ?? item.title ?? '')}</p>
        ${renderText(item.answer)}
      </article>
    `;

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(target.companyName || '이력서')}</title>
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
    .cover { padding-bottom: 18px; border-bottom: 2px solid #111827; margin-bottom: 22px; }
    .eyebrow { margin: 0 0 6px; color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
    h1 { margin: 0; color: #0f172a; font-size: 28px; line-height: 1.25; font-weight: 900; letter-spacing: -0.01em; }
    .job { margin: 7px 0 0; color: #475569; font-size: 13px; font-weight: 700; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
    .meta-row { border: 1px solid #e2e8f0; background: #f8fafc; padding: 8px 10px; }
    .meta-row span { display: block; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; }
    .meta-row strong { display: block; margin-top: 3px; color: #1e293b; font-size: 11px; font-weight: 800; }
    .section { margin-top: 20px; break-inside: auto; }
    .section h2 { margin: 0 0 9px; padding-bottom: 5px; border-bottom: 1px solid #cbd5e1; color: #334155; font-size: 13px; font-weight: 900; letter-spacing: -0.01em; }
    .item { margin-top: 10px; padding: 11px 12px; border: 1px solid #e2e8f0; background: #ffffff; break-inside: avoid; }
    .page-safe { break-inside: avoid; }
    .item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .item h3 { margin: 0; color: #0f172a; font-size: 12px; font-weight: 900; }
    .item-head span { flex-shrink: 0; color: #94a3b8; font-size: 10px; font-weight: 700; }
    .sub { margin: 2px 0 7px; color: #64748b; font-size: 10.5px; font-weight: 700; }
    .question { margin: 4px 0 9px; color: #334155; font-size: 11px; font-weight: 800; white-space: pre-wrap; }
    .text { color: #1f2937; font-size: 11.2px; white-space: pre-wrap; }
    .empty { color: #94a3b8; }
  </style>
</head>
<body>
  <main class="resume">
    <header class="cover">
      <p class="eyebrow">ResearchAI Resume</p>
      <h1>${escapeHtml(target.companyName || '기업명 미입력')}</h1>
      <p class="job">${escapeHtml(target.jobTitle || '직무 미입력')}</p>
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
}
