import { Controller, Get, Post, Delete, Sse, Param, Body, BadRequestException, MessageEvent, HttpCode } from '@nestjs/common';
import { Observable } from 'rxjs';
import { QueueService } from '../application/queue.service';
import { QueueStatusDto } from './dto/response/queue-status.dto';
import { SessionQueryService } from '../../sessions/application/query/session-query.service';
import { EnqueueDeepResearchDto } from './dto/request/enqueue-deep-research.dto';
import { EnqueueLightResearchDto } from './dto/request/enqueue-light-research.dto';

class EnqueueSummaryDto {
  localAIModel: string;
}

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly sessionQueryService: SessionQueryService,
  ) {}

  @Get('status')
  getQueueStatus(): QueueStatusDto {
    return this.queueService.getStatus();
  }

  // ************** //
  // Light Research //
  // ************** //
  @Post('research/light')
  async enqueueLightResearch(
    @Body() body: EnqueueLightResearchDto,
  ) {
    return this.queueService.enqueueLightResearch(body);
  }

  @Delete('research/light/:searchId')
  async cancelLightResearch(@Param('searchId') searchId: string) {
    await this.queueService.cancelLightResearch(searchId);
    return { ok: true };
  }

  @Sse('research/light/:searchId/stream')
  getLightResearchStream(@Param('searchId') searchId: string): Observable<MessageEvent> {
    const obs = this.queueService.getLightResearchStream(searchId);
    if (!obs) throw new BadRequestException('진행 중인 Light Research 작업이 없습니다.');
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

  // ************* //
  // 세션의 서머리 생성 //
  // ************* //
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
  async streamSummary(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    const obs = await this.queueService.getSummaryStream(id);
    if (!obs) throw new BadRequestException('진행 중인 서머리 작업이 없습니다.');
    return obs;
  }

  // ************ //
  // Write Assist //
  // ************ //
  @Post('write-assist')
  @HttpCode(202)
  async enqueueWriteAssist(
    @Body() body: { content: string; instruction: string; model: string; history?: { role: 'user' | 'assistant'; content: string }[] },
  ) {
    return this.queueService.enqueueWriteAssist(body.content, body.instruction, body.model, body.history);
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
    return this.queueService.enqueueCompanyProfile(body.companyName, body.model);
  }

  @Delete('company-profile/:jobId')
  cancelCompanyProfile(@Param('jobId') jobId: string) {
    this.queueService.cancelCompanyProfile(jobId);
    return { ok: true };
  }

  @Sse('company-profile/:jobId/stream')
  streamCompanyProfile(@Param('jobId') jobId: string): Observable<MessageEvent> {
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
    if (!body.companyName?.trim()) throw new BadRequestException('companyName이 필요합니다.');
    return this.queueService.enqueueCompanyAnalysis(body.companyName, body.model ?? '');
  }

  @Delete('company-analysis/:jobId')
  cancelCompanyAnalysis(@Param('jobId') jobId: string) {
    this.queueService.cancelCompanyAnalysis(jobId);
    return { ok: true };
  }

  @Sse('company-analysis/:jobId/stream')
  streamCompanyAnalysis(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getCompanyAnalysisStream(jobId);
    if (!obs) throw new BadRequestException('진행 중인 기업 분석 작업이 없습니다.');
    return obs;
  }

  // *********** //
  // Doc Parse   //
  // *********** //
  @Delete('doc-parse/:jobId')
  cancelDocParse(@Param('jobId') jobId: string) {
    this.queueService.cancelDocParse(jobId);
    return { ok: true };
  }

  @Sse('doc-parse/:jobId/stream')
  streamDocParse(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const obs = this.queueService.getDocParseStream(jobId);
    if (!obs) throw new BadRequestException('진행 중인 문서 분석 작업이 없습니다.');
    return obs;
  }
}
