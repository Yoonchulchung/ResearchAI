import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ResumeService } from 'src/recruit/application/resume/resume.service';
import { DeepResearchPipelineService } from 'src/research/application/pipeline/deep-research-pipeline.service';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { NaverNewsApi } from 'src/news/infrastructure/provider/naver-news.api';
import { PuppeteerService } from 'src/browse/infrastructure/puppeteer.service';

@Controller('resume')
export class ResumeController {
  constructor(
    private readonly resumeService: ResumeService,
    private readonly deepResearch: DeepResearchPipelineService,
    private readonly naverNews: NaverNewsApi,
    private readonly puppeteer: PuppeteerService,
  ) {}

  @Get()
  async getResume(
    @Query('ids') ids?: string,
    @Query('deleted') deleted?: string,
  ) {
    return this.resumeService.getResume(ids, {
      deleted: deleted === 'true' || deleted === '1',
    });
  }

  @Get('search')
  async searchResume(
    @Query('q') q: string,
    @Query('excludeResumeId') excludeResumeId?: string,
  ) {
    if (!q?.trim()) return { items: [] };
    return this.resumeService.searchResume(q.trim(), excludeResumeId?.trim());
  }

  @Get('activities')
  async getAllActivities(
    @Query('excludeResumeId') excludeResumeId?: string,
  ) {
    return this.resumeService.getAllActivities(excludeResumeId?.trim());
  }

  @Put()
  async saveResume(@Body() body: Record<string, unknown>) {
    return this.resumeService.saveResume(body);
  }

  @Patch(':resumeId/interview-script')
  async updateInterviewScript(
    @Param('resumeId') resumeId: string,
    @Body() body: { interviewScript?: string },
  ) {
    return this.resumeService.updateInterviewScript(
      resumeId,
      body.interviewScript ?? '',
    );
  }

  @Patch(':resumeId/company-link')
  async updateCompanyLink(
    @Param('resumeId') resumeId: string,
    @Body() body: { companyId?: string | null },
  ) {
    return this.resumeService.updateCompanyLink(
      resumeId,
      body.companyId ?? null,
    );
  }

  @Get(':resumeId/pdf')
  async downloadPdf(@Param('resumeId') resumeId: string, @Res() res: Response) {
    const { buffer, filename } =
      await this.resumeService.generateResumePdf(resumeId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Get(':resumeId/versions')
  async listVersions(@Param('resumeId') resumeId: string) {
    return this.resumeService.listVersions(resumeId);
  }

  @Get(':resumeId/versions/:versionId')
  async getVersion(
    @Param('resumeId') resumeId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.resumeService.getVersion(resumeId, versionId);
  }

  @Post(':resumeId/versions/:versionId/restore')
  async restoreVersion(
    @Param('resumeId') resumeId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.resumeService.restoreVersion(resumeId, versionId);
  }

  @Delete(':resumeId/versions/:versionId')
  async deleteVersion(
    @Param('resumeId') resumeId: string,
    @Param('versionId') versionId: string,
  ) {
    await this.resumeService.deleteVersion(resumeId, versionId);
    return { ok: true };
  }

  @Post(':resumeId/restore')
  async restoreResume(@Param('resumeId') resumeId: string) {
    await this.resumeService.restoreResume(resumeId);
    return { ok: true };
  }

  @Delete(':resumeId/permanent')
  async permanentlyDeleteResume(@Param('resumeId') resumeId: string) {
    await this.resumeService.permanentlyDeleteResume(resumeId);
    return { ok: true };
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
    @Body()
    body: { subjectKey: string; type: string; result: string; model?: string },
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
    @Body()
    body: {
      companyName: string;
      jdText: string;
      result: string;
      model?: string;
    },
  ) {
    return this.resumeService.upsertCompanyJdEval(
      resumeId,
      body.companyName ?? '',
      body.jdText ?? '',
      body.result,
      body.model ?? null,
    );
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
    @Body()
    body: {
      companyName: string;
      itemId: string;
      title: string;
      searchQuery: string;
      searchId?: string;
    },
  ) {
    return this.resumeService.upsertCompanyNewsItem(
      resumeId,
      body.companyName,
      body.itemId,
      body.title,
      body.searchQuery,
      body.searchId ?? null,
    );
  }

  @Post('company-news/:id/deep-search')
  async deepSearchCompanyNews(
    @Param('id') id: string,
    @Body() body: { query: string; model?: string },
  ) {
    const model = body.model ?? 'claude-haiku-4-5-20251001';
    const result = await this.deepResearch.run(
      body.query,
      model,
      SearchEngine.DUCKDUCKGO,
    );
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

  // ── PDF 첨부파일 ──────────────────────────────────────────────────────────────

  @Get(':resumeId/attachments')
  async listAttachments(@Param('resumeId') resumeId: string) {
    return this.resumeService.listAttachments(resumeId);
  }

  @Post(':resumeId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  async addAttachment(
    @Param('resumeId') resumeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('파일이 없습니다.');

    let parsedText: string | null = null;
    let pageCount: number | null = null;
    if (file.mimetype === 'application/pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(file.buffer);
      parsedText = result.text ?? null;
      pageCount = result.numpages ?? null;
    }

    return this.resumeService.addAttachment(
      resumeId,
      file,
      parsedText,
      pageCount,
    );
  }

  @Get(':resumeId/attachments/:id/file')
  async getAttachmentFile(
    @Param('resumeId') resumeId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const att = await this.resumeService.getAttachmentFile(resumeId, id);
    if (!att) throw new NotFoundException('첨부파일을 찾을 수 없습니다.');
    res.set({
      'Content-Type': att.mimeType,
      'Content-Length': String(att.fileData.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(att.fileData);
  }

  @Delete(':resumeId/attachments/:id')
  async deleteAttachment(
    @Param('resumeId') resumeId: string,
    @Param('id') id: string,
  ) {
    await this.resumeService.deleteAttachment(resumeId, id);
    return { ok: true };
  }

  // ── JD 관련 뉴스 검색 ──────────────────────────────────────────────────────

  /** 네이버 뉴스 API로 JD 관련 기사 검색 */
  @Post('jd-news-search')
  async jdNewsSearch(@Body() body: { query: string; limit?: number }) {
    const { query, limit = 10 } = body;
    if (!query?.trim()) throw new BadRequestException('query is required');
    const items = await this.naverNews.fetchByQuery(query.trim(), limit);
    return {
      items: items.map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.description,
        date: item.pubDate,
        source: item.source,
      })),
    };
  }

  /** Puppeteer로 기사 본문 스크레이핑 */
  @Post('jd-news-search/article')
  async jdNewsArticle(@Body() body: { url: string }) {
    const { url } = body;
    if (!url?.trim()) throw new BadRequestException('url is required');

    const result = await this.puppeteer.withPage(async (page) => {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      );
      await page.goto(url.trim(), { waitUntil: 'domcontentloaded', timeout: 20_000 });

      return page.evaluate(() => {
        // 광고·네비게이션·댓글 등 제거
        const REMOVE_SELECTORS = [
          'script', 'style', 'noscript', 'iframe',
          'nav', 'header', 'footer', '.ad', '.advertisement',
          '.comment', '#comment', '.sns', '.share',
          '[class*="aside"]', '[class*="related"]', '[class*="recommend"]',
          '[id*="aside"]', '[id*="related"]',
        ];
        REMOVE_SELECTORS.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        });

        // 본문 후보 선택자 (한국 언론사 공통)
        const CONTENT_SELECTORS = [
          'article', '#articleBodyContents', '#article-view-content-div',
          '.article-view-content', '.news_view', '#newsViewArea',
          '.content_view', '#cont_article', '.article_body',
          '#articeBody', '.article__body', '[itemprop="articleBody"]',
          '#newsEndContents', '#article_content', '.news-article-body',
          'main',
        ];

        let best = '';
        for (const sel of CONTENT_SELECTORS) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (el as HTMLElement).innerText?.trim() ?? '';
            if (text.length > best.length) best = text;
          }
        }

        if (!best) {
          // fallback: 가장 긴 텍스트 블록
          const blocks = Array.from(document.querySelectorAll('p, div'));
          best = blocks
            .map((el) => (el as HTMLElement).innerText?.trim() ?? '')
            .filter((t) => t.length > 100)
            .sort((a, b) => b.length - a.length)[0] ?? '';
        }

        return {
          title: document.title,
          text: best.slice(0, 6000),
        };
      });
    });

    return result;
  }
}
