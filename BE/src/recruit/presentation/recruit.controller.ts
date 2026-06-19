import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CollectService } from 'src/recruit/application/collect.service';
import { JobsService } from 'src/recruit/application/jobs.service';
import { RecruitContextService } from 'src/recruit/application/recruit-context.service';
import { SourceRegistry } from 'src/recruit/infrastructure/sources/source-registry';

@Controller('recruit')
export class RecruitController {
  constructor(
    private readonly collectService: CollectService,
    private readonly jobsService: JobsService,
    private readonly recruitContext: RecruitContextService,
    private readonly sourceRegistry: SourceRegistry,
  ) {}

  // ── 테스트 ────────────────────────────────────────────────

  @Post('test/live-search')
  async testLiveSearch(
    @Body()
    body: {
      keyword: string;
      companyTypes?: string[];
      jobTypes?: string[];
    },
  ) {
    const logs: string[] = [];
    const jobs: any[] = [];
    let result = '';

    for await (const event of this.recruitContext.liveSearch({
      keyword: body.keyword,
      companyTypes: body.companyTypes,
      jobTypes: body.jobTypes,
    })) {
      if (event.type === 'log') logs.push(event.message);
      else if (event.type === 'jobs') jobs.push(...event.jobs);
      else if (event.type === 'result') result = event.result;
    }

    return { logs, jobs, result };
  }

  // ── 소스 ─────────────────────────────────────────────────

  @Get('sources')
  getSources() {
    return this.sourceRegistry.getAll();
  }

  // ── 수집 ─────────────────────────────────────────────────

  @Post('collect')
  collect(
    @Body()
    body: {
      keyword: string;
      location?: string;
      limit?: number;
      sources?: string[];
    },
  ) {
    return this.collectService.startCollect(body);
  }

  @Get('collect/status/:jobId')
  getCollectStatus(@Param('jobId') jobId: string) {
    const status = this.collectService.getJobStatus(jobId);
    if (!status) return { found: false };
    return { found: true, ...status };
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
