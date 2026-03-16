import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaService, ParsedMedia } from './media.service';

const ALLOWED_MIMETYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
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
        if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
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
}
