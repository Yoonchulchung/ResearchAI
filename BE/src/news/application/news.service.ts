import { Injectable } from '@nestjs/common';
import { NewsFeedService } from 'src/news/application/internal/news-feed.service';
import { NewsArticleService } from 'src/news/application/internal/news-article.service';
import { NewsYoutubeService } from 'src/news/application/internal/news-youtube.service';
import { NewsSearchService } from 'src/news/application/internal/news-search.service';
import { NewsCacheService } from 'src/news/application/internal/news-cache.service';
import {
  ConflictZone,
  CountryNewsItem,
  GithubNewsItem,
  HuggingFaceNewsItem,
  KeywordItem,
  NewsArticleSummary,
  NewsItem,
  QueryNewsResult,
  RoadmapExpandResult,
  SaveNewsArticleSummaryInput,
  SearchRoadmapMonth,
  SearchRoadmapResult,
} from 'src/news/application/news.types';
import { YoutubeNewsItem } from 'src/news/infrastructure/provider/youtube.api';

export type {
  ConflictZone,
  CountryNewsItem,
  GithubNewsItem,
  HuggingFaceNewsItem,
  KeywordItem,
  NewsArticleSummary,
  NewsItem,
  QueryNewsItem,
  QueryNewsResult,
  RoadmapExpandResult,
  SearchRoadmapEvent,
  SearchRoadmapMonth,
  SearchRoadmapResult,
} from 'src/news/application/news.types';

/**
 * 뉴스 애플리케이션 파사드.
 *
 * 컨트롤러와 큐는 이 클래스만 의존하고, 실제 책임은 기능별 서비스가 맡는다.
 */
@Injectable()
export class NewsService {
  constructor(
    private readonly feed: NewsFeedService,
    private readonly article: NewsArticleService,
    private readonly youtube: NewsYoutubeService,
    private readonly search: NewsSearchService,
    private readonly cache: NewsCacheService,
  ) {}

  getNaverNews(category: string, limit = 20, offset = 0): Promise<NewsItem[]> {
    return this.feed.getNaverNews(category, limit, offset);
  }

  getGithubTrending(since: string): Promise<GithubNewsItem[]> {
    return this.feed.getGithubTrending(since);
  }

  getHuggingFaceTrending(category: string): Promise<HuggingFaceNewsItem[]> {
    return this.feed.getHuggingFaceTrending(category);
  }

  getStackOverflowHot(site: string, limit: number) {
    return this.feed.getStackOverflowHot(site, limit);
  }

  getKeywords(limit: number): Promise<KeywordItem[]> {
    return this.feed.getKeywords(limit);
  }

  getConflictZones(): Promise<ConflictZone[]> {
    return this.feed.getConflictZones();
  }

  getCountryNews(name: string, limit: number): Promise<CountryNewsItem[]> {
    return this.feed.getCountryNews(name, limit);
  }

  getArticleContent(url: string) {
    return this.article.getContent(url);
  }

  getArticleSummary(url: string): Promise<NewsArticleSummary | null> {
    return this.article.getSummary(url);
  }

  saveArticleSummary(
    input: SaveNewsArticleSummaryInput,
  ): Promise<NewsArticleSummary> {
    return this.article.saveSummary(input);
  }

  getYoutubeNews(limit = 30): Promise<YoutubeNewsItem[]> {
    return this.youtube.getNews(limit);
  }

  getYoutubeLive(): Promise<YoutubeNewsItem[]> {
    return this.youtube.getLive();
  }

  refreshTodayCache(): Promise<void> {
    return this.cache.clearToday();
  }

  getSearchRoadmap(query: string): Promise<SearchRoadmapResult> {
    return this.search.getRoadmap(query);
  }

  getQueryNews(
    query: string,
    start = 1,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<QueryNewsResult> {
    return this.search.getQueryNews(query, start, dateFrom, dateTo);
  }

  expandRoadmap(
    query: string,
    direction: 'newer' | 'older',
    referenceDate: string,
    existingMonths: SearchRoadmapMonth[],
  ): Promise<RoadmapExpandResult> {
    return this.search.expandRoadmap(
      query,
      direction,
      referenceDate,
      existingMonths,
    );
  }
}
