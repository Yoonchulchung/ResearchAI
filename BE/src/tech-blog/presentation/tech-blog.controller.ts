import { Controller, Get, Query } from '@nestjs/common';
import { TechBlogService } from '../application/tech-blog.service';
import type { TechBlogListResult, TechBlogSource, TechBlogTrendSummary } from '../domain/tech-blog.types';

@Controller('tech-blogs')
export class TechBlogController {
  constructor(private readonly techBlogService: TechBlogService) {}

  @Get('sources')
  getSources(): TechBlogSource[] {
    return this.techBlogService.getSources();
  }

  @Get('posts')
  getPosts(
    @Query('source') source = 'all',
    @Query('limit') limitStr = '120',
    @Query('refresh') refresh = 'false',
  ): Promise<TechBlogListResult> {
    const limit = parseInt(limitStr, 10) || 120;
    return this.techBlogService.getPosts({
      source,
      limit,
      refresh: refresh === 'true' || refresh === '1',
    });
  }

  @Get('trends')
  getTrendSummary(
    @Query('days') daysStr = '14',
    @Query('source') source = 'all',
    @Query('model') model = '',
    @Query('refresh') refresh = 'false',
  ): Promise<TechBlogTrendSummary> {
    const days = parseInt(daysStr, 10) || 14;
    return this.techBlogService.getTrendSummary({
      days,
      source,
      model,
      refresh: refresh === 'true' || refresh === '1',
    });
  }
}
