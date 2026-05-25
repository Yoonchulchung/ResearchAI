import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
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
    @Query('bookmarked') bookmarked = 'false',
  ): Promise<TechBlogListResult> {
    const limit = parseInt(limitStr, 10) || 120;
    return this.techBlogService.getPosts({
      source,
      limit,
      refresh: refresh === 'true' || refresh === '1',
      bookmarked: bookmarked === 'true' || bookmarked === '1',
    });
  }

  @Patch('posts/:id/bookmark')
  setBookmark(
    @Param('id') id: string,
    @Body() body: { bookmarked?: boolean } = {},
  ) {
    return this.techBlogService.setBookmark(decodeURIComponent(id), body.bookmarked === true);
  }

  @Patch('posts/:id/read')
  setRead(
    @Param('id') id: string,
    @Body() body: { read?: boolean } = {},
  ) {
    return this.techBlogService.setRead(decodeURIComponent(id), body.read !== false);
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

  @Get('trends/latest')
  getLatestTrendSummary(
    @Query('days') daysStr = '14',
    @Query('source') source = 'all',
    @Query('model') model = '',
  ): Promise<TechBlogTrendSummary | null> {
    const days = parseInt(daysStr, 10) || 14;
    return this.techBlogService.getLatestStoredTrendSummary({
      days,
      source,
      model,
    });
  }
}
