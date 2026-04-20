import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DocumentEntity } from '../domain/entity/document.entity';
import { ExperienceEntity } from '../domain/entity/experience.entity';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { VectorService } from '../../vector/vector.service';
import { QueueService } from '../../queue/application/queue.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

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

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly repo: Repository<DocumentEntity>,
    @InjectRepository(ExperienceEntity)
    private readonly experienceRepo: Repository<ExperienceEntity>,
    private readonly aiProvider: AiProviderService,
    private readonly vectorService: VectorService,
    private readonly queueService: QueueService,
  ) {}

  // ── Documents ────────────────────────────────────────────────────────────

  findAll(userId: string | null): Promise<DocumentEntity[]> {
    if (!userId) return Promise.resolve([]);
    return this.repo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  findOne(id: string): Promise<DocumentEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(title: string, content: string, userId: string | null, companyName?: string): Promise<DocumentEntity> {
    const entity = this.repo.create({ id: randomUUID(), userId, title, content, companyName: companyName ?? null });
    return this.repo.save(entity);
  }

  async update(id: string, title?: string, content?: string, companyName?: string): Promise<DocumentEntity | null> {
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

  async extractText(buffer: Buffer, mimetype: string): Promise<{ text: string; pageCount: number }> {
    if (mimetype === 'application/pdf' || mimetype === 'application/octet-stream') {
      const parsed = await pdfParse(buffer);
      return { text: parsed.text, pageCount: parsed.numpages };
    }
    return { text: buffer.toString('utf-8'), pageCount: 1 };
  }

  async ask(
    docText: string,
    question: string,
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    const system = `당신은 문서 분석 전문가입니다. 사용자가 제공한 문서 내용을 기반으로 질문에 답변합니다.
답변은 한국어로 작성하고, 문서에 없는 내용은 추측하지 마세요.
문서 내용에서 관련 부분을 인용하거나 참조하여 답변하세요.`;

    const prompt = `=== 문서 내용 ===
${docText.slice(0, 30000)}

=== 질문 ===
${question}`;

    const { text: answer } = await this.aiProvider.call(aiModel, system, prompt);
    return { answer };
  }

  async quickAction(
    docText: string,
    action: 'translate' | 'summarize' | 'explain' | 'keywords',
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    const prompts: Record<string, string> = {
      translate: '이 문서의 내용을 한국어로 번역해주세요. 원문의 구조와 형식을 최대한 유지하세요.',
      summarize: '이 문서의 핵심 내용을 3~5개의 불릿 포인트로 요약해주세요.',
      explain: '이 문서의 내용을 쉬운 말로 설명해주세요. 전문 용어가 있다면 풀어서 설명하세요.',
      keywords: '이 문서에서 핵심 키워드와 주요 개념을 추출하고 각각 간략히 설명해주세요.',
    };
    return this.ask(docText, prompts[action], aiModel);
  }

  // ── Experiences ──────────────────────────────────────────────────────────

  findAllExperiences(userId: string | null): Promise<ExperienceEntity[]> {
    if (!userId) return Promise.resolve([]);
    return this.experienceRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  findOneExperience(id: string): Promise<ExperienceEntity | null> {
    return this.experienceRepo.findOne({ where: { id } });
  }

  async createExperience(title: string, content: string, userId: string | null, category?: string, sourceDocId?: string | null): Promise<ExperienceEntity> {
    const entity = this.experienceRepo.create({ id: randomUUID(), userId, title, content, category, sourceDocId: sourceDocId ?? null });
    const saved = await this.experienceRepo.save(entity);
    await this.vectorService.indexExperience(saved.id, saved.title, saved.content);
    return saved;
  }

  async updateExperience(
    id: string,
    title?: string,
    content?: string,
    category?: string,
    aiCategories?: string[] | null,
  ): Promise<ExperienceEntity | null> {
    const entity = await this.experienceRepo.findOne({ where: { id } });
    if (!entity) return null;
    if (title !== undefined) entity.title = title;
    if (content !== undefined) entity.content = content;
    if (category !== undefined) entity.category = category;
    if (aiCategories !== undefined) entity.aiCategories = aiCategories;
    const saved = await this.experienceRepo.save(entity);
    await this.vectorService.indexExperience(saved.id, saved.title, saved.content);
    return saved;
  }

  async deleteExperience(id: string): Promise<void> {
    await this.experienceRepo.delete(id);
    await this.vectorService.deleteExperience(id);
  }

  async suggestCategories(id: string, model: string): Promise<{ categories: string[] }> {
    const entity = await this.experienceRepo.findOne({ where: { id } });
    if (!entity) return { categories: [] };

    const CATEGORY_LIST = ['개발', '기획', '디자인', '마케팅', '영업', '운영', '연구', '교육', '기타'];

    const prompt = `다음 경험의 제목과 내용을 분석하여 가장 잘 어울리는 카테고리를 추천해주세요.

경험 제목: ${entity.title}

경험 내용:
${entity.content}

추천 가능한 카테고리 목록: ${CATEGORY_LIST.join(', ')}

위 목록에서 이 경험과 관련 있는 카테고리를 1~3개 선택하세요. 목록에 없는 카테고리는 절대 사용하지 마세요.
반드시 아래 JSON만 반환하세요 (마크다운 코드블록 없이 순수 JSON):
{"categories": ["카테고리1", "카테고리2"]}`;

    try {
      const { text: raw } = await this.aiProvider.call(model, '', prompt);
      const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();
      const parsed = JSON.parse(cleaned) as { categories: string[] };
      const valid = parsed.categories.filter((c) => CATEGORY_LIST.includes(c));
      entity.aiCategories = valid;
      await this.experienceRepo.save(entity);
      return { categories: valid };
    } catch {
      return { categories: [] };
    }
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

  async searchExperiences(query: string, topK = 5): Promise<ExperienceSearchItem[]> {
    const vectorResults = await this.vectorService.searchExperiences(query, topK);

    if (vectorResults.length > 0) {
      const items = await Promise.all(
        vectorResults.map(async (r) => {
          const entity = await this.experienceRepo.findOne({ where: { id: r.experienceId } });
          if (!entity) return null;
          return { id: entity.id, title: entity.title, content: entity.content, category: entity.category, score: r.score };
        }),
      );
      return items.filter(Boolean) as ExperienceSearchItem[];
    }

    const all = await this.experienceRepo.find({ order: { createdAt: 'DESC' } });
    const lower = query.toLowerCase();
    const scored = all.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      category: e.category,
      score: e.title.toLowerCase().includes(lower) || e.content.toLowerCase().includes(lower) ? 0.8 : 0.3,
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  // ── Write Assist ─────────────────────────────────────────────────────────

  async enqueueWriteAssist(
    action: string,
    content: string,
    model: string,
    experiences?: { title: string; content: string }[],
    companyCtx?: string,
  ): Promise<{ jobId: string }> {
    return this.queueService.enqueueDocWriteAssist(action, content, model, experiences, companyCtx);
  }
}
