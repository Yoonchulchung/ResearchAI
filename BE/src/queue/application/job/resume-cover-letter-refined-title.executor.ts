import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { ResumeService } from 'src/recruit/application/resume/resume.service';

export interface ResumeCoverLetterRefinedTitleRequest {
  resumeIds?: string[];
  coverLetterIds?: string[];
  onlyEmpty?: boolean;
  limit?: number;
  model?: string;
}

export interface ResumeCoverLetterRefinedTitleResult {
  total: number;
  updated: Array<{ id: string; resumeId: string; refinedTitle: string }>;
}

const DEFAULT_MODEL = 'gemini-2.0-flash';

@Injectable()
export class ResumeCoverLetterRefinedTitleExecutor {
  private readonly logger = new Logger(
    ResumeCoverLetterRefinedTitleExecutor.name,
  );

  constructor(
    private readonly resumeService: ResumeService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async execute(
    request: ResumeCoverLetterRefinedTitleRequest,
    onLog: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<ResumeCoverLetterRefinedTitleResult> {
    const model = request.model?.trim() || DEFAULT_MODEL;
    const items = await this.resumeService.findCoverLettersForRefinedTitle({
      resumeIds: request.resumeIds,
      coverLetterIds: request.coverLetterIds,
      onlyEmpty: request.onlyEmpty,
      limit: request.limit,
    });

    onLog(`자기소개서 문항 ${items.length}개의 제목 재작성을 시작합니다.`);
    this.logger.log(
      `[RefinedTitle] ${items.length} cover letters, model=${model}`,
    );

    const updated: ResumeCoverLetterRefinedTitleResult['updated'] = [];
    for (const [index, item] of items.entries()) {
      if (signal?.aborted) break;
      onLog(
        `${index + 1}/${items.length} 제목 생성 중: ${this.truncate(item.title || item.answer, 36)}`,
      );
      const refinedTitle = await this.generateRefinedTitle(model, item, signal);
      await this.resumeService.updateCoverLetterRefinedTitle(
        item.id,
        refinedTitle,
      );
      updated.push({ id: item.id, resumeId: item.resumeId, refinedTitle });
      onLog(`${index + 1}/${items.length} 완료: ${refinedTitle}`);
    }

    return { total: items.length, updated };
  }

  private async generateRefinedTitle(
    model: string,
    item: {
      title: string;
      answer: string;
      companyName: string;
      jobTitle: string;
      jd: string | null;
    },
    signal?: AbortSignal,
  ): Promise<string> {
    const system = [
      '너는 자기소개서 문항 제목을 재작성하는 도우미다.',
      'question을 읽고 해당 문항이 묻는 핵심 주제를 한 문장으로 파악해라.',
      '파악한 핵심 주제를 간결한 명사형 제목으로 만들어라.',
      '예시: "협업 리더십", "데이터 활용 강점", "직무 성장 경험", "문제 해결 역량"',
      '제목은 15자 이내로 자연스러운 한국어 명사형으로 끝내라.',
      '기업명이나 직무명은 제목에 포함하지 않는다.',
      '반드시 JSON만 반환한다. 설명, 마크다운, 코드블록은 금지한다.',
    ].join('\n');

    const prompt = JSON.stringify({
      output_schema: { title: '[핵심주제]' },
      question: item.title,
    });

    const result = await this.aiProvider.call(model, system, prompt, {
      signal,
      caller: 'ResumeCoverLetterRefinedTitleExecutor',
    });

    return this.parseTitle(result.text) || item.title || '자기소개서';
  }

  private parseTitle(text: string): string {
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(trimmed) as { title?: unknown };
      if (typeof parsed.title === 'string') return parsed.title.trim();
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as { title?: unknown };
          if (typeof parsed.title === 'string') return parsed.title.trim();
        } catch {
          // fall through
        }
      }
    }
    return '';
  }

  private truncate(value: string, max: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > max
      ? `${normalized.slice(0, max)}...`
      : normalized;
  }
}
