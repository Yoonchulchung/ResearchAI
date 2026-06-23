import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { BrowserService } from 'src/browse/application/browser.service';
import { NewsArticleSummaryEntity } from 'src/news/domain/entity/news-article-summary.entity';
import {
  NewsArticleSummary,
  SaveNewsArticleSummaryInput,
} from 'src/news/application/service/news.types';

@Injectable()
export class NewsArticleService {
  constructor(
    private readonly browser: BrowserService,
    @InjectRepository(NewsArticleSummaryEntity)
    private readonly summaryRepo: Repository<NewsArticleSummaryEntity>,
  ) {}

  async getContent(url: string): Promise<{
    title: string;
    content: string;
    image?: string;
    finalUrl?: string;
  }> {
    if (!url.trim()) return { title: '', content: '' };

    try {
      return await this.browser.fetchArticle(url);
    } catch {
      return { title: '', content: '', finalUrl: url };
    }
  }

  async getSummary(url: string): Promise<NewsArticleSummary | null> {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return null;

    const entity = await this.summaryRepo.findOneBy({ url: normalizedUrl });
    return entity ? this.toSummary(entity) : null;
  }

  async saveSummary(
    input: SaveNewsArticleSummaryInput,
  ): Promise<NewsArticleSummary> {
    const url = input.url.trim();
    if (!url) throw new Error('뉴스 요약 저장 URL이 비어 있습니다.');

    const existing = await this.summaryRepo.findOneBy({ url });
    const entity = this.summaryRepo.create({
      id: existing?.id ?? createHash('sha1').update(url).digest('hex'),
      url,
      title: input.title || existing?.title || '제목 없음',
      source: input.source ?? existing?.source ?? null,
      description: input.description ?? existing?.description ?? null,
      summary: input.summary,
      model: input.model ?? existing?.model ?? null,
      articleUrl: input.articleUrl ?? existing?.articleUrl ?? url,
    });

    await this.summaryRepo.save(entity);
    const saved = await this.summaryRepo.findOneByOrFail({ id: entity.id });
    return this.toSummary(saved);
  }

  private toSummary(entity: NewsArticleSummaryEntity): NewsArticleSummary {
    return {
      id: entity.id,
      url: entity.url,
      title: entity.title,
      source: entity.source,
      description: entity.description,
      summary: entity.summary,
      model: entity.model,
      articleUrl: entity.articleUrl,
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
