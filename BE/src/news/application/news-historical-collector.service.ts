import { Injectable } from '@nestjs/common';
import type {
  CompanyNewsScrapeOptions,
  CompanyNewsScrapedArticle,
} from 'src/company/application/news/company-news-scrape.types';
import { NewsHistoricalCollectorImplService } from 'src/news/application/internal/news-historical-collector-impl.service';

export interface NewsHistoricalCollectRequest extends CompanyNewsScrapeOptions {
  companyName: string;
  dateTo: Date;
}

export interface NewsHistoricalCollectResult {
  articles: CompanyNewsScrapedArticle[];
  hasMore: boolean;
  dateFrom: string;
  dateTo: string;
  stopped: boolean;
  reachedStopDate: boolean;
}

@Injectable()
export class NewsHistoricalCollectorService {
  constructor(private readonly collector: NewsHistoricalCollectorImplService) {}

  collect(
    request: NewsHistoricalCollectRequest,
  ): Promise<NewsHistoricalCollectResult> {
    return this.collector.collect(request);
  }
}
