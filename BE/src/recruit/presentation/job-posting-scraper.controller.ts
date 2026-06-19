import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { JobPostingScraperService } from 'src/recruit/application/job-posting-scraper.service';
import { RecruitJobPostingCollectService } from 'src/recruit/application/recruit-job-posting-collect.service';
import type {
  JobPostingListFilters,
  JobPostingScrapeOptions,
} from 'src/recruit/domain/job-posting.model';
import type { CollectDetailConfig } from 'src/recruit/application/recruit-job-posting-collect.service';

type AiMode = 'analysis' | 'interview';

@Controller(['recruit/job-postings', 'job-posting-scraper'])
export class JobPostingScraperController {
  constructor(
    private readonly service: JobPostingScraperService,
    private readonly collectService: RecruitJobPostingCollectService,
  ) {}

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
    @Query('company') company?: string,
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
      company,
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

  @Patch('data/:id/applied')
  setApplied(
    @Param('id') id: string,
    @Body() body: { appliedAt?: string | null },
  ) {
    return this.service.setApplied(id, body.appliedAt ?? null);
  }

  @Get('data/:id')
  async dataById(@Param('id') id: string) {
    const posting = await this.service.getPostingById(id);
    if (!posting) throw new NotFoundException('채용 공고를 찾을 수 없습니다.');
    return posting;
  }

  @Get('data/:id/ai-analysis')
  getAiAnalysis(
    @Param('id') id: string,
    @Query('mode') mode: AiMode = 'analysis',
  ) {
    const result = this.service.getAiAnalysis(id, mode);
    return {
      id,
      mode,
      text: result?.text ?? null,
      docId: result?.docId ?? null,
    };
  }

  @Post('data/:id/ai-analysis')
  saveAiAnalysis(
    @Param('id') id: string,
    @Body() body: { mode: AiMode; text: string; docId?: string | null },
  ) {
    this.service.setAiAnalysis(
      id,
      body.mode ?? 'analysis',
      body.text,
      body.docId,
    );
    return { ok: true };
  }

  @Post('data/image-files')
  getImageFiles(@Body() body: { html: string }) {
    const files = this.service.getPostingImageFiles(body.html ?? '');
    return { files };
  }

  // ── 채용 상세 수집 (1주일 내 마감 공고 → TypeORM 저장) ──────────────────────

  @Post('collect-detail/start')
  startCollectDetail(@Body() config: CollectDetailConfig) {
    return this.collectService.collect(config);
  }

  @Post('collect-detail/preview')
  previewCollectCount(@Body() config: CollectDetailConfig) {
    return this.collectService.previewCount(config);
  }

  @Post('collect-detail/stop')
  stopCollectDetail() {
    return this.collectService.stop();
  }

  @Get('collect-detail/status')
  getCollectDetailStatus() {
    return this.collectService.getStatus();
  }

  @Get('collect-detail/list')
  async listCollected(@Query('limit') limit = '100') {
    return this.collectService.listCollected(Number(limit));
  }

  @Post('collect-detail/recommend')
  async triggerRecommend() {
    await this.collectService.generateRecommendations();
    return { message: '추천 생성 완료' };
  }

  @Get('collect-detail/recommendations')
  async getRecommendations(@Query('limit') limit = '20') {
    return this.collectService.getRecommendations(Number(limit));
  }

  @Delete('collect-detail/recommendations/:id')
  async deleteRecommendation(@Param('id') id: string) {
    await this.collectService.deleteRecommendation(Number(id));
    return { message: '삭제 완료' };
  }
}
