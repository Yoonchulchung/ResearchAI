import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ResumeService } from '../../application/resume/resume.service';
import { DeepResearchPipelineService } from '../../../research/application/pipeline/deep-research-pipeline.service';
import { SearchEngine } from '../../../research/domain/model/search-planner.model';

@Controller('resume')
export class ResumeController {
  constructor(
    private readonly resumeService: ResumeService,
    private readonly deepResearch: DeepResearchPipelineService,
  ) {}

  @Get()
  async getResume(@Query('ids') ids?: string) {
    return this.resumeService.getResume(ids);
  }

  @Get('search')
  async searchResume(@Query('q') q: string) {
    if (!q?.trim()) return { items: [] };
    return this.resumeService.searchResume(q.trim());
  }

  @Put()
  async saveResume(@Body() body: Record<string, unknown>) {
    return this.resumeService.saveResume(body);
  }

  @Delete(':resumeId')
  async deleteResume(@Param('resumeId') resumeId: string) {
    await this.resumeService.deleteResume(resumeId);
    return { ok: true };
  }

  // ── AI eval persistence ──────────────────────────────────────────────────

  @Get(':resumeId/ai-evals')
  async getAiEvals(@Param('resumeId') resumeId: string) {
    return this.resumeService.getAiEvals(resumeId);
  }

  @Post(':resumeId/ai-evals')
  async upsertAiEval(
    @Param('resumeId') resumeId: string,
    @Body() body: { subjectKey: string; type: string; result: string; model?: string },
  ) {
    return this.resumeService.upsertAiEval(
      resumeId,
      body.subjectKey,
      body.type,
      body.result,
      body.model ?? null,
    );
  }

  @Delete('ai-evals/:id')
  async deleteAiEval(@Param('id') id: string) {
    await this.resumeService.deleteAiEval(id);
    return { ok: true };
  }

  // ── JD 평가 ──────────────────────────────────────────────────────────────────

  @Get(':resumeId/jd-eval')
  async getCompanyJdEval(@Param('resumeId') resumeId: string) {
    return this.resumeService.getCompanyJdEval(resumeId);
  }

  @Post(':resumeId/jd-eval')
  async upsertCompanyJdEval(
    @Param('resumeId') resumeId: string,
    @Body() body: { companyName: string; jdText: string; result: string; model?: string },
  ) {
    return this.resumeService.upsertCompanyJdEval(resumeId, body.companyName ?? '', body.jdText ?? '', body.result, body.model ?? null);
  }

  // ── 기업 뉴스 ────────────────────────────────────────────────────────────────

  @Get(':resumeId/company-news')
  async getCompanyNews(
    @Param('resumeId') resumeId: string,
    @Query('companyName') companyName?: string,
  ) {
    return this.resumeService.getCompanyNews(resumeId, companyName);
  }

  @Post(':resumeId/company-news')
  async upsertCompanyNewsItem(
    @Param('resumeId') resumeId: string,
    @Body() body: { companyName: string; itemId: string; title: string; searchQuery: string; searchId?: string },
  ) {
    return this.resumeService.upsertCompanyNewsItem(resumeId, body.companyName, body.itemId, body.title, body.searchQuery, body.searchId ?? null);
  }

  @Post('company-news/:id/deep-search')
  async deepSearchCompanyNews(
    @Param('id') id: string,
    @Body() body: { query: string; model?: string },
  ) {
    const model = body.model ?? 'claude-haiku-4-5-20251001';
    const result = await this.deepResearch.run(body.query, model, SearchEngine.DUCKDUCKGO);
    await this.resumeService.updateCompanyNewsDetail(id, result.aiResult);
    return { aiResult: result.aiResult, confidence: result.confidence };
  }

  @Patch('company-news/:id/detail')
  async updateCompanyNewsDetail(
    @Param('id') id: string,
    @Body() body: { detailJson: string },
  ) {
    await this.resumeService.updateCompanyNewsDetail(id, body.detailJson);
    return { ok: true };
  }

  @Delete('company-news/:id')
  async deleteCompanyNews(@Param('id') id: string) {
    await this.resumeService.deleteCompanyNews(id);
    return { ok: true };
  }

  @Delete(':resumeId/company-news')
  async deleteCompanyNewsByResume(
    @Param('resumeId') resumeId: string,
    @Query('companyName') companyName?: string,
  ) {
    await this.resumeService.deleteCompanyNewsByResume(resumeId, companyName);
    return { ok: true };
  }
}
