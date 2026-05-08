import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { JobPostingScraperService } from '../application/job-posting-scraper.service';
import type { JobPostingListFilters, JobPostingScrapeOptions } from '../domain/job-posting.model';

@Controller('job-posting-scraper')
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

  @Get('detail')
  async detail(
    @Query('id') id: string,
    @Query('url') url: string,
    @Query('source') source: string,
  ) {
    return this.service.fetchDetailContent(id, url, source);
  }

  @Get('data')
  async data(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('job') job?: string,
    @Query('companyType') companyType?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
  ) {
    const filters: JobPostingListFilters = { source, search, job, companyType, type, category };
    return this.service.getData(Number(page), Number(limit), filters);
  }
}
