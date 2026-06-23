import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import type { ImageContentBlock } from 'src/ai/application/ai-provider.types';

const IMAGE_CACHE_DIR = path.join(process.cwd(), 'data/recruit/image-cache');
const MEDIA_TYPE_MAP: Record<string, ImageContentBlock['mediaType']> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};
import { QueueJob } from 'src/queue/domain/queue-job.model';
import {
  QuestionType,
  QUESTION_TYPE_LABELS,
  WriteAssistExtras,
} from 'src/queue/application/job/write-assist/types';
import {
  ACTION_PROMPTS,
  WRITE_ASSIST_SYSTEM_PROMPT,
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyPrompt,
  EVALUATE_RUBRICS,
  EVALUATE_OUTPUT_FORMAT,
  EVALUATE_SYSTEM_PROMPT,
  IMPROVE_PIPELINE_SYSTEM_PROMPT,
  IMPROVE_PIPELINE_OUTPUT_FORMAT,
  JD_EVALUATE_SYSTEM_PROMPT,
  JD_EVALUATE_OUTPUT_FORMAT,
} from 'src/queue/application/job/write-assist/prompts';

export type { WriteAssistExtras } from 'src/queue/application/job/write-assist/types';

@Injectable()
export class WriteAssistExecutor {
  private readonly logger = new Logger(WriteAssistExecutor.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async execute(
    taskType: QueueJob.TaskType,
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    switch (taskType) {
      case QueueJob.TaskType.WRITEASSIST_EVALUATE:
        return this.executeEvaluate(content, model, onChunk, signal, extras);

      case QueueJob.TaskType.WRITEASSIST_IMPROVE:
        return this.executeImprove(content, model, onChunk, signal, extras);

      case QueueJob.TaskType.WRITEASSIST_JD_EVALUATE:
        return this.executeJdEvaluate(content, model, onChunk, signal, extras);

      default:
        return this.executeDefaultTask(
          taskType,
          content,
          model,
          onChunk,
          signal,
          extras,
        );
    }
  }

  // ── 기본 액션 ────────────────────────────────────────────────────────────────

  private loadImageBlocks(imageFiles?: string[]): ImageContentBlock[] {
    if (!imageFiles?.length) return [];
    return imageFiles.flatMap((filename) => {
      const filePath = path.join(IMAGE_CACHE_DIR, filename);
      if (!fs.existsSync(filePath)) return [];
      try {
        const ext = path.extname(filename).slice(1).toLowerCase();
        const mediaType = MEDIA_TYPE_MAP[ext] ?? 'image/jpeg';
        const data = fs.readFileSync(filePath).toString('base64');
        return [{ type: 'image' as const, mediaType, data }];
      } catch {
        return [];
      }
    });
  }

  private async executeDefaultTask(
    taskType: QueueJob.TaskType,
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    const instruction = this.buildInstruction(taskType, content, extras);
    const imageBlocks = this.loadImageBlocks(extras?.imageFiles);

    const messageContent = imageBlocks.length
      ? [...imageBlocks, instruction]
      : instruction;

    const currentMessage = { role: 'user' as const, content: messageContent };

    // 커스텀 프롬프트(WRITEASSIST)만 이전 대화 히스토리를 포함해 연속성 유지
    const messages =
      taskType === QueueJob.TaskType.WRITEASSIST && extras?.history?.length
        ? [...extras.history, currentMessage]
        : [currentMessage];

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(
      model,
      WRITE_ASSIST_SYSTEM_PROMPT,
      messages,
    )) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }
    return fullText;
  }

  // ── 문항 분리 ────────────────────────────────────────────────────────────────

  /**
   * 문서를 개별 문항 단위로 분리.
   * **굵은 텍스트** 형태의 줄을 문항 헤더로 인식.
   * 분리 불가능하면 문서 전체를 단일 섹션으로 반환.
   */
  private splitSections(content: string): { header: string; body: string }[] {
    // 한 줄 전체가 **...** 인 경우를 문항 구분자로 사용
    const parts = content.split(/^(\*\*[^\n*]+\*\*)\s*$/m);

    if (parts.length <= 1) return [{ header: '', body: content.trim() }];

    const sections: { header: string; body: string }[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const header = (parts[i] ?? '').trim();
      const body = (parts[i + 1] ?? '').trim();
      if (header || body) sections.push({ header, body });
    }
    return sections.length > 0
      ? sections
      : [{ header: '', body: content.trim() }];
  }

  // ── 분류 ─────────────────────────────────────────────────────────────────────

  private async classifyQuestionType(
    content: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<{
    type: QuestionType;
    questionText: string;
    companyCtxFromDoc?: string;
  }> {
    try {
      const { text } = await this.aiProvider.call(
        model,
        CLASSIFY_SYSTEM_PROMPT,
        buildClassifyPrompt(content),
        {
          signal,
          caller: 'WriteAssistEvaluate.classify',
        },
      );
      const cleaned = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('JSON not found');
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        type?: string;
        questionText?: string;
        company?: {
          name?: string;
          position?: string;
          jd?: string;
          requiredCompetencies?: string[];
        };
      };

      const validTypes: QuestionType[] = [
        'motivation',
        'experience',
        'competency',
        'personality',
        'general',
      ];
      const type = validTypes.includes(parsed.type as QuestionType)
        ? (parsed.type as QuestionType)
        : 'general';
      const questionText =
        (parsed.questionText ?? '').trim() || '(문항 추출 실패)';

      let companyCtxFromDoc: string | undefined;
      const c = parsed.company;
      if (c?.name || c?.position || c?.jd) {
        const lines: string[] = ['## 지원 정보 (문서 자동 추출)'];
        if (c.name) lines.push(`- 지원 회사: ${c.name}`);
        if (c.position) lines.push(`- 지원 직무: ${c.position}`);
        if (c.jd) lines.push(`- JD 요약: ${c.jd}`);
        if (c.requiredCompetencies?.length)
          lines.push(`- 핵심 역량: ${c.requiredCompetencies.join(', ')}`);
        companyCtxFromDoc = lines.join('\n') + '\n\n';
      }

      this.logger.log(
        `[WriteAssistEvaluate] 분류: ${type} | "${questionText.slice(0, 60)}" | 회사: ${c?.name ?? '-'}`,
      );
      return { type, questionText, companyCtxFromDoc };
    } catch (err) {
      this.logger.warn(
        `[WriteAssistEvaluate] 분류 실패, general 폴백: ${(err as Error).message}`,
      );
      return { type: 'general', questionText: '(자동 분류 실패)' };
    }
  }

  // ── 글 평가 ──────────────────────────────────────────────────────────────────

  private async executeEvaluate(
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    const sections = this.splitSections(content);

    if (sections.length <= 1) {
      const { type, questionText, companyCtxFromDoc } =
        await this.classifyQuestionType(content, model, signal);
      if (signal?.aborted) return '';
      const companyCtx = extras?.companyCtx ?? companyCtxFromDoc ?? '';
      return this.streamEvalSection(
        content,
        type,
        questionText,
        companyCtx,
        extras,
        model,
        onChunk,
        signal,
      );
    }

    // 다문항: 섹션별 순차 평가
    let fullText = '';
    let sharedCompanyCtx = extras?.companyCtx ?? '';

    for (let i = 0; i < sections.length; i++) {
      if (signal?.aborted) break;
      const { header, body } = sections[i];
      const sectionContent = [header, body].filter(Boolean).join('\n\n');

      const { type, questionText, companyCtxFromDoc } =
        await this.classifyQuestionType(sectionContent, model, signal);
      if (!sharedCompanyCtx && companyCtxFromDoc)
        sharedCompanyCtx = companyCtxFromDoc;
      if (signal?.aborted) break;

      const displayHeader = header.replace(/\*\*/g, '').trim();
      const divider = `${i > 0 ? '\n\n' : ''}---\n\n## 📝 문항 ${i + 1} / ${sections.length}${displayHeader ? `\n\n> ${displayHeader}` : ''}\n\n`;
      fullText += divider;
      onChunk(divider);

      const result = await this.streamEvalSection(
        sectionContent,
        type,
        questionText,
        sharedCompanyCtx,
        extras,
        model,
        onChunk,
        signal,
      );
      fullText += result;
    }

    return fullText;
  }

  private async streamEvalSection(
    sectionContent: string,
    type: QuestionType,
    questionText: string,
    companyCtx: string,
    extras: WriteAssistExtras | undefined,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const typeLabel = QUESTION_TYPE_LABELS[type];
    const rubric = EVALUATE_RUBRICS[type];
    const axes = this.extractAxisInfo(rubric);
    const reviewer2 = type === 'personality' ? 'HR 인성 평가자' : '실무 면접관';
    const outputFormat = this.fillAxisPlaceholders(
      EVALUATE_OUTPUT_FORMAT.replaceAll('{TYPE_LABEL}', typeLabel).replaceAll(
        '{REVIEWER_2}',
        reviewer2,
      ),
      axes,
    );
    const system = EVALUATE_SYSTEM_PROMPT.replaceAll('{TYPE_LABEL}', typeLabel);
    const expContext = this.buildExpContext(extras?.experiences);

    const userPrompt = `${companyCtx}${expContext}# 평가 작업

## 문항 유형
${typeLabel}

## 추출된 문항
"${questionText}"

${rubric}

---

${outputFormat}

---

## 평가 대상 문서

${sectionContent.trim() || '(빈 문서)'}`;

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(model, system, [
      { role: 'user' as const, content: userPrompt },
    ])) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }
    return fullText;
  }

  // ── 내용 개선 ────────────────────────────────────────────────────────────────

  private async executeImprove(
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    const sections = this.splitSections(content);

    if (sections.length <= 1) {
      const { type, questionText, companyCtxFromDoc } =
        await this.classifyQuestionType(content, model, signal);
      if (signal?.aborted) return '';
      const companyCtx = extras?.companyCtx ?? companyCtxFromDoc ?? '';
      return this.streamImproveSection(
        content,
        type,
        questionText,
        companyCtx,
        extras,
        model,
        onChunk,
        signal,
      );
    }

    // 다문항: 섹션별 순차 개선
    let fullText = '';
    let sharedCompanyCtx = extras?.companyCtx ?? '';

    for (let i = 0; i < sections.length; i++) {
      if (signal?.aborted) break;
      const { header, body } = sections[i];
      const sectionContent = [header, body].filter(Boolean).join('\n\n');

      const { type, questionText, companyCtxFromDoc } =
        await this.classifyQuestionType(sectionContent, model, signal);
      if (!sharedCompanyCtx && companyCtxFromDoc)
        sharedCompanyCtx = companyCtxFromDoc;
      if (signal?.aborted) break;

      const displayHeader = header.replace(/\*\*/g, '').trim();
      const divider = `${i > 0 ? '\n\n' : ''}---\n\n## ✏️ 문항 ${i + 1} / ${sections.length}${displayHeader ? `\n\n> ${displayHeader}` : ''}\n\n`;
      fullText += divider;
      onChunk(divider);

      const result = await this.streamImproveSection(
        sectionContent,
        type,
        questionText,
        sharedCompanyCtx,
        extras,
        model,
        onChunk,
        signal,
      );
      fullText += result;
    }

    return fullText;
  }

  private async streamImproveSection(
    sectionContent: string,
    type: QuestionType,
    questionText: string,
    companyCtx: string,
    extras: WriteAssistExtras | undefined,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const typeLabel = QUESTION_TYPE_LABELS[type];
    const rubric = EVALUATE_RUBRICS[type];
    const axes = this.extractAxisInfo(rubric);
    const outputFormat = this.fillAxisPlaceholders(
      IMPROVE_PIPELINE_OUTPUT_FORMAT.replaceAll('{TYPE_LABEL}', typeLabel),
      axes,
    );
    const system = IMPROVE_PIPELINE_SYSTEM_PROMPT.replaceAll(
      '{TYPE_LABEL}',
      typeLabel,
    );
    const expContext = this.buildExpContext(extras?.experiences);

    const userPrompt = `${companyCtx}${expContext}## 문항 유형
${typeLabel}

## 추출된 문항
"${questionText}"

${outputFormat}

---

## 원본 문서 (단락 수: 아래 문서의 단락 수를 반드시 확인하고 동일하게 유지)

${sectionContent.trim() || '(빈 문서)'}`;

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(model, system, [
      { role: 'user' as const, content: userPrompt },
    ])) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }
    return fullText;
  }

  // ── 루브릭 파싱 ──────────────────────────────────────────────────────────────

  private extractAxisInfo(rubric: string): { name: string; max: number }[] {
    const matches = [
      ...rubric.matchAll(/^###\s+\d+\.\s*([^\n(]+?)(?:\s*\((\d+)점\))?$/gm),
    ];
    const info = matches.map((m) => ({
      name: m[1].trim(),
      max: m[2] ? parseInt(m[2], 10) : 25,
    }));
    while (info.length < 4)
      info.push({ name: `항목 ${info.length + 1}`, max: 25 });
    return info.slice(0, 4);
  }

  private fillAxisPlaceholders(
    template: string,
    axes: { name: string; max: number }[],
  ): string {
    let out = template;
    axes.forEach((a, i) => {
      out = out
        .replaceAll(`{AXIS_${i + 1}}`, a.name)
        .replaceAll(`{MAX_${i + 1}}`, String(a.max));
    });
    return out;
  }

  // ── 프롬프트 조립 ─────────────────────────────────────────────────────────────

  private buildInstruction(
    taskType: QueueJob.TaskType,
    content: string,
    extras?: WriteAssistExtras,
  ): string {
    if (taskType === QueueJob.TaskType.WRITEASSIST) {
      const expContext = this.buildExpContext(extras?.experiences);
      return `## 현재 문서 내용\n${content.trim() || '(빈 문서)'}\n\n## 요청사항\n${(extras?.companyCtx ?? '') + expContext + (extras?.instruction ?? '')}\n\n위 요청에 따라 마크다운으로 작성해주세요.`;
    }
    const template = ACTION_PROMPTS[taskType];
    if (!template) throw new Error(`알 수 없는 taskType: ${taskType}`);
    const expContext = this.buildExpContext(extras?.experiences);
    return (
      (extras?.companyCtx ?? '') +
      expContext +
      template.replace('{content}', content.trim() || '(빈 문서)')
    );
  }

  private buildExpContext(
    experiences?: { title: string; content: string }[],
  ): string {
    if (!experiences?.length) return '';
    return `## 참고할 나의 경험\n${experiences.map((e) => `### ${e.title}\n${e.content}`).join('\n\n')}\n\n---\n\n`;
  }

  // ── JD 산업·직무 분석 ───────────────────────────────────────────────────────

  private async executeJdEvaluate(
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    const companyCtx = extras?.companyCtx ?? '';
    const userPrompt = `${companyCtx ? `## 기업 분석 데이터\n${companyCtx}\n\n---\n\n` : ''}## 채용공고 (JD)\n\n${content.trim() || '(JD 없음)'}

${JD_EVALUATE_OUTPUT_FORMAT}`;

    let result = '';
    for await (const chunk of this.aiProvider.stream(
      model,
      JD_EVALUATE_SYSTEM_PROMPT,
      [{ role: 'user' as const, content: userPrompt }],
    )) {
      if (signal?.aborted) break;
      onChunk(chunk);
      result += chunk;
    }
    return result;
  }
}
