export interface CompanyNewsScrapedArticle {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
}

export interface CompanyNewsScrapeResult {
  fetched: number;
  saved: number;
  hasMore: boolean;
  dateFrom: string;
  dateTo: string;
  stopped: boolean;
  reachedStopDate: boolean;
}

export type CompanyNewsScrapeProgressEvent =
  | {
      type: 'start';
      companyName: string;
      message: string;
    }
  | {
      type: 'window';
      attempt: number;
      maxAttempts: number;
      dateFrom: string;
      dateTo: string;
      fetched: number;
      message: string;
    }
  | {
      type: 'query';
      query: string;
      dateFrom: string;
      dateTo: string;
      message: string;
    }
  | {
      type: 'page';
      query: string;
      start: number;
      dateFrom: string;
      dateTo: string;
      fetched: number;
      added: number;
      rejectedByTitle: number;
      totalFetched: number;
      message: string;
    }
  | {
      type: 'saving';
      fetched: number;
      message: string;
    }
  | {
      type: 'done';
      result: CompanyNewsScrapeResult;
      message: string;
    }
  | {
      type: 'error';
      message: string;
    };

export interface CompanyNewsScrapeOptions {
  onProgress?: (event: CompanyNewsScrapeProgressEvent) => void;
  signal?: AbortSignal;
  stopDate?: string;
}
