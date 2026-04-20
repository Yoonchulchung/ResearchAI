import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from '../application/documents.service';
import { requestContext } from '../../shared/request-context';

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
  constructor(private readonly service: DocumentsService) {}

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
  create(@Body() body: { title: string; content: string; companyName?: string }) {
    const userId = requestContext.getStore()?.id ?? null;
    return this.service.create(body.title, body.content, userId, body.companyName);
  }

  @Patch('documents/:id')
  update(@Param('id') id: string, @Body() body: { title?: string; content?: string; companyName?: string }) {
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
    const { text, pageCount } = await this.service.extractText(file.buffer, file.mimetype);
    return { text, pageCount, filename: file.originalname, size: file.size };
  }

  @Post('doc-parse/ask')
  async ask(@Body() body: { docText: string; question: string; aiModel?: string }) {
    if (!body.docText || !body.question) throw new BadRequestException('docText와 question이 필요합니다');
    return this.service.ask(body.docText, body.question, body.aiModel);
  }

  @Post('doc-parse/quick-action')
  async quickAction(@Body() body: { docText: string; action: 'translate' | 'summarize' | 'explain' | 'keywords'; aiModel?: string }) {
    if (!body.docText || !body.action) throw new BadRequestException('docText와 action이 필요합니다');
    return this.service.quickAction(body.docText, body.action, body.aiModel);
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
    return this.service.createExperience(dto.title, dto.content, userId, dto.category, dto.sourceDocId);
  }

  @Patch('experiences/:id')
  updateExperience(@Param('id') id: string, @Body() dto: UpdateExperienceDto) {
    return this.service.updateExperience(id, dto.title, dto.content, dto.category, dto.aiCategories);
  }

  @Delete('experiences/:id')
  deleteExperience(@Param('id') id: string) {
    return this.service.deleteExperience(id);
  }

  @Post('experiences/search')
  searchExperiences(@Body() dto: { query: string; topK?: number }) {
    return this.service.searchExperiences(dto.query, dto.topK ?? 5);
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
    @Body() body: {
      action: string;
      content: string;
      model: string;
      experiences?: { title: string; content: string }[];
      companyCtx?: string;
    },
  ) {
    if (!body.action || !body.content) throw new BadRequestException('action과 content가 필요합니다');
    return this.service.enqueueWriteAssist(body.action, body.content, body.model, body.experiences, body.companyCtx);
  }
}
