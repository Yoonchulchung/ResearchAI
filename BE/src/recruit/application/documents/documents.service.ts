import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DocumentEntity } from 'src/recruit/domain/documents/entity/document.entity';
import { ResumeCoverLetterEntity } from 'src/recruit/domain/resume/resume-cover-letter.entity';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { VectorService } from 'src/vector/vector.service';
import { AiQueueService } from 'src/queue/application/queue/ai-queue.service';
import {
  buildPortfolioEvaluationPrompt,
  PORTFOLIO_EVALUATION_SYSTEM_PROMPT,
} from 'src/recruit/domain/documents/doc-parse.prompts';
import pdfParse from 'pdf-parse';

export interface DocAskResult {
  answer: string;
}

export interface ExperienceSearchItem {
  id: string;
  title: string;
  content: string;
  category?: string;
  score: number;
}

export interface ExperienceRecord {
  id: string;
  userId: string | null;
  title: string;
  content: string;
  category: string | null;
  sourceDocId: string | null;
  aiCategories: string[] | null;
  companyName: string | null;
  jobTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly repo: Repository<DocumentEntity>,
    @InjectRepository(ResumeCoverLetterEntity)
    private readonly coverLetterRepo: Repository<ResumeCoverLetterEntity>,
    private readonly aiProvider: AiProviderService,
    private readonly vectorService: VectorService,
    private readonly queueService: AiQueueService,
  ) {}

  // ── Documents ────────────────────────────────────────────────────────────

  findAll(userId: string | null): Promise<DocumentEntity[]> {
    if (!userId) return Promise.resolve([]);
    return this.repo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  findOne(id: string): Promise<DocumentEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(
    title: string,
    content: string,
    userId: string | null,
    companyName?: string,
  ): Promise<DocumentEntity> {
    const entity = this.repo.create({
      id: randomUUID(),
      userId,
      title,
      content,
      companyName: companyName ?? null,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    title?: string,
    content?: string,
    companyName?: string,
  ): Promise<DocumentEntity | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    if (title !== undefined) entity.title = title;
    if (content !== undefined) entity.content = content;
    if (companyName !== undefined) entity.companyName = companyName || null;
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  // ── Doc-parse ────────────────────────────────────────────────────────────

  async extractText(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ text: string; pageCount: number; pages: string[] }> {
    if (
      mimetype === 'application/pdf' ||
      mimetype === 'application/octet-stream'
    ) {
      const pages: string[] = [];
      const result = await pdfParse(buffer, {
        pagerender: (pageData: any) =>
          pageData.getTextContent().then((content: any) => {
            const text = content.items.map((i: any) => i.str).join(' ');
            pages.push(text);
            return text;
          }),
      });
      const text = result.text ?? pages.join('\n\n');
      const pageCount = result.numpages ?? pages.length ?? 1;
      return {
        text,
        pageCount,
        pages: pages.length > 0 ? pages : [text],
      };
    }
    const text = buffer.toString('utf-8');
    return { text, pageCount: 1, pages: [text] };
  }

  /** 포트폴리오 페이지별 평가 — 각 페이지의 문제점·개선점 + 종합 평가 */
  async evaluatePortfolio(
    pages: string[],
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    if (!pages || pages.length === 0) {
      return { answer: '평가할 페이지가 없습니다.' };
    }

    const { text: answer } = await this.aiProvider.call(
      aiModel,
      PORTFOLIO_EVALUATION_SYSTEM_PROMPT,
      buildPortfolioEvaluationPrompt(pages),
    );
    return { answer };
  }

  private buildAskContext(docText: string, question: string) {
    const system = `당신은 문서 분석 전문가입니다. 사용자가 제공한 문서 내용을 기반으로 질문에 답변합니다.
답변은 한국어로 작성하고, 문서에 없는 내용은 추측하지 마세요.
문서 내용에서 관련 부분을 인용하거나 참조하여 답변하세요.`;
    const prompt = `=== 문서 내용 ===\n${docText.slice(0, 30000)}\n\n=== 질문 ===\n${question}`;
    return { system, prompt };
  }

  async ask(
    docText: string,
    question: string,
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    const { system, prompt } = this.buildAskContext(docText, question);
    const { text: answer } = await this.aiProvider.call(
      aiModel,
      system,
      prompt,
    );
    return { answer };
  }

  async *askStream(
    docText: string,
    question: string,
    aiModel = 'claude-sonnet-4-6',
  ): AsyncGenerator<string> {
    const { system, prompt } = this.buildAskContext(docText, question);
    yield* this.aiProvider.stream(aiModel, system, [
      { role: 'user', content: prompt },
    ]);
  }

  async quickAction(
    docText: string,
    action: 'translate' | 'explain' | 'keywords',
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    const prompts: Record<string, string> = {
      translate:
        '이 문서의 내용을 한국어로 번역해주세요. 원문의 구조와 형식을 최대한 유지하세요.',
      explain:
        '이 문서의 내용을 쉬운 말로 설명해주세요. 전문 용어가 있다면 풀어서 설명하세요.',
      keywords:
        '이 문서에서 핵심 키워드와 주요 개념을 추출하고 각각 간략히 설명해주세요.',
    };
    return this.ask(docText, prompts[action], aiModel);
  }

  /** 페이지별 요약 — 각 페이지를 개별 분석하여 마크다운으로 반환 */
  async summarizeByPage(
    pages: string[],
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    if (!pages || pages.length === 0)
      return { answer: '요약할 페이지가 없습니다.' };

    const system = `당신은 문서 요약 전문가입니다. 각 페이지의 핵심 내용을 간결하고 명확하게 요약합니다.`;

    const pagesBlock = pages
      .map((p, i) => `### 페이지 ${i + 1}\n${p.trim() || '(텍스트 없음)'}`)
      .join('\n\n---\n\n');

    const prompt = `다음은 문서의 페이지별 텍스트입니다. 각 페이지의 핵심 내용을 2~4개의 불릿으로 요약해주세요.

## 출력 형식

### 페이지 1
- 핵심 내용 1
- 핵심 내용 2

### 페이지 2
- ...

---

## 문서 내용 (총 ${pages.length}페이지)

${pagesBlock}`;

    const { text: answer } = await this.aiProvider.call(
      aiModel,
      system,
      prompt,
    );
    return { answer };
  }

  // ── Experiences ──────────────────────────────────────────────────────────

  async findAllExperiences(
    _userId: string | null,
  ): Promise<ExperienceRecord[]> {
    const coverLetters = await this.coverLetterRepo.find({
      relations: { resume: true },
      order: { orderIndex: 'ASC' },
    });

    return coverLetters
      .filter((cl) => cl.answer?.trim())
      .map((cl) => {
        const categories = this.parseCategoryString(cl.category);
        return {
          id: cl.id,
          userId: null,
          title: cl.refinedTitle?.trim() || cl.title?.trim() || '제목 없음',
          content: cl.answer,
          category: categories[0] ?? null,
          sourceDocId: null,
          aiCategories: categories.length > 0 ? categories : null,
          companyName: cl.resume?.companyName ?? null,
          jobTitle: cl.resume?.jobTitle ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });
  }

  private parseCategoryString(value: string | null): string[] {
    if (!value?.trim()) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fallback to comma-separated
    }
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  findOneExperience(_id: string): Promise<ExperienceRecord | null> {
    return Promise.resolve(null);
  }

  async createExperience(
    title: string,
    content: string,
    userId: string | null,
    category?: string,
    sourceDocId?: string | null,
  ): Promise<ExperienceRecord> {
    const now = new Date();
    const record: ExperienceRecord = {
      id: randomUUID(),
      userId,
      title,
      content,
      category: category ?? null,
      sourceDocId: sourceDocId ?? null,
      aiCategories: null,
      companyName: null,
      jobTitle: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.vectorService.indexExperience(
      record.id,
      record.title,
      record.content,
      userId,
    );
    return record;
  }

  async updateExperience(
    _id: string,
    _title?: string,
    _content?: string,
    _category?: string,
    _aiCategories?: string[] | null,
  ): Promise<ExperienceRecord | null> {
    return null;
  }

  async deleteExperience(id: string): Promise<void> {
    await this.vectorService.deleteExperience(id);
  }

  async suggestCategories(
    _id: string,
    _model: string,
  ): Promise<{ categories: string[] }> {
    return { categories: [] };
  }

  async extractFromDocument(
    content: string,
    model: string,
  ): Promise<{ title: string; content: string }[]> {
    const prompt = `다음 자기소개서/문서에서 번호로 구분된 각 항목을 분리하여 경험 목록으로 추출해주세요.

문서 내용:
${content}

각 번호별 항목을 분석하여 다음 형식으로 반환하세요:
- title: 항목의 질문/주제를 간결하게 요약 (예: "한화엔진 지원 동기 및 목표")
- content: 해당 항목의 답변 내용 전체

반드시 아래 JSON만 반환하세요 (마크다운 코드블록 없이 순수 JSON):
{"experiences": [{"title": "제목", "content": "내용"}, ...]}`;

    try {
      const { text: raw } = await this.aiProvider.call(model, '', prompt);
      const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();
      const parsed = JSON.parse(cleaned) as {
        experiences: { title: string; content: string }[];
      };
      return parsed.experiences ?? [];
    } catch {
      return [];
    }
  }

  async searchExperiences(
    query: string,
    topK = 5,
    userId?: string | null,
  ): Promise<ExperienceSearchItem[]> {
    const vectorResults = await this.vectorService.searchExperiences(
      query,
      topK,
      userId,
    );
    return vectorResults.map((r) => ({
      id: r.experienceId,
      title: r.title,
      content: r.text,
      score: r.score,
    }));
  }

  // ── Write Assist ─────────────────────────────────────────────────────────

  async enqueueWriteAssist(
    action: string,
    content: string,
    model: string,
    experiences?: { title: string; content: string }[],
    companyCtx?: string,
  ): Promise<{ jobId: string }> {
    return this.queueService.enqueueDocWriteAssist(
      action,
      content,
      model,
      experiences,
      companyCtx,
    );
  }

  // ── Doc Parse (queue) ────────────────────────────────────────────────────

  enqueueDocParseAsk(
    docText: string,
    question: string,
    model?: string,
  ): Promise<{ jobId: string }> {
    return this.queueService.enqueueDocParseAsk(docText, question, model ?? '');
  }

  enqueueDocParseAction(
    action: string,
    docText: string | undefined,
    pages: string[] | undefined,
    model?: string,
  ): Promise<{ jobId: string }> {
    return this.queueService.enqueueDocParseAction(
      action,
      docText,
      pages,
      model ?? '',
    );
  }
}
