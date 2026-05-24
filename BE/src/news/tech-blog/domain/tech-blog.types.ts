export interface TechBlogSource {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  category?: string;
  description?: string[];
}

export interface TechBlogPost {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  thumbnail?: string;
  tags: string[];
}

export interface TechBlogListResult {
  sources: TechBlogSource[];
  posts: TechBlogPost[];
  errors: { sourceId: string; message: string }[];
  fetchedAt: string;
}

export interface TechBlogTrendKeyword {
  keyword: string;
  count: number;
}

export interface TechBlogTrendSummary {
  summary: string;
  keywords: TechBlogTrendKeyword[];
  postCount: number;
  sourceCount: number;
  from: string;
  to: string;
  generatedAt: string;
  cached: boolean;
  model: string;
}
