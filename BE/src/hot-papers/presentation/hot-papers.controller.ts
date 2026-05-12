import { Controller, Get, Query } from '@nestjs/common';
import { HotPapersService } from '../application/hot-papers.service';
import type { HotPaperListResult } from '../application/hot-papers.service';

@Controller('hot-papers')
export class HotPapersController {
  constructor(private readonly hotPapersService: HotPapersService) {}

  @Get()
  getPapers(
    @Query('source') source = 'all',
    @Query('limit') limitStr = '120',
    @Query('refresh') refresh = 'false',
  ): Promise<HotPaperListResult> {
    const limit = parseInt(limitStr, 10) || 120;
    return this.hotPapersService.getPapers({
      source,
      limit,
      refresh: refresh === 'true' || refresh === '1',
    });
  }
}
