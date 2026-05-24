import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('trends/latest')
  getLatestTrendSummary(
    @Query('model') model = '',
  ) {
    return this.hotPapersService.getLatestStoredTrendSummary({ model });
  }

  @Get(':id/pdf-proxy')
  async getPdfProxy(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const result = await this.hotPapersService.fetchPdfBuffer(decodeURIComponent(id));
    if (!result) throw new NotFoundException('PDF를 찾을 수 없습니다.');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${result.filename}"`,
      'Content-Length': result.buffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(result.buffer);
  }

  @Get(':id')
  async getPaperById(@Param('id') id: string) {
    const paper = await this.hotPapersService.findById(decodeURIComponent(id));
    if (!paper) throw new NotFoundException('논문을 찾을 수 없습니다.');
    return paper;
  }
}
