import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { JobPostingScraperService } from '../application/job-posting-scraper.service';
import type { JobPostingListFilters, JobPostingScrapeOptions } from '../domain/job-posting.model';

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
    @Query('sort') sort?: string,
  ) {
    const filters: JobPostingListFilters = {
      source,
      search,
      job,
      companyType,
      type,
      category,
      sort: sort === 'deadline' ? 'deadline' : 'latest',
    };
    return this.service.getData(Number(page), Number(limit), filters);
  }

  @Get('data/:id')
  async dataById(@Param('id') id: string) {
    const posting = await this.service.getPostingById(id);
    if (!posting) throw new NotFoundException('채용 공고를 찾을 수 없습니다.');
    return posting;
  }
}
