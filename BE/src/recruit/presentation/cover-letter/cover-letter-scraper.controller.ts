import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CoverLetterScraperService } from '../../application/cover-letter/cover-letter-scraper.service';
import type { CoverLetterJobAnalysisRequest, ScrapeOptions } from '../../domain/cover-letter/cover-letter.model';

@Controller('cover-letter-scraper')
export class CoverLetterScraperController {
  constructor(private readonly service: CoverLetterScraperService) {}

  /** 수집 시작
   * POST /cover-letter-scraper/start
   * Body (모두 선택사항):
   *   startPage  — 시작 페이지 (기본 1)
   *   maxPages   — 최대 페이지 수 (기본 무제한)
   *   delayMs    — 요청 간격 ms (기본 1500)
   *   company    — 기업명 필터
   *   role       — 직무 필터
   *   keyword    — 키워드 필터
   */
  @Post('start')
  start(@Body() opts: ScrapeOptions) {
    return this.service.startScraping(opts);
  }

  /** 수집 중단
   * POST /cover-letter-scraper/stop
   */
  @Post('stop')
  stop() {
    return this.service.stopScraping();
  }

  /** 현재 수집 상태
   * GET /cover-letter-scraper/status
   */
  @Get('status')
  status() {
    return this.service.getStatus();
  }

  /** 수집된 데이터 조회
   * GET /cover-letter-scraper/data?page=1&limit=20
   */
  @Get('data')
  async data(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('offset') offset?: string,
    @Query('source') source?: string,
    @Query('companyType') companyType?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    const parsedOffset = offset === undefined ? undefined : Number(offset);
    return this.service.getData(
      Number(page),
      Number(limit),
      {
        source,
        companyType,
        search,
        sort: sort === 'latest' ? 'latest' : undefined,
      },
      Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    );
  }

  @Get('data/:id')
  async detail(@Param('id') id: string) {
    const item = await this.service.getById(id);
    if (!item) throw new NotFoundException('자소서를 찾을 수 없습니다.');
    return item;
  }

  @Post('ai-job-analysis')
  analyzeJobs(@Body() body: CoverLetterJobAnalysisRequest) {
    return this.service.analyzeJobsWithAi(body);
  }

  @Get('spec-analyses')
  async specAnalyses(@Query('ids') ids: string) {
    const idList = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.service.getSpecAnalyses(idList);
  }
}
