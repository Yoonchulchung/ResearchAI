export interface BrowserSearchResult {
  title: string;
  url: string;
  snippet: string;
  imageUrl?: string;
}

export interface BrowserWebSearchResult extends BrowserSearchResult {
  source: string;
}

export interface BrowserArticle {
  title: string;
  content: string;
  image?: string;
  finalUrl: string;
}

export interface BrowserOpenGraph {
  image?: string;
  finalUrl: string;
}

export interface BrowserRenderedHtmlOptions {
  waitUntil?: 'domcontentloaded' | 'networkidle2';
  selectorTimeout?: number;
}

export interface BrowserNewsSearchRequest {
  query: string;
  start?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface BrowserNewsSearchResult extends BrowserSearchResult {
  publishedAt: string | null;
  source: string;
}

export interface BrowserLiveVideo {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
}

export interface BrowserPdfOptions {
  format?: 'A4' | 'Letter';
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}
