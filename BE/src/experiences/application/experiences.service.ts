import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ExperienceEntity } from '../domain/entity/experience.entity';
import { VectorService } from '../../vector/vector.service';
import { AiService } from '../../ai/application/ai.service';

export interface ExperienceSearchItem {
  id: string;
  title: string;
  content: string;
  category?: string;
  score: number;
}

@Injectable()
export class ExperiencesService {
  constructor(
    @InjectRepository(ExperienceEntity)
    private readonly repo: Repository<ExperienceEntity>,
    private readonly vectorService: VectorService,
    private readonly aiService: AiService,
  ) {}

  findAll(): Promise<ExperienceEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  findOne(id: string): Promise<ExperienceEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(title: string, content: string, category?: string): Promise<ExperienceEntity> {
    const entity = this.repo.create({ id: randomUUID(), title, content, category });
    const saved = await this.repo.save(entity);
    await this.vectorService.indexExperience(saved.id, saved.title, saved.content);
    return saved;
  }

  async update(
    id: string,
    title?: string,
    content?: string,
    category?: string,
    aiCategories?: string[] | null,
  ): Promise<ExperienceEntity | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    if (title !== undefined) entity.title = title;
    if (content !== undefined) entity.content = content;
    if (category !== undefined) entity.category = category;
    if (aiCategories !== undefined) entity.aiCategories = aiCategories;
    const saved = await this.repo.save(entity);
    await this.vectorService.indexExperience(saved.id, saved.title, saved.content);
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
    await this.vectorService.deleteExperience(id);
  }

  async suggestCategories(id: string, model: string): Promise<{ categories: string[] }> {
    const entity = await this.repo.findOne({ where: { id } });
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
      const { text: raw } = await this.aiService.call(model, '', prompt);
      const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();
      const parsed = JSON.parse(cleaned) as { categories: string[] };
      const valid = parsed.categories.filter((c) => CATEGORY_LIST.includes(c));
      // DB에 자동 저장
      entity.aiCategories = valid;
      await this.repo.save(entity);
      return { categories: valid };
    } catch {
      return { categories: [] };
    }
  }

  async search(query: string, topK = 5): Promise<ExperienceSearchItem[]> {
    const vectorResults = await this.vectorService.searchExperiences(query, topK);

    if (vectorResults.length > 0) {
      const items = await Promise.all(
        vectorResults.map(async (r) => {
          const entity = await this.repo.findOne({ where: { id: r.experienceId } });
          if (!entity) return null;
          return { id: entity.id, title: entity.title, content: entity.content, category: entity.category, score: r.score };
        }),
      );
      return items.filter(Boolean) as ExperienceSearchItem[];
    }

    // Qdrant 없을 때: 전체 목록 반환 (score = 1)
    const all = await this.repo.find({ order: { createdAt: 'DESC' } });
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
}
