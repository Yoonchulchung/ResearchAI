import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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

  @Post(':id/ai-summary')
  summarizePaper(
    @Param('id') id: string,
    @Body() body: { model?: string; refresh?: boolean } = {},
  ) {
    return this.hotPapersService.summarizePaper(id, {
      model: body.model,
      refresh: body.refresh === true,
    });
  }
}
