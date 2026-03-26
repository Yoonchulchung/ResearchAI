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

  findAll(): Promise<DocumentEntity[]> {
    return this.repo.find({ order: { updatedAt: 'DESC' } });
  }

  findOne(id: string): Promise<DocumentEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(title: string, content: string, companyName?: string): Promise<DocumentEntity> {
    const entity = this.repo.create({ id: randomUUID(), title, content, companyName: companyName ?? null });
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

  findAllExperiences(): Promise<ExperienceEntity[]> {
    return this.experienceRepo.find({ order: { createdAt: 'DESC' } });
  }

  findOneExperience(id: string): Promise<ExperienceEntity | null> {
    return this.experienceRepo.findOne({ where: { id } });
  }

  async createExperience(title: string, content: string, category?: string, sourceDocId?: string | null): Promise<ExperienceEntity> {
    const entity = this.experienceRepo.create({ id: randomUUID(), title, content, category, sourceDocId: sourceDocId ?? null });
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

  private static readonly WRITE_ASSIST_PROMPTS: Record<string, string> = {
    continue:
      '아래 문서의 내용을 자연스럽게 이어서 작성해주세요. 문서의 흐름과 스타일을 유지하면서 다음 내용을 작성하세요:\n\n{content}',
    section:
      '아래 문서에 추가할 새로운 섹션을 제안하고 작성해주세요. 문서의 맥락에 맞는 주제를 선택하세요:\n\n{content}',
    improve:
      '아래 문서의 문장을 더 명확하고 전문적으로 개선해주세요. 내용은 유지하되 표현을 다듬어주세요:\n\n{content}',
    summarize:
      '아래 문서의 핵심 내용을 간결하게 요약해주세요:\n\n{content}',
    plagiarism: `당신은 AI 생성 텍스트 감지 전문가입니다. 아래 문서를 분석하여 AI 표절 가능성을 평가해주세요.

## 분석 항목
1. **AI 생성 가능성** — 문장 패턴, 반복적 구조, 지나치게 완성된 문체 등 AI 특징 여부 (0~100%)
2. **표현 다양성** — 어휘·문장 구조의 다양성 및 자연스러운 개인 특색 유무
3. **의심 구간** — AI가 작성했을 가능성이 높은 문장이나 단락을 인용하여 지적
4. **독창성 점수** — 글 전체의 독창성 수준 (10점 만점)
5. **개선 권고** — 더 인간적이고 개성 있는 글로 개선하기 위한 구체적 제안

각 항목에 근거와 함께 답하고, 마지막에 종합 판정(인간 작성 / 일부 AI 보조 / AI 주도)을 내려주세요.

---
## 검사 대상 문서

{content}`,
    evaluate: `당신은 전문 글쓰기 컨설턴트입니다. 아래 문서를 다음 항목에 따라 컨설팅 보고서 형식으로 평가해주세요.

## 평가 항목
1. **반복 단어 사용** — 같은 단어·표현이 과도하게 반복되는 구간을 찾아 원문을 인용하고 대안 표현을 제안해주세요
2. **진부한 표현** — "최선을 다하다", "열정을 가지고" 등 식상하거나 의미가 희석된 표현을 원문 인용과 함께 지적해주세요
3. **애매한 표현** — 독자가 오해하거나 의미가 불분명한 문장을 원문 인용과 함께 구체적인 수정 방향을 제안해주세요
4. **지나치게 긴 문장** — 한 문장에 내용이 과도하게 압축되어 가독성을 해치는 구간을 원문 인용 후 분리 방법을 제안해주세요
5. **논리적인 흐름** — 문단 간 연결이 자연스러운지, 주장과 근거가 논리적으로 이어지는지, 비약이나 모순이 없는지 평가해주세요
6. **질문에 적절한 내용** — 글의 주제·질문 의도에 맞는 내용을 담고 있는지, 핵심에서 벗어난 불필요한 내용이 있는지 평가해주세요
7. **종합 개선 제안** — 위 분석을 바탕으로 우선순위가 높은 개선 방향 3가지를 제안해주세요

각 항목에서 실제 원문을 인용(> 인용 형식)하여 근거를 명확히 하고, 마지막에 전체 완성도 점수(10점 만점)와 한 줄 종합 의견을 작성해주세요.

---
## 평가 대상 문서

{content}`,
  };

  async enqueueWriteAssist(
    action: string,
    content: string,
    model: string,
    experiences?: { title: string; content: string }[],
    companyCtx?: string,
  ): Promise<{ jobId: string }> {
    const template = DocumentsService.WRITE_ASSIST_PROMPTS[action];
    if (!template) throw new Error(`알 수 없는 액션: ${action}`);

    const expContext =
      experiences && experiences.length > 0
        ? `## 참고할 나의 경험\n${experiences.map((e) => `### ${e.title}\n${e.content}`).join('\n\n')}\n\n---\n\n`
        : '';

    const instruction = (companyCtx ?? '') + expContext + template.replace('{content}', content);
    return this.queueService.enqueueWriteAssist(content, instruction, model);
  }
}
