import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaService, MimeType, ParsedMedia } from './media.service';

const ALLOWED_MIMETYPES: MimeType[] = [
  MimeType.JPEG,
  MimeType.JPG,
  MimeType.PNG,
  MimeType.GIF,
  MimeType.WEBP,
  MimeType.PDF,
  MimeType.DOCX,
  MimeType.DOC,
];

const MAX_SIZE_MB = 20;

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMETYPES.includes(file.mimetype as MimeType)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`지원하지 않는 파일 형식입니다: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ParsedMedia> {
    if (!file) throw new BadRequestException('파일이 없습니다.');
    return this.mediaService.parse(file);
  }

  @Post('extract-image-text')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`이미지 파일만 지원합니다: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async extractImageText(
    @UploadedFile() file: Express.Multer.File,
    @Body('model') model?: string,
  ): Promise<{ text: string; filename: string; model: string }> {
    if (!file) throw new BadRequestException('파일이 없습니다.');
    return this.mediaService.extractImageText(file, model || 'gemini-2.0-flash');
  }
}
