import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from 'src/recruit/application/documents/documents.service';
import { JobplanetScraperService } from 'src/company/infrastructure/jobplanet/jobplanet-scraper.service';
import { requestContext } from 'src/shared/request-context';
import { CatchAuthService } from 'src/browse/infrastructure/auth/catch-auth.service';

// ── Experience DTOs ───────────────────────────────────────────────────────

class CreateExperienceDto {
  title: string;
  content: string;
  category?: string;
  sourceDocId?: string | null;
}

class UpdateExperienceDto {
  title?: string;
  content?: string;
  category?: string;
  aiCategories?: string[] | null;
}

// ── Controller ────────────────────────────────────────────────────────────

@Controller()
export class DocumentsController {
  constructor(
    private readonly service: DocumentsService,
    private readonly jobplanetScraper: JobplanetScraperService,
    private readonly catchAuth: CatchAuthService,
  ) {}

  // ── Jobplanet Test ──────────────────────────────────────────────────────

  /** 로그인 후 기업 리뷰 페이지 HTML 덤프 — 셀렉터 디버깅용 */
  @Post('jobplanet/debug-page')
  async debugJobplanetPage(
    @Body() body: { id: string; password: string; companyName?: string },
  ) {
    if (!body.id || !body.password)
      throw new BadRequestException('id와 password가 필요합니다');
    return this.jobplanetScraper.debugPage(
      body.id,
      body.password,
      body.companyName ?? '삼성전자',
    );
  }

  /** 잡플래닛 리뷰 페이지 원문 + 추출 결과 — 셀렉터 튜닝용 */
  @Post('jobplanet/debug-reviews')
  async debugJobplanetReviews(
    @Body() body: { id: string; password: string; companyName: string },
  ) {
    if (!body.id || !body.password || !body.companyName) {
      throw new BadRequestException('id, password, companyName 이 필요합니다');
    }
    return this.jobplanetScraper.debugReviews(
      body.id,
      body.password,
      body.companyName,
    );
  }

  @Post('jobplanet/test-login')
  async testJobplanetLogin(
    @Body() body: { id: string; password: string; companyName?: string },
  ) {
    if (!body.id || !body.password) {
      throw new BadRequestException('id와 password가 필요합니다');
    }
    return this.runJobplanetTest(body);
  }

  @Post('jobplanet/test-login/stream')
  async testJobplanetLoginStream(
    @Body() body: { id: string; password: string; companyName?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.id || !body.password) {
      throw new BadRequestException('id와 password가 필요합니다');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const send = (event: object) => {
      if (closed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await this.runJobplanetTest(body, (message) =>
        send({ type: 'log', message }),
      );
      send({ type: 'done', result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '잡플래닛 테스트 오류';
      send({ type: 'error', message: msg });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  private async runJobplanetTest(
    body: { id: string; password: string; companyName?: string },
    onLog?: (line: string) => void,
  ) {
    const logs: string[] = [];
    const addLog = (message: string) => {
      const line = `[${new Date().toISOString()}] ${message}`;
      logs.push(line);
      onLog?.(line);
    };

    // 1단계: 로그인 테스트
    addLog('잡플래닛 로그인 테스트 시작');
    const loginResult = await this.jobplanetScraper.testLogin(
      body.id,
      body.password,
      addLog,
    );
    if (!loginResult.success) {
      return {
        ok: false,
        failedStep: loginResult.failedStep,
        finalUrl: loginResult.finalUrl,
        error: loginResult.error,
        logs,
      };
    }

    // 2단계: 기업 데이터 수집 (companyName 있을 때만)
    if (!body.companyName?.trim()) {
      addLog('기업명이 없어 로그인 테스트만 완료');
      return {
        ok: true,
        loginOnly: true,
        finalUrl: loginResult.finalUrl,
        logs,
      };
    }

    try {
      addLog(`기업 리뷰 수집 시작: ${body.companyName.trim()}`);
      const result = await this.jobplanetScraper.scrapeCompany(
        body.companyName.trim(),
        body.id,
        body.password,
        addLog,
      );
      if (!result) {
        addLog(
          `기업 데이터 수집 실패: "${body.companyName}" 검색 결과 없음 또는 수집 실패`,
        );
        return {
          ok: false,
          failedStep: '기업 데이터 수집',
          error: `"${body.companyName}" 검색 결과 없음 또는 수집 실패`,
          logs,
        };
      }
      addLog(`기업 데이터 수집 성공: ${result.companyName}`);
      return {
        ok: true,
        companyName: result.companyName,
        overallRating: result.overallRating,
        reviewCount: result.reviewCount,
        welfare: result.welfare,
        preview: result.reviews.slice(0, 2),
        logs,
      };
    } catch (err) {
      addLog(`기업 데이터 수집 예외: ${(err as Error).message}`);
      return {
        ok: false,
        failedStep: '기업 데이터 수집',
        error: (err as Error).message,
        logs,
      };
    }
  }

  // ── Catch Test ──────────────────────────────────────────────────────────

  @Post('catch/test-login')
  async testCatchLogin(@Body() body: { id?: string; password?: string }) {
    const credentials = this.resolveCatchCredentials(body);
    if (!credentials) {
      throw new BadRequestException('id와 password가 필요합니다');
    }
    return this.runCatchTest(credentials);
  }

  @Post('catch/test-login/stream')
  async testCatchLoginStream(
    @Body() body: { id?: string; password?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const credentials = this.resolveCatchCredentials(body);
    if (!credentials) {
      throw new BadRequestException('id와 password가 필요합니다');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const send = (event: object) => {
      if (closed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await this.runCatchTest(credentials, (message) =>
        send({ type: 'log', message }),
      );
      send({ type: 'done', result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '캐치 테스트 오류';
      send({ type: 'error', message: msg });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  private resolveCatchCredentials(body: { id?: string; password?: string }) {
    const stored = requestContext.getStore()?.serviceCredentials;
    const id = body.id?.trim() || stored?.catchId?.trim();
    const password = body.password || stored?.catchPassword || '';

    if (!id || !password) return null;
    return { id, password };
  }

  private async runCatchTest(
    body: { id: string; password: string },
    onLog?: (line: string) => void,
  ) {
    onLog?.(`[${new Date().toISOString()}] 캐치 로그인 테스트 시작`);
    return this.catchAuth.testLogin(body.id, body.password, onLog);
  }

  // ── Documents ───────────────────────────────────────────────────────────

  @Get('documents')
  findAll() {
    const userId = requestContext.getStore()?.id ?? null;
    return this.service.findAll(userId);
  }

  @Get('documents/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('documents')
  create(
    @Body() body: { title: string; content: string; companyName?: string },
  ) {
    const userId = requestContext.getStore()?.id ?? null;
    return this.service.create(
      body.title,
      body.content,
      userId,
      body.companyName,
    );
  }

  @Patch('documents/:id')
  update(
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string; companyName?: string },
  ) {
    return this.service.update(id, body.title, body.content, body.companyName);
  }

  @Delete('documents/:id')
  deleteDocument(@Param('id') id: string) {
    return this.service.delete(id);
  }

  // ── Doc-parse ───────────────────────────────────────────────────────────

  @Post('doc-parse/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('파일이 없습니다');
    const { text, pageCount, pages } = await this.service.extractText(
      file.buffer,
      file.mimetype,
    );
    return {
      text,
      pageCount,
      pages,
      filename: file.originalname,
      size: file.size,
    };
  }

  @Post('doc-parse/ask')
  @HttpCode(202)
  async enqueueAsk(
    @Body() body: { docText: string; question: string; aiModel?: string },
  ) {
    if (!body.docText || !body.question)
      throw new BadRequestException('docText와 question이 필요합니다');
    return this.service.enqueueDocParseAsk(
      body.docText,
      body.question,
      body.aiModel,
    );
  }

  @Post('doc-parse/quick-action')
  @HttpCode(202)
  async enqueueQuickAction(
    @Body() body: { docText: string; action: string; aiModel?: string },
  ) {
    if (!body.docText || !body.action)
      throw new BadRequestException('docText와 action이 필요합니다');
    return this.service.enqueueDocParseAction(
      body.action,
      body.docText,
      undefined,
      body.aiModel,
    );
  }

  @Post('doc-parse/summarize-pages')
  @HttpCode(202)
  async enqueueSummarizePages(
    @Body() body: { pages: string[]; aiModel?: string },
  ) {
    if (!body.pages || !Array.isArray(body.pages) || body.pages.length === 0) {
      throw new BadRequestException('pages 배열이 필요합니다');
    }
    return this.service.enqueueDocParseAction(
      'summarize',
      undefined,
      body.pages,
      body.aiModel,
    );
  }

  @Post('doc-parse/evaluate')
  @HttpCode(202)
  async enqueueEvaluate(@Body() body: { pages: string[]; aiModel?: string }) {
    if (!body.pages || !Array.isArray(body.pages) || body.pages.length === 0) {
      throw new BadRequestException('pages 배열이 필요합니다');
    }
    return this.service.enqueueDocParseAction(
      'evaluate',
      undefined,
      body.pages,
      body.aiModel,
    );
  }

  // ── Experiences ─────────────────────────────────────────────────────────

  @Get('experiences')
  findAllExperiences() {
    const userId = requestContext.getStore()?.id ?? null;
    return this.service.findAllExperiences(userId);
  }

  @Post('experiences')
  createExperience(@Body() dto: CreateExperienceDto) {
    const userId = requestContext.getStore()?.id ?? null;
    return this.service.createExperience(
      dto.title,
      dto.content,
      userId,
      dto.category,
      dto.sourceDocId,
    );
  }

  @Patch('experiences/:id')
  updateExperience(@Param('id') id: string, @Body() dto: UpdateExperienceDto) {
    return this.service.updateExperience(
      id,
      dto.title,
      dto.content,
      dto.category,
      dto.aiCategories,
    );
  }

  @Delete('experiences/:id')
  deleteExperience(@Param('id') id: string) {
    return this.service.deleteExperience(id);
  }

  @Post('experiences/search')
  searchExperiences(@Body() dto: { query: string; topK?: number }) {
    const userId = requestContext.getStore()?.id ?? null;
    return this.service.searchExperiences(dto.query, dto.topK ?? 5, userId);
  }

  @Post('experiences/:id/suggest-categories')
  suggestCategories(@Param('id') id: string, @Body() dto: { model: string }) {
    return this.service.suggestCategories(id, dto.model);
  }

  @Post('experiences/extract-from-doc')
  extractFromDoc(@Body() dto: { content: string; model: string }) {
    return this.service.extractFromDocument(dto.content, dto.model);
  }

  // ── Write Assist ────────────────────────────────────────────────────────

  @Post('write-assist')
  enqueueWriteAssist(
    @Body()
    body: {
      action: string;
      content: string;
      model: string;
      experiences?: { title: string; content: string }[];
      companyCtx?: string;
    },
  ) {
    if (!body.action || !body.content)
      throw new BadRequestException('action과 content가 필요합니다');
    return this.service.enqueueWriteAssist(
      body.action,
      body.content,
      body.model,
      body.experiences,
      body.companyCtx,
    );
  }
}
