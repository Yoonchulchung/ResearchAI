import { Injectable } from '@nestjs/common';
import { TechBlogImplService } from 'src/news/application/tech-blog/tech-blog-impl.service';
import type {
  TechBlogListResult,
  TechBlogPost,
  TechBlogSource,
  TechBlogTrendSummary,
} from 'src/news/domain/tech-blog/tech-blog.types';

@Injectable()
export class TechBlogService {
  constructor(private readonly impl: TechBlogImplService) {}

  getSources(): TechBlogSource[] {
    return this.impl.getSources();
  }

  getPosts(
    options: {
      source?: string;
      limit?: number;
      refresh?: boolean;
      bookmarked?: boolean;
    } = {},
  ): Promise<TechBlogListResult> {
    return this.impl.getPosts(options);
  }

  setBookmark(id: string, bookmarked: boolean): Promise<TechBlogPost> {
    return this.impl.setBookmark(id, bookmarked);
  }

  setRead(id: string, read = true): Promise<TechBlogPost> {
    return this.impl.setRead(id, read);
  }

  getTrendSummary(
    options: {
      days?: number;
      source?: string;
      model?: string;
      refresh?: boolean;
      onChunk?: (chunk: string) => void;
    } = {},
  ): Promise<TechBlogTrendSummary> {
    return this.impl.getTrendSummary(options);
  }

  getLatestStoredTrendSummary(
    options: { days?: number; source?: string; model?: string } = {},
  ): Promise<TechBlogTrendSummary | null> {
    return this.impl.getLatestStoredTrendSummary(options);
  }
}
