import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JobPostingScraperService } from '../application/job-posting-scraper.service';
import type { JobPostingListFilters, JobPostingScrapeOptions } from '../domain/job-posting.model';

type AiMode = 'analysis' | 'interview';

@Controller(['recruit/job-postings', 'job-posting-scraper'])
export class JobPostingScraperController {
  constructor(private readonly service: JobPostingScraperService) {}

  @Post('start')
  start(@Body() opts: JobPostingScrapeOptions) {
    return this.service.startScraping(opts);
  }

  @Post('stop')
  stop() {
    return this.service.stopScraping();
  }

  @Get('status')
  status() {
    return this.service.getStatus();
  }

  @Get('popular')
  async popular() {
    return this.service.getPopularPostings();
  }

  @Get('detail')
  async detail(
    @Query('id') id: string,
    @Query('url') url: string,
    @Query('source') source: string,
  ) {
    return this.service.fetchDetailContent(id, url, source);
  }

  @Get('image-cache')
  imageCacheStats() {
    return this.service.getImageCacheStats();
  }

  @Get('image/:filename')
  serveImage(@Param('filename') filename: string, @Res() res: Response) {
    const result = this.service.serveImage(filename);
    if (!result) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(result.buffer);
  }

  @Get('data')
  async data(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('job') job?: string,
    @Query('companyType') companyType?: string,
    @Query('excludeCompanyType') excludeCompanyType?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('scheduleFrom') scheduleFrom?: string,
    @Query('scheduleTo') scheduleTo?: string,
    @Query('sort') sort?: string,
    @Query('favorite') favorite?: string,
  ) {
    const filters: JobPostingListFilters = {
      source,
      search,
      job,
      companyType,
      excludeCompanyType,
      type,
      category,
      scheduleFrom,
      scheduleTo,
      sort: sort === 'deadline' ? 'deadline' : 'latest',
      favorite: favorite === 'true',
    };
    return this.service.getData(Number(page), Number(limit), filters);
  }

  @Post('data/:id/favorite')
  favorite(@Param('id') id: string) {
    return this.service.setFavorite(id, true);
  }

  @Delete('data/:id/favorite')
  unfavorite(@Param('id') id: string) {
    return this.service.setFavorite(id, false);
  }

  @Get('data/:id')
  async dataById(@Param('id') id: string) {
    const posting = await this.service.getPostingById(id);
    if (!posting) throw new NotFoundException('채용 공고를 찾을 수 없습니다.');
    return posting;
  }

  @Get('data/:id/ai-analysis')
  getAiAnalysis(@Param('id') id: string, @Query('mode') mode: AiMode = 'analysis') {
    const text = this.service.getAiAnalysis(id, mode);
    return { id, mode, text };
  }

  @Post('data/:id/ai-analysis')
  saveAiAnalysis(
    @Param('id') id: string,
    @Body() body: { mode: AiMode; text: string },
  ) {
    this.service.setAiAnalysis(id, body.mode ?? 'analysis', body.text);
    return { ok: true };
  }

  @Post('data/image-files')
  getImageFiles(@Body() body: { html: string }) {
    const files = this.service.getPostingImageFiles(body.html ?? '');
    return { files };
  }
}
