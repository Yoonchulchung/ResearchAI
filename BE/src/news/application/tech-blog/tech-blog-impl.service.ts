import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import {
  AppConfigService,
  CONFIG_KEYS,
} from 'src/config/application/app-config.service';
import { ContentRefreshStateEntity } from 'src/shared/entity/content-refresh-state.entity';
import { TechBlogPostEntity } from 'src/news/domain/tech-blog/entity/tech-blog-post.entity';
import { TechBlogTrendSummaryEntity } from 'src/news/domain/tech-blog/entity/tech-blog-trend-summary.entity';
import type {
  TechBlogListResult,
  TechBlogPost,
  TechBlogSource,
  TechBlogTrendKeyword,
  TechBlogTrendSummary,
} from 'src/news/domain/tech-blog/tech-blog.types';
import { TechBlogCrawlerService } from 'src/news/infrastructure/tech-blog/tech-blog-crawler.service';
import {
  cleanText,
  dateValue,
} from 'src/news/infrastructure/tech-blog/tech-blog-crawler.util';

const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 60 * 60 * 1000;
const REFRESH_STATE_KEY = 'content-refresh:tech-blogs';
const DEFAULT_LIST_LIMIT = 300;
const MAX_LIST_LIMIT = 300;
const MAX_SOURCE_LIST_LIMIT = 1000;
const MIN_POSTS_PER_SOURCE = 5;
const DEFAULT_TREND_DAYS = 14;
const TREND_CACHE_MS = 6 * 60 * 60 * 1000;
const TREND_STOPWORDS = new Set([
  '그리고',
  '하지만',
  '있는',
  '없는',
  '위한',
  '통한',
  '으로',
  '에서',
  '에게',
  '까지',
  '부터',
  '보다',
  'with',
  'from',
  'that',
  'this',
  'into',
  'using',
  'about',
  'build',
  'building',
  'based',
  'how',
  'the',
  'and',
  'for',
  'of',
  'to',
  'in',
  'on',
  'a',
  'an',
  'is',
  'are',
  'be',
  'by',
]);

@Injectable()
export class TechBlogImplService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TechBlogImplService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<TechBlogListResult['errors']> | null = null;
  private trendCache: {
    key: string;
    expiresAt: number;
    value: TechBlogTrendSummary;
  } | null = null;

  constructor(
    @InjectRepository(TechBlogPostEntity)
    private readonly postRepo: Repository<TechBlogPostEntity>,
    @InjectRepository(TechBlogTrendSummaryEntity)
    private readonly trendRepo: Repository<TechBlogTrendSummaryEntity>,
    @InjectRepository(ContentRefreshStateEntity)
    private readonly refreshStateRepo: Repository<ContentRefreshStateEntity>,
    private readonly crawler: TechBlogCrawlerService,
    private readonly aiProvider: AiProviderService,
    private readonly appConfig: AppConfigService,
  ) {}

  onModuleInit() {
    setTimeout(() => {
      this.refreshCacheIfStale().catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : '기술 블로그 자동 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }, 5_000);

    this.refreshTimer = setInterval(() => {
      this.refreshCacheIfStale().catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : '기술 블로그 자동 수집에 실패했습니다.';
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

  async getPosts(
    options: {
      source?: string;
      limit?: number;
      refresh?: boolean;
      bookmarked?: boolean;
    } = {},
  ): Promise<TechBlogListResult> {
    let errors: TechBlogListResult['errors'] = [];
    const cachedCount = await this.postRepo.count();

    if (options.refresh || cachedCount === 0) {
      errors = await this.refreshCache();
    } else {
      this.refreshCacheIfStale().catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : '기술 블로그 백그라운드 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }

    const result: TechBlogListResult = {
      sources: this.crawler.getSources(),
      posts: await this.readCachedPosts(),
      errors,
      fetchedAt: (await this.getLastRefreshAt()) ?? new Date(0).toISOString(),
    };

    return this.filterResult(
      result,
      options.source,
      options.limit,
      options.bookmarked,
    );
  }

  async setBookmark(id: string, bookmarked: boolean): Promise<TechBlogPost> {
    const entity = await this.postRepo.findOne({ where: { id } });
    if (!entity)
      throw new NotFoundException('기술 블로그 글을 찾을 수 없습니다.');
    entity.bookmarked = bookmarked;
    return this.toPost(await this.postRepo.save(entity));
  }

  async setRead(id: string, read = true): Promise<TechBlogPost> {
    const entity = await this.postRepo.findOne({ where: { id } });
    if (!entity)
      throw new NotFoundException('기술 블로그 글을 찾을 수 없습니다.');
    entity.readAt = read ? new Date().toISOString() : null;
    return this.toPost(await this.postRepo.save(entity));
  }

  async getTrendSummary(
    options: {
      days?: number;
      source?: string;
      model?: string;
      refresh?: boolean;
      onChunk?: (chunk: string) => void;
    } = {},
  ): Promise<TechBlogTrendSummary> {
    const days = Math.min(Math.max(options.days ?? DEFAULT_TREND_DAYS, 1), 60);
    const source =
      options.source && options.source !== 'all' ? options.source : 'all';
    const model =
      options.model ||
      (await this.appConfig.get(
        CONFIG_KEYS.DEFAULT_CLOUD_MODEL,
        'claude-haiku-4-5-20251001',
      ));
    const posts = await this.readCachedPosts();
    const now = Date.now();
    const fromTime = now - days * 24 * 60 * 60 * 1000;
    const trendPosts = posts
      .filter((post) => source === 'all' || post.sourceId === source)
      .filter((post) => {
        const time = dateValue(post.publishedAt);
        return time >= fromTime && time <= now + 24 * 60 * 60 * 1000;
      });
    const keywords = this.extractKeywords(trendPosts).slice(0, 20);
    const from = new Date(fromTime).toISOString();
    const to = new Date(now).toISOString();
    const cacheKey = this.trendCacheKey({
      days,
      source,
      model,
      posts: trendPosts,
    });

    if (
      !options.refresh &&
      this.trendCache?.key === cacheKey &&
      this.trendCache.expiresAt > now
    ) {
      return { ...this.trendCache.value, cached: true };
    }

    if (!options.refresh) {
      const stored = await this.readStoredTrendSummary(cacheKey, now);
      if (stored) {
        this.trendCache = {
          key: cacheKey,
          expiresAt: stored.expiresAtMs,
          value: stored.value,
        };
        return { ...stored.value, cached: true };
      }
    }

    if (trendPosts.length === 0) {
      const value: TechBlogTrendSummary = {
        summary:
          '최근 기간에 분석할 기술 블로그 글이 없습니다. 먼저 새로고침으로 글을 수집해 주세요.',
        keywords,
        postCount: 0,
        sourceCount: 0,
        from,
        to,
        generatedAt: new Date().toISOString(),
        cached: false,
        model,
      };
      await this.storeTrendSummary(cacheKey, value);
      return value;
    }

    const sourceCount = new Set(trendPosts.map((post) => post.sourceId)).size;
    const prompt = this.buildTrendPrompt(trendPosts, keywords, days);
    const systemPrompt =
      '너는 여러 기업 기술 블로그를 분석하는 한국어 기술 트렌드 애널리스트다. 제공된 글 목록에 없는 사실을 만들지 말고, 반복적으로 등장하는 키워드와 기업별 채택 흐름을 근거로 요약한다.';

    let text: string;
    if (options.onChunk) {
      const onChunk = options.onChunk;
      text = '';
      for await (const chunk of this.aiProvider.stream(model, systemPrompt, [
        { role: 'user', content: prompt },
      ])) {
        text += chunk;
        onChunk(chunk);
      }
    } else {
      ({ text } = await this.aiProvider.call(model, systemPrompt, prompt, {
        caller: 'tech-blog-trend-summary',
      }));
    }

    const value: TechBlogTrendSummary = {
      summary: text.trim(),
      keywords,
      postCount: trendPosts.length,
      sourceCount,
      from,
      to,
      generatedAt: new Date().toISOString(),
      cached: false,
      model,
    };
    this.trendCache = {
      key: cacheKey,
      expiresAt: Date.now() + TREND_CACHE_MS,
      value,
    };
    await this.storeTrendSummary(cacheKey, value);
    return value;
  }

  async getLatestStoredTrendSummary(
    options: { days?: number; source?: string; model?: string } = {},
  ): Promise<TechBlogTrendSummary | null> {
    const days = Math.min(Math.max(options.days ?? DEFAULT_TREND_DAYS, 1), 60);
    const source =
      options.source && options.source !== 'all' ? options.source : 'all';
    const prefix = `${days}:${source}:`;
    const candidates = await this.trendRepo.find({
      order: { generatedAt: 'DESC' },
      take: 80,
    });

    const model = options.model?.trim();
    const entity = candidates.find((item) => {
      if (!item.cacheKey.startsWith(prefix)) return false;
      if (!model) return true;
      return item.model === model;
    });
    if (!entity) return null;

    return {
      summary: entity.summary,
      keywords: this.parseTrendKeywords(entity.keywordsJson),
      postCount: entity.postCount,
      sourceCount: entity.sourceCount,
      from: entity.from,
      to: entity.to,
      generatedAt: entity.generatedAt,
      cached: true,
      model: entity.model,
    };
  }

  private async refreshCacheIfStale(): Promise<void> {
    const lastRefreshAt = await this.getLastRefreshAt();
    const empty = (await this.postRepo.count()) === 0;
    if (
      !empty &&
      lastRefreshAt &&
      Date.now() - new Date(lastRefreshAt).getTime() < DAILY_REFRESH_MS
    )
      return;
    await this.refreshCache();
  }

  private async refreshCache(): Promise<TechBlogListResult['errors']> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.collectAndStorePosts().finally(() => {
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

  private filterResult(
    result: TechBlogListResult,
    source?: string,
    limit = DEFAULT_LIST_LIMIT,
    bookmarked = false,
  ): TechBlogListResult {
    const isSourceDetail = Boolean(source && source !== 'all');
    const resolvedLimit = Math.min(
      Math.max(limit, 1),
      isSourceDetail ? MAX_SOURCE_LIST_LIMIT : MAX_LIST_LIMIT,
    );
    const filtered = bookmarked
      ? result.posts.filter((post) => post.bookmarked)
      : result.posts;
    const posts = isSourceDetail
      ? filtered
          .filter((post) => post.sourceId === source)
          .slice(0, resolvedLimit)
      : this.pickBalancedPosts(filtered, result.sources, resolvedLimit);

    return {
      ...result,
      posts,
    };
  }

  private pickBalancedPosts(
    posts: TechBlogPost[],
    sources: TechBlogSource[],
    limit: number,
  ): TechBlogPost[] {
    const bySource = new Map<string, TechBlogPost[]>();
    for (const post of posts) {
      bySource.set(post.sourceId, [
        ...(bySource.get(post.sourceId) ?? []),
        post,
      ]);
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

    return selected.sort(
      (a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt),
    );
  }

  private buildTrendPrompt(
    posts: TechBlogPost[],
    keywords: TechBlogTrendKeyword[],
    days: number,
  ): string {
    const postLines = posts
      .slice(0, 160)
      .map((post, index) => {
        const tags = post.tags.length ? ` / tags: ${post.tags.join(', ')}` : '';
        const summary = post.summary ? ` - ${post.summary}` : '';
        const date = post.publishedAt?.slice(0, 10) ?? '날짜 없음';
        return `${index + 1}. [${date}] ${post.sourceName}: ${post.title}${summary}${tags}`;
      })
      .join('\n');
    const keywordLines = keywords
      .map((item) => `${item.keyword}(${item.count})`)
      .join(', ');

    return `다음은 최근 ${days}일 동안 수집된 기업 기술 블로그 글 목록이야.

[자주 등장한 키워드]
${keywordLines || '없음'}

[글 목록]
${postLines}

아래 형식으로 한국어 Markdown만 출력해줘.

## 핵심 요약
- 2~3문장으로 현재 가장 뜨거운 기술 흐름을 요약

## 핫 토픽
- 토픽명: 왜 뜨거운지, 어떤 기업/글 제목에서 근거가 보이는지
- 4~6개

## 반복 키워드 해석
- 키워드: 이 키워드가 어떤 기술/제품/조직 흐름을 의미하는지
- 5~8개

## 기업들이 글을 쓰는 의도
- 채용 브랜딩, 기술 신뢰, 제품 홍보, 생태계 선점 등 관점에서 3~5개

## 눈여겨볼 글
- 글 제목 (출처): 왜 봐야 하는지
- 3~5개`;
  }

  private extractKeywords(posts: TechBlogPost[]): TechBlogTrendKeyword[] {
    const counts = new Map<string, number>();
    for (const post of posts) {
      const text = [
        post.title,
        post.summary ?? '',
        post.sourceName,
        ...post.tags,
      ].join(' ');
      for (const keyword of this.tokenizeKeywords(text)) {
        counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));
  }

  private tokenizeKeywords(text: string): string[] {
    return cleanText(text)
      .replace(/[^\p{L}\p{N}+#./-]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^[#./-]+|[#./-]+$/g, ''))
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !/^\d+$/.test(token))
      .filter((token) => !TREND_STOPWORDS.has(token.toLowerCase()))
      .map((token) => (token.length > 28 ? token.slice(0, 28) : token));
  }

  private trendCacheKey(options: {
    days: number;
    source: string;
    model: string;
    posts: TechBlogPost[];
  }): string {
    const hash = createHash('sha256')
      .update(
        options.posts
          .map((post) => `${post.id}:${post.publishedAt ?? ''}`)
          .join('|'),
      )
      .digest('hex')
      .slice(0, 16);
    return `${options.days}:${options.source}:${options.model}:${hash}`;
  }

  private async readStoredTrendSummary(
    cacheKey: string,
    now = Date.now(),
  ): Promise<{ value: TechBlogTrendSummary; expiresAtMs: number } | null> {
    const entity = await this.trendRepo.findOne({ where: { cacheKey } });
    if (!entity) return null;
    const expiresAtMs = new Date(entity.expiresAt).getTime();
    if (expiresAtMs <= now) return null;

    return {
      expiresAtMs,
      value: {
        summary: entity.summary,
        keywords: this.parseTrendKeywords(entity.keywordsJson),
        postCount: entity.postCount,
        sourceCount: entity.sourceCount,
        from: entity.from,
        to: entity.to,
        generatedAt: entity.generatedAt,
        cached: true,
        model: entity.model,
      },
    };
  }

  private async storeTrendSummary(
    cacheKey: string,
    value: TechBlogTrendSummary,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + TREND_CACHE_MS).toISOString();
    await this.trendRepo.save(
      this.trendRepo.create({
        cacheKey,
        summary: value.summary,
        keywordsJson: JSON.stringify(value.keywords ?? []),
        postCount: value.postCount,
        sourceCount: value.sourceCount,
        from: value.from,
        to: value.to,
        generatedAt: value.generatedAt,
        expiresAt,
        model: value.model,
      }),
    );
  }

  private parseTrendKeywords(value: string): TechBlogTrendKeyword[] {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is TechBlogTrendKeyword =>
          item &&
          typeof item === 'object' &&
          typeof item.keyword === 'string' &&
          typeof item.count === 'number',
      );
    } catch {
      return [];
    }
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
      bookmarked: entity.bookmarked,
      readAt: entity.readAt ?? undefined,
    };
  }

  private async getLastRefreshAt(): Promise<string | null> {
    const state = await this.refreshStateRepo.findOne({
      where: { key: REFRESH_STATE_KEY },
    });
    return state?.refreshedAt || null;
  }

  private async setLastRefreshAt(value: string): Promise<void> {
    await this.refreshStateRepo.save(
      this.refreshStateRepo.create({
        key: REFRESH_STATE_KEY,
        refreshedAt: value,
      }),
    );
  }

  private parseJsonArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
