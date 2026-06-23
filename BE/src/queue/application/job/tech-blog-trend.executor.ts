import { Injectable, Logger } from '@nestjs/common';
import { TechBlogService } from 'src/news/tech-blog/application/tech-blog.service';
import type { TechBlogTrendSummary } from 'src/news/tech-blog/domain/tech-blog.types';

export interface TechBlogTrendRequest {
  days?: number;
  source?: string;
  model?: string;
  refresh?: boolean;
}

@Injectable()
export class TechBlogTrendExecutor {
  private readonly logger = new Logger(TechBlogTrendExecutor.name);

  constructor(private readonly techBlogService: TechBlogService) {}

  async execute(
    request: TechBlogTrendRequest,
    onChunk: (chunk: string) => void,
  ): Promise<TechBlogTrendSummary> {
    this.logger.log(
      `[TechBlogTrend] 분석 시작 days=${request.days ?? 14} source=${request.source ?? 'all'}`,
    );
    const result = await this.techBlogService.getTrendSummary({
      ...request,
      onChunk,
    });
    this.logger.log(`[TechBlogTrend] 완료 postCount=${result.postCount}`);
    return result;
  }
}
