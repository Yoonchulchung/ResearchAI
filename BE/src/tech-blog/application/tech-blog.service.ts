import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { ContentRefreshStateEntity } from '../../shared/entity/content-refresh-state.entity';
import { TechBlogPostEntity } from '../domain/entity/tech-blog-post.entity';
import type { TechBlogListResult, TechBlogPost, TechBlogSource } from '../domain/tech-blog.types';
import { TechBlogCrawlerService } from '../infrastructure/tech-blog-crawler.service';
import { cleanText, dateValue } from '../infrastructure/tech-blog-crawler.util';

const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 60 * 60 * 1000;
const REFRESH_STATE_KEY = 'content-refresh:tech-blogs';
const DEFAULT_LIST_LIMIT = 300;
const MAX_LIST_LIMIT = 300;
const MAX_SOURCE_LIST_LIMIT = 1000;
const MIN_POSTS_PER_SOURCE = 5;

@Injectable()
export class TechBlogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TechBlogService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<TechBlogListResult['errors']> | null = null;

  constructor(
    @InjectRepository(TechBlogPostEntity)
    private readonly postRepo: Repository<TechBlogPostEntity>,
    @InjectRepository(ContentRefreshStateEntity)
    private readonly refreshStateRepo: Repository<ContentRefreshStateEntity>,
    private readonly crawler: TechBlogCrawlerService,
  ) {}

  onModuleInit() {
    setTimeout(() => {
      this.refreshCacheIfStale().catch((error) => {
        const message = error instanceof Error ? error.message : '기술 블로그 자동 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }, 5_000);

    this.refreshTimer = setInterval(() => {
      this.refreshCacheIfStale().catch((error) => {
        const message = error instanceof Error ? error.message : '기술 블로그 자동 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }, REFRESH_CHECK_MS);
    this.refreshTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  getSources(): TechBlogSource[] {
    return this.crawler.getSources();
  }

  async getPosts(options: { source?: string; limit?: number; refresh?: boolean } = {}): Promise<TechBlogListResult> {
    let errors: TechBlogListResult['errors'] = [];
    const cachedCount = await this.postRepo.count();

    if (options.refresh || cachedCount === 0) {
      errors = await this.refreshCache();
    } else {
      this.refreshCacheIfStale().catch((error) => {
        const message = error instanceof Error ? error.message : '기술 블로그 백그라운드 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }

    const result: TechBlogListResult = {
      sources: this.crawler.getSources(),
      posts: await this.readCachedPosts(),
      errors,
      fetchedAt: (await this.getLastRefreshAt()) ?? new Date(0).toISOString(),
    };

    return this.filterResult(result, options.source, options.limit);
  }

  private async refreshCacheIfStale(): Promise<void> {
    const lastRefreshAt = await this.getLastRefreshAt();
    const empty = (await this.postRepo.count()) === 0;
    if (!empty && lastRefreshAt && Date.now() - new Date(lastRefreshAt).getTime() < DAILY_REFRESH_MS) return;
    await this.refreshCache();
  }

  private async refreshCache(): Promise<TechBlogListResult['errors']> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.collectAndStorePosts()
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async collectAndStorePosts(): Promise<TechBlogListResult['errors']> {
    await this.deletePostsFromDisabledSources();

    const { posts, errors } = await this.crawler.crawlAll();
    if (posts.length > 0) {
      await this.postRepo.save(posts.map((post) => this.toPostEntity(post)));
    }
    await this.setLastRefreshAt(new Date().toISOString());
    return errors;
  }

  private async readCachedPosts(): Promise<TechBlogPost[]> {
    const sourceIds = this.enabledSourceIds();
    const entities = await this.postRepo.find({
      where: { sourceId: In(sourceIds) },
      order: { publishedAt: 'DESC', updatedAt: 'DESC' },
    });
    return entities
      .map((entity) => this.toPost(entity))
      .sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
  }

  private filterResult(result: TechBlogListResult, source?: string, limit = DEFAULT_LIST_LIMIT): TechBlogListResult {
    const isSourceDetail = Boolean(source && source !== 'all');
    const resolvedLimit = Math.min(
      Math.max(limit, 1),
      isSourceDetail ? MAX_SOURCE_LIST_LIMIT : MAX_LIST_LIMIT,
    );
    const posts = isSourceDetail
      ? result.posts.filter((post) => post.sourceId === source).slice(0, resolvedLimit)
      : this.pickBalancedPosts(result.posts, result.sources, resolvedLimit);

    return {
      ...result,
      posts,
    };
  }

  private pickBalancedPosts(posts: TechBlogPost[], sources: TechBlogSource[], limit: number): TechBlogPost[] {
    const bySource = new Map<string, TechBlogPost[]>();
    for (const post of posts) {
      bySource.set(post.sourceId, [...(bySource.get(post.sourceId) ?? []), post]);
    }

    const selected: TechBlogPost[] = [];
    const selectedIds = new Set<string>();

    for (const source of sources) {
      const sourcePosts = bySource.get(source.id) ?? [];
      for (const post of sourcePosts.slice(0, MIN_POSTS_PER_SOURCE)) {
        if (selected.length >= limit) break;
        selected.push(post);
        selectedIds.add(post.id);
      }
      if (selected.length >= limit) break;
    }

    for (const post of posts) {
      if (selected.length >= limit) break;
      if (selectedIds.has(post.id)) continue;
      selected.push(post);
      selectedIds.add(post.id);
    }

    return selected.sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
  }

  private async deletePostsFromDisabledSources(): Promise<void> {
    const sourceIds = this.enabledSourceIds();
    if (sourceIds.length === 0) return;
    await this.postRepo.delete({ sourceId: Not(In(sourceIds)) });
  }

  private enabledSourceIds(): string[] {
    return this.crawler.getSources().map((source) => source.id);
  }

  private toPostEntity(post: TechBlogPost): TechBlogPostEntity {
    return this.postRepo.create({
      id: post.id,
      sourceId: post.sourceId,
      sourceName: post.sourceName,
      title: cleanText(post.title),
      url: post.url,
      summary: post.summary ? cleanText(post.summary) : null,
      publishedAt: post.publishedAt ?? null,
      thumbnail: post.thumbnail ?? null,
      tagsJson: JSON.stringify(post.tags ?? []),
    });
  }

  private toPost(entity: TechBlogPostEntity): TechBlogPost {
    return {
      id: entity.id,
      sourceId: entity.sourceId,
      sourceName: entity.sourceName,
      title: entity.title,
      url: entity.url,
      summary: entity.summary ?? undefined,
      publishedAt: entity.publishedAt ?? undefined,
      thumbnail: entity.thumbnail ?? undefined,
      tags: this.parseJsonArray(entity.tagsJson),
    };
  }

  private async getLastRefreshAt(): Promise<string | null> {
    const state = await this.refreshStateRepo.findOne({ where: { key: REFRESH_STATE_KEY } });
    return state?.refreshedAt || null;
  }

  private async setLastRefreshAt(value: string): Promise<void> {
    await this.refreshStateRepo.save(this.refreshStateRepo.create({ key: REFRESH_STATE_KEY, refreshedAt: value }));
  }

  private parseJsonArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}
