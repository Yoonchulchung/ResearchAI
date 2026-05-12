import { Injectable, Logger } from '@nestjs/common';
import { TECH_BLOG_SOURCES } from '../domain/tech-blog.sources';
import type { TechBlogListResult, TechBlogPost, TechBlogSource } from '../domain/tech-blog.types';
import { fetchBanksaladPosts } from './banksalad.provider';
import { fetchGoogleDevelopersPosts } from './google-developers.provider';
import { fetchHyundaiAutoeverPosts } from './hyundai-autoever.provider';
import { fetchLinkedInPosts } from './linkedin.provider';
import { fetchNaverPlacePosts } from './medium.provider';
import { fetchNaverD2Posts } from './naver-d2.provider';
import { dedupePosts, fetchText, parseFeed, parseHtml } from './tech-blog-crawler.util';

const SOURCE_CONCURRENCY = 8;

@Injectable()
export class TechBlogCrawlerService {
  private readonly logger = new Logger(TechBlogCrawlerService.name);

  getSources(): TechBlogSource[] {
    return TECH_BLOG_SOURCES;
  }

  async crawlAll(): Promise<{ posts: TechBlogPost[]; errors: TechBlogListResult['errors'] }> {
    const settled = await this.mapWithConcurrency(TECH_BLOG_SOURCES, SOURCE_CONCURRENCY, (source) => this.fetchSource(source));
    const posts: TechBlogPost[] = [];
    const errors: TechBlogListResult['errors'] = [];

    settled.forEach((result, index) => {
      const source = TECH_BLOG_SOURCES[index];
      if (result.status === 'fulfilled') {
        posts.push(...result.value);
        return;
      }
      const message = result.reason instanceof Error ? result.reason.message : '크롤링에 실패했습니다.';
      errors.push({ sourceId: source.id, message });
      this.logger.warn(`${source.name} crawl failed: ${message}`);
    });

    return { posts: dedupePosts(posts), errors };
  }

  private async fetchSource(source: TechBlogSource): Promise<TechBlogPost[]> {
    if (source.id === 'naver-d2') return fetchNaverD2Posts(source);
    if (source.id === 'naver-place') return fetchNaverPlacePosts(source);
    if (source.id === 'banksalad') return fetchBanksaladPosts(source);
    if (source.id === 'google-developers') return fetchGoogleDevelopersPosts(source);
    if (source.id === 'hyundai-autoever') return fetchHyundaiAutoeverPosts(source);
    if (source.id === 'linkedin') return fetchLinkedInPosts(source);

    const url = source.feedUrl ?? source.url;
    const html = await fetchText(url);
    const contentType = html.trimStart();

    if (source.feedUrl || contentType.startsWith('<?xml') || contentType.startsWith('<rss') || contentType.startsWith('<feed')) {
      const parsed = parseFeed(html, source);
      if (parsed.length > 0) return parsed;
    }

    return parseHtml(html, source);
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        try {
          results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    });

    await Promise.all(workers);
    return results;
  }
}
