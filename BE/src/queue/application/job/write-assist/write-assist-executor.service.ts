import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from '../../../../ai/infrastructure/ai-provider.service';
import { QueueJob } from '../../../domain/queue-job.model';
import { QuestionType, QUESTION_TYPE_LABELS, WriteAssistExtras } from './types';
import {
  ACTION_PROMPTS,
  WRITE_ASSIST_SYSTEM_PROMPT,
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyPrompt,
  EVALUATE_RUBRICS,
  EVALUATE_OUTPUT_FORMAT,
  EVALUATE_SYSTEM_PROMPT,
} from './prompts';

export type { WriteAssistExtras } from './types';

@Injectable()
export class WriteAssistExecutorService {
  private readonly logger = new Logger(WriteAssistExecutorService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async execute(
    taskType: QueueJob.TaskType,
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    // 글 평가는 2단계 AI Agent 흐름 (분류 → 유형별 평가)
    if (taskType === QueueJob.TaskType.WRITEASSIST_EVALUATE) {
      return this.executeEvaluate(content, model, onChunk, signal, extras);
    }

    // 그 외 액션은 정적 프롬프트 단일 호출
    const instruction = this.buildInstruction(taskType, content, extras);

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(model, WRITE_ASSIST_SYSTEM_PROMPT, [
      { role: 'user' as const, content: instruction },
    ])) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }
    return fullText;
  }

  // ── 글 평가 — 2단계 AI Agent ──────────────────────────────────────────────

  /** 1단계: 문서 상단의 문항을 분석해 유형을 분류 */
  private async classifyQuestionType(
    content: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<{ type: QuestionType; questionText: string }> {
    try {
      const { text } = await this.aiProvider.call(model, CLASSIFY_SYSTEM_PROMPT, buildClassifyPrompt(content), {
        signal,
        caller: 'WriteAssistEvaluate.classify',
      });
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('JSON not found');
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        type?: string;
        questionText?: string;
      };
      const validTypes: QuestionType[] = ['motivation', 'experience', 'competency', 'general'];
      const type = validTypes.includes(parsed.type as QuestionType)
        ? (parsed.type as QuestionType)
        : 'general';
      const questionText = (parsed.questionText ?? '').trim() || '(문항 추출 실패)';
      this.logger.log(`[WriteAssistEvaluate] 분류 결과: ${type} | 문항: "${questionText.slice(0, 60)}"`);
      return { type, questionText };
    } catch (err) {
      this.logger.warn(`[WriteAssistEvaluate] 분류 실패, general 폴백: ${(err as Error).message}`);
      return { type: 'general', questionText: '(자동 분류 실패)' };
    }
  }

  /** 2단계: 분류된 유형에 맞춘 평가 프롬프트로 스트리밍 평가 */
  private async executeEvaluate(
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    // 1) 문항 분류
    const { type, questionText } = await this.classifyQuestionType(content, model, signal);
    if (signal?.aborted) return '';

    const typeLabel = QUESTION_TYPE_LABELS[type];
    const rubric = EVALUATE_RUBRICS[type];

    // 출력 형식의 자리표시자를 유형별 항목명으로 치환
    const axisNames = this.extractAxisNames(rubric);
    const outputFormat = EVALUATE_OUTPUT_FORMAT
      .replaceAll('{TYPE_LABEL}', typeLabel)
      .replaceAll('{AXIS_1}', axisNames[0])
      .replaceAll('{AXIS_2}', axisNames[1])
      .replaceAll('{AXIS_3}', axisNames[2])
      .replaceAll('{AXIS_4}', axisNames[3]);

    const system = EVALUATE_SYSTEM_PROMPT.replaceAll('{TYPE_LABEL}', typeLabel);

    const expContext = this.buildExpContext(extras?.experiences);
    const userPrompt = `${extras?.companyCtx ?? ''}${expContext}# 평가 작업

## 문항 유형
${typeLabel}

## 추출된 문항
"${questionText}"

${rubric}

---

${outputFormat}

---

## 평가 대상 문서

${content.trim() || '(빈 문서)'}`;

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

  /** 루브릭 텍스트에서 "### N. 항목명 (25점)" 패턴으로 4개 axis 이름 추출 */
  private extractAxisNames(rubric: string): string[] {
    const matches = [...rubric.matchAll(/^###\s+\d+\.\s*([^\n(]+?)(?:\s*\(\d+점\))?$/gm)];
    const names = matches.map((m) => m[1].trim());
    while (names.length < 4) names.push(`항목 ${names.length + 1}`);
    return names.slice(0, 4);
  }

  // ── 액션별 프롬프트 조립 (정적 PROMPTS) ─────────────────────────────────

  private buildInstruction(
    taskType: QueueJob.TaskType,
    content: string,
    extras?: WriteAssistExtras,
  ): string {
    // 커스텀 자유 입력
    if (taskType === QueueJob.TaskType.WRITEASSIST) {
      const expContext = this.buildExpContext(extras?.experiences);
      return `## 현재 문서 내용\n${content.trim() || '(빈 문서)'}\n\n## 요청사항\n${(extras?.companyCtx ?? '') + expContext + (extras?.instruction ?? '')}\n\n위 요청에 따라 마크다운으로 작성해주세요.`;
    }

    const template = ACTION_PROMPTS[taskType];
    if (!template) throw new Error(`알 수 없는 taskType: ${taskType}`);

    const expContext = this.buildExpContext(extras?.experiences);
    const body = template.replace('{content}', content.trim() || '(빈 문서)');
    return (extras?.companyCtx ?? '') + expContext + body;
  }

  private buildExpContext(experiences?: { title: string; content: string }[]): string {
    if (!experiences || experiences.length === 0) return '';
    return `## 참고할 나의 경험\n${experiences.map((e) => `### ${e.title}\n${e.content}`).join('\n\n')}\n\n---\n\n`;
  }
}
