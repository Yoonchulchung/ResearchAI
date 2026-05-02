import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DocumentEntity } from '../domain/entity/document.entity';
import { ExperienceEntity } from '../domain/entity/experience.entity';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { VectorService } from '../../vector/vector.service';
import { QueueService } from '../../queue/application/queue.service';
import { PDFParse } from 'pdf-parse';

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

  async extractText(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ text: string; pageCount: number; pages: string[] }> {
    if (mimetype === 'application/pdf' || mimetype === 'application/octet-stream') {
      // pdf-parse v2: PDFParse 클래스 사용, 페이지별 분리는 라이브러리가 제공
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        const pages = (result.pages ?? []).map((p) => p.text ?? '');
        const text = result.text ?? pages.join('\n\n');
        const pageCount = result.total ?? pages.length ?? 1;
        return {
          text,
          pageCount,
          pages: pages.length > 0 ? pages : [text],
        };
      } finally {
        await parser.destroy().catch(() => {});
      }
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

    const pagesBlock = pages
      .map((p, i) => `### 📄 페이지 ${i + 1}\n${p.trim() || '(텍스트 없음 — 이미지 위주 페이지일 가능성)'}`)
      .join('\n\n---\n\n');

    const system = `당신은 10년차 시니어 포트폴리오 리뷰어이자 채용 심사 전문가입니다.
지원자의 포트폴리오를 페이지 단위로 엄격하게 분석하여 합격 가능성을 높이는 구체적 피드백을 제공합니다.`;

    const prompt = `# 포트폴리오 페이지 분석 요청

다음은 페이지별로 추출된 포트폴리오 텍스트입니다. 각 페이지를 개별 분석한 뒤 종합 평가를 작성하세요.

## 평가 기준 (각 25점, 합계 100점)

1. **직무 적합성** — 지원 직무·분야가 명확한가, 페이지 내용이 직무와 연관되는가
2. **콘텐츠 완성도** — STAR(상황·과제·행동·결과) 구조 + 정량적 성과(수치·지표)
3. **시각·구조적 완성도** — 정보 위계, 가독성, 페이지별 메시지 명확성, 빈 페이지·정보 부족 페이지 식별
4. **차별화·임팩트** — 평범한 자기소개를 넘는 독창성, 첫인상·결말의 강도

## 출력 형식 (반드시 이 마크다운 구조 그대로)

\`\`\`
# 📊 포트폴리오 평가

## 🎯 종합

| 항목 | 점수 | 등급 |
|------|------|------|
| 직무 적합성 | __/25 | A/B/C/D |
| 콘텐츠 완성도 | __/25 | A/B/C/D |
| 시각·구조적 완성도 | __/25 | A/B/C/D |
| 차별화·임팩트 | __/25 | A/B/C/D |
| **종합** | **__/100** | **__** |

**합격 가능성**: 매우 높음 / 높음 / 보통 / 낮음 / 매우 낮음
**한 줄 총평**: (한 문장)

---

## 📄 페이지별 분석

### 페이지 1
- **🟢 좋은 점**: (구체적)
- **🔴 문제점**: (원문 인용 가능 시 \`> "..."\` 인용)
- **💡 개선 제안**: (실행 가능한 액션)

### 페이지 2
(같은 형식)

(... 모든 페이지 반복)

---

## 🎯 우선 개선 5가지
1. (가장 시급한 항목, 어느 페이지의 어떤 부분을 어떻게 고칠지)
2. ...
3. ...
4. ...
5. ...
\`\`\`

## 평가 원칙
- **엄격하게**: 적당히 좋다는 평가 금지. 구체적 근거 없는 긍정 평가 금지.
- **페이지 단위로**: 각 페이지가 어떤 메시지를 전달하는지, 어떤 페이지가 약한지 명시.
- **빈 페이지 / 텍스트 없는 페이지** ("(텍스트 없음 ..."): 이미지 위주 페이지로 간주하고 "텍스트만으로는 평가 어려움. 캡션·설명 추가 권장" 같은 방향으로 평가.
- **실행 가능하게**: "더 잘 만들어라" 같은 막연한 조언 금지. 구체적 수정안 제시.

---

## 분석 대상 포트폴리오 (총 ${pages.length}페이지)

${pagesBlock}`;

    const { text: answer } = await this.aiProvider.call(aiModel, system, prompt);
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
    const { text: answer } = await this.aiProvider.call(aiModel, system, prompt);
    return { answer };
  }

  async *askStream(
    docText: string,
    question: string,
    aiModel = 'claude-sonnet-4-6',
  ): AsyncGenerator<string> {
    const { system, prompt } = this.buildAskContext(docText, question);
    yield* this.aiProvider.stream(aiModel, system, [{ role: 'user', content: prompt }]);
  }

  async quickAction(
    docText: string,
    action: 'translate' | 'explain' | 'keywords',
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    const prompts: Record<string, string> = {
      translate: '이 문서의 내용을 한국어로 번역해주세요. 원문의 구조와 형식을 최대한 유지하세요.',
      explain: '이 문서의 내용을 쉬운 말로 설명해주세요. 전문 용어가 있다면 풀어서 설명하세요.',
      keywords: '이 문서에서 핵심 키워드와 주요 개념을 추출하고 각각 간략히 설명해주세요.',
    };
    return this.ask(docText, prompts[action], aiModel);
  }

  /** 페이지별 요약 — 각 페이지를 개별 분석하여 마크다운으로 반환 */
  async summarizeByPage(
    pages: string[],
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    if (!pages || pages.length === 0) return { answer: '요약할 페이지가 없습니다.' };

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

    const { text: answer } = await this.aiProvider.call(aiModel, system, prompt);
    return { answer };
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
    await this.vectorService.indexExperience(saved.id, saved.title, saved.content, userId);
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
    await this.vectorService.indexExperience(saved.id, saved.title, saved.content, saved.userId ?? null);
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

  async searchExperiences(query: string, topK = 5, userId?: string | null): Promise<ExperienceSearchItem[]> {
    const vectorResults = await this.vectorService.searchExperiences(query, topK, userId);

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

  // ── Doc Parse (queue) ────────────────────────────────────────────────────

  enqueueDocParseAsk(docText: string, question: string, model?: string): Promise<{ jobId: string }> {
    return this.queueService.enqueueDocParseAsk(docText, question, model ?? '');
  }

  enqueueDocParseAction(
    action: string,
    docText: string | undefined,
    pages: string[] | undefined,
    model?: string,
  ): Promise<{ jobId: string }> {
    return this.queueService.enqueueDocParseAction(action, docText, pages, model ?? '');
  }
}
