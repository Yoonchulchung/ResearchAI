import { Controller, Get, Post, Delete, Param, Body, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CollectService } from '../application/collect.service';
import { JobsService } from '../application/jobs.service';
import { SourceRegistry } from '../infrastructure/sources/source-registry';

@Controller('recruit')
export class RecruitController {
  constructor(
    private readonly collectService: CollectService,
    private readonly jobsService: JobsService,
    private readonly sourceRegistry: SourceRegistry,
  ) {}

  // ── 소스 ─────────────────────────────────────────────────

  @Get('sources')
  getSources() {
    return this.sourceRegistry.getAll();
  }

  // ── 수집 ─────────────────────────────────────────────────

  @Post('collect')
  collect(@Body() body: { keyword: string; location?: string; limit?: number; sources?: string[] }) {
    if (this.collectService.isRunning()) {
      return { ok: false, message: '이미 수집 중입니다.' };
    }
    this.collectService.collect(body).catch(() => {});
    return { ok: true, message: '수집을 시작합니다.' };
  }

  @Get('collect/stream')
  stream(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    this.collectService.addClient(res);
    req.on('close', () => this.collectService.removeClient(res));
  }

  // ── 공고 조회 ─────────────────────────────────────────────

  @Get('jobs')
  getJobs(
    @Query('keyword') keyword?: string,
    @Query('source') source?: string,
    @Query('company') company?: string,
  ) {
    return this.jobsService.findAll({ keyword, source, company });
  }

  @Get('stats')
  getStats() {
    return this.jobsService.stats();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Delete('jobs/:id')
  removeJob(@Param('id') id: string) {
    return this.jobsService.remove(id);
  }

  @Delete('jobs')
  clearJobs() {
    return this.jobsService.clear();
  }
}
