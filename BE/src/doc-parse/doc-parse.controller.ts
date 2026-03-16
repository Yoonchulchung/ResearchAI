import {
  Controller, Post, UploadedFile, UseInterceptors,
  Body, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocParseService } from './doc-parse.service';

interface AskBody {
  docText: string;
  question: string;
  aiModel?: string;
}

interface QuickActionBody {
  docText: string;
  action: 'translate' | 'summarize' | 'explain' | 'keywords';
  aiModel?: string;
}

@Controller('doc-parse')
export class DocParseController {
  constructor(private readonly docParseService: DocParseService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('파일이 없습니다');
    const { text, pageCount } = await this.docParseService.extractText(file.buffer, file.mimetype);
    return { text, pageCount, filename: file.originalname, size: file.size };
  }

  @Post('ask')
  async ask(@Body() body: AskBody) {
    if (!body.docText || !body.question) throw new BadRequestException('docText와 question이 필요합니다');
    return this.docParseService.ask(body.docText, body.question, body.aiModel);
  }

  @Post('quick-action')
  async quickAction(@Body() body: QuickActionBody) {
    if (!body.docText || !body.action) throw new BadRequestException('docText와 action이 필요합니다');
    return this.docParseService.quickAction(body.docText, body.action, body.aiModel);
  }
}
