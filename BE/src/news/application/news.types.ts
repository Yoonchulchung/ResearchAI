export interface QueryNewsItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
  imageUrl?: string;
  source: string;
  itemType?: 'news' | 'web';
}

export interface QueryNewsResult {
  items: QueryNewsItem[];
  hasMore: boolean;
  nextStart: number;
}

export interface SearchRoadmapEvent {
  category: string;
  summary: string;
  type: string;
  importance: string;
  sourceIndex?: number;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface SearchRoadmapMonth {
  yearMonth: string;
  events: SearchRoadmapEvent[];
}

export interface SearchRoadmapResult {
  months: SearchRoadmapMonth[];
  newsCount: number;
  query: string;
  model: string;
}

export interface RoadmapExpandResult extends SearchRoadmapResult {
  addedCount: number;
}

export interface CountryNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

export interface NewsItem extends CountryNewsItem {
  description: string;
  imageUrl?: string | null;
}

export interface GithubNewsItem {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
}

export interface HuggingFaceNewsItem {
  id: string;
  modelId?: string;
  likes: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
  lastModified?: string;
}

export interface KeywordItem {
  keyword: string;
  count: number;
}

export interface ConflictZone {
  code: string;
  score: number;
  headlines: string[];
}

export interface NewsArticleSummary {
  id: string;
  url: string;
  title: string;
  source: string | null;
  description: string | null;
  summary: string;
  model: string | null;
  articleUrl: string | null;
  updatedAt: string;
}

export interface SaveNewsArticleSummaryInput {
  url: string;
  title: string;
  source?: string | null;
  description?: string | null;
  summary: string;
  model?: string | null;
  articleUrl?: string | null;
}
