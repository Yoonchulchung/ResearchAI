import {
  Controller,
  Get,
  Post,
  Delete,
  Sse,
  Param,
  Body,
  BadRequestException,
  MessageEvent,
  HttpCode,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { QueueService } from 'src/queue/application/queue.service';
import { QueueStatusDto } from 'src/queue/presentation/dto/response/queue-status.dto';
import { SessionQueryService } from 'src/sessions/application/query/session-query.service';
import { DartApiQueueService } from 'src/financial/infrastructure/dart-api-queue.service';
import { SaraminCompanyService } from 'src/company/infrastructure/jobportal/saramin-company.service';
import { JasoseolCompanyService } from 'src/company/infrastructure/jobportal/jasoseol-company.service';
import { EnqueueDeepResearchDto } from 'src/queue/presentation/dto/request/enqueue-deep-research.dto';
import { EnqueueLightResearchDto } from 'src/queue/presentation/dto/request/enqueue-light-research.dto';

class EnqueueSummaryDto {
  localAIModel!: string;
}

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly sessionQueryService: SessionQueryService,
    private readonly dartQueue: DartApiQueueService,
    private readonly saramin: SaraminCompanyService,
    private readonly jasoseol: JasoseolCompanyService,
  ) {}

  @Get('status')
  getQueueStatus(): QueueStatusDto {
    return this.queueService.getStatus();
  }

  @Get('data-sources/status')
  getDataSourceQueueStatus() {
    return [
      this.dartQueue.getStatus(),
      this.saramin.getStatus(),
      this.jasoseol.getStatus(),
    ];
  }

  // ************** //
  // Light Research //
  // ************** //
  @Post('research/light')
  async enqueueLightResearch(@Body() body: EnqueueLightResearchDto) {
    return this.queueService.enqueueLightResearch(body);
  }

  @Delete('research/light/:searchId')
  async cancelLightResearch(@Param('searchId') searchId: string) {
    await this.queueService.cancelLightResearch(searchId);
    return { ok: true };
  }

  @Sse('research/light/:searchId/stream')
  getLightResearchStream(
    @Param('searchId') searchId: string,
  ): Observable<MessageEvent> {
    const obs = this.queueService.getLightResearchStream(searchId);
    if (!obs)
      throw new BadRequestException(
        '진행 중인 Light Research 작업이 없습니다.',
      );
    return obs;
  }

  // ************* //
  // Deep Research //
  // ************* //
  @Post('research/:id/deep')
  async enqueueDeepResearch(
    @Param('id') id: string,
    @Body() body: EnqueueDeepResearchDto,
  ) {
    return this.queueService.enqueueDeepResearch(id, body);
  }

  @Delete('research/:id/deep')
  async cancelDeepResearch(@Param('id') id: string) {
    await this.queueService.cancelBySession(id);
    return { ok: true };
  }

  @Delete('research/:id/deep/items/:itemId')
  async cancelDeepResearchItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    await this.queueService.cancelByItem(id, itemId);
    return { ok: true };
  }

  // **************** //
  // 세션의 서머리 생성 //
  // **************** //
  @Post('sessions/:id/summary')
  async enqueueSummary(
    @Param('id') id: string,
    @Body() body: EnqueueSummaryDto,
  ) {
    const ctx = await this.sessionQueryService.buildSummaryContext(id);
    if (!ctx) throw new BadRequestException('완료된 태스크가 없습니다.');
    await this.queueService.enqueueSummary(id, body.localAIModel || ctx.model);
    return { ok: true };
  }

  @Delete('sessions/:id/summary')
  async cancelSummary(@Param('id') id: string) {
    await this.queueService.cancelSummary(id);
    return { ok: true };
  }

  @Sse('sessions/:id/summary/stream')
  async streamSummary(
    @Param('id') id: string,
  ): Promise<Observable<MessageEvent>> {
    const obs = await this.queueService.getSummaryStream(id);
    if (!obs)
      throw new BadRequestException('진행 중인 서머리 작업이 없습니다.');
    return obs;
  }

  // ************ //
  // Write Assist //
  // ************ //
  @Post('write-assist')
  @HttpCode(202)
  async enqueueWriteAssist(
    @Body()
    body: {
      content: string;
      instruction: string;
      model: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      imageFiles?: string[];
    },
  ) {
    return this.queueService.enqueueWriteAssist(
      body.content,
      body.instruction,
      body.model,
      body.history,
      body.imageFiles,
    );
  }

  @Delete('write-assist/:jobId')
  cancelWriteAssist(@Param('jobId') jobId: string) {
    this.queueService.cancelWriteAssist(jobId);
    return { ok: true };
  }

  @Sse('write-assist/:jobId/stream')
  streamWriteAssist(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getWriteAssistStream(jobId);
    if (!obs) throw new BadRequestException('진행 중인 작업이 없습니다.');
    return obs;
  }

  // *************** //
  // Company Profile //
  // *************** //
  @Post('company-profile')
  @HttpCode(202)
  async enqueueCompanyProfile(
    @Body() body: { companyName: string; model: string },
  ) {
    return this.queueService.enqueueCompanyProfile(
      body.companyName,
      body.model,
    );
  }

  @Delete('company-profile/:jobId')
  cancelCompanyProfile(@Param('jobId') jobId: string) {
    this.queueService.cancelCompanyProfile(jobId);
    return { ok: true };
  }

  @Sse('company-profile/:jobId/stream')
  streamCompanyProfile(
    @Param('jobId') jobId: string,
  ): Observable<MessageEvent> {
    const obs = this.queueService.getCompanyProfileStream(jobId);
    if (!obs) throw new BadRequestException('진행 중인 작업이 없습니다.');
    return obs;
  }

  // **************** //
  // Company Analysis //
  // **************** //
  @Post('company-analysis')
  @HttpCode(202)
  async enqueueCompanyAnalysis(
    @Body() body: { companyName: string; model?: string },
  ) {
    if (!body.companyName?.trim())
      throw new BadRequestException('companyName이 필요합니다.');
    return this.queueService.enqueueCompanyAnalysis(
      body.companyName,
      body.model ?? '',
    );
  }

  @Delete('company-analysis/:jobId')
  cancelCompanyAnalysis(@Param('jobId') jobId: string) {
    this.queueService.cancelCompanyAnalysis(jobId);
    return { ok: true };
  }

  @Sse('company-analysis/:jobId/stream')
  streamCompanyAnalysis(
    @Param('jobId') jobId: string,
  ): Observable<MessageEvent> {
    const obs = this.queueService.getCompanyAnalysisStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 기업 분석 작업이 없습니다.');
    return obs;
  }

  // ****************** //
  // Roadmap Analysis   //
  // ****************** //
  @Post('roadmap-analysis')
  @HttpCode(202)
  async enqueueRoadmapAnalysis(
    @Body()
    body: {
      companyId: string;
      companyName: string;
      model: string;
      incremental?: boolean;
    },
  ) {
    if (!body.companyId?.trim())
      throw new BadRequestException('companyId가 필요합니다.');
    return this.queueService.enqueueRoadmapAnalysis(
      body.companyId,
      body.companyName,
      body.model,
      body.incremental ?? false,
    );
  }

  @Delete('roadmap-analysis/:jobId')
  cancelRoadmapAnalysis(@Param('jobId') jobId: string) {
    this.queueService.cancelRoadmapAnalysis(jobId);
    return { ok: true };
  }

  @Sse('roadmap-analysis/:jobId/stream')
  streamRoadmapAnalysis(
    @Param('jobId') jobId: string,
  ): Observable<MessageEvent> {
    const obs = this.queueService.getRoadmapAnalysisStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 로드맵 분석 작업이 없습니다.');
    return obs;
  }

  // **************** //
  // Bulk Fetch News  //
  // **************** //
  @Post('bulk-fetch-news')
  @HttpCode(202)
  async enqueueBulkFetchNews(
    @Body() body: { companyId: string; companyName: string; round?: number },
  ) {
    if (!body.companyId?.trim())
      throw new BadRequestException('companyId가 필요합니다.');
    return this.queueService.enqueueBulkFetchNews(
      body.companyId,
      body.companyName,
      body.round ?? 0,
    );
  }

  @Delete('bulk-fetch-news/:jobId')
  cancelBulkFetchNews(@Param('jobId') jobId: string) {
    this.queueService.cancelBulkFetchNews(jobId);
    return { ok: true };
  }

  @Sse('bulk-fetch-news/:jobId/stream')
  streamBulkFetchNews(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getBulkFetchNewsStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 뉴스 수집 작업이 없습니다.');
    return obs;
  }

  // **************** //
  // Tech Blog Trend  //
  // **************** //
  @Post('tech-blog-trend')
  @HttpCode(202)
  async enqueueTechBlogTrend(
    @Body()
    body: {
      days?: number;
      source?: string;
      model?: string;
      refresh?: boolean;
    },
  ) {
    return this.queueService.enqueueTechBlogTrend(body);
  }

  @Delete('tech-blog-trend/:jobId')
  cancelTechBlogTrend(@Param('jobId') jobId: string) {
    this.queueService.cancelTechBlogTrend(jobId);
    return { ok: true };
  }

  @Sse('tech-blog-trend/:jobId/stream')
  streamTechBlogTrend(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getTechBlogTrendStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 트렌드 분석 작업이 없습니다.');
    return obs;
  }

  // ************* //
  // Paper Summary //
  // ************* //
  @Post('paper-summary')
  @HttpCode(202)
  async enqueuePaperSummary(
    @Body() body: { id: string; model?: string; refresh?: boolean },
  ) {
    if (!body.id?.trim()) throw new BadRequestException('id가 필요합니다.');
    return this.queueService.enqueuePaperSummary({
      id: body.id,
      model: body.model,
      refresh: body.refresh === true,
    });
  }

  @Delete('paper-summary/:jobId')
  cancelPaperSummary(@Param('jobId') jobId: string) {
    this.queueService.cancelPaperSummary(jobId);
    return { ok: true };
  }

  @Sse('paper-summary/:jobId/stream')
  streamPaperSummary(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getPaperSummaryStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 논문 요약 작업이 없습니다.');
    return obs;
  }

  // **************** //
  // Hot Paper Trend  //
  // **************** //
  @Post('paper-trend')
  @HttpCode(202)
  async enqueuePaperTrend(@Body() body: { model?: string; refresh?: boolean }) {
    return this.queueService.enqueuePaperTrend(body);
  }

  @Delete('paper-trend/:jobId')
  cancelPaperTrend(@Param('jobId') jobId: string) {
    this.queueService.cancelPaperTrend(jobId);
    return { ok: true };
  }

  @Sse('paper-trend/:jobId/stream')
  streamPaperTrend(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getPaperTrendStream(jobId);
    if (!obs)
      throw new BadRequestException(
        '진행 중인 논문 트렌드 분석 작업이 없습니다.',
      );
    return obs;
  }

  // **************** //
  // News AI Summary  //
  // **************** //
  @Post('news-article-summary')
  @HttpCode(202)
  async enqueueNewsArticleSummary(
    @Body()
    body: {
      title: string;
      url: string;
      source?: string;
      description?: string;
      model?: string;
      refresh?: boolean;
    },
  ) {
    if (!body.title?.trim() && !body.url?.trim())
      throw new BadRequestException('title 또는 url이 필요합니다.');
    return this.queueService.enqueueNewsArticleSummary({
      title: body.title ?? '',
      url: body.url ?? '',
      source: body.source,
      description: body.description,
      model: body.model,
      refresh: body.refresh === true,
    });
  }

  @Delete('news-article-summary/:jobId')
  cancelNewsArticleSummary(@Param('jobId') jobId: string) {
    this.queueService.cancelNewsArticleSummary(jobId);
    return { ok: true };
  }

  @Sse('news-article-summary/:jobId/stream')
  streamNewsArticleSummary(
    @Param('jobId') jobId: string,
  ): Observable<MessageEvent> {
    const obs = this.queueService.getNewsArticleSummaryStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 뉴스 요약 작업이 없습니다.');
    return obs;
  }

  // ******************************** //
  // Resume Cover Letter Categories   //
  // ******************************** //
  @Post('resume/cover-letter-categories')
  @HttpCode(202)
  async enqueueResumeCoverLetterCategories(
    @Body()
    body: {
      resumeIds?: string[];
      coverLetterIds?: string[];
      onlyEmpty?: boolean;
      limit?: number;
      model?: string;
    },
  ) {
    return this.queueService.enqueueResumeCoverLetterCategories({
      resumeIds: body.resumeIds,
      coverLetterIds: body.coverLetterIds,
      onlyEmpty: body.onlyEmpty !== false,
      limit: body.limit,
      model: body.model,
    });
  }

  @Delete('resume/cover-letter-categories/:jobId')
  cancelResumeCoverLetterCategories(@Param('jobId') jobId: string) {
    this.queueService.cancelResumeCoverLetterCategories(jobId);
    return { ok: true };
  }

  @Sse('resume/cover-letter-categories/:jobId/stream')
  streamResumeCoverLetterCategories(
    @Param('jobId') jobId: string,
  ): Observable<MessageEvent> {
    const obs = this.queueService.getResumeCoverLetterCategoryStream(jobId);
    if (!obs)
      throw new BadRequestException(
        '진행 중인 자기소개서 카테고리 분류 작업이 없습니다.',
      );
    return obs;
  }

  // *************************************** //
  // Resume Cover Letter Refined Title       //
  // *************************************** //
  @Post('resume/cover-letter-refined-titles')
  @HttpCode(202)
  async enqueueResumeCoverLetterRefinedTitles(
    @Body()
    body: {
      resumeIds?: string[];
      coverLetterIds?: string[];
      onlyEmpty?: boolean;
      limit?: number;
      model?: string;
    },
  ) {
    return this.queueService.enqueueResumeCoverLetterRefinedTitle({
      resumeIds: body.resumeIds,
      coverLetterIds: body.coverLetterIds,
      onlyEmpty: body.onlyEmpty !== false,
      limit: body.limit,
      model: body.model,
    });
  }

  @Delete('resume/cover-letter-refined-titles/:jobId')
  cancelResumeCoverLetterRefinedTitles(@Param('jobId') jobId: string) {
    this.queueService.cancelResumeCoverLetterRefinedTitle(jobId);
    return { ok: true };
  }

  @Sse('resume/cover-letter-refined-titles/:jobId/stream')
  streamResumeCoverLetterRefinedTitles(
    @Param('jobId') jobId: string,
  ): Observable<MessageEvent> {
    const obs = this.queueService.getResumeCoverLetterRefinedTitleStream(jobId);
    if (!obs)
      throw new BadRequestException(
        '진행 중인 자기소개서 제목 재작성 작업이 없습니다.',
      );
    return obs;
  }

  // *********** //
  // Doc Parse   //
  // *********** //
  @Post('doc-parse/ask')
  @HttpCode(202)
  async enqueueDocParseAsk(
    @Body() body: { docText: string; question: string; model?: string },
  ) {
    if (!body.docText || !body.question)
      throw new BadRequestException('docText와 question이 필요합니다');
    return this.queueService.enqueueDocParseAsk(
      body.docText,
      body.question,
      body.model ?? '',
    );
  }

  @Post('doc-parse/action')
  @HttpCode(202)
  async enqueueDocParseAction(
    @Body()
    body: {
      action: string;
      docText?: string;
      pages?: string[];
      model?: string;
    },
  ) {
    if (!body.action) throw new BadRequestException('action이 필요합니다');
    return this.queueService.enqueueDocParseAction(
      body.action,
      body.docText,
      body.pages,
      body.model ?? '',
    );
  }

  @Delete('doc-parse/:jobId')
  cancelDocParse(@Param('jobId') jobId: string) {
    this.queueService.cancelDocParse(jobId);
    return { ok: true };
  }

  @Sse('doc-parse/:jobId/stream')
  streamDocParse(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getDocParseStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 문서 분석 작업이 없습니다.');
    return obs;
  }

  // ************* //
  // Spec Analysis //
  // ************* //
  @Post('spec-analysis')
  @HttpCode(202)
  async enqueueSpecAnalysis(
    @Body()
    body: {
      ids?: string[];
      target?: string;
      model?: string;
      limit?: number;
    },
  ) {
    return this.queueService.enqueueSpecAnalysis(body);
  }

  @Delete('spec-analysis/:jobId')
  cancelSpecAnalysis(@Param('jobId') jobId: string) {
    this.queueService.cancelSpecAnalysis(jobId);
    return { ok: true };
  }

  @Sse('spec-analysis/:jobId/stream')
  streamSpecAnalysis(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getSpecAnalysisStream(jobId);
    if (!obs)
      throw new BadRequestException('진행 중인 스펙 분석 작업이 없습니다.');
    return obs;
  }

  // *********** //
  // Image OCR   //
  // *********** //
  @Post('image-ocr/enqueue')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else
          cb(
            new BadRequestException(
              `이미지 파일만 지원합니다: ${file.mimetype}`,
            ),
            false,
          );
      },
    }),
  )
  async enqueueImageOcr(
    @UploadedFile() file: Express.Multer.File,
    @Body('model') model?: string,
  ): Promise<{ jobId: string }> {
    if (!file) throw new BadRequestException('파일이 없습니다.');
    return this.queueService.enqueueImageOcr(
      file.buffer,
      file.mimetype,
      model ?? 'gemini-2.0-flash',
    );
  }

  @Delete('image-ocr/:jobId')
  cancelImageOcr(@Param('jobId') jobId: string) {
    this.queueService.cancelImageOcr(jobId);
    return { ok: true };
  }

  @Sse('image-ocr/:jobId/stream')
  streamImageOcr(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getImageOcrStream(jobId);
    if (!obs) throw new BadRequestException('진행 중인 OCR 작업이 없습니다.');
    return obs;
  }
}
