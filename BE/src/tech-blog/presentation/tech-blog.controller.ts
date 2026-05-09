import { Controller, Get, Query } from '@nestjs/common';
import { TechBlogListResult, TechBlogService, TechBlogSource } from '../application/tech-blog.service';

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
}
