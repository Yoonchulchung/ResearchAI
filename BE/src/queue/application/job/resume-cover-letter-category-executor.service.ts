import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { ResumeService } from 'src/recruit/application/resume/resume.service';

export interface ResumeCoverLetterCategoryRequest {
  resumeIds?: string[];
  coverLetterIds?: string[];
  onlyEmpty?: boolean;
  limit?: number;
  model?: string;
}

export interface ResumeCoverLetterCategoryResult {
  total: number;
  updated: Array<{ id: string; resumeId: string; category: string[] }>;
}

const FREE_CATEGORY_MODEL = 'gemini-2.0-flash';
const COVER_LETTER_CATEGORIES = [
  '지원 동기',
  '직무 역량',
  '강점/약점',
  '성장 과정',
  '입사 후 포부',
  '협업/갈등',
  '문제 해결',
  '도전/실패',
  '주위의 모습',
  '가치관',
  '기타',
];

@Injectable()
export class ResumeCoverLetterCategoryExecutorService {
  private readonly logger = new Logger(
    ResumeCoverLetterCategoryExecutorService.name,
  );

  constructor(
    private readonly resumeService: ResumeService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async execute(
    request: ResumeCoverLetterCategoryRequest,
    onLog: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<ResumeCoverLetterCategoryResult> {
    const model = this.resolveFreeModel(request.model);
    const items =
      await this.resumeService.findCoverLettersForCategoryClassification({
        resumeIds: request.resumeIds,
        coverLetterIds: request.coverLetterIds,
        onlyEmpty: request.onlyEmpty,
        limit: request.limit,
      });

    onLog(`자기소개서 문항 ${items.length}개 카테고리 분류를 시작합니다.`);
    this.logger.log(
      `[ResumeCategory] ${items.length} cover letters, model=${model}`,
    );

    const updated: ResumeCoverLetterCategoryResult['updated'] = [];
    for (const [index, item] of items.entries()) {
      if (signal?.aborted) break;
      onLog(
        `${index + 1}/${items.length} 분류 중: ${this.truncate(item.title || item.answer, 36)}`,
      );
      const category = await this.classifyOne(
        model,
        item.title,
        item.answer,
        signal,
      );
      await this.resumeService.updateCoverLetterCategory(item.id, category);
      updated.push({ id: item.id, resumeId: item.resumeId, category });
      onLog(
        `${index + 1}/${items.length} 저장 완료: ${category.join(', ') || '기타'}`,
      );
    }

    return { total: items.length, updated };
  }

  private async classifyOne(
    model: string,
    title: string,
    answer: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const system = [
      '너는 채용 자기소개서 문항을 분류하는 도우미다.',
      '반드시 JSON만 반환한다. 설명, 마크다운, 코드블록은 금지한다.',
      `허용 카테고리: ${COVER_LETTER_CATEGORIES.join(', ')}`,
      '문항 하나에 여러 카테고리가 해당될 수 있다.',
      '애매하면 가장 가까운 카테고리 1~2개를 고르고, 정말 맞는 항목이 없을 때만 기타를 사용한다.',
    ].join('\n');
    const prompt = JSON.stringify({
      output_schema: { categories: ['지원 동기'] },
      question: title,
      answer: answer.slice(0, 4000),
    });

    const result = await this.aiProvider.call(model, system, prompt, {
      signal,
      caller: 'ResumeCoverLetterCategoryExecutor',
    });
    return this.normalizeCategories(this.parseCategories(result.text));
  }

  private resolveFreeModel(model?: string): string {
    const value = model?.trim();
    if (!value) return FREE_CATEGORY_MODEL;
    if (
      value.startsWith('gemini') ||
      value.startsWith('groq:') ||
      value === 'llama-3.3-70b-versatile'
    ) {
      return value;
    }
    return FREE_CATEGORY_MODEL;
  }

  private parseCategories(text: string): string[] {
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(trimmed) as { categories?: unknown };
      if (Array.isArray(parsed.categories))
        return parsed.categories.map(String);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as { categories?: unknown };
          if (Array.isArray(parsed.categories))
            return parsed.categories.map(String);
        } catch {
          // fall through
        }
      }
    }
    return COVER_LETTER_CATEGORIES.filter((category) =>
      trimmed.includes(category),
    );
  }

  private normalizeCategories(categories: string[]): string[] {
    const allowed = new Set(COVER_LETTER_CATEGORIES);
    const normalized = categories
      .map((category) => category.trim())
      .filter((category) => allowed.has(category));
    const unique = [...new Set(normalized)];
    return unique.length > 0 ? unique.slice(0, 3) : ['기타'];
  }

  private truncate(value: string, max: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > max
      ? `${normalized.slice(0, max)}...`
      : normalized;
  }
}
