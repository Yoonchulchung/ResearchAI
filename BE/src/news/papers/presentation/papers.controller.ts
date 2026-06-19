import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PapersService } from 'src/news/papers/application/papers.service';
import type { PaperListResult } from 'src/news/papers/application/papers.service';

@Controller('papers')
export class PapersController {
  constructor(private readonly papersService: PapersService) {}

  @Get()
  getPapers(
    @Query('source') source = 'all',
    @Query('limit') limitStr = '120',
    @Query('refresh') refresh = 'false',
    @Query('bookmarked') bookmarked = 'false',
  ): Promise<PaperListResult> {
    const limit = parseInt(limitStr, 10) || 120;
    return this.papersService.getPapers({
      source,
      limit,
      refresh: refresh === 'true' || refresh === '1',
      bookmarked: bookmarked === 'true' || bookmarked === '1',
    });
  }

  @Post(':id/ai-summary')
  summarizePaper(
    @Param('id') id: string,
    @Body() body: { model?: string; refresh?: boolean } = {},
  ) {
    return this.papersService.summarizePaper(id, {
      model: body.model,
      refresh: body.refresh === true,
    });
  }

  @Patch(':id/bookmark')
  setBookmark(
    @Param('id') id: string,
    @Body() body: { bookmarked?: boolean } = {},
  ) {
    return this.papersService.setBookmark(
      decodeURIComponent(id),
      body.bookmarked === true,
    );
  }

  @Patch(':id/read')
  setRead(@Param('id') id: string, @Body() body: { read?: boolean } = {}) {
    return this.papersService.setRead(
      decodeURIComponent(id),
      body.read !== false,
    );
  }

  @Get('trends/latest')
  getLatestTrendSummary(@Query('model') model = '') {
    return this.papersService.getLatestStoredTrendSummary({ model });
  }

  @Get(':id/pdf-proxy')
  async getPdfProxy(@Param('id') id: string, @Res() res: Response) {
    const result = await this.papersService.fetchPdfBuffer(
      decodeURIComponent(id),
    );
    if (!result) throw new NotFoundException('PDF를 찾을 수 없습니다.');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${result.filename}"`,
      'Content-Length': result.buffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(result.buffer);
  }

  @Get(':id/chat')
  async getChatMessages(@Param('id') id: string) {
    const messages = await this.papersService.getChatMessages(
      decodeURIComponent(id),
    );
    return { messages };
  }

  @Put(':id/chat')
  async saveChatMessages(
    @Param('id') id: string,
    @Body() body: { messages: { role: string; content: string }[] },
  ) {
    await this.papersService.saveChatMessages(
      decodeURIComponent(id),
      body.messages ?? [],
    );
    return { ok: true };
  }

  @Delete(':id/chat')
  async clearChatMessages(@Param('id') id: string) {
    await this.papersService.clearChatMessages(decodeURIComponent(id));
    return { ok: true };
  }

  @Get(':id')
  async getPaperById(@Param('id') id: string) {
    const paper = await this.papersService.findById(decodeURIComponent(id));
    if (!paper) throw new NotFoundException('논문을 찾을 수 없습니다.');
    return paper;
  }
}
