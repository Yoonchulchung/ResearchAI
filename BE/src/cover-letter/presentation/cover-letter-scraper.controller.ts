import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CoverLetterScraperService } from '../application/cover-letter-scraper.service';
import type { ScrapeOptions } from '../domain/cover-letter.model';

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
  ) {
    return this.service.getData(Number(page), Number(limit));
  }
}
