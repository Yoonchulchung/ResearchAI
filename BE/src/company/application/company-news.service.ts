import { Injectable } from '@nestjs/common';
import {
  CompanyNewsImplService,
  CompanyNewsItem,
  CompanyNewsKeywordResult,
} from 'src/company/application/news/company-news-impl.service';
import { CompanyNewsScraperImplService } from 'src/company/application/news/company-news-scraper-impl.service';
import { CompanyNewsTimelineImplService } from 'src/company/application/news/company-news-timeline-impl.service';
import type {
  CompanyNewsScrapeOptions,
  CompanyNewsScrapeResult,
} from 'src/company/application/news/company-news-scrape.types';
import type {
  NewsTimelineResult,
  TimelineNewsSourcesResult,
} from 'src/company/application/news/company-news-timeline-impl.service';

export type {
  CompanyNewsItem,
  CompanyNewsKeyword,
  CompanyNewsKeywordResult,
} from 'src/company/application/news/company-news-impl.service';

export type {
  CompanyNewsScrapeOptions,
  CompanyNewsScrapeProgressEvent,
  CompanyNewsScrapeResult,
  CompanyNewsScrapedArticle,
} from 'src/company/application/news/company-news-scrape.types';

export type {
  NewsTimelineResult,
  TimelineEvent,
  TimelineMonth,
  TimelineNewsSourceItem,
  TimelineNewsSourcesResult,
  TimelineNewsUsageStatus,
} from 'src/company/application/news/company-news-timeline-impl.service';

@Injectable()
export class CompanyNewsService {
  constructor(
    private readonly impl: CompanyNewsImplService,
    private readonly scraper: CompanyNewsScraperImplService,
    private readonly timeline: CompanyNewsTimelineImplService,
  ) {}

  fetchAndSaveNews(
    companyId: string,
    companyName: string,
    limit = 50,
    offset = 0,
  ): Promise<CompanyNewsItem[]> {
    return this.impl.fetchAndSaveNews(companyId, companyName, limit, offset);
  }

  fetchLatestNewsSinceLastCollection(
    companyId: string,
    companyName: string,
  ): Promise<CompanyNewsItem[]> {
    return this.impl.fetchLatestNewsSinceLastCollection(companyId, companyName);
  }

  getSavedNews(
    companyId: string,
    limit = 50,
    offset = 0,
  ): Promise<CompanyNewsItem[]> {
    return this.impl.getSavedNews(companyId, limit, offset);
  }

  resetSavedNews(companyId: string): Promise<{
    deletedNews: number;
    deletedKeywords: number;
    deletedTimeline: number;
  }> {
    return this.impl.resetSavedNews(companyId);
  }

  fetchNews(companyName: string, limit = 10): Promise<CompanyNewsItem[]> {
    return this.impl.fetchNews(companyName, limit);
  }

  detectTitleKeywords(
    companyId: string,
    companyName: string,
    titles: string[],
    model: string,
  ): Promise<CompanyNewsKeywordResult> {
    return this.impl.detectTitleKeywords(companyId, companyName, titles, model);
  }

  getSavedTitleKeywords(companyId: string): Promise<CompanyNewsKeywordResult> {
    return this.impl.getSavedTitleKeywords(companyId);
  }

  bulkFetchAndSaveNews(
    companyId: string,
    companyName: string,
    round = 0,
  ): Promise<{ fetched: number; saved: number; hasMore: boolean }> {
    return this.impl.bulkFetchAndSaveNews(companyId, companyName, round);
  }

  scrapeHistorical(
    companyId: string,
    companyName: string,
    options: CompanyNewsScrapeOptions = {},
  ): Promise<CompanyNewsScrapeResult> {
    return this.scraper.scrapeHistorical(companyId, companyName, options);
  }

  analyzeTimeline(
    companyId: string,
    companyName: string,
    model: string,
    incremental = false,
  ): Promise<NewsTimelineResult> {
    return this.timeline.analyze(companyId, companyName, model, incremental);
  }

  getSavedTimeline(
    companyId: string,
    companyName?: string,
  ): Promise<NewsTimelineResult | null> {
    return this.timeline.getSaved(companyId, companyName);
  }

  getTimelineSources(
    companyId: string,
    companyName: string,
  ): Promise<TimelineNewsSourcesResult> {
    return this.timeline.getSources(companyId, companyName);
  }
}
