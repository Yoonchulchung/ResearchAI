import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CoverLetterScraperService } from 'src/recruit/application/cover-letter/cover-letter-scraper.service';
import type {
  CoverLetterJobAnalysisRequest,
  ScrapeOptions,
} from 'src/recruit/domain/cover-letter/cover-letter.model';

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
    @Query('jobCategory') jobCategory?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('hidden') hidden?: string,
  ) {
    const parsedOffset = offset === undefined ? undefined : Number(offset);
    return this.service.getData(
      Number(page),
      Number(limit),
      {
        source,
        companyType,
        jobCategory,
        search,
        sort: sort === 'latest' ? 'latest' : undefined,
        hidden: hidden === 'true',
      },
      Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    );
  }

  /** 기존 데이터 jobCategory 일괄 분류
   * POST /cover-letter-scraper/backfill-categories
   */
  @Post('backfill-categories')
  backfillCategories() {
    return this.service.backfillJobCategories();
  }

  @Post('backfill-questions')
  backfillQuestions() {
    return this.service.backfillQuestionRows();
  }

  @Get('questions')
  searchQuestions(
    @Query('q') q = '',
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
    @Query('sortDir') sortDir = 'desc',
  ) {
    const dir = sortDir === 'asc' ? 'asc' : 'desc';
    return this.service.searchQuestions(q, Number(limit), Number(offset), dir);
  }

  @Get('data/:id')
  async detail(@Param('id') id: string) {
    const item = await this.service.getById(id);
    if (!item) throw new NotFoundException('자소서를 찾을 수 없습니다.');
    return item;
  }

  @Post('data/:id/hidden')
  async setHidden(
    @Param('id') id: string,
    @Body() body: { isHidden?: boolean },
  ) {
    const item = await this.service.setHidden(id, body.isHidden === true);
    if (!item) throw new NotFoundException('자소서를 찾을 수 없습니다.');
    return item;
  }

  /** 기업명으로 린커리어 즉시 수집 — SSE 실시간 진행상황 스트리밍
   * GET /cover-letter-scraper/scrape-by-company/stream?company=현대모비스&maxPages=3
   */
  @Get('scrape-by-company/stream')
  async scrapeByCompanyStream(
    @Query('company') company = '',
    @Query('maxPages') maxPagesStr = '3',
    @Query('delayMs') delayMsStr = '600',
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const trimmed = company.trim();
    if (!trimmed) {
      res.status(400).json({ error: '기업명을 입력하세요.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const cleanup = () => res.end();
    req.on('close', cleanup);

    const send = (payload: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await this.service.scrapeByCompanyWithProgress(
        trimmed,
        Number(maxPagesStr) || 3,
        Number(delayMsStr) || 600,
        send,
      );
    } catch (e) {
      send({ type: 'error', message: (e as Error).message });
    } finally {
      req.off('close', cleanup);
      res.end();
    }
  }

  @Post('ai-job-analysis')
  analyzeJobs(@Body() body: CoverLetterJobAnalysisRequest) {
    return this.service.analyzeJobsWithAi(body);
  }

  @Get('spec-analyses')
  async specAnalyses(@Query('ids') ids: string) {
    const idList = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.service.getSpecAnalyses(idList);
  }
}
