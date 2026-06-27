import { Injectable, Logger } from '@nestjs/common';
import { BrowserService } from 'src/browse/application/browser.service';
import type {
  CompanyNewsScrapeOptions,
  CompanyNewsScrapedArticle,
} from 'src/company/application/news/company-news-scrape.types';
import { newsTitleIncludesCompanyName } from 'src/news/application/news-dedup.utils';
import type {
  NewsHistoricalCollectRequest,
  NewsHistoricalCollectResult,
} from 'src/news/application/news-historical-collector.service';

interface HistoricalSearchTask {
  query: string;
  pageIdx: number;
  start: number;
}

function subtractMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() - months);
  return r;
}

function parseDateKey(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function monthDiff(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

const MIN_ARTICLES = 10;
const WINDOW_MONTHS = 3;
const MAX_ATTEMPTS = 8;
const OLDEST_YEAR = 2010;
const DEFAULT_HISTORICAL_SEARCH_CONCURRENCY = 2;
const MAX_HISTORICAL_SEARCH_CONCURRENCY = 4;

@Injectable()
export class NewsHistoricalCollectorImplService {
  private readonly logger = new Logger(NewsHistoricalCollectorImplService.name);

  constructor(private readonly browser: BrowserService) {}

  async collect(
    request: NewsHistoricalCollectRequest,
  ): Promise<NewsHistoricalCollectResult> {
    let currentDateTo = new Date(request.dateTo);
    const initialDateTo = new Date(currentDateTo);
    const allArticles: CompanyNewsScrapedArticle[] = [];
    const seenUrls = new Set<string>();
    let firstDateFrom = currentDateTo;
    const stopDate = parseDateKey(request.stopDate);
    const maxAttempts = stopDate
      ? Math.max(
          MAX_ATTEMPTS,
          Math.ceil(
            Math.max(monthDiff(stopDate, initialDateTo), 0) / WINDOW_MONTHS,
          ),
        )
      : MAX_ATTEMPTS;
    let reachedStopDate = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (request.signal?.aborted) break;
      if (stopDate && currentDateTo < stopDate) {
        reachedStopDate = true;
        break;
      }

      let dateFrom = subtractMonths(currentDateTo, WINDOW_MONTHS);
      if (stopDate && dateFrom < stopDate) {
        dateFrom = new Date(stopDate);
        reachedStopDate = true;
      }
      const dateFromKey = dateFrom.toISOString().substring(0, 10);
      const dateToKey = currentDateTo.toISOString().substring(0, 10);

      request.onProgress?.({
        type: 'window',
        attempt: attempt + 1,
        maxAttempts,
        dateFrom: dateFromKey,
        dateTo: dateToKey,
        fetched: allArticles.length,
        message: `${dateFromKey} ~ ${dateToKey} 구간을 검색합니다. 현재 누적 ${allArticles.length}건`,
      });

      const articles = await this.collectRange(
        request.companyName,
        dateFrom,
        currentDateTo,
        5,
        request,
      );

      for (const article of articles) {
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);
        allArticles.push(article);
      }

      firstDateFrom = dateFrom;

      if (request.signal?.aborted) break;
      if (allArticles.length >= MIN_ARTICLES) break;
      if (reachedStopDate) break;
      if (dateFrom.getFullYear() <= OLDEST_YEAR) break;

      currentDateTo = new Date(dateFrom);
      currentDateTo.setDate(currentDateTo.getDate() - 1);
      await this.delay(500, request.signal);
    }

    const stopped = Boolean(request.signal?.aborted);
    return {
      articles: allArticles,
      hasMore:
        !reachedStopDate &&
        !stopped &&
        firstDateFrom.getFullYear() > OLDEST_YEAR,
      dateFrom: firstDateFrom.toISOString().substring(0, 10),
      dateTo: initialDateTo.toISOString().substring(0, 10),
      stopped,
      reachedStopDate,
    };
  }

  private async collectRange(
    companyName: string,
    dateFrom: Date,
    dateTo: Date,
    maxPages: number,
    options: CompanyNewsScrapeOptions,
  ): Promise<CompanyNewsScrapedArticle[]> {
    const articles: CompanyNewsScrapedArticle[] = [];
    const seenUrls = new Set<string>();
    const queries = this.buildHistoricalQueries(companyName);
    const dateFromKey = dateFrom.toISOString().substring(0, 10);
    const dateToKey = dateTo.toISOString().substring(0, 10);
    const queryArticleCounts = new Map<string, number>();
    const tasks: HistoricalSearchTask[] = [];

    for (const query of queries) {
      options.onProgress?.({
        type: 'query',
        query,
        dateFrom: dateFromKey,
        dateTo: dateToKey,
        message: `"${query}" 검색어로 ${dateFromKey} ~ ${dateToKey} 구간을 확인합니다.`,
      });
      queryArticleCounts.set(query, 0);

      for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
        tasks.push({ query, pageIdx, start: pageIdx * 10 + 1 });
      }
    }

    await this.runLimited(
      tasks,
      this.getHistoricalSearchConcurrency(),
      async (task) => {
        if (options.signal?.aborted) return;
        try {
          const items = await this.browser.searchNews({
            query: task.query,
            start: task.start,
            dateFrom: dateFromKey,
            dateTo: dateToKey,
          });

          let added = 0;
          let rejectedByTitle = 0;
          for (const item of items) {
            if (!newsTitleIncludesCompanyName(item.title, companyName)) {
              rejectedByTitle++;
              continue;
            }
            if (!this.isWithinRange(item, dateFromKey, dateToKey)) continue;
            if (seenUrls.has(item.url)) continue;
            seenUrls.add(item.url);
            articles.push(item);
            added++;
          }
          queryArticleCounts.set(
            task.query,
            (queryArticleCounts.get(task.query) ?? 0) + added,
          );

          options.onProgress?.({
            type: 'page',
            query: task.query,
            start: task.start,
            dateFrom: dateFromKey,
            dateTo: dateToKey,
            fetched: items.length,
            added,
            rejectedByTitle,
            totalFetched: articles.length,
            message: `"${task.query}" ${task.pageIdx + 1}페이지: 검색 ${items.length}건, 제목 제외 ${rejectedByTitle}건, 신규 후보 ${added}건, 누적 ${articles.length}건`,
          });
        } catch (e) {
          this.logger.warn(
            `뉴스 검색 실패 (query="${task.query}", start=${task.start}): ${
              (e as Error).message
            }`,
          );
        }
      },
      options.signal,
    );

    for (const query of queries) {
      this.logger.debug(
        `뉴스 기간 검색 query="${query}" range=${dateFromKey}~${dateToKey} added=${queryArticleCounts.get(query) ?? 0}`,
      );
    }

    return articles;
  }

  private async runLimited<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    let index = 0;
    const workerCount = Math.min(concurrency, items.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (index < items.length && !signal?.aborted) {
          const item = items[index++];
          await worker(item);
        }
      }),
    );
  }

  private getHistoricalSearchConcurrency(): number {
    const parsed = Number(process.env.NEWS_HISTORICAL_SEARCH_CONCURRENCY);
    if (!Number.isFinite(parsed)) return DEFAULT_HISTORICAL_SEARCH_CONCURRENCY;
    return Math.min(
      Math.max(Math.floor(parsed), 1),
      MAX_HISTORICAL_SEARCH_CONCURRENCY,
    );
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  private buildHistoricalQueries(companyName: string): string[] {
    const name = companyName.trim().replace(/\s+/g, ' ');
    const candidates = [
      name,
      `"${name}"`,
      `${name} 뉴스`,
      `${name} 발표`,
      `${name} 서비스`,
      `${name} 투자`,
      `${name} 실적`,
      `${name} 채용`,
    ];

    return Array.from(new Set(candidates.filter(Boolean)));
  }

  private isWithinRange(
    item: CompanyNewsScrapedArticle,
    dateFromKey: string,
    dateToKey: string,
  ): boolean {
    if (!item.publishedAt) return false;
    const dateKey = item.publishedAt.slice(0, 10);
    return dateKey >= dateFromKey && dateKey <= dateToKey;
  }
}
