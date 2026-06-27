import { Injectable } from '@nestjs/common';
import { NewsProviderService } from 'src/news/infrastructure/news-provider.service';
import { NaverRssApi } from 'src/news/infrastructure/provider/naver-rss.api';
import { deduplicateNewsItems } from 'src/news/application/news-dedup.utils';
import { NewsCacheService } from 'src/news/application/internal/news-cache.service';
import {
  detectConflictCountries,
  extractKeywords,
} from 'src/news/application/internal/news-insight.utils';
import {
  ConflictZone,
  CountryNewsItem,
  GithubNewsItem,
  HuggingFaceNewsItem,
  KeywordItem,
  NewsItem,
} from 'src/news/application/news.types';

const CATEGORY_QUERIES: Record<string, string> = {
  it: 'IT 기술 AI',
  economy: '경제 금융',
  society: '사회 사건',
  politics: '정치 국회',
  world: '국제 세계',
  culture: '문화 엔터테인먼트',
  science: '과학 우주',
};

@Injectable()
export class NewsFeedService {
  constructor(
    private readonly provider: NewsProviderService,
    private readonly naverRssApi: NaverRssApi,
    private readonly cache: NewsCacheService,
  ) {}

  async getNaverNews(
    category: string,
    limit = 20,
    offset = 0,
  ): Promise<NewsItem[]> {
    const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const normalizedOffset = Math.min(Math.max(Math.floor(offset), 0), 999);
    const cacheKey = this.cacheKey(
      `naver-${category}-${normalizedLimit}-${normalizedOffset}`,
    );
    const cached = await this.cache.get<NewsItem[]>(cacheKey);
    if (cached?.length) return deduplicateNewsItems(cached);

    const query = CATEGORY_QUERIES[category] ?? CATEGORY_QUERIES.it;
    let items = await this.provider.fetchNewsByQuery(
      query,
      normalizedLimit,
      normalizedOffset,
    );

    if (items.length === 0 && normalizedOffset === 0) {
      items = await this.naverRssApi.fetchByCategory(category, normalizedLimit);
    }

    const deduplicated = deduplicateNewsItems(items);
    if (deduplicated.length) await this.cache.set(cacheKey, deduplicated);
    return deduplicated;
  }

  async getGithubTrending(since: string): Promise<GithubNewsItem[]> {
    const period = since === 'weekly' || since === 'monthly' ? since : 'daily';
    return this.cached(`github-${period}`, () =>
      this.provider.fetchTrendingRepos(period),
    );
  }

  async getHuggingFaceTrending(
    category: string,
  ): Promise<HuggingFaceNewsItem[]> {
    const type =
      category === 'datasets' || category === 'spaces' ? category : 'models';
    return this.cached(`huggingface-${type}`, () =>
      this.provider.fetchHfTrending(type, 20),
    );
  }

  async getStackOverflowHot(site: string, limit: number) {
    return this.cached(`stackoverflow-${site}`, () =>
      this.provider.fetchStackOverflowHot(site, limit),
    );
  }

  async getKeywords(limit: number): Promise<KeywordItem[]> {
    const titles = await this.collectTitles('kw-titles', [
      'IT AI 기술',
      '경제 금융 증시',
      '사회 정치',
      '국제 세계',
      '과학 환경',
    ]);
    return extractKeywords(titles, limit);
  }

  async getConflictZones(): Promise<ConflictZone[]> {
    const cacheKey = this.cacheKey('conflicts');
    const cached = await this.cache.get<ConflictZone[]>(cacheKey);
    if (cached) return cached;

    const titles = await this.collectTitles('conflict-titles', [
      '전쟁 교전 공격 폭격',
      'war conflict attack military',
      '분쟁 사상자 내전 반군',
      'ceasefire invasion troops casualties',
      '이스라엘 가자 우크라이나 러시아 이란',
    ]);
    const zones = detectConflictCountries(titles);
    await this.cache.set(cacheKey, zones);
    return zones;
  }

  async getCountryNews(
    name: string,
    limit: number,
  ): Promise<CountryNewsItem[]> {
    if (!name.trim()) return [];
    const items = await this.provider.fetchNewsByQuery(name);
    return deduplicateNewsItems(items)
      .slice(0, limit)
      .map(({ title, link, source, pubDate }) => ({
        title,
        link,
        source,
        pubDate,
      }));
  }

  private async cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cacheKey = this.cacheKey(key);
    const cached = await this.cache.get<T>(cacheKey);
    if (cached) return cached;

    const value = await fetcher();
    await this.cache.set(cacheKey, value);
    return value;
  }

  private async collectTitles(
    key: string,
    queries: string[],
  ): Promise<string[]> {
    const cacheKey = this.cacheKey(key);
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const results = await Promise.allSettled(
      queries.map((query) => this.provider.fetchNewsByQuery(query)),
    );
    const titles = results.flatMap((result) =>
      result.status === 'fulfilled'
        ? deduplicateNewsItems(result.value).map((item) => item.title)
        : [],
    );
    await this.cache.set(cacheKey, titles);
    return titles;
  }

  private cacheKey(key: string): string {
    return `raw-${key}-${this.cache.todayKey()}`;
  }
}
